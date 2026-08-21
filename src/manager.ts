import type { Context } from '@deepseek-ai/cordis'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import type { Config, NarraConnectionConfig, ResolvedConfig } from './config.js'
import { resolveConfig } from './config.js'
import { Semaphore } from './semaphore.js'
import { ChannelWorker, type WorkerStatusPatch } from './worker.js'

function materialSignature(connection: NarraConnectionConfig): string {
  return JSON.stringify({
    id: connection.id,
    agentPreset: connection.agentPreset,
    displayName: connection.displayName,
    bio: connection.bio,
    gatewayUrl: connection.gatewayUrl,
    credentialRef: connection.credentialRef,
    enabled: connection.enabled ?? true,
  })
}

interface RunningWorker {
  readonly signature: string
  readonly worker: ChannelWorker
}

/** Reconciles settings rows into isolated binding Workers. */
export class ChannelManager {
  private readonly workers = new Map<string, RunningWorker>()
  private readonly semaphore: Semaphore
  private reconcileTail = Promise.resolve()
  private statusTail = Promise.resolve()

  constructor(
    private readonly ctx: Context,
    private readonly settings: SettingsScope<Config>,
  ) {
    this.semaphore = new Semaphore(resolveConfig(settings.get()).globalConcurrency)
  }

  reconcile(): Promise<void> {
    this.reconcileTail = this.reconcileTail.then(() => this.doReconcile())
    return this.reconcileTail
  }

  async dispose(): Promise<void> {
    await this.reconcileTail
    const workers = [...this.workers.values()].map(row => row.worker)
    this.workers.clear()
    await Promise.allSettled(workers.map(worker => worker.stop()))
  }

  private async doReconcile(): Promise<void> {
    const config: ResolvedConfig = resolveConfig(this.settings.get())
    const desired = new Map(config.connections.map(connection => [connection.id, connection]))
    for (const [id, running] of this.workers) {
      const next = desired.get(id)
      if (next !== undefined && next.enabled !== false && materialSignature(next) === running.signature) continue
      this.workers.delete(id)
      await running.worker.stop()
    }
    for (const connection of config.connections) {
      if (connection.enabled === false || this.workers.has(connection.id)) continue
      const worker = new ChannelWorker(this.ctx, connection, config, this.semaphore, (id, patch) => this.writeStatus(id, patch))
      this.workers.set(connection.id, { signature: materialSignature(connection), worker })
      worker.start()
    }
  }

  private writeStatus(id: string, patch: WorkerStatusPatch): Promise<void> {
    const operation = this.statusTail.then(async () => {
      const current = this.settings.get()
      const connections = (current.connections ?? []).map(connection => connection.id !== id ? connection : {
        ...connection,
        ...patch,
      })
      await this.settings.update({ connections })
    })
    this.statusTail = operation.catch(error => {
      this.ctx.logger.warn(`narra-channel: failed to persist worker status: ${String(error)}`)
    })
    return operation
  }
}
