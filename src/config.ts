import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'

/** Durable settings namespace used by the Host worker and browser section. */
export const NARRA_CHANNEL_SETTINGS_NAMESPACE = settingsNamespace('narra-channel')

/** User-visible lifecycle state for one Narra Agent binding. */
export type NarraConnectionStatus =
  | 'pending'
  | 'binding'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'needs_attention'
  | 'disabled'

/** One Harness Agent Preset bound to one Narra Agent identity. */
export interface NarraConnectionConfig {
  readonly id: string
  readonly agentPreset: string
  readonly displayName: string
  readonly bio: string
  readonly gatewayUrl: string
  readonly credentialRef: string
  readonly enabled?: boolean
  readonly status?: NarraConnectionStatus
  readonly statusMessage?: string
}

/** Plugin configuration and deployment tunables. */
export interface Config {
  readonly connections?: readonly NarraConnectionConfig[]
  readonly pollTimeoutMs?: number
  readonly requestTimeoutMs?: number
  readonly connectRetryMinMs?: number
  readonly connectRetryMaxMs?: number
  readonly idleAgentTtlMs?: number
  readonly globalConcurrency?: number
  readonly normalChunkChars?: number
  readonly voiceChunkChars?: number
  readonly voiceMaxTokens?: number
  readonly maxResponseBytes?: number
}

const ConnectionSchema: z<NarraConnectionConfig> = z.object({
  id: z.string().required(),
  agentPreset: z.string().required(),
  displayName: z.string().required(),
  bio: z.string().required(),
  gatewayUrl: z.string().required(),
  credentialRef: z.string().role('credential-ref').required(),
  enabled: z.boolean().default(true),
  status: z.union([
    'pending',
    'binding',
    'connecting',
    'connected',
    'disconnected',
    'needs_attention',
    'disabled',
  ] as const).default('pending'),
  statusMessage: z.string(),
}) as z<NarraConnectionConfig>

/** Loader and Settings schema for the third-party bundle. */
export const Config = z.object({
  connections: z.array(ConnectionSchema).default([]),
  pollTimeoutMs: z.number().step(1).min(1000).max(30000).default(30000),
  requestTimeoutMs: z.number().step(1).min(1000).default(35000),
  connectRetryMinMs: z.number().step(1).min(100).default(1000),
  connectRetryMaxMs: z.number().step(1).min(1000).default(30000),
  idleAgentTtlMs: z.number().step(1).min(0).default(600000),
  globalConcurrency: z.number().step(1).min(1).default(8),
  normalChunkChars: z.number().step(1).min(1).default(48),
  voiceChunkChars: z.number().step(1).min(1).default(18),
  voiceMaxTokens: z.number().step(1).min(1).default(512),
  maxResponseBytes: z.number().step(1).min(1024).default(2097152),
}) as z<Config>

/** Fully defaulted runtime values. */
export interface ResolvedConfig {
  readonly connections: readonly NarraConnectionConfig[]
  readonly pollTimeoutMs: number
  readonly requestTimeoutMs: number
  readonly connectRetryMinMs: number
  readonly connectRetryMaxMs: number
  readonly idleAgentTtlMs: number
  readonly globalConcurrency: number
  readonly normalChunkChars: number
  readonly voiceChunkChars: number
  readonly voiceMaxTokens: number
  readonly maxResponseBytes: number
}

/** Resolve schema defaults for direct construction and tests. */
export function resolveConfig(config: Config): ResolvedConfig {
  return {
    connections: config.connections ?? [],
    pollTimeoutMs: config.pollTimeoutMs ?? 30000,
    requestTimeoutMs: config.requestTimeoutMs ?? 35000,
    connectRetryMinMs: config.connectRetryMinMs ?? 1000,
    connectRetryMaxMs: config.connectRetryMaxMs ?? 30000,
    idleAgentTtlMs: config.idleAgentTtlMs ?? 600000,
    globalConcurrency: config.globalConcurrency ?? 8,
    normalChunkChars: config.normalChunkChars ?? 48,
    voiceChunkChars: config.voiceChunkChars ?? 18,
    voiceMaxTokens: config.voiceMaxTokens ?? 512,
    maxResponseBytes: config.maxResponseBytes ?? 2097152,
  }
}
