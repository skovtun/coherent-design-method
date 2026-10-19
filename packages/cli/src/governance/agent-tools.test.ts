import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Each call builds the TypeScript graph; under a full parallel run that can pass 5s.
vi.setConfig({ testTimeout: 30_000 })
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { registerGovernanceTools } from './agent-tools.js'
import { preWriteDecision } from './hook.js'
import { hashTree, loadTransaction } from './transaction.js'

let root: string
const write = (p: string, c: string) => {
  mkdirSync(join(root, p, '..'), { recursive: true })
  writeFileSync(join(root, p), c)
}
const read = (p: string) => readFileSync(join(root, p), 'utf-8')

async function connect() {
  const server = new McpServer({ name: 'coherent', version: 'test' })
  registerGovernanceTools(server)
  const [ct, st] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '1.0.0' })
  await Promise.all([client.connect(ct), server.connect(st)])
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = (await client.callTool({ name, arguments: { root, ...args } })) as {
      content: { text: string }[]
      isError?: boolean
    }
    if (r.isError) throw new Error(r.content[0].text)
    return JSON.parse(r.content[0].text)
  }
  return { client, call }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cagent-'))
  // No tsconfig: typecheck is skipped, so these tests need no compiler.
  write('src/components/card.tsx', 'export function Card() {\n  return <div />\n}\n')
  write('src/app/page.tsx', "import { Card } from '../components/card'\nexport default () => <Card />\n")
  write('src/app/about/page.tsx', 'export default () => <p>About</p>\n')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('agent-mode MCP tools', () => {
  it('serves only the governance tools', async () => {
    const { client } = await connect()
    const { tools } = await client.listTools()
    expect(tools.map(t => t.name).sort()).toEqual([
      'coherent_begin_edit',
      'coherent_ds_sync',
      'coherent_inventory',
      'coherent_rollback_edit',
      'coherent_verify_edit',
    ])
  })

  it('runs the whole protocol: inventory → begin → write → verify → rollback', async () => {
    const { call } = await connect()
    const inv = await call('coherent_inventory', {})
    expect(inv.protocol).toBe(1)
    expect(inv.inventory).toContain('src/components/card.tsx')
    expect(inv.openEdit).toBeNull()

    const before = hashTree(root)
    const begun = await call('coherent_begin_edit', {
      request: 'make the card a section',
      scope: 'component',
      modify: ['src/components/card.tsx'],
    })
    expect(begun.affectedRoutes).toEqual(['/'])
    expect((await call('coherent_inventory', {})).openEdit.txId).toBe(begun.txId)

    write('src/components/card.tsx', 'export function Card() {\n  return <section />\n}\n')
    const fast = await call('coherent_verify_edit', { level: 'fast' })
    expect(fast).toMatchObject({ ok: true, status: 'open', outOfPlan: [] })

    const final = await call('coherent_verify_edit', { level: 'final' })
    expect(final).toMatchObject({ ok: true, status: 'committed', verdict: 'verified_without_visual' })

    const rb = await call('coherent_rollback_edit', {})
    expect(rb.txId).toBe(begun.txId)
    expect(hashTree(root)).toEqual(before)
  })

  it('catches a write outside the declared set (e.g. via Bash) and keeps a failed edit open', async () => {
    const { call } = await connect()
    await call('coherent_begin_edit', { request: 'r', scope: 'page', modify: ['src/app/page.tsx'] })
    write('src/app/page.tsx', 'export default () => <main />\n')
    write('src/app/about/page.tsx', 'export default () => <p>Sneaky</p>\n')
    const fast = await call('coherent_verify_edit', { level: 'fast' })
    expect(fast.ok).toBe(false)
    expect(fast.outOfPlan).toEqual(['src/app/about/page.tsx'])
    const final = await call('coherent_verify_edit', { level: 'final' })
    expect(final).toMatchObject({ ok: false, verdict: 'failed', status: 'open' })
    expect(final.problems.join('\n')).toMatch(/outside the declared write set/)
  })

  it('lets the agent amend the write set, then verifies clean', async () => {
    const { call } = await connect()
    const begun = await call('coherent_begin_edit', {
      request: 'r',
      scope: 'page',
      modify: ['src/app/page.tsx'],
    })
    write('src/app/page.tsx', 'export default () => <main />\n')
    write('src/components/badge.tsx', 'export const Badge = () => <span />\n')
    const amended = await call('coherent_begin_edit', {
      request: 'r',
      scope: 'page',
      create: ['src/components/badge.tsx'],
      amend: begun.txId,
    })
    expect(amended.writeSet.create).toEqual(['src/components/badge.tsx'])
    expect((await call('coherent_verify_edit', { level: 'fast' })).ok).toBe(true)
    // Rolling back still deletes the created file, although it existed when declared.
    await call('coherent_rollback_edit', {})
    expect(existsSync(join(root, 'src/components/badge.tsx'))).toBe(false)
    expect(read('src/app/page.tsx')).toContain('<Card />')
  })

  it('recovers the open edit from disk after a server restart', async () => {
    const a = await connect()
    const begun = await a.call('coherent_begin_edit', {
      request: 'r',
      scope: 'page',
      modify: ['src/app/page.tsx'],
    })
    write('src/app/page.tsx', 'export default () => <main />\n')
    const b = await connect() // a new server process
    expect((await b.call('coherent_inventory', {})).openEdit.txId).toBe(begun.txId)
    const final = await b.call('coherent_verify_edit', { level: 'final' })
    expect(final.status).toBe('committed')
    expect(loadTransaction(root, begun.txId).status).toBe('committed')
  })

  it('returns errors as tool errors, not crashes', async () => {
    const { call } = await connect()
    await expect(call('coherent_verify_edit', { level: 'fast' })).rejects.toThrow(/No open edit/)
    await expect(
      call('coherent_begin_edit', { request: 'r', scope: 'page', create: ['../escape.tsx'] }),
    ).rejects.toThrow(/Unsafe path/)
    await expect(
      call('coherent_begin_edit', { request: 'r', scope: 'page', modify: ['src/nope.tsx'] }),
    ).rejects.toThrow(/do not exist/)
  })
})

describe('pre-write hook', () => {
  const env = () => ({ CLAUDE_PROJECT_DIR: root })
  const edit = (file: string) => preWriteDecision({ tool_name: 'Edit', tool_input: { file_path: file } }, env())

  it('requires an open edit for project files, allows tool/state dirs and files outside the project', async () => {
    expect(edit(join(root, 'src/app/page.tsx'))).toMatch(/coherent_begin_edit/)
    expect(edit(join(root, '.claude/notes.md'))).toBeNull()
    expect(edit(join(root, 'node_modules/x/index.js'))).toBeNull()
    expect(edit('/tmp/elsewhere.txt')).toBeNull()
  })

  it('allows declared files and points undeclared ones at amend', async () => {
    const { call } = await connect()
    const begun = await call('coherent_begin_edit', {
      request: 'r',
      scope: 'page',
      modify: ['src/app/page.tsx'],
    })
    expect(edit(join(root, 'src/app/page.tsx'))).toBeNull()
    expect(edit('src/app/page.tsx')).toBeNull()
    expect(edit(join(root, 'src/app/about/page.tsx'))).toContain(`amend="${begun.txId}"`)
  })
})

describe('changes made outside Coherent', () => {
  it('reports files changed since the last verified edit', async () => {
    const { call } = await connect()
    await call('coherent_begin_edit', { request: 'r', scope: 'page', modify: ['src/app/page.tsx'] })
    write('src/app/page.tsx', 'export default () => <main />\n')
    await call('coherent_verify_edit', { level: 'final' })
    expect((await call('coherent_inventory', {})).changedOutsideCoherent).toBeNull()
    // e.g. Codex without the write guard, or an IDE
    write('src/app/about/page.tsx', 'export default () => <p>Changed elsewhere</p>\n')
    const inv = await call('coherent_inventory', {})
    expect(inv.changedOutsideCoherent.files).toEqual(['src/app/about/page.tsx'])
  })
})

describe('design system (ADR-0013)', () => {
  it('syncs IDs and the /design-system page as a normal, verified, undoable edit', async () => {
    const { call } = await connect()
    const before = hashTree(root)
    const sync = await call('coherent_ds_sync', {})
    expect(sync.assigned).toEqual([{ id: 'CID-001', name: 'Card', file: 'src/components/card.tsx' }])
    expect(read('src/components/card.tsx')).toMatch(/^\/\*\* @coherent-id CID-001 \*\/\nexport function Card/)
    expect(read('src/app/design-system/page.tsx')).toContain('"CID-001"')
    // Only comments were added: the page that renders Card must stay identical.
    expect(sync.renderedRoutes).toContain('/ (must not change)')
    const final = await call('coherent_verify_edit', { level: 'final' })
    expect(final).toMatchObject({ ok: true, status: 'committed' })

    const inv = await call('coherent_inventory', {})
    expect(inv.designSystem.page).toBe('/design-system')
    expect(inv.designSystem.components).toEqual([
      { id: 'CID-001', name: 'Card', kind: 'block', file: 'src/components/card.tsx', routes: ['/'] },
    ])
    expect(await call('coherent_ds_sync', {})).toMatchObject({ inSync: true })

    await call('coherent_rollback_edit', {})
    expect(hashTree(root)).toEqual(before)
  })

  it('edits by ID: the component file only, with the page kept current inside the same edit', async () => {
    const { call } = await connect()
    await call('coherent_ds_sync', {})
    await call('coherent_verify_edit', { level: 'final' })

    const begun = await call('coherent_begin_edit', {
      request: 'CID-001: make it a section',
      scope: 'component',
      target: 'CID-001',
    })
    expect(begun.writeSet.modify).toEqual(['src/components/card.tsx', 'src/app/design-system/page.tsx'])
    write('src/components/card.tsx', read('src/components/card.tsx').replace('<div />', '<section />'))
    expect((await call('coherent_verify_edit', { level: 'final' })).ok).toBe(true)

    await expect(call('coherent_begin_edit', { request: 'r', scope: 'page', target: 'CID-001' })).rejects.toThrow(
      /is a component: use scope "component"/,
    )
    await expect(
      call('coherent_begin_edit', {
        request: 'r',
        scope: 'component',
        target: '@card',
        modify: ['src/components/card.tsx', 'src/app/page.tsx'],
      }),
    ).rejects.toThrow(/changes only src\/components\/card.tsx/)
  })

  it('keeps page edits away from components and token edits in the stylesheet', async () => {
    const { call } = await connect()
    write('src/app/globals.css', ':root { --radius: 0.5rem; }\n')
    await expect(
      call('coherent_begin_edit', {
        request: 'r',
        scope: 'page',
        modify: ['src/app/page.tsx', 'src/components/card.tsx'],
      }),
    ).rejects.toThrow(/A page edit cannot change components or tokens/)
    await expect(
      call('coherent_begin_edit', { request: 'r', scope: 'tokens', modify: ['src/app/page.tsx'] }),
    ).rejects.toThrow(/A token edit changes only stylesheets/)
  })

  it('fails a new component without an ID once the project has a design system, and says which ID to use', async () => {
    const { call } = await connect()
    await call('coherent_ds_sync', {})
    await call('coherent_verify_edit', { level: 'final' })
    const begun = await call('coherent_begin_edit', {
      request: 'add a badge',
      scope: 'new-component',
      create: ['src/components/badge.tsx'],
    })
    expect(begun.idsForNewComponents[0]).toBe('CID-002')
    write('src/components/badge.tsx', 'export function Badge() { return <span /> }\n')
    const fast = await call('coherent_verify_edit', { level: 'fast' })
    expect(fast.ok).toBe(false)
    expect(fast.problems.join('\n')).toMatch(
      /Badge in src\/components\/badge.tsx → add `\/\*\* @coherent-id CID-002 \*\/`/,
    )
    write('src/components/badge.tsx', '/** @coherent-id CID-002 */\nexport function Badge() { return <span /> }\n')
    expect((await call('coherent_verify_edit', { level: 'fast' })).ok).toBe(true)
  })
})
