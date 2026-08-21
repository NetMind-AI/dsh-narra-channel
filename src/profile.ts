/** Preset metadata available to the Narra settings surface. */
export interface PresetProfileSource {
  readonly id: string
  readonly name?: string
  readonly description?: string
}

/** Stable public identity submitted to Narra for one binding. */
export interface NarraProfile {
  readonly name: string
  readonly bio: string
}

const BUILT_IN_PROFILES: Readonly<Record<string, NarraProfile>> = {
  standard: {
    name: 'DeepSeek 助手',
    bio: '运行于本机 DeepSeek Harness 的通用智能助理，可以帮助你分析问题、处理代码与文件，并持续推进项目任务。',
  },
}

function agentName(raw: string): string {
  const withoutType = raw.replace(/\s*(?:模式|预设|mode|preset)\s*$/iu, '').trim()
  if (withoutType === '' || withoutType.toLowerCase() === 'standard') return 'DeepSeek 助手'
  if (/(?:助手|助理|专家|顾问|agent)$/iu.test(withoutType)) return withoutType
  return `${withoutType}助手`
}

function sentence(text: string): string {
  return /[。！？.!?]$/u.test(text) ? text : `${text}。`
}

/** Suggest a user-facing Narra identity without treating the preset type as the identity. */
export function suggestNarraProfile(preset: PresetProfileSource): NarraProfile {
  const builtIn = BUILT_IN_PROFILES[preset.id]
  if (builtIn !== undefined) return builtIn
  const name = agentName(preset.name?.trim() || preset.id)
  const description = preset.description?.trim()
  return {
    name,
    bio: description === undefined || description === ''
      ? `由 DeepSeek Harness 驱动的${name}，可以持续协助你处理相关任务。`
      : `由 DeepSeek Harness 驱动。${sentence(description)}`,
  }
}
