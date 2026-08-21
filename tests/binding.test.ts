import { describe, expect, it, vi } from 'vitest'
import { bindEndpoints, extractBindUrl, parseSetupGuide, provisionBinding } from '../src/binding.js'

function guide(status: string, revision = 3, runtime = false): string {
  return `# Guide
- **Status**: \`${status}\`
- **Guide Revision**: ${revision}
${runtime ? `## Gateway API Base URL
\`\`\`
https://narra.example/api/agent-gateway
\`\`\`

Authorization: Bearer runtime-secret
` : ''}`
}

function currentGuide(status: string, runtime = false): string {
  return `# Narra Messenger Agent Integration
> **Bind Flow Status**: \`${status}\`
${runtime ? `## Gateway API Base URL
\`\`\`text
https://narra.example/api/agent-gateway
\`\`\`

Authorization: Bearer runtime-secret
` : ''}`
}

describe('Narra bind compatibility', () => {
  it('derives fixed endpoints from both supported bind-link forms', () => {
    expect(bindEndpoints('https://narra.example/public-token/setup-guide.md')).toEqual({
      guideUrl: 'https://narra.example/public-token/setup-guide.md',
      reportProfileUrl: 'https://narra.example/bind-agent/report-profile?token=public-token',
      ackGuideUrl: 'https://narra.example/bind-agent/ack-update-guide?token=public-token',
    })
    expect(bindEndpoints('https://narra.example/bind-agent/setup-guide?token=a%20b').guideUrl)
      .toBe('https://narra.example/a%20b/setup-guide.md')
  })

  it('extracts and deduplicates the setup URL from copied binding instructions', () => {
    const url = 'https://api.netmind.chat/example-token/setup-guide.md'
    expect(extractBindUrl(`Please read [${url}](${url}) and follow the instructions to bind the agent to Narra.`))
      .toBe(url)
    expect(extractBindUrl(url)).toBe(url)
  })

  it('rejects missing or ambiguous setup URLs', () => {
    expect(() => extractBindUrl('Please bind this agent.')).toThrow('do not contain a valid setup-guide URL')
    expect(() => extractBindUrl([
      'https://api.netmind.chat/first/setup-guide.md',
      'https://api.netmind.chat/second/setup-guide.md',
    ].join(' '))).toThrow('multiple different setup-guide URLs')
  })

  it('parses only status, revision and runtime credentials', () => {
    expect(parseSetupGuide(guide('waiting_connection', 7, true))).toEqual({
      status: 'waiting_connection',
      revision: 7,
      gatewayUrl: 'https://narra.example/api/agent-gateway',
      gatewayToken: 'runtime-secret',
    })
  })

  it('parses the current bind-flow status without requiring a guide revision', () => {
    expect(parseSetupGuide(currentGuide('waiting_connection', true))).toEqual({
      status: 'waiting_connection',
      gatewayUrl: 'https://narra.example/api/agent-gateway',
      gatewayToken: 'runtime-secret',
    })
  })

  it('requires a revision only when the guide requests acknowledgement', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(currentGuide('waiting_skill_ack')))
    await expect(provisionBinding(
      'https://narra.example/token/setup-guide.md',
      { name: 'Narra Agent', bio: 'Helpful' },
      fetcher,
    )).rejects.toThrow('requires acknowledgement but has no Guide Revision')
  })

  it('advances profile and guide acknowledgement before returning runtime data', async () => {
    const responses = [
      new Response(guide('waiting_profile')),
      new Response('{"success":true}'),
      new Response(guide('waiting_skill_ack', 4)),
      new Response('{"success":true}'),
      new Response(guide('waiting_connection', 4, true)),
    ]
    const fetcher = vi.fn<typeof fetch>(async () => responses.shift() ?? new Response('', { status: 500 }))
    await expect(provisionBinding(
      'https://narra.example/token/setup-guide.md',
      { name: 'Narra Agent', bio: 'Helpful' },
      fetcher,
    )).resolves.toEqual({
      baseUrl: 'https://narra.example/api/agent-gateway',
      token: 'runtime-secret',
    })
    expect(fetcher).toHaveBeenCalledTimes(5)
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' })
    expect(fetcher.mock.calls[3]?.[1]).toMatchObject({ body: '{"revision":4}' })
  })
})
