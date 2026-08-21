import type { GatewayRuntime, SetupGuideSnapshot } from './types.js'

const STATUS_RE = /^(?:>\s*|-\s*)\*\*(?:Bind Flow )?Status\*\*:\s*`([^`]+)`\s*$/m
const REVISION_RE = /^(?:>\s*|-\s*)\*\*Guide Revision\*\*:\s*(\d+)\s*$/m
const GATEWAY_RE = /^## Gateway API Base URL\s*\n```(?:text)?\s*\n([^\n`]+)\s*\n```/m
const BEARER_RE = /^Authorization:\s*Bearer\s+([^\s`]+)\s*$/m
const HTTP_URL_RE = /https?:\/\/[^\s<>()\[\]{}"'`]+/g

/** Parse only the reviewed, versioned fields of a Narra setup guide. */
export function parseSetupGuide(markdown: string): SetupGuideSnapshot {
  const status = STATUS_RE.exec(markdown)?.[1]
  const revision = REVISION_RE.exec(markdown)?.[1]
  if (status === undefined) throw new Error('Narra setup guide is missing Bind Flow Status')
  const gatewayUrl = GATEWAY_RE.exec(markdown)?.[1]?.trim().replace(/\/+$/, '')
  const gatewayToken = BEARER_RE.exec(markdown)?.[1]
  return {
    status,
    ...(revision === undefined ? {} : { revision: Number(revision) }),
    ...(gatewayUrl === undefined ? {} : { gatewayUrl }),
    ...(gatewayToken === undefined || gatewayToken === '<not-yet-provisioned>'
      ? {}
      : { gatewayToken }),
  }
}

/** Accept the public setup URL forms emitted by Narra and derive fixed endpoints. */
export function bindEndpoints(bindUrl: string): {
  readonly guideUrl: string
  readonly reportProfileUrl: string
  readonly ackGuideUrl: string
} {
  const url = new URL(bindUrl)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Narra bind link must use http or https')
  }
  let token = url.searchParams.get('token') ?? undefined
  if (token === undefined) {
    const match = /^\/([^/]+)\/setup-guide\.md\/?$/.exec(url.pathname)
    token = match?.[1] === undefined ? undefined : decodeURIComponent(match[1])
  }
  if (token === undefined || token.length === 0) throw new Error('Narra bind link has no token')
  const base = url.origin
  return {
    guideUrl: `${base}/${encodeURIComponent(token)}/setup-guide.md`,
    reportProfileUrl: `${base}/bind-agent/report-profile?token=${encodeURIComponent(token)}`,
    ackGuideUrl: `${base}/bind-agent/ack-update-guide?token=${encodeURIComponent(token)}`,
  }
}

/** Extract one unambiguous Narra setup URL from copied binding instructions. */
export function extractBindUrl(instructions: string): string {
  const candidates = instructions.match(HTTP_URL_RE) ?? []
  const guideUrls = new Set<string>()
  for (const candidate of candidates) {
    const trimmed = candidate.replace(/[.,;:!?，。；：！？]+$/u, '')
    try {
      guideUrls.add(bindEndpoints(trimmed).guideUrl)
    } catch {
      // Copied instructions may contain unrelated links; only Narra setup URLs count.
    }
  }
  if (guideUrls.size === 0) {
    throw new Error('Narra binding instructions do not contain a valid setup-guide URL')
  }
  if (guideUrls.size > 1) {
    throw new Error('Narra binding instructions contain multiple different setup-guide URLs')
  }
  return [...guideUrls][0]!
}

async function checkedText(response: Response, operation: string): Promise<string> {
  const text = await response.text()
  if (!response.ok) throw new Error(`${operation} failed with HTTP ${response.status}: ${text.slice(0, 300)}`)
  return text
}

/** Advance Narra's public bind state machine using fixed, data-only operations. */
export async function provisionBinding(
  bindUrl: string,
  profile: { readonly name: string; readonly bio: string },
  fetchImpl: typeof fetch = fetch,
): Promise<GatewayRuntime> {
  const endpoints = bindEndpoints(bindUrl)
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const guide = parseSetupGuide(await checkedText(await fetchImpl(endpoints.guideUrl, {
      headers: { accept: 'text/markdown' },
      cache: 'no-store',
    }), 'fetch setup guide'))

    if ((guide.status === 'waiting_connection' || guide.status === 'connected')
      && guide.gatewayUrl !== undefined && guide.gatewayToken !== undefined) {
      return { baseUrl: guide.gatewayUrl, token: guide.gatewayToken }
    }
    if (guide.status === 'created' || guide.status === 'waiting_profile') {
      await checkedText(await fetchImpl(endpoints.reportProfileUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(profile),
      }), 'report agent profile')
      continue
    }
    if (guide.status === 'waiting_skill_ack') {
      if (guide.revision === undefined) {
        throw new Error('Narra setup guide requires acknowledgement but has no Guide Revision')
      }
      await checkedText(await fetchImpl(endpoints.ackGuideUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ revision: guide.revision }),
      }), 'acknowledge setup guide')
      continue
    }
    throw new Error(`Narra bind is not ready for automatic setup (status: ${guide.status})`)
  }
  throw new Error('Narra bind did not reach waiting_connection after 8 state transitions')
}
