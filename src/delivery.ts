import type { GatewayClient } from './gateway-client.js'

/** Character-count batching with sentence-aware early flush for voice. */
export class ReplyDelivery {
  private seq = 1
  private pending = ''
  private fullText = ''
  private tail: Promise<void> = Promise.resolve()
  private terminal = false
  private sentAny = false

  constructor(
    private readonly gateway: GatewayClient,
    private readonly invocationId: string,
    private readonly targetChars: number,
    private readonly voice: boolean,
    private readonly signal?: AbortSignal,
  ) {}

  get text(): string { return this.fullText }

  push(delta: string): void {
    if (this.terminal || delta === '') return
    this.pending += delta
    this.fullText += delta
    if (this.shouldFlush()) this.enqueueFlush()
  }

  flush(): Promise<void> {
    if (!this.terminal) this.enqueueFlush()
    return this.tail
  }

  async end(finalText: string): Promise<void> {
    if (this.terminal) return
    this.enqueueFlush()
    await this.tail
    await this.gateway.replyEnd(this.invocationId, finalText, this.signal)
    this.terminal = true
  }

  private shouldFlush(): boolean {
    if (this.voice && !this.sentAny && this.pending.trim() !== '') return true
    if (this.pending.length >= this.targetChars) return true
    return this.voice && /[。！？!?；;，,]\s*$/.test(this.pending)
  }

  private enqueueFlush(): void {
    const delta = this.pending
    if (delta === '') return
    this.pending = ''
    const seq = this.seq
    this.seq += 1
    this.sentAny = true
    this.tail = this.tail.then(() => this.gateway.replyChunk(this.invocationId, seq, delta, this.signal))
  }
}
