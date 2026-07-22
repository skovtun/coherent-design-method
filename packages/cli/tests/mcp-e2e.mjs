#!/usr/bin/env node
/**
 * MCP live e2e — the two things the in-process suite cannot cover.
 *
 * Run from the monorepo root: `pnpm test:mcp-e2e`
 *
 *   1. The stdio wire. `mcp.test.ts` drives the server through
 *      InMemoryTransport, so it never proves that JSON-RPC framing survives a
 *      real subprocess — a single stray `console.log` on stdout would corrupt
 *      the stream and the in-process suite would still be green.
 *   2. A real Chromium capture. `coherent_extract`'s pipeline is tested with
 *      the browser factory mocked; this runs the actual browser against live
 *      sites, including one (stripe.com) whose network never goes quiet.
 *
 * Requires: `npm run build` first, network access, and the optional
 * `playwright` peer dep (`npm i -g playwright && npx playwright install
 * chromium`). Not part of CI — it is slow, networked, and browser-bound.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const CLI_BIN = join(ROOT, 'packages', 'cli', 'dist', 'index.js')

const results = []
function check(name, pass, detail = '') {
  results.push({ name, pass })
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const transport = new StdioClientTransport({
  command: 'node',
  args: [CLI_BIN, 'mcp'],
  cwd: ROOT,
  stderr: 'pipe',
})
const client = new Client({ name: 'coherent-e2e', version: '1.0.0' })
await client.connect(transport)
check('stdio handshake', true)

const { tools } = await client.listTools()
check('tools/list returns 6 tools', tools.length === 6, tools.map(t => t.name).join(', '))

const validate = await client.callTool({
  name: 'coherent_validate',
  arguments: { code: 'export default function P(){return <div className="bg-gray-100">x</div>}' },
})
const verdict = JSON.parse(validate.content[0].text)
check('coherent_validate flags a raw Tailwind color', verdict.passed === false && verdict.errorCount > 0, verdict.summary)

const ssrf = await client.callTool({ name: 'coherent_extract', arguments: { url: 'http://127.0.0.1:8080/' } })
check('coherent_extract refuses loopback', ssrf.isError === true)

// Live captures. linear.app is dark-mode + webfont-heavy; stripe.com never
// reaches networkidle (the captured-on-load fallback path).
for (const url of ['https://example.com/', 'https://linear.app/', 'https://stripe.com/']) {
  const t0 = Date.now()
  const res = await client.callTool({ name: 'coherent_extract', arguments: { url } })
  if (res.isError) {
    check(`live capture ${url}`, false, res.content[0].text.slice(0, 160))
    continue
  }
  const p = JSON.parse(res.content[0].text)
  const shaped = ['source', 'hero', 'tokens', 'semantic'].every(k => k in p)
  check(
    `live capture ${url}`,
    shaped && p.tokens.colors.length > 0 && p.semantic === null,
    `${Date.now() - t0}ms · ${p.tokens.colors.length} colors · mode=${p.source.mode}`,
  )
}

// settleMs is a real wall-clock delay in the browser, not just a forwarded arg.
const timed = async args => {
  const t0 = Date.now()
  await client.callTool({ name: 'coherent_extract', arguments: { url: 'https://example.com/', ...args } })
  return Date.now() - t0
}
const base = Math.min(await timed({}), await timed({}))
const settled = Math.min(await timed({ settleMs: 8000 }), await timed({ settleMs: 8000 }))
check('settleMs delays the real capture', settled - base > 7000, `base ${base}ms → ${settled}ms`)

const overCap = await client.callTool({
  name: 'coherent_extract',
  arguments: { url: 'https://example.com/', timeoutMs: 3_600_000 },
})
check('timeoutMs above the cap is refused by the schema', overCap.isError === true)

// The server must still be framing correctly after all of that.
check('server survives the browser runs', (await client.listTools()).tools.length === 6)

await client.close()
const failed = results.filter(r => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
