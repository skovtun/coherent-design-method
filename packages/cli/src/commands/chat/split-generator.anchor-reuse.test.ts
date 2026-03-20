import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { ComponentManager, type DesignSystemConfig } from '@getcoherent/core'
import { parseModification } from '../../agents/modifier.js'
import { splitGeneratePages } from './split-generator.js'
import { MIN_ANCHOR_PAGE_CODE_CHARS } from './utils.js'

vi.mock('../../agents/modifier.js', () => ({
  parseModification: vi.fn(),
}))

const spinner = {
  start() {
    return this
  },
  succeed() {
    return this
  },
  fail() {
    return this
  },
  warn() {
    return this
  },
  text: '',
} as import('ora').Ora

function minimalConfig(): DesignSystemConfig {
  return {
    name: 'Test',
    description: 'd',
    settings: {
      initialized: true,
      appType: 'multi-page',
      framework: 'next',
      typescript: true,
      cssFramework: 'tailwind',
      autoScaffold: false,
    },
    tokens: {} as DesignSystemConfig['tokens'],
    components: [],
    pages: [],
    navigation: { type: 'header', enabled: true, items: [] },
    layoutBlocks: [],
    metadata: { version: '1', lastModified: new Date().toISOString() },
  } as unknown as DesignSystemConfig
}

describe('splitGeneratePages — existing anchor reuse', () => {
  beforeEach(() => {
    vi.mocked(parseModification).mockReset()
  })
  afterEach(() => {
    vi.mocked(parseModification).mockReset()
  })

  it('does not call parseModification for home when disk anchor exists and there are other pages', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'co-split-anchor-'))
    mkdirSync(join(dir, 'app'), { recursive: true })
    const pad = 'x'.repeat(MIN_ANCHOR_PAGE_CODE_CHARS)
    writeFileSync(
      join(dir, 'app', 'page.tsx'),
      `export default function Home(){return <main className="container max-w-6xl mx-auto px-4">${pad}</main>}`,
      'utf-8',
    )
    try {
      vi.mocked(parseModification).mockImplementation(async (_msg, _ctx, _p, opts) => {
        if (opts?.planOnly) {
          return {
            requests: [
              { type: 'add-page' as const, target: 'new' as const, changes: { id: 'home', name: 'Home', route: '/' } },
              { type: 'add-page' as const, target: 'new' as const, changes: { id: 'about', name: 'About', route: '/about' } },
            ],
          }
        }
        return {
          requests: [
            {
              type: 'add-page' as const,
              target: 'new' as const,
              changes: { id: 'about', name: 'About', route: '/about', pageCode: '// ok' },
            },
          ],
        }
      })

      const cm = new ComponentManager(minimalConfig())
      const out = await splitGeneratePages(spinner as never, 'add home and about', { config: minimalConfig(), componentManager: cm }, 'auto', {
        projectRoot: dir,
      })

      expect(out).toHaveLength(1)
      expect((out[0].changes as { id?: string }).id).toBe('about')

      const nonPlanCalls = vi.mocked(parseModification).mock.calls.filter(([, , , o]) => !o?.planOnly)
      expect(nonPlanCalls).toHaveLength(1)
      expect(String(nonPlanCalls[0][0])).toContain('About')
      expect(String(nonPlanCalls[0][0])).not.toMatch(/Create ONE page called "Home"/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('still calls parseModification for home when projectRoot is omitted', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'co-split-no-root-'))
    mkdirSync(join(dir, 'app'), { recursive: true })
    writeFileSync(
      join(dir, 'app', 'page.tsx'),
      `export default function Home(){return <div>${'y'.repeat(MIN_ANCHOR_PAGE_CODE_CHARS)}</div>}`,
      'utf-8',
    )
    try {
      let homeCalls = 0
      vi.mocked(parseModification).mockImplementation(async (msg, _ctx, _p, opts) => {
        if (opts?.planOnly) {
          return {
            requests: [
              { type: 'add-page' as const, target: 'new' as const, changes: { id: 'home', name: 'Home', route: '/' } },
              { type: 'add-page' as const, target: 'new' as const, changes: { id: 'z', name: 'Z', route: '/z' } },
            ],
          }
        }
        if (String(msg).includes('Create ONE page called "Home"')) {
          homeCalls++
          return {
            requests: [
              {
                type: 'add-page' as const,
                target: 'new' as const,
                changes: { id: 'home', name: 'Home', route: '/', pageCode: '// h' },
              },
            ],
          }
        }
        return {
          requests: [
            { type: 'add-page' as const, target: 'new' as const, changes: { id: 'z', name: 'Z', route: '/z', pageCode: '// z' } },
          ],
        }
      })

      const cm = new ComponentManager(minimalConfig())
      await splitGeneratePages(spinner as never, 'pages: home z', { config: minimalConfig(), componentManager: cm }, 'auto', {})

      expect(homeCalls).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
