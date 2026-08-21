import { describe, expect, it } from 'vitest'
import { invocationMessage, messageIdFor, sessionIdFor, stripNarraEnvelope } from '../src/message.js'

describe('Narra message mapping', () => {
  it('uses deterministic, binding-isolated identities', () => {
    expect(messageIdFor('a', 'i')).toBe(messageIdFor('a', 'i'))
    expect(messageIdFor('a', 'i')).not.toBe(messageIdFor('b', 'i'))
    expect(sessionIdFor('a', 'room')).not.toBe(sessionIdFor('b', 'room'))
  })

  it('strips the duplicated voice envelope and adds current-turn spoken guidance', () => {
    const raw = '<narra-system-prompt version="1" mode="voice">server voice policy</narra-system-prompt>\n\n天气如何？'
    expect(stripNarraEnvelope(raw)).toBe('天气如何？')
    const message = invocationMessage('binding', {
      invocation_id: 'invocation',
      room_id: 'room',
      message: raw,
      voice_instructions: '先直接回答核心问题。',
    }, false)
    expect(message.source).toMatchObject({ kind: 'narra', voice: true })
    expect(message.content[0]).toMatchObject({ type: 'text' })
    const text = message.content[0]?.type === 'text' ? message.content[0].text : ''
    expect(text).toContain('live 1:1 voice turn')
    expect(text.match(/server voice policy/g)).toBeNull()
    expect(text).toContain('天气如何？')
  })
})
