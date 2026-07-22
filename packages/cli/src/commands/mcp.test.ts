/**
 * MCP server integration tests. Uses the SDK's in-memory transport pair so a
 * real Client drives the real server registration in-process — no subprocess,
 * no stdio, no browser. Covers tool discovery + each tool's happy path and
 * error path.
 *
 * `coherent_extract` is the one browser-bound tool. Its capture pipeline is
 * spied, not replaced: the default implementation stays the REAL
 * captureExtraction (so the SSRF gate is exercised end-to-end through the MCP
 * layer — it rejects before any browser launch), and only the happy path is
 * stubbed per-test. The pipeline itself is covered in extract.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { registerCoherentTools } from './mcp.js'
import { captureExtraction, type ExtractionPayload } from './extract.js'

vi.mock('./extract.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./extract.js')>()
  return { ...actual, captureExtraction: vi.fn(actual.captureExtraction) }
})

async function connectedClient() {
  const server = new McpServer({ name: 'coherent', version: 'test' })
  registerCoherentTools(server)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '1.0.0' })
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])
  return { client, close: () => client.close() }
}

/** Parse a tool result's single text block as JSON. */
function json(result: { content: Array<{ type: string; text: string }> }): any {
  return JSON.parse(result.content[0].text)
}

describe('coherent mcp — tool registration', () => {
  it('exposes exactly the six agent-contract tools', async () => {
    const { client, close } = await connectedClient()
    const { tools } = await client.listTools()
    expect(tools.map(t => t.name).sort()).toEqual([
      'coherent_apply_design',
      'coherent_constraints',
      'coherent_extract',
      'coherent_manifest',
      'coherent_tokens',
      'coherent_validate',
    ])
    // Every tool name conforms to MCP naming (SEP-986): [A-Za-z0-9_.-], 1-128.
    for (const t of tools) expect(t.name).toMatch(/^[A-Za-z0-9_.-]{1,128}$/)
    await close()
  })
})

describe('coherent_validate', () => {
  it('flags raw Tailwind colors as errors', async () => {
    const { client, close } = await connectedClient()
    const res = await client.callTool({
      name: 'coherent_validate',
      arguments: { code: 'export default function P(){return <div className="bg-gray-100 text-blue-600">x</div>}' },
    })
    const out = json(res as any)
    expect(out.passed).toBe(false)
    expect(out.errorCount).toBeGreaterThan(0)
    expect(Array.isArray(out.issues)).toBe(true)
    await close()
  })

  it('returns a structured verdict with per-severity counts', async () => {
    const { client, close } = await connectedClient()
    const res = await client.callTool({
      name: 'coherent_validate',
      arguments: {
        code: 'export default function P(){return <main className="bg-background text-foreground">x</main>}',
      },
    })
    const out = json(res as any)
    expect(out).toHaveProperty('errorCount')
    expect(out).toHaveProperty('warningCount')
    expect(out).toHaveProperty('infoCount')
    expect(out.passed).toBe(out.errorCount === 0)
    await close()
  })
})

describe('coherent_constraints', () => {
  it('returns the tiered bundle with an inferred page type', async () => {
    const { client, close } = await connectedClient()
    const res = await client.callTool({ name: 'coherent_constraints', arguments: { intent: 'a login form' } })
    const out = json(res as any)
    expect(out.pageType).toBe('auth')
    expect(out.blocks.coreConstraints).toBeTruthy()
    expect(out.generationInstructions).toContain('login form')
    await close()
  })

  it('errors on an unknown atmosphere preset', async () => {
    const { client, close } = await connectedClient()
    const res = (await client.callTool({
      name: 'coherent_constraints',
      arguments: { intent: 'x', atmosphere: 'does-not-exist' },
    })) as any
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain('Unknown atmosphere preset')
    await close()
  })

  it('errors on a blank intent instead of returning a bogus payload', async () => {
    const { client, close } = await connectedClient()
    const res = (await client.callTool({ name: 'coherent_constraints', arguments: { intent: '   ' } })) as any
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain('No intent provided')
    await close()
  })
})

describe('coherent_manifest', () => {
  it('emits the static design contract', async () => {
    const { client, close } = await connectedClient()
    const res = await client.callTool({ name: 'coherent_manifest', arguments: {} })
    const out = json(res as any)
    expect(out.$schema).toContain('coherent-manifest')
    expect(out.designContract.pageTypes).toEqual(['marketing', 'app', 'auth'])
    expect(out.designContract.atmospheres.length).toBeGreaterThan(0)
    await close()
  })
})

describe('coherent_tokens', () => {
  it('errors cleanly when run outside a Coherent project', async () => {
    const { client, close } = await connectedClient()
    // The vitest cwd is the repo root, which is not a Coherent project.
    const res = (await client.callTool({ name: 'coherent_tokens', arguments: {} })) as any
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain('project')
    await close()
  })
})

describe('coherent_apply_design', () => {
  it('errors cleanly when run outside a Coherent project', async () => {
    const { client, close } = await connectedClient()
    const res = (await client.callTool({
      name: 'coherent_apply_design',
      arguments: { designMarkdown: '# Design\n\nPrimary: #ff0000\n' },
    })) as any
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain('project')
    await close()
  })
})

describe('coherent_extract', () => {
  const mockedCapture = vi.mocked(captureExtraction)

  const PAYLOAD: ExtractionPayload = {
    source: {
      url: 'https://93.184.216.34/',
      finalUrl: 'https://93.184.216.34/',
      capturedAt: '2026-07-22T12:00:00.000Z',
      mode: 'light',
      title: 'Example',
      loadTimeMs: 900,
    },
    hero: { text: 'Payments infrastructure', fontSize: 48, source: 'h1' },
    tokens: { colors: [{ hex: '#635bff', role: 'brand', usage: 'button' }] } as never,
    semantic: null,
  }

  beforeEach(() => {
    mockedCapture.mockClear()
  })

  it('advertises the URL contract, the SSRF refusal, and the optional peer dep', async () => {
    const { client, close } = await connectedClient()
    const { tools } = await client.listTools()
    const extract = tools.find(t => t.name === 'coherent_extract')!
    expect(Object.keys(extract.inputSchema.properties ?? {}).sort()).toEqual([
      'semantic',
      'settleMs',
      'timeoutMs',
      'url',
    ])
    expect(extract.inputSchema.required).toEqual(['url'])
    expect(extract.description).toMatch(/playwright/i)
    expect(extract.description).toMatch(/SSRF|private/i)
    await close()
  })

  it('forwards the capture-timing knobs (CLI --timeout / --settle-ms parity)', async () => {
    mockedCapture.mockResolvedValueOnce(PAYLOAD)
    const { client, close } = await connectedClient()
    await client.callTool({
      name: 'coherent_extract',
      arguments: { url: 'https://example.com/', timeoutMs: 60000, settleMs: 1500 },
    })
    expect(mockedCapture).toHaveBeenCalledWith('https://example.com/', {
      semantic: false,
      timeoutMs: 60000,
      settleMs: 1500,
    })
    await close()
  })

  it('caps the timing knobs so a model cannot pin a browser open for an hour', async () => {
    const { client, close } = await connectedClient()
    const tooLong = (await client.callTool({
      name: 'coherent_extract',
      arguments: { url: 'https://example.com/', timeoutMs: 3_600_000 },
    })) as any
    const tooSettled = (await client.callTool({
      name: 'coherent_extract',
      arguments: { url: 'https://example.com/', settleMs: 600_000 },
    })) as any
    const negative = (await client.callTool({
      name: 'coherent_extract',
      arguments: { url: 'https://example.com/', settleMs: -1 },
    })) as any

    expect(tooLong.isError).toBe(true)
    expect(tooSettled.isError).toBe(true)
    expect(negative.isError).toBe(true)
    expect(mockedCapture).not.toHaveBeenCalled()
    await close()
  })

  it('rejects a malformed URL at the schema boundary — the pipeline is never entered', async () => {
    const { client, close } = await connectedClient()
    const res = (await client.callTool({ name: 'coherent_extract', arguments: { url: 'not a url' } })) as any
    expect(res.isError).toBe(true)
    expect(mockedCapture).not.toHaveBeenCalled()
    await close()
  })

  it('refuses loopback through the real SSRF gate — no browser is launched', async () => {
    const { client, close } = await connectedClient()
    const res = (await client.callTool({
      name: 'coherent_extract',
      arguments: { url: 'http://127.0.0.1:8080/' },
    })) as any
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toMatch(/^Extraction failed:/)
    expect(res.content[0].text).toMatch(/loopback/i)
    await close()
  })

  it('refuses the cloud metadata endpoint', async () => {
    const { client, close } = await connectedClient()
    const res = (await client.callTool({
      name: 'coherent_extract',
      arguments: { url: 'http://169.254.169.254/latest/meta-data/' },
    })) as any
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toMatch(/169\.254/)
    await close()
  })

  it('refuses a non-http scheme that zod .url() alone would accept', async () => {
    const { client, close } = await connectedClient()
    const res = (await client.callTool({ name: 'coherent_extract', arguments: { url: 'file:///etc/passwd' } })) as any
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toMatch(/scheme/i)
    await close()
  })

  it('returns the extraction payload as JSON, with the semantic pass off by default', async () => {
    mockedCapture.mockResolvedValueOnce(PAYLOAD)
    const { client, close } = await connectedClient()
    const res = await client.callTool({ name: 'coherent_extract', arguments: { url: 'https://example.com/' } })
    const out = json(res as any)

    expect(out.source.title).toBe('Example')
    expect(out.tokens.colors[0].hex).toBe('#635bff')
    expect(out.semantic).toBeNull()
    expect(mockedCapture).toHaveBeenCalledWith('https://example.com/', { semantic: false })
    await close()
  })

  it('forwards semantic:true to the pipeline', async () => {
    mockedCapture.mockResolvedValueOnce(PAYLOAD)
    const { client, close } = await connectedClient()
    await client.callTool({ name: 'coherent_extract', arguments: { url: 'https://example.com/', semantic: true } })
    expect(mockedCapture).toHaveBeenCalledWith('https://example.com/', { semantic: true })
    await close()
  })

  it('surfaces a missing Playwright install as an actionable error, not a stack trace', async () => {
    mockedCapture.mockRejectedValueOnce(
      new Error('PLAYWRIGHT_NOT_INSTALLED: `coherent extract` needs Playwright.\n  npm install -g playwright'),
    )
    const { client, close } = await connectedClient()
    const res = (await client.callTool({
      name: 'coherent_extract',
      arguments: { url: 'https://example.com/' },
    })) as any
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toContain('PLAYWRIGHT_NOT_INSTALLED')
    expect(res.content[0].text).toContain('npm install -g playwright')
    await close()
  })

  it('surfaces a navigation timeout as a tool error rather than crashing the server', async () => {
    mockedCapture.mockRejectedValueOnce(new Error('NAVIGATION_TIMEOUT: https://example.com/ after 30000ms'))
    const { client, close } = await connectedClient()
    const res = (await client.callTool({
      name: 'coherent_extract',
      arguments: { url: 'https://example.com/' },
    })) as any
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toBe('Extraction failed: NAVIGATION_TIMEOUT: https://example.com/ after 30000ms')
    // The server survives — a second call still round-trips.
    const { tools } = await client.listTools()
    expect(tools).toHaveLength(6)
    await close()
  })
})
