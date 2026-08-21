import { describe, expect, it, vi } from 'vitest'
import { ReplyDelivery } from '../src/delivery.js'

describe('ReplyDelivery', () => {
  it('preserves strict chunk sequence and final text', async () => {
    const gateway = {
      replyChunk: vi.fn(async () => undefined),
      replyEnd: vi.fn(async () => undefined),
    }
    const delivery = new ReplyDelivery(gateway as never, 'inv', 4, false)
    delivery.push('ab')
    delivery.push('cd')
    delivery.push('ef')
    await delivery.end('abcdef')
    expect(gateway.replyChunk.mock.calls).toEqual([
      ['inv', 1, 'abcd', undefined],
      ['inv', 2, 'ef', undefined],
    ])
    expect(gateway.replyEnd).toHaveBeenCalledWith('inv', 'abcdef', undefined)
  })

  it('flushes voice at sentence boundaries before the size target', async () => {
    const gateway = {
      replyChunk: vi.fn(async () => undefined),
      replyEnd: vi.fn(async () => undefined),
    }
    const delivery = new ReplyDelivery(gateway as never, 'voice', 99, true)
    delivery.push('我')
    delivery.push('来查一下。')
    await delivery.flush()
    expect(gateway.replyChunk.mock.calls).toEqual([
      ['voice', 1, '我', undefined],
      ['voice', 2, '来查一下。', undefined],
    ])
  })
})
