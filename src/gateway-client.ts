import { GatewayTerminalError, type NarraInvocation } from './types.js'

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

async function bodySnippet(response: Response): Promise<string> {
  try { return (await response.text()).slice(0, 300) } catch { return '' }
}

export class GatewayClient {
  constructor(
    readonly baseUrl: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly requestTimeoutMs = 35000,
    private readonly maxResponseBytes = 2097152,
  ) {}

  async connect(signal?: AbortSignal): Promise<void> {
    await this.request('connect', { method: 'POST', ...(signal === undefined ? {} : { signal }) })
  }

  async poll(timeoutMs: number, signal?: AbortSignal): Promise<NarraInvocation | undefined> {
    const data = await this.request(`invocations/poll?timeout=${Math.min(30000, timeoutMs)}`, {
      ...(signal === undefined ? {} : { signal }),
    })
    if (isRecord(data) && data.status === 'no_invocation') return undefined
    if (!isRecord(data) || typeof data.invocation_id !== 'string' || typeof data.message !== 'string') {
      throw new Error('Narra Gateway returned an invalid invocation payload')
    }
    return data as unknown as NarraInvocation
  }

  async replyChunk(invocationId: string, seq: number, delta: string, signal?: AbortSignal): Promise<void> {
    await this.request(`invocations/${encodeURIComponent(invocationId)}/reply-chunk`, {
      method: 'POST', body: JSON.stringify({ seq, delta }), ...(signal === undefined ? {} : { signal }),
    }, true)
  }

  async replyEnd(invocationId: string, text: string, signal?: AbortSignal): Promise<void> {
    await this.request(`invocations/${encodeURIComponent(invocationId)}/reply-end`, {
      method: 'POST', body: JSON.stringify({ text }), ...(signal === undefined ? {} : { signal }),
    }, true)
  }

  async reportError(invocationId: string, error: string): Promise<void> {
    await this.request(`invocations/${encodeURIComponent(invocationId)}/error`, {
      method: 'POST', body: JSON.stringify({ error: error.slice(0, 1000) }),
    }, true)
  }

  private async request(path: string, init: RequestInit, terminal = false): Promise<unknown> {
    const timeoutSignal = AbortSignal.timeout(this.requestTimeoutMs)
    const signal = init.signal === undefined || init.signal === null
      ? timeoutSignal
      : AbortSignal.any([init.signal, timeoutSignal])
    const response = await this.fetchImpl(joinUrl(this.baseUrl, path), {
      ...init,
      signal,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${this.token}`,
        ...init.body === undefined ? {} : { 'content-type': 'application/json' },
        ...init.headers,
      },
    })
    if (!response.ok) {
      const detail = await bodySnippet(response)
      const message = `Narra Gateway HTTP ${response.status}${detail === '' ? '' : `: ${detail}`}`
      if (terminal && [404, 409, 410, 423].includes(response.status)) {
        throw new GatewayTerminalError(message, response.status)
      }
      throw new Error(message)
    }
    if (response.status === 204) return undefined
    const declaredLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > this.maxResponseBytes) {
      throw new Error(`Narra Gateway response exceeds ${this.maxResponseBytes} bytes`)
    }
    const text = await response.text()
    if (new TextEncoder().encode(text).byteLength > this.maxResponseBytes) {
      throw new Error(`Narra Gateway response exceeds ${this.maxResponseBytes} bytes`)
    }
    return text === '' ? undefined : JSON.parse(text) as unknown
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
