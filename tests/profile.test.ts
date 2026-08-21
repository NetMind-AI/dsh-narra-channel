import { describe, expect, it } from 'vitest'
import { suggestNarraProfile } from '../src/profile.js'

describe('Narra public profile suggestions', () => {
  it('uses a user-facing identity for the standard preset', () => {
    expect(suggestNarraProfile({
      id: 'standard',
      name: '标准模式',
      description: '功能完整的编码 Agent。',
    })).toEqual({
      name: 'DeepSeek 助手',
      bio: '运行于本机 DeepSeek Harness 的通用智能助理，可以帮助你分析问题、处理代码与文件，并持续推进项目任务。',
    })
  })

  it('turns a preset type into an agent-like name', () => {
    expect(suggestNarraProfile({
      id: 'review',
      name: '代码审查模式',
      description: '检查代码风险并提出修改建议',
    })).toEqual({
      name: '代码审查助手',
      bio: '由 DeepSeek Harness 驱动。检查代码风险并提出修改建议。',
    })
  })

  it('keeps an existing agent-like name and supplies a fallback bio', () => {
    expect(suggestNarraProfile({ id: 'product', name: '产品顾问' })).toEqual({
      name: '产品顾问',
      bio: '由 DeepSeek Harness 驱动的产品顾问，可以持续协助你处理相关任务。',
    })
  })
})
