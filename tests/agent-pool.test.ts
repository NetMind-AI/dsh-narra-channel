import type { Context } from '@deepseek-ai/cordis'
import type { AgentHandle } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentPool } from '../src/agent-pool.js'

function deferred(): { promise: Promise<void>; resolve: () => void } {
  const result = Promise.withResolvers<void>()
  return { promise: result.promise, resolve: () => result.resolve() }
}

function handle(dispose: () => Promise<void>): AgentHandle {
  return {
    agent: { whenIdle: vi.fn().mockResolvedValue(undefined) },
    dispose,
  } as unknown as AgentHandle
}

describe('AgentPool', () => {
  afterEach(() => { vi.useRealTimers() })

  it('waits for idle retirement before resuming the same persisted session', async () => {
    vi.useFakeTimers()
    const retired = deferred()
    const first = handle(() => retired.promise)
    const second = handle(async () => {})
    const create = vi.fn().mockResolvedValue(first)
    const resume = vi.fn().mockResolvedValue(second)
    const ctx = {
      get: vi.fn().mockReturnValue(undefined),
      agentDefaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      agentPresets: { mount: vi.fn().mockResolvedValue(undefined) },
      agents: { create, resume, get: vi.fn().mockReturnValue(undefined) },
      sessionPersistence: { list: vi.fn().mockResolvedValue([]) },
      logger: { warn: vi.fn() },
    } as unknown as Context
    const pool = new AgentPool(ctx, 'standard', 100)
    const sessionId = SessionId('narra:binding:room')

    await pool.use(sessionId, async () => {})
    await vi.advanceTimersByTimeAsync(100)

    const reopened = pool.use(sessionId, async () => 'reopened')
    await Promise.resolve()
    expect(resume).not.toHaveBeenCalled()

    retired.resolve()
    await expect(reopened).resolves.toBe('reopened')
    expect(resume).toHaveBeenCalledOnce()

    await pool.dispose()
  })

  it('reuses a session that is already live without taking ownership of it', async () => {
    const live = handle(vi.fn())
    const create = vi.fn()
    const resume = vi.fn()
    const ctx = {
      get: vi.fn().mockReturnValue(undefined),
      agentDefaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      agentPresets: { mount: vi.fn() },
      agents: { create, resume, get: vi.fn().mockReturnValue(live.agent) },
      sessionPersistence: { list: vi.fn() },
      logger: { warn: vi.fn() },
    } as unknown as Context
    const pool = new AgentPool(ctx, 'standard', 100)

    await expect(pool.use(SessionId('narra:binding:live-room'), async ({ agent }) => agent)).resolves.toBe(live.agent)
    expect(create).not.toHaveBeenCalled()
    expect(resume).not.toHaveBeenCalled()

    await pool.dispose()
    expect(live.dispose).not.toHaveBeenCalled()
  })
})
