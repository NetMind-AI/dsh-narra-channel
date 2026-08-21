import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-agent-presets'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-settings'
import { Config, NARRA_CHANNEL_SETTINGS_NAMESPACE, type Config as PluginConfig } from './config.js'
import { ChannelManager } from './manager.js'

export const name = 'narra-channel'
export const inject = [
  'agents',
  'agentDefaultModel',
  'agentPresets',
  'credentials',
  'sessions',
  'sessionPersistence',
  'settings',
]
export { Config }

/** Mount the third-party Narra channel without modifying Harness or Narra. */
export function apply(ctx: Context, config: PluginConfig): void {
  const scope = ctx.settings.register(NARRA_CHANNEL_SETTINGS_NAMESPACE, Config, { base: config })
  const manager = new ChannelManager(ctx, scope)
  scope.watch(() => manager.reconcile())
  ctx.effect(() => {
    void manager.reconcile()
    return () => manager.dispose()
  }, 'narra-channel: binding workers')
}
