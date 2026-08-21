import type { Context } from '@deepseek-ai/cordis'
import { installModelSelection, type Agent, type ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-agent-presets'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-session'
import type { SessionId } from '@deepseek-ai/dsh-session'

interface PoolEntry {
  readonly agent: Agent
  readonly dispose: (() => Promise<void>) | undefined
  uses: number
  idleTimer: ReturnType<typeof setTimeout> | undefined
}

/** Owns one lazily-created/resumed Harness Agent per Narra room. */
export class AgentPool {
  private readonly entries = new Map<SessionId, Promise<PoolEntry>>()
  private readonly retirements = new Map<SessionId, Promise<void>>()
  private persistedIds: Promise<Set<string>> | undefined

  constructor(
    private readonly ctx: Context,
    private readonly presetId: string,
    private readonly idleTtlMs: number,
  ) {}

  async use<T>(sessionId: SessionId, task: (entry: Pick<PoolEntry, 'agent'>, fresh: boolean) => Promise<T>): Promise<T> {
    const existing = this.entries.get(sessionId)
    const entryPromise = existing ?? this.open(sessionId)
    if (existing === undefined) this.entries.set(sessionId, entryPromise)
    let entry: PoolEntry
    try { entry = await entryPromise } catch (error) {
      this.entries.delete(sessionId)
      throw error
    }
    if (entry.idleTimer !== undefined) clearTimeout(entry.idleTimer)
    entry.idleTimer = undefined
    entry.uses += 1
    try { return await task(entry, existing === undefined) } finally {
      entry.uses -= 1
      this.armEviction(sessionId, entry, entryPromise)
    }
  }

  async dispose(): Promise<void> {
    const settled = await Promise.allSettled(this.entries.values())
    this.entries.clear()
    const activeRetirements = settled
      .filter((row): row is PromiseFulfilledResult<PoolEntry> => row.status === 'fulfilled')
      .flatMap(row => row.value.dispose === undefined ? [] : [row.value.dispose()])
    await Promise.allSettled([...activeRetirements, ...this.retirements.values()])
    this.retirements.clear()
  }

  private async open(sessionId: SessionId): Promise<PoolEntry> {
    await this.retirements.get(sessionId)
    await this.ctx.get('loader')?.await()
    const attached = this.ctx.agents.get(sessionId)
    if (attached !== undefined) return { agent: attached, dispose: undefined, uses: 0, idleTimer: undefined }
    const selection = this.ctx.agentDefaultModel.currentSelection()
    const persisted = await this.persisted()
    const setup = async (agentCtx: Context): Promise<void> => {
      const selected: ModelSelectionRef = { current: selection, assembled: undefined }
      installModelSelection(agentCtx, selected)
      await this.ctx.agentPresets.mount(agentCtx, this.presetId)
    }
    let handle
    try {
      handle = persisted.has(String(sessionId))
        ? await this.ctx.agents.resume({
            resumeSessionId: sessionId,
            agentOptions: { provider: selection.provider, model: selection.model },
            setup,
          })
        : await this.ctx.agents.create({
            sessionId,
            meta: { cwd: process.cwd(), agentPreset: this.presetId },
            agentOptions: { provider: selection.provider, model: selection.model },
            setup,
          })
    } catch (error) {
      const raced = this.ctx.agents.get(sessionId)
      if (raced !== undefined) return { agent: raced, dispose: undefined, uses: 0, idleTimer: undefined }
      throw error
    }
    persisted.add(String(sessionId))
    await handle.agent.whenIdle()
    return { agent: handle.agent, dispose: handle.dispose, uses: 0, idleTimer: undefined }
  }

  private persisted(): Promise<Set<string>> {
    this.persistedIds ??= this.ctx.sessionPersistence.list()
      .then(headers => new Set(headers.map(header => String(header.id))))
    return this.persistedIds
  }

  private armEviction(sessionId: SessionId, entry: PoolEntry, entryPromise: Promise<PoolEntry>): void {
    if (entry.uses !== 0 || this.idleTtlMs === 0) return
    entry.idleTimer = setTimeout(() => {
      if (entry.uses !== 0 || this.entries.get(sessionId) !== entryPromise) return
      if (entry.dispose === undefined) {
        this.entries.delete(sessionId)
        return
      }
      const retirement = entry.dispose().catch(error => {
        this.ctx.logger.warn(`narra-channel: failed to dispose idle session ${String(sessionId)}: ${String(error)}`)
      }).finally(() => {
        if (this.retirements.get(sessionId) === retirement) this.retirements.delete(sessionId)
      })
      this.retirements.set(sessionId, retirement)
      this.entries.delete(sessionId)
    }, this.idleTtlMs)
    entry.idleTimer.unref?.()
  }
}
