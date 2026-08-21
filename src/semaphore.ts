/** Small abort-aware FIFO semaphore shared by every binding Worker. */
export class Semaphore {
  private active = 0
  private readonly waiters: Array<() => void> = []

  constructor(private readonly capacity: number) {}

  async run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquire(signal)
    try { return await task() } finally { this.release() }
  }

  private async acquire(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted()
    if (this.active < this.capacity) {
      this.active += 1
      return
    }
    await new Promise<void>((resolve, reject) => {
      const grant = (): void => {
        signal?.removeEventListener('abort', abort)
        this.active += 1
        resolve()
      }
      const abort = (): void => {
        const index = this.waiters.indexOf(grant)
        if (index >= 0) this.waiters.splice(index, 1)
        reject(signal?.reason instanceof Error ? signal.reason : new Error('aborted'))
      }
      this.waiters.push(grant)
      signal?.addEventListener('abort', abort, { once: true })
    })
  }

  private release(): void {
    this.active -= 1
    this.waiters.shift()?.()
  }
}
