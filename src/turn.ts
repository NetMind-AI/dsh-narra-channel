import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionEvent, TurnEndReason } from '@deepseek-ai/dsh-session'
import { GatewayTerminalError, type NarraInvocation } from './types.js'
import { ReplyDelivery } from './delivery.js'
import type { GatewayClient } from './gateway-client.js'
import { invocationMessage } from './message.js'

export interface TurnOptions {
  readonly bindingId: string
  readonly includeBootstrapContext: boolean
  readonly normalChunkChars: number
  readonly voiceChunkChars: number
  readonly voiceMaxTokens: number
  readonly signal: AbortSignal
}

/** Drive one correlated Harness turn and stream only its visible text to Narra. */
export async function runInvocationTurn(
  agent: Agent,
  gateway: GatewayClient,
  invocation: NarraInvocation,
  options: TurnOptions,
): Promise<string> {
  const message = invocationMessage(options.bindingId, invocation, options.includeBootstrapContext)
  const voice = message.source.kind === 'narra' && message.source.voice
  const delivery = new ReplyDelivery(
    gateway,
    invocation.invocation_id,
    voice ? options.voiceChunkChars : options.normalChunkChars,
    voice,
    options.signal,
  )
  let turn: number | undefined
  let endReason: TurnEndReason | undefined
  let assembledFallback = ''

  const disposeClaimed = agent.ctx.on('agent/inbox/claimed', ({ message: claimed, turn: claimedTurn }) => {
    if (claimed.id === message.id) turn = claimedTurn
  })
  const disposeRequest = agent.ctx.on('agent/request', async ({ turn: requestTurn }, next) => {
    const config = await next()
    if (!voice || requestTurn !== turn) return config
    return { ...config, maxTokens: Math.min(config.maxTokens ?? options.voiceMaxTokens, options.voiceMaxTokens) }
  })
  const disposeEvents = agent.ctx.on('session/event', (session, event: SessionEvent) => {
    if (session !== agent.session || turn === undefined) return
    if (event.type === 'assistant/chunk' && event.data.turn === turn) {
      const chunk = event.data.chunk
      if (chunk.type === 'text-delta') delivery.push(chunk.text)
      if (chunk.type === 'block-end') void delivery.flush()
      return
    }
    if (event.type === 'assistant/message' && event.data.turn === turn) {
      assembledFallback += event.data.message.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('')
      return
    }
    if (event.type === 'turn/end' && event.data.turn === turn) endReason = event.data.reason
  })
  const abort = (): void => { agent.cancel({ kind: 'user' }) }
  options.signal.addEventListener('abort', abort, { once: true })

  try {
    agent.followup(message)
    await agent.whenIdle()
    options.signal.throwIfAborted()
    const text = delivery.text === '' ? assembledFallback : delivery.text
    if (text.trim() === '') throw new Error(`Harness Agent produced no visible reply (${endReason?.kind ?? 'unknown outcome'})`)
    if (endReason?.kind === 'error' || endReason?.kind === 'blocked'
      || endReason?.kind === 'aborted' || endReason?.kind === 'interrupted') {
      throw new Error(`Harness Agent turn ended with ${endReason.kind}`)
    }
    await delivery.end(text)
    return text
  } catch (error) {
    if (error instanceof GatewayTerminalError) agent.cancel({ kind: 'user' })
    throw error
  } finally {
    options.signal.removeEventListener('abort', abort)
    disposeEvents()
    disposeRequest()
    disposeClaimed()
  }
}
