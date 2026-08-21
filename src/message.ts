import { createHash } from 'node:crypto'
import { freezeMessage, MessageId, type UserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { NarraContextMessage, NarraInvocation } from './types.js'

export interface NarraMessageSource {
  readonly kind: 'narra'
  readonly bindingId: string
  readonly invocationId: string
  readonly roomId: string
  readonly senderId?: string
  readonly senderName?: string
  readonly voice: boolean
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    narra: NarraMessageSource
  }
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24)
}

export function roomIdOf(invocation: NarraInvocation): string {
  return invocation.memory_scope?.key
    ?? invocation.room_id
    ?? invocation.conversation_id
    ?? `invocation:${invocation.invocation_id}`
}

export function sessionIdFor(bindingId: string, roomId: string): SessionId {
  return SessionId(`narra:${digest(bindingId)}:${digest(roomId)}`)
}

export function messageIdFor(bindingId: string, invocationId: string): MessageId {
  return MessageId(`narra:${digest(`${bindingId}\0${invocationId}`)}`)
}

const NARRA_ENVELOPE = /^<narra-system-prompt\b[^>]*>[\s\S]*?<\/narra-system-prompt>\s*/i

export function stripNarraEnvelope(message: string): string {
  return message.replace(NARRA_ENVELOPE, '')
}

function contextText(context: readonly NarraContextMessage[]): string {
  return context
    .slice(-20)
    .map(row => `${row.role === 'assistant' ? 'Agent' : 'User'}: ${row.content}`)
    .join('\n')
}

/** Build one durable, deterministic Harness input for a Gateway invocation. */
export function invocationMessage(
  bindingId: string,
  invocation: NarraInvocation,
  includeBootstrapContext: boolean,
): UserMessage {
  const roomId = roomIdOf(invocation)
  const voice = typeof invocation.voice_instructions === 'string'
    && invocation.voice_instructions.trim() !== ''
  const prompt: string[] = []

  if (includeBootstrapContext && (invocation.context?.length ?? 0) > 0) {
    prompt.push(
      '<narra-recent-context>',
      contextText(invocation.context ?? []),
      '</narra-recent-context>',
      '',
    )
  }
  if (voice) {
    prompt.push(
      '<narra-current-turn mode="voice">',
      'This is a live 1:1 voice turn. Start the answer immediately. Use short, natural spoken sentences. '
        + 'Avoid Markdown, lists, emoji, parenthetical asides, and unnecessary greetings. '
        + 'If a tool is needed, first say one brief, specific progress sentence, then perform the work and give the actual result.',
      `Server instruction: ${invocation.voice_instructions?.trim()}`,
      '</narra-current-turn>',
      '',
    )
  }
  prompt.push(stripNarraEnvelope(invocation.message).trim())

  return freezeMessage({
    id: messageIdFor(bindingId, invocation.invocation_id),
    role: 'user',
    content: [{ type: 'text', text: prompt.join('\n') }],
    source: {
      kind: 'narra',
      bindingId,
      invocationId: invocation.invocation_id,
      roomId,
      ...(invocation.sender?.matrix_user_id === undefined ? {} : { senderId: invocation.sender.matrix_user_id }),
      ...(invocation.sender?.display_name === undefined ? {} : { senderName: invocation.sender.display_name }),
      voice,
    },
  })
}
