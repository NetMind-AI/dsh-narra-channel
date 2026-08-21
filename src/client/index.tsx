import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { Config, NarraConnectionConfig } from '../config.js'
import { extractBindUrl } from '../binding.js'
import { suggestNarraProfile, type NarraProfile } from '../profile.js'

const NS = 'narra-channel'
export const inject = ['slots', 'connection']

type Api = ConnectionHandle['api']
type Preset = { id: string; name?: string; description?: string; broken?: string }

interface Snapshot {
  readonly writable: boolean
  readonly revision: number
  readonly config: Config
  readonly presets: readonly Preset[]
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function loadSnapshot(api: Api): Promise<Snapshot> {
  const [settingsResponse, presetResponse] = await Promise.all([
    api.settings.describe({}),
    api.agentPresets.list({}),
  ])
  if (!settingsResponse.result.ok) throw new Error(settingsResponse.result.error.message)
  if (!presetResponse.result.ok) throw new Error(presetResponse.result.error.message)
  const section = settingsResponse.result.value.namespaces.find(row => row.ns === NS)
  if (section === undefined) throw new Error('Narra Channel Host plugin is not mounted')
  return {
    writable: settingsResponse.result.value.writable,
    revision: section.revision,
    config: section.value as Config,
    presets: presetResponse.result.value.presets.filter(row => row.broken === undefined),
  }
}

function unwrap(response: { result: { ok: true } | { ok: false; error: { message: string } } }): void {
  if (!response.result.ok) throw new Error(response.result.error.message)
}

const panel: CSSProperties = { maxWidth: 760, padding: '4px 0 32px', color: 'var(--foreground, inherit)' }
const card: CSSProperties = { border: '1px solid rgba(127,127,127,.28)', borderRadius: 12, padding: 16, marginBottom: 12 }
const field: CSSProperties = { display: 'grid', gap: 6, marginBottom: 12 }
const input: CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid rgba(127,127,127,.4)', borderRadius: 8, padding: '9px 10px', background: 'transparent', color: 'inherit' }
const button: CSSProperties = { border: 0, borderRadius: 8, padding: '9px 14px', cursor: 'pointer', background: '#2962ff', color: '#fff' }
const secondaryButton: CSSProperties = { ...button, border: '1px solid rgba(127,127,127,.4)', background: 'transparent', color: 'inherit' }
const profilePreview: CSSProperties = { border: '1px solid rgba(127,127,127,.22)', borderRadius: 10, padding: 14, marginBottom: 12, background: 'rgba(127,127,127,.06)' }

function NarraSettingsSection({ api }: { api: Api }) {
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [preset, setPreset] = useState('')
  const [bindInstructions, setBindInstructions] = useState('')
  const [profileOverride, setProfileOverride] = useState<NarraProfile>()
  const [editingProfile, setEditingProfile] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const next = await loadSnapshot(api)
      setSnapshot(next)
      setPreset(current => current || next.presets[0]?.id || '')
      setError(undefined)
    } catch (cause) { setError(messageOf(cause)) }
  }, [api])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 3000)
    return () => { window.clearInterval(timer) }
  }, [refresh])

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (snapshot === undefined) return
    setBusy(true)
    setError(undefined)
    const id = crypto.randomUUID()
    const credentialRef = `NARRA_CHANNEL_${id.replaceAll('-', '').toUpperCase()}`
    try {
      const selectedPreset = snapshot.presets.find(row => row.id === preset)
      if (selectedPreset === undefined) throw new Error('请选择可用的 Agent Preset')
      const profile = profileOverride ?? suggestNarraProfile(selectedPreset)
      const displayName = profile.name.trim()
      const bio = profile.bio.trim()
      if (displayName === '' || bio === '') throw new Error('Narra Agent 的名称和简介不能为空')
      const bindUrl = extractBindUrl(bindInstructions)
      unwrap(await api.credentials.set({ ref: credentialRef, value: bindUrl }))
      const connection: NarraConnectionConfig = {
        id,
        agentPreset: preset,
        displayName,
        bio,
        gatewayUrl: '',
        credentialRef,
        enabled: true,
        status: 'pending',
        statusMessage: '等待 Channel Worker 启动',
      }
      unwrap(await api.settings.update({
        ns: NS,
        patch: { connections: [...(snapshot.config.connections ?? []), connection] },
        expectedRevision: snapshot.revision,
      }))
      setBindInstructions('')
      setProfileOverride(undefined)
      setEditingProfile(false)
      await refresh()
    } catch (cause) {
      try { await api.credentials.unset({ ref: credentialRef }) } catch {}
      setError(messageOf(cause))
    } finally { setBusy(false) }
  }

  const selectedPreset = snapshot?.presets.find(row => row.id === preset)
  const suggestedProfile = selectedPreset === undefined ? undefined : suggestNarraProfile(selectedPreset)
  const publicProfile = profileOverride ?? suggestedProfile

  const remove = async (connection: NarraConnectionConfig): Promise<void> => {
    if (snapshot === undefined) return
    setBusy(true)
    setError(undefined)
    try {
      unwrap(await api.settings.update({
        ns: NS,
        patch: { connections: (snapshot.config.connections ?? []).filter(row => row.id !== connection.id) },
        expectedRevision: snapshot.revision,
      }))
      unwrap(await api.credentials.unset({ ref: connection.credentialRef }))
      await refresh()
    } catch (cause) { setError(messageOf(cause)) } finally { setBusy(false) }
  }

  return <section style={panel}>
    <h2 style={{ marginTop: 0 }}>Narra</h2>
    <p>选择 Harness Agent Preset，再粘贴 Narra 提供的完整绑定脚本。插件会自动提交 preset 的名称和简介并开始监听消息。</p>
    {error === undefined ? null : <p role="alert" style={{ color: '#d32f2f' }}>{error}</p>}

    {(snapshot?.config.connections ?? []).map(connection => <article key={connection.id} style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
        <div>
          <strong>{connection.displayName}</strong>
          <div style={{ opacity: .72, fontSize: 13 }}>{connection.agentPreset} · {connection.status ?? 'pending'}</div>
          {connection.statusMessage === undefined ? null : <div style={{ marginTop: 6 }}>{connection.statusMessage}</div>}
        </div>
        <button type="button" disabled={busy} onClick={() => { void remove(connection) }} style={{ ...button, background: '#b3261e' }}>移除</button>
      </div>
    </article>)}

    <form onSubmit={(event) => { void submit(event) }} style={card}>
      <h3 style={{ marginTop: 0 }}>绑定新 Agent</h3>
      <label style={field}>Agent Preset
        <select required value={preset} onChange={event => {
          setPreset(event.target.value)
          setProfileOverride(undefined)
          setEditingProfile(false)
        }} style={input}>
          {(snapshot?.presets ?? []).map(row => <option key={row.id} value={row.id}>{row.name ?? row.id}</option>)}
        </select>
      </label>
      <label style={field}>Narra 绑定脚本
        <textarea
          required
          value={bindInstructions}
          onChange={event => { setBindInstructions(event.target.value) }}
          rows={4}
          placeholder="Please read [https://…/setup-guide.md](https://…/setup-guide.md) and follow the instructions to bind the agent to Narra."
          style={input}
        />
      </label>
      {publicProfile === undefined ? null : <section style={profilePreview}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
          <div>
            <div style={{ opacity: .68, fontSize: 13, marginBottom: 5 }}>即将创建为</div>
            <strong>{publicProfile.name}</strong>
            <div style={{ marginTop: 6, lineHeight: 1.55 }}>{publicProfile.bio}</div>
          </div>
          <button type="button" disabled={busy} onClick={() => {
            if (!editingProfile) setProfileOverride(publicProfile)
            setEditingProfile(value => !value)
          }} style={secondaryButton}>{editingProfile ? '收起' : '编辑资料'}</button>
        </div>
        {editingProfile ? <div style={{ marginTop: 14 }}>
          <label style={field}>Agent 名称
            <input
              required
              value={publicProfile.name}
              onChange={event => { setProfileOverride({ name: event.target.value, bio: publicProfile.bio }) }}
              style={input}
            />
          </label>
          <label style={{ ...field, marginBottom: 0 }}>Agent 简介
            <textarea
              required
              value={publicProfile.bio}
              onChange={event => { setProfileOverride({ name: publicProfile.name, bio: event.target.value }) }}
              rows={3}
              style={input}
            />
          </label>
          {profileOverride === undefined ? null : <button type="button" disabled={busy} onClick={() => {
            setProfileOverride(undefined)
            setEditingProfile(false)
          }} style={{ ...secondaryButton, marginTop: 10 }}>恢复建议资料</button>}
        </div> : null}
      </section>}
      <button type="submit" disabled={busy || snapshot?.writable !== true || preset === ''} style={button}>
        {busy ? '处理中…' : '绑定并开始监听'}
      </button>
      {snapshot?.writable === false ? <p>当前 Harness 设置存储为只读，无法添加绑定。</p> : null}
    </form>
  </section>
}

export function apply(ctx: ClientContext): void {
  const { api } = ctx.get('connection') as ConnectionHandle
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'narra',
    order: 25,
    label: 'Narra',
  }, () => <NarraSettingsSection api={api} />))
}
