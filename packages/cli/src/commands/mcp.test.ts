/**
 * MCP server integration tests. Uses the SDK's in-memory transport pair so a
 * real Client drives the real server registration in-process — no subprocess,
 * no stdio, no browser. Covers tool discovery + each non-browser tool's happy
 * path and error path. `coherent_extract` is browser-bound (playwright) and
 * exercised by the extract command's own suite / manual e2e, not here.
 */
import { describe, it, expect } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { registerCoherentTools } from './mcp.js'

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
