import type { SessionEvent } from '@deepseek-ai/dsh-session'

export interface InvocationHistory {
  readonly seen: boolean
  readonly completed: boolean
  readonly text: string
  readonly errored: boolean
}

/** Fold one Narra invocation's already-committed turn, if present. */
export function findInvocationHistory(
  events: readonly SessionEvent[],
  bindingId: string,
  invocationId: string,
): InvocationHistory {
  let turn: number | undefined
  let text = ''
  let completed = false
  let errored = false
  for (const event of events) {
    if (event.type === 'user/message') {
      const source = event.data.source as { kind?: unknown; bindingId?: unknown; invocationId?: unknown }
      if (source.kind === 'narra' && source.bindingId === bindingId && source.invocationId === invocationId) {
        const preceding = events.slice(0, event.seq).findLast(candidate => candidate.type === 'turn/start')
        turn = preceding?.type === 'turn/start' ? preceding.data.turn : undefined
      }
      continue
    }
    if (turn === undefined) continue
    if (event.type === 'assistant/message' && event.data.turn === turn) {
      const joined = event.data.message.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('')
      if (joined !== '') text += joined
    }
    if (event.type === 'turn/end' && event.data.turn === turn) {
      completed = event.data.reason.kind === 'completed' || event.data.reason.kind === 'max-tokens'
      errored = event.data.reason.kind === 'error'
        || event.data.reason.kind === 'interrupted'
        || event.data.reason.kind === 'aborted'
        || event.data.reason.kind === 'blocked'
      break
    }
  }
  return { seen: turn !== undefined, completed, text, errored }
}
