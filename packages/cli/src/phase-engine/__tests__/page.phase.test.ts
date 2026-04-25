import { describe, it, expect, beforeEach } from 'vitest'
import type { DesignSystemConfig } from '@getcoherent/core'
import { InMemorySessionStore } from '../in-memory-session-store.js'
import { createPagePhase, type PageArtifact, type PagesInput } from '../phases/page.js'
import { buildInlinePagePrompt, buildPagePrompt } from '../prompt-builders/page.js'
import type { PageSpec, PagesInputShared } from '../prompt-builders/page.js'

const baseConfig = (overrides: Partial<DesignSystemConfig> = {}): DesignSystemConfig =>
  ({
    name: 'My App',
    pages: [{ name: 'Home', route: '/' }],
    navigation: { type: 'header' },
    settings: { appType: 'web' },
    components: [],
    tokens: {
      colors: {
        light: {
          primary: '#000000',
          secondary: '#111111',
          accent: '#222222',
          success: '#22c55e',
          warning: '#f59e0b',
          error: '#ef4444',
          info: '#3b82f6',
          background: '#ffffff',
          foreground: '#0a0a0a',
          muted: '#f4f4f5',
          border: '#e4e4e7',
        },
        dark: {
          primary: '#ffffff',
          secondary: '#eeeeee',
          accent: '#dddddd',
          success: '#22c55e',
          warning: '#f59e0b',
          error: '#ef4444',
          info: '#3b82f6',
          background: '#0a0a0a',
          foreground: '#fafafa',
          muted: '#27272a',
          border: '#3f3f46',
        },
      },
    },
    ...overrides,
  }) as unknown as DesignSystemConfig

const baseSpec = (overrides: Partial<PageSpec> = {}): PageSpec => ({
  id: 'dashboard',
  name: 'Dashboard',
  route: '/dashboard',
  pageType: 'app',
  atmosphereDirective: '',
  designConstraints: 'DESIGN QUALITY (app): dense, data-first.',
  layoutNote: 'LAYOUT: sidebar.',
  reusePlanDirective: '',
  tieredComponentsPrompt: undefined,
  authNote: null,
  planSummary: '',
  existingPagesContext: '',
  pageSections: [],
  ...overrides,
})

const baseShared = (overrides: Partial<PagesInputShared> = {}): PagesInputShared => ({
  message: 'build a SaaS app',
  styleContext: '',
  existingAppPageNote: '',
  designMemoryBlock: '',
  routeNote: 'EXISTING ROUTES in this project: /, /dashboard.',
  alignmentNote: 'CRITICAL LAYOUT RULE: container matching.',
  config: baseConfig(),
  componentRegistry: 'Available components: Button, Card',
  sharedComponentsSummary: undefined,
  projectRoot: null,
  ...overrides,
})

const baseInput = (overrides: Partial<PagesInput> = {}): PagesInput => ({
  shared: baseShared(),
  pages: [baseSpec()],
  ...overrides,
})

describe('buildInlinePagePrompt (pure)', () => {
  it('includes the page name, route, and pageType header', () => {
    const out = buildInlinePagePrompt(baseSpec(), baseShared())
    expect(out).toContain('Create ONE page called "Dashboard" at route "/dashboard".')
    expect(out).toContain('PAGE TYPE: app')
  })

  it('injects the shared message into the Context line', () => {
    const out = buildInlinePagePrompt(baseSpec(), baseShared({ message: 'pricing page for Acme' }))
    expect(out).toContain('Context: pricing page for Acme.')
  })

  it('falls back reuse → tiered → nothing in that order', () => {
    const viaReuse = buildInlinePagePrompt(baseSpec({ reusePlanDirective: 'REUSE: Hero' }), baseShared())
    expect(viaReuse).toContain('REUSE: Hero')

    const viaTiered = buildInlinePagePrompt(
      baseSpec({ reusePlanDirective: '', tieredComponentsPrompt: 'TIERED: FeatureCard' }),
      baseShared(),
    )
    expect(viaTiered).toContain('TIERED: FeatureCard')
    expect(viaTiered).not.toContain('REUSE: Hero')

    const nothing = buildInlinePagePrompt(baseSpec(), baseShared())
    expect(nothing).not.toContain('REUSE:')
    expect(nothing).not.toContain('TIERED:')
  })

  it('omits existingAppPageNote for auth pages', () => {
    const appOut = buildInlinePagePrompt(baseSpec(), baseShared({ existingAppPageNote: 'EXISTING APP PAGE: x' }))
    expect(appOut).toContain('EXISTING APP PAGE: x')

    const authOut = buildInlinePagePrompt(
      baseSpec({ pageType: 'auth', id: 'login', name: 'Login', route: '/login' }),
      baseShared({ existingAppPageNote: 'EXISTING APP PAGE: x' }),
    )
    expect(authOut).not.toContain('EXISTING APP PAGE: x')
  })

  it('drops empty parts without leaving blank lines', () => {
    const out = buildInlinePagePrompt(baseSpec(), baseShared())
    expect(out).not.toMatch(/\n\n\n/)
  })

  it('includes authNote only when provided', () => {
    const withAuth = buildInlinePagePrompt(
      baseSpec({ pageType: 'auth', authNote: 'AUTH: centered card only.' }),
      baseShared(),
    )
    expect(withAuth).toContain('AUTH: centered card only.')

    const withoutAuth = buildInlinePagePrompt(baseSpec(), baseShared())
    expect(withoutAuth).not.toContain('AUTH:')
  })
})

describe('buildPagePrompt (wraps buildModificationPrompt)', () => {
  it('wraps inline with the full modification prompt (constraints + registry)', () => {
    const out = buildPagePrompt(baseSpec(), baseShared())
    expect(out).toContain('Create ONE page called "Dashboard"')
    expect(out).toContain('Available components: Button, Card')
    expect(out).toContain('EXISTING ROUTES IN THIS PROJECT')
  })

  it('passes reusePlanDirective through to the mod prompt as a directive section', () => {
    const out = buildPagePrompt(baseSpec({ reusePlanDirective: 'REUSE: Hero, Footer' }), baseShared())
    expect(out).toContain('COMPONENT REUSE DIRECTIVE')
    expect(out).toContain('REUSE: Hero, Footer')
  })
})

describe('createPagePhase', () => {
  let store: InMemorySessionStore
  let sessionId: string

  beforeEach(async () => {
    store = new InMemorySessionStore()
    const meta = await store.create()
    sessionId = meta.uuid
  })

  async function writeInput(input: PagesInput) {
    await store.writeArtifact(sessionId, 'pages-input.json', JSON.stringify(input))
  }

  it('exposes phase shape with pageId in name', () => {
    const phase = createPagePhase('dashboard')
    expect(phase.kind).toBe('ai')
    expect(phase.name).toBe('page:dashboard')
  })

  it('prep builds the page prompt for the matching pageId', async () => {
    await writeInput(
      baseInput({
        pages: [
          baseSpec({ id: 'home', name: 'Home', route: '/' }),
          baseSpec({ id: 'dashboard', name: 'Dashboard', route: '/dashboard' }),
        ],
      }),
    )
    const prompt = await createPagePhase('dashboard').prep({ session: store, sessionId })
    expect(prompt).toContain('Create ONE page called "Dashboard" at route "/dashboard"')
    expect(prompt).not.toContain('Create ONE page called "Home" at route "/"')
  })

  it('prep throws when pageId is not in pages-input', async () => {
    await writeInput(baseInput({ pages: [baseSpec({ id: 'home' })] }))
    await expect(createPagePhase('ghost').prep({ session: store, sessionId })).rejects.toThrow(
      /pageId "ghost" not found/,
    )
  })

  it('prep throws when input artifact missing', async () => {
    await expect(createPagePhase('home').prep({ session: store, sessionId })).rejects.toThrow(
      /missing required artifact "pages-input.json"/,
    )
  })

  it('prep throws on malformed input shape', async () => {
    await store.writeArtifact(sessionId, 'pages-input.json', JSON.stringify({ shared: {} }))
    await expect(createPagePhase('home').prep({ session: store, sessionId })).rejects.toThrow(
      /must have a "shared" object and a "pages" array/,
    )
  })

  it('ingest writes page-<id>.json with the add-page request', async () => {
    await writeInput(baseInput())
    const aiResponse = JSON.stringify({
      requests: [
        {
          type: 'add-page',
          target: 'new',
          changes: {
            id: 'dashboard',
            name: 'Dashboard',
            route: '/dashboard',
            pageCode: 'export default function Page(){ return <div/> }',
          },
        },
      ],
    })
    await createPagePhase('dashboard').ingest(aiResponse, { session: store, sessionId })

    const out = JSON.parse((await store.readArtifact(sessionId, 'page-dashboard.json'))!) as PageArtifact
    expect(out.id).toBe('dashboard')
    expect(out.name).toBe('Dashboard')
    expect(out.route).toBe('/dashboard')
    expect(out.pageType).toBe('app')
    expect(out.request?.type).toBe('add-page')
    const changes = out.request?.changes as Record<string, unknown>
    expect(changes.pageCode).toContain('function Page')
  })

  it('ingest writes request: null when AI returns no add-page request', async () => {
    await writeInput(baseInput())
    await createPagePhase('dashboard').ingest(JSON.stringify({ requests: [] }), { session: store, sessionId })

    const out = JSON.parse((await store.readArtifact(sessionId, 'page-dashboard.json'))!) as PageArtifact
    expect(out.request).toBeNull()
    expect(out.id).toBe('dashboard')
  })

  it('ingest accepts ```json fenced responses', async () => {
    await writeInput(baseInput())
    const aiResponse =
      '```json\n{"requests":[{"type":"add-page","target":"new","changes":{"pageCode":"export function P(){}"}}]}\n```'
    await createPagePhase('dashboard').ingest(aiResponse, { session: store, sessionId })

    const out = JSON.parse((await store.readArtifact(sessionId, 'page-dashboard.json'))!) as PageArtifact
    expect(out.request?.type).toBe('add-page')
  })

  it('preserves pageCode verbatim through ingest', async () => {
    await writeInput(baseInput())
    const pageCode = 'import X from "y"\nexport function Page(){\n  return <div className="x">hi</div>\n}'
    await createPagePhase('dashboard').ingest(
      JSON.stringify({ requests: [{ type: 'add-page', target: 'new', changes: { pageCode } }] }),
      { session: store, sessionId },
    )
    const out = JSON.parse((await store.readArtifact(sessionId, 'page-dashboard.json'))!) as PageArtifact
    const got = (out.request?.changes as Record<string, unknown>).pageCode
    expect(got).toBe(pageCode)
  })

  // M14 (PHASE_ENGINE_PROTOCOL=2): page phase response is JSON header + ```tsx
  // fenced body, NOT pageCode-as-escaped-string. Kills the JSON-escape failure
  // class observed on long pageCode in v0.9.0 dogfood.
  describe('M14 fenced ```tsx response schema', () => {
    it('parses JSON header + fenced ```tsx body and stitches pageCode verbatim', async () => {
      await writeInput(baseInput())
      const tsxBody = `import { Card } from "@/components/ui/card"
export default function DashboardPage() {
  return <div className="space-y-6">Hello "world"</div>
}`
      const fenced = `{
  "type": "add-page",
  "target": "new",
  "changes": {
    "id": "dashboard",
    "name": "Dashboard",
    "route": "/dashboard"
  }
}

\`\`\`tsx
${tsxBody}
\`\`\``
      await createPagePhase('dashboard').ingest(fenced, { session: store, sessionId })
      const out = JSON.parse((await store.readArtifact(sessionId, 'page-dashboard.json'))!) as PageArtifact
      const got = (out.request?.changes as Record<string, unknown>).pageCode
      expect(got).toBe(tsxBody)
      // Verify TSX with embedded double quotes doesn't get mangled — that
      // was the failure mode that triggered the 106-line settings rewrite
      // in v0.9.0 dogfood.
      expect(got).toContain('"world"')
    })

    it('handles TSX with embedded backticks in template literals', async () => {
      await writeInput(baseInput())
      const tsxBody = 'export default function P() { const s = `hello`; return <div>{s}</div> }'
      const fenced = `{"type":"add-page","target":"new","changes":{"id":"dashboard"}}

\`\`\`tsx
${tsxBody}
\`\`\``
      await createPagePhase('dashboard').ingest(fenced, { session: store, sessionId })
      const out = JSON.parse((await store.readArtifact(sessionId, 'page-dashboard.json'))!) as PageArtifact
      expect((out.request?.changes as Record<string, unknown>).pageCode).toBe(tsxBody)
    })

    it('falls back to legacy JSON-with-pageCode when no fence is present (back-compat)', async () => {
      await writeInput(baseInput())
      const pageCode = 'export default function Legacy() {}'
      const legacy = JSON.stringify({
        requests: [{ type: 'add-page', target: 'new', changes: { id: 'dashboard', pageCode } }],
      })
      await createPagePhase('dashboard').ingest(legacy, { session: store, sessionId })
      const out = JSON.parse((await store.readArtifact(sessionId, 'page-dashboard.json'))!) as PageArtifact
      expect((out.request?.changes as Record<string, unknown>).pageCode).toBe(pageCode)
    })

    it('returns null request when neither format yields an add-page', async () => {
      await writeInput(baseInput())
      await createPagePhase('dashboard').ingest('garbage not even json', { session: store, sessionId })
      const out = JSON.parse((await store.readArtifact(sessionId, 'page-dashboard.json'))!) as PageArtifact
      expect(out.request).toBeNull()
    })

    it('falls back to legacy parse when fenced header JSON is malformed', async () => {
      await writeInput(baseInput())
      // The malformed fence triggers fallback to plan-response parser.
      // Wrap a valid `{requests: [...]}` in the legacy shape so the fallback
      // produces a real request — the fenced regex won't match because the
      // header isn't valid JSON, so the entire raw string flows to the
      // legacy branch.
      const malformedFence = JSON.stringify({
        requests: [
          { type: 'add-page', target: 'new', changes: { id: 'dashboard', pageCode: 'export default () => null' } },
        ],
      })
      await createPagePhase('dashboard').ingest(malformedFence, { session: store, sessionId })
      const out = JSON.parse((await store.readArtifact(sessionId, 'page-dashboard.json'))!) as PageArtifact
      expect(out.request?.type).toBe('add-page')
    })
  })

  it('honors custom artifact names', async () => {
    await store.writeArtifact(sessionId, 'pages-in.json', JSON.stringify(baseInput()))
    const phase = createPagePhase('dashboard', {
      inputArtifact: 'pages-in.json',
      outputArtifact: 'dash-out.json',
    })
    const prompt = await phase.prep({ session: store, sessionId })
    expect(prompt).toContain('Dashboard')

    await phase.ingest(
      JSON.stringify({
        requests: [{ type: 'add-page', target: 'new', changes: { pageCode: 'export function P(){}' } }],
      }),
      { session: store, sessionId },
    )
    expect(await store.readArtifact(sessionId, 'dash-out.json')).not.toBeNull()
    expect(await store.readArtifact(sessionId, 'page-dashboard.json')).toBeNull()
  })

  it('each phase instance is isolated by pageId (parallel-safe artifact writes)', async () => {
    await writeInput(
      baseInput({
        pages: [
          baseSpec({ id: 'home', name: 'Home', route: '/' }),
          baseSpec({ id: 'dashboard', name: 'Dashboard', route: '/dashboard' }),
        ],
      }),
    )
    const homePhase = createPagePhase('home')
    const dashPhase = createPagePhase('dashboard')

    await Promise.all([
      homePhase.ingest(
        JSON.stringify({
          requests: [{ type: 'add-page', target: 'new', changes: { pageCode: 'export function H(){}' } }],
        }),
        { session: store, sessionId },
      ),
      dashPhase.ingest(
        JSON.stringify({
          requests: [{ type: 'add-page', target: 'new', changes: { pageCode: 'export function D(){}' } }],
        }),
        { session: store, sessionId },
      ),
    ])

    const home = JSON.parse((await store.readArtifact(sessionId, 'page-home.json'))!) as PageArtifact
    const dash = JSON.parse((await store.readArtifact(sessionId, 'page-dashboard.json'))!) as PageArtifact
    expect(home.id).toBe('home')
    expect(dash.id).toBe('dashboard')
  })
})
