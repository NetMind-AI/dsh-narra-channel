import { describe, expect, it } from 'vitest'
import { Semaphore } from '../src/semaphore.js'

describe('Semaphore', () => {
  it('bounds concurrent model work while preserving all tasks', async () => {
    const semaphore = new Semaphore(2)
    let active = 0
    let peak = 0
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const tasks = Array.from({ length: 5 }, (_, index) => semaphore.run(async () => {
      active += 1
      peak = Math.max(peak, active)
      await gate
      active -= 1
      return index
    }))
    await Promise.resolve()
    expect(peak).toBe(2)
    release()
    await expect(Promise.all(tasks)).resolves.toEqual([0, 1, 2, 3, 4])
  })
})
