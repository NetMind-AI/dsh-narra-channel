import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { NarraConnectionConfig, NarraConnectionStatus, ResolvedConfig } from './config.js'
import { AgentPool } from './agent-pool.js'
import { provisionBinding } from './binding.js'
import { GatewayClient } from './gateway-client.js'
import { findInvocationHistory } from './history.js'
import { roomIdOf, sessionIdFor } from './message.js'
import { Semaphore } from './semaphore.js'
import { GatewayTerminalError } from './types.js'
import { runInvocationTurn } from './turn.js'

export interface WorkerStatusPatch {
  readonly status: NarraConnectionStatus
  readonly statusMessage?: string
  readonly gatewayUrl?: string
}

export type WorkerStatusSink = (bindingId: string, patch: WorkerStatusPatch) => Promise<void>

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    const abort = (): void => {
      clearTimeout(timer)
      reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'))
    }
    signal.addEventListener('abort', abort, { once: true })
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isBindLink(value: string): boolean {
  try {
    const url = new URL(value)
    return /\/setup-guide(?:\.md)?\/?$/.test(url.pathname) || url.pathname === '/bind-agent/setup-guide'
  } catch { return false }
}

/** One independent long-poll owner for one Narra binding. */
export class ChannelWorker {
  private readonly abortController = new AbortController()
  private readonly pool: AgentPool
  private task: Promise<void> | undefined

  constructor(
    private readonly ctx: Context,
    private readonly connection: NarraConnectionConfig,
    private readonly config: ResolvedConfig,
    private readonly semaphore: Semaphore,
    private readonly status: WorkerStatusSink,
  ) {
    this.pool = new AgentPool(ctx, connection.agentPreset, config.idleAgentTtlMs)
  }

  start(): void {
    this.task ??= this.run().catch(error => {
      if (!this.abortController.signal.aborted) {
        this.ctx.logger.error(`narra-channel[${this.connection.id}]: worker stopped: ${errorMessage(error)}`)
        void this.status(this.connection.id, { status: 'needs_attention', statusMessage: errorMessage(error) })
      }
    })
  }

  async stop(): Promise<void> {
    this.abortController.abort(new Error('Narra Channel Worker stopped'))
    await Promise.allSettled([this.task, this.pool.dispose()])
  }

  private async run(): Promise<void> {
    const signal = this.abortController.signal
    const secret = await this.ctx.credentials.resolve(credentialRef(this.connection.credentialRef))
    if (secret === undefined) throw new Error('Narra credential is not configured')

    let token = secret.value
    let gatewayUrl = this.connection.gatewayUrl.trim()
    if (isBindLink(token)) {
      await this.status(this.connection.id, { status: 'binding', statusMessage: '正在完成 Narra 绑定…' })
      const runtime = await provisionBinding(token, {
        name: this.connection.displayName,
        bio: this.connection.bio,
      })
      token = runtime.token
      gatewayUrl = runtime.baseUrl
      await this.ctx.credentials.set(credentialRef(this.connection.credentialRef), token)
      await this.status(this.connection.id, {
        status: 'connecting',
        statusMessage: '绑定完成，正在连接 Gateway…',
        gatewayUrl,
      })
    }
    if (gatewayUrl === '') throw new Error('Narra Gateway URL is missing; paste a bind link again')

    const gateway = new GatewayClient(
      gatewayUrl,
      token,
      fetch,
      this.config.requestTimeoutMs,
      this.config.maxResponseBytes,
    )
    let retryMs = this.config.connectRetryMinMs
    while (!signal.aborted) {
      try {
        await this.status(this.connection.id, { status: 'connecting', statusMessage: '正在连接 Narra Gateway…' })
        await gateway.connect(signal)
        await this.status(this.connection.id, { status: 'connected', statusMessage: '正在监听 Narra 消息' })
        retryMs = this.config.connectRetryMinMs
        await this.poll(gateway, signal)
      } catch (error) {
        if (signal.aborted) break
        const message = errorMessage(error)
        if (/HTTP 40[013]/.test(message)) throw error
        await this.status(this.connection.id, { status: 'disconnected', statusMessage: `${message}；稍后重试` })
        await delay(retryMs, signal)
        retryMs = Math.min(this.config.connectRetryMaxMs, retryMs * 2)
      }
    }
  }

  private async poll(gateway: GatewayClient, signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const invocation = await gateway.poll(this.config.pollTimeoutMs, signal)
      if (invocation === undefined) continue
      // One binding never polls a second message while the current one owns its
      // 30-second lease. Different bindings still run independently.
      await this.semaphore.run(() => this.process(gateway, invocation, signal), signal)
    }
  }

  private async process(
    gateway: GatewayClient,
    invocation: Awaited<ReturnType<GatewayClient['poll']>> & {},
    signal: AbortSignal,
  ): Promise<void> {
    if (invocation === undefined) return
    const sessionId = sessionIdFor(this.connection.id, roomIdOf(invocation))
    try {
      await this.pool.use(sessionId, async ({ agent }) => {
        const history = findInvocationHistory(agent.session.events, this.connection.id, invocation.invocation_id)
        if (history.completed && history.text !== '') {
          await gateway.replyEnd(invocation.invocation_id, history.text, signal)
          return
        }
        if (history.seen) {
          await gateway.reportError(invocation.invocation_id, 'A previous local attempt did not complete safely')
          return
        }
        const hasConversation = agent.session.events.some(event => event.type === 'user/message')
        await runInvocationTurn(agent, gateway, invocation, {
          bindingId: this.connection.id,
          includeBootstrapContext: !hasConversation,
          normalChunkChars: this.config.normalChunkChars,
          voiceChunkChars: this.config.voiceChunkChars,
          voiceMaxTokens: this.config.voiceMaxTokens,
          signal,
        })
        await this.ctx.sessions.flush(agent.session)
      })
    } catch (error) {
      if (signal.aborted || error instanceof GatewayTerminalError) return
      this.ctx.logger.warn(`narra-channel[${this.connection.id}]: invocation ${invocation.invocation_id} failed: ${errorMessage(error)}`)
      try { await gateway.reportError(invocation.invocation_id, errorMessage(error)) } catch (reportError) {
        this.ctx.logger.warn(`narra-channel[${this.connection.id}]: could not report invocation error: ${errorMessage(reportError)}`)
      }
    }
  }
}
