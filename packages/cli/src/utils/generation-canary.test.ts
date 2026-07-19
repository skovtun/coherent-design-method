import { describe, it, expect, vi } from 'vitest'

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: async () => ({ content: [{ type: 'text', text: '{}' }] }) }
    constructor() {}
  },
}))

import { ClaudeClient } from './claude.js'
import type { ModificationRequest } from '@getcoherent/core'

/**
 * Generation canary — the regression lock for PJ-016 (the month-long P0 where a
 * fresh multi-page `coherent chat` silently produced empty pages after the
 * Sonnet 5 migration).
 *
 * The root cause was NOT the model — it was the pipeline dropping a page the
 * model actually returned, because Sonnet 5 returns pages in several shapes the
 * parser didn't all handle (flattened request, trailing content, bare object,
 * fenced TSX, prose-wrapped fence). Each shape below is a real observed
 * response. For every one, the assertion is the same and load-bearing: a
 * usable add-page request with NON-EMPTY pageCode must come out of
 * `parseModification`. If a future refactor breaks any branch of the
 * parse/normalize/extract chain, this fails in CI instead of shipping empty
 * pages to users for a month.
 */

function clientReturning(responseText: string): ClaudeClient {
  const client = new ClaudeClient('test-key')
  ;(client as any).client = {
    messages: {
      create: async () => ({ content: [{ type: 'text', text: responseText }], stop_reason: 'end_turn' }),
    },
  }
  return client
}

const PAGE = 'export default function Home() {\n  return <div className="space-y-6">Real page</div>\n}'

/** Pull the pageCode a downstream consumer would read (`request.changes.pageCode`). */
function pageCodeOf(requests: unknown[]): string {
  const addPage = (requests as ModificationRequest[]).find(r => r?.type === 'add-page')
  return ((addPage?.changes as Record<string, unknown> | undefined)?.pageCode as string) ?? ''
}

const SHAPES: Array<{ name: string; raw: string }> = [
  {
    name: 'nested JSON (Sonnet 4 style — changes wrapper)',
    raw: JSON.stringify({
      requests: [{ type: 'add-page', target: 'new', changes: { id: 'home', route: '/', pageCode: PAGE } }],
    }),
  },
  {
    name: 'flattened JSON (Sonnet 5 — fields on the request, no changes wrapper)',
    raw: JSON.stringify({
      requests: [{ type: 'add-page', target: 'new', id: 'home', name: 'Home', route: '/', pageCode: PAGE }],
    }),
  },
  {
    name: 'bare single request object (no requests wrapper)',
    raw: JSON.stringify({ type: 'add-page', target: 'new', id: 'home', route: '/', pageCode: PAGE }),
  },
  {
    name: 'JSON with trailing content after the value',
    raw:
      JSON.stringify({ requests: [{ type: 'add-page', changes: { route: '/', pageCode: PAGE } }] }) +
      '\n\n```tsx\n// stray\n```',
  },
  {
    name: 'fenced TSX (header + ```tsx block)',
    raw: `{ "type": "add-page", "target": "new", "changes": { "id": "home", "name": "Home", "route": "/" } }\n\n\`\`\`tsx\n${PAGE}\n\`\`\``,
  },
  {
    name: 'fenced TSX wrapped in prose + trailing note',
    raw: `Here is the page:\n\n{ "type": "add-page", "changes": { "route": "/" } }\n\n\`\`\`tsx\n${PAGE}\n\`\`\`\n\nLet me know if you want changes.`,
  },
  {
    name: 'fenced with ```jsx tag',
    raw: `{ "type": "add-page", "changes": { "route": "/" } }\n\n\`\`\`jsx\n${PAGE}\n\`\`\``,
  },
  {
    name: 'markdown ```json fence around the envelope',
    raw:
      '```json\n' +
      JSON.stringify({ requests: [{ type: 'add-page', changes: { route: '/', pageCode: PAGE } }] }) +
      '\n```',
  },
]

describe('generation canary — every Sonnet 5 page shape yields a non-empty page', () => {
  for (const shape of SHAPES) {
    it(shape.name, async () => {
      const client = clientReturning(shape.raw)
      const result = await client.parseModification('generate the home page')
      const code = pageCodeOf(result.requests)
      expect(code, `no pageCode extracted from: ${shape.name}`).toContain('export default function')
      expect(code.length).toBeGreaterThan(40)
    })
  }
})

describe('generation canary — truncation surfaces loudly (never a silent empty page)', () => {
  it('a max_tokens stop throws RESPONSE_TRUNCATED instead of returning empty', async () => {
    const client = new ClaudeClient('test-key')
    ;(client as any).client = {
      messages: {
        // Full-looking content but stopped at the token ceiling — the exact
        // shape that produced empty pages before v0.22.8 (thinking ate the
        // budget). The guard must convert it to a thrown, coded error.
        create: async () => ({
          content: [{ type: 'text', text: '{"requests":[{"type":"add-page","changes":{"pageCode":"import' }],
          stop_reason: 'max_tokens',
        }),
      },
    }
    await expect(client.parseModification('generate the home page')).rejects.toMatchObject({
      code: 'RESPONSE_TRUNCATED',
    })
  })
})
