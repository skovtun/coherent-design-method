import { describe, it, expect, beforeEach } from 'vitest'
import { InMemorySessionStore } from '../in-memory-session-store.js'
import {
  createComponentsPhase,
  pickGeneratedComponents,
  type ComponentsArtifact,
  type ComponentsInput,
} from '../phases/components.js'
import type { ArchitecturePlan } from '../../commands/chat/plan-generator.js'

const spec = (
  name: string,
  overrides: Partial<ArchitecturePlan['sharedComponents'][number]> = {},
): ArchitecturePlan['sharedComponents'][number] => ({
  name,
  description: `${name} component`,
  props: '{}',
  type: 'section',
  shadcnDeps: [],
  usedBy: ['/'],
  ...overrides,
})

const baseInput = (overrides: Partial<ComponentsInput> = {}): ComponentsInput => ({
  sharedComponents: [spec('Hero')],
  styleContext: '',
  ...overrides,
})

describe('pickGeneratedComponents (pure)', () => {
  const specs = [spec('Hero'), spec('FeatureGrid')]

  it('extracts code per spec, normalizes export default → export function', () => {
    const parsed = {
      requests: [
        {
          type: 'add-page',
          changes: { name: 'Hero', pageCode: 'export default function Hero() { return <div/> }' },
        },
        {
          type: 'add-page',
          changes: { name: 'FeatureGrid', pageCode: 'export function FeatureGrid() { return <ul/> }' },
        },
      ],
    }
    const out = pickGeneratedComponents(parsed, specs)
    expect(out).toHaveLength(2)
    expect(out[0].name).toBe('Hero')
    expect(out[0].code).toContain('export function Hero')
    expect(out[0].code).not.toContain('export default')
    expect(out[0].file).toBe('components/shared/hero.tsx')
    expect(out[1].name).toBe('FeatureGrid')
    expect(out[1].file).toBe('components/shared/feature-grid.tsx')
  })

  it('skips entries with empty/missing pageCode', () => {
    const parsed = {
      requests: [
        { type: 'add-page', changes: { name: 'Hero', pageCode: '' } },
        { type: 'add-page', changes: { name: 'FeatureGrid' } },
      ],
    }
    expect(pickGeneratedComponents(parsed, specs)).toHaveLength(0)
  })

  it('skips entries whose code lacks a function export', () => {
    const parsed = {
      requests: [
        { type: 'add-page', changes: { name: 'Hero', pageCode: 'const Hero = () => <div/>' } },
        { type: 'add-page', changes: { name: 'FeatureGrid', pageCode: 'export function FeatureGrid(){}' } },
      ],
    }
    const out = pickGeneratedComponents(parsed, specs)
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('FeatureGrid')
  })

  it('returns empty when requests array missing', () => {
    expect(pickGeneratedComponents({}, specs)).toEqual([])
  })

  it('preserves spec order even when AI returns out of order', () => {
    const parsed = {
      requests: [
        {
          type: 'add-page',
          changes: { name: 'FeatureGrid', pageCode: 'export function FeatureGrid(){}' },
        },
        { type: 'add-page', changes: { name: 'Hero', pageCode: 'export function Hero(){}' } },
      ],
    }
    const out = pickGeneratedComponents(parsed, specs)
    expect(out.map(c => c.name)).toEqual(['Hero', 'FeatureGrid'])
  })

  it('camelCase → kebab-case file path', () => {
    const out = pickGeneratedComponents(
      {
        requests: [
          {
            type: 'add-page',
            changes: { name: 'PricingTable', pageCode: 'export function PricingTable(){}' },
          },
        ],
      },
      [spec('PricingTable')],
    )
    expect(out[0].file).toBe('components/shared/pricing-table.tsx')
  })
})

describe('createComponentsPhase', () => {
  let store: InMemorySessionStore
  let sessionId: string

  beforeEach(async () => {
    store = new InMemorySessionStore()
    const meta = await store.create()
    sessionId = meta.uuid
  })

  async function writeInput(input: ComponentsInput) {
    await store.writeArtifact(sessionId, 'components-input.json', JSON.stringify(input))
  }

  it('exposes phase shape', () => {
    const phase = createComponentsPhase()
    expect(phase.kind).toBe('ai')
    expect(phase.name).toBe('components')
  })

  it('prep builds the batch prompt from components-input.json', async () => {
    await writeInput(
      baseInput({
        sharedComponents: [
          spec('Hero', { description: 'top-of-page hero' }),
          spec('PricingTable', { description: 'three-tier pricing' }),
        ],
        styleContext: 'Container: container max-w-6xl',
      }),
    )
    const prompt = await createComponentsPhase().prep({ session: store, sessionId })
    expect(prompt).toContain('Hero: top-of-page hero')
    expect(prompt).toContain('PricingTable: three-tier pricing')
    expect(prompt).toContain('Container: container max-w-6xl')
    expect(prompt).toContain('NAMED export')
  })

  it('prep falls back to "default" style when styleContext empty', async () => {
    await writeInput(baseInput({ styleContext: '' }))
    const prompt = await createComponentsPhase().prep({ session: store, sessionId })
    expect(prompt).toContain('Style context: default')
  })

  it('prep emits PHASE_SKIP_SENTINEL when input is missing (v0.11.4)', async () => {
    // Pre-v0.11.4 this threw → CLI exit 1 → user saw `❌ components
    // prep failed`. Now: when components-input.json is absent (because
    // extract-style was skipped because anchor was skipped because plan
    // had no add-page), prep() emits the skip sentinel cleanly. CLI
    // exits 0; skill body detects sentinel and skips Write+ingest.
    const result = await createComponentsPhase().prep({ session: store, sessionId })
    expect(result).toMatch(/__COHERENT_PHASE_SKIPPED__/)
  })

  it('prep throws on malformed input', async () => {
    await store.writeArtifact(sessionId, 'components-input.json', JSON.stringify({ sharedComponents: 'oops' }))
    await expect(createComponentsPhase().prep({ session: store, sessionId })).rejects.toThrow(
      /must have an array "sharedComponents" and a string "styleContext"/,
    )
  })

  // M14 (PHASE_ENGINE_PROTOCOL=2): when there are no shared components to
  // generate, prep writes the empty artifact deterministically and returns
  // a sentinel telling the skill orchestrator to skip Write+ingest.
  describe('M14 PHASE_SKIP_SENTINEL fast path', () => {
    it('returns the sentinel and writes empty components-generated.json when sharedComponents is empty', async () => {
      // Seed plan + plan-input so the pages-input chain can also seed.
      await store.writeArtifact(
        sessionId,
        'plan.json',
        JSON.stringify({
          pageNames: [{ id: 'home', name: 'Home', route: '/' }],
          navigationType: 'header',
          appName: null,
        }),
      )
      await store.writeArtifact(
        sessionId,
        'plan-input.json',
        JSON.stringify({ message: 'build', config: { name: 'My App' } }),
      )
      await writeInput(baseInput({ sharedComponents: [], styleContext: 'tokens' }))

      const out = await createComponentsPhase().prep({ session: store, sessionId })
      expect(out).toContain('__COHERENT_PHASE_SKIPPED__')

      const generated = JSON.parse(
        (await store.readArtifact(sessionId, 'components-generated.json'))!,
      ) as ComponentsArtifact
      expect(generated.components).toEqual([])
    })

    it('ingest tolerates the sentinel as input (back-compat for older skill markdown)', async () => {
      await writeInput(baseInput({ sharedComponents: [], styleContext: 'tokens' }))
      // Pre-fill the artifact (as prep would have).
      await store.writeArtifact(sessionId, 'components-generated.json', JSON.stringify({ components: [] }))
      // Calling ingest with the sentinel should be a no-op — the artifact is preserved.
      await createComponentsPhase().ingest('__COHERENT_PHASE_SKIPPED__\n', { session: store, sessionId })
      const out = JSON.parse((await store.readArtifact(sessionId, 'components-generated.json'))!) as ComponentsArtifact
      expect(out.components).toEqual([])
    })

    it('full prep cycle (with components) does NOT return the sentinel', async () => {
      await writeInput(baseInput({ sharedComponents: [spec('Hero')] }))
      const out = await createComponentsPhase().prep({ session: store, sessionId })
      expect(out).not.toContain('__COHERENT_PHASE_SKIPPED__')
      expect(out).toContain('Hero')
    })
  })

  it('ingest writes components-generated.json with code per spec', async () => {
    await writeInput(
      baseInput({
        sharedComponents: [spec('Hero'), spec('FeatureGrid')],
      }),
    )
    const aiResponse = JSON.stringify({
      requests: [
        {
          type: 'add-page',
          changes: { name: 'Hero', pageCode: 'export function Hero(){ return <div/> }' },
        },
        {
          type: 'add-page',
          changes: { name: 'FeatureGrid', pageCode: 'export function FeatureGrid(){ return <ul/> }' },
        },
      ],
    })
    await createComponentsPhase().ingest(aiResponse, { session: store, sessionId })

    const out = JSON.parse((await store.readArtifact(sessionId, 'components-generated.json'))!) as ComponentsArtifact
    expect(out.components).toHaveLength(2)
    expect(out.components[0]).toEqual({
      name: 'Hero',
      code: 'export function Hero(){ return <div/> }',
      file: 'components/shared/hero.tsx',
    })
    expect(out.components[1].name).toBe('FeatureGrid')
  })

  it('ingest writes empty components array when AI returns nothing usable', async () => {
    await writeInput(baseInput({ sharedComponents: [spec('Hero')] }))
    await createComponentsPhase().ingest(JSON.stringify({ requests: [] }), { session: store, sessionId })

    const out = JSON.parse((await store.readArtifact(sessionId, 'components-generated.json'))!) as ComponentsArtifact
    expect(out.components).toEqual([])
  })

  it('ingest accepts ```json fenced responses', async () => {
    await writeInput(baseInput({ sharedComponents: [spec('Hero')] }))
    const aiResponse =
      '```json\n{"requests":[{"type":"add-page","changes":{"name":"Hero","pageCode":"export function Hero(){}"}}]}\n```'
    await createComponentsPhase().ingest(aiResponse, { session: store, sessionId })
    const out = JSON.parse((await store.readArtifact(sessionId, 'components-generated.json'))!) as ComponentsArtifact
    expect(out.components).toHaveLength(1)
    expect(out.components[0].name).toBe('Hero')
  })

  it('honors custom artifact names', async () => {
    await store.writeArtifact(
      sessionId,
      'components-input-x.json',
      JSON.stringify(baseInput({ sharedComponents: [spec('Hero')] })),
    )
    const phase = createComponentsPhase({
      inputArtifact: 'components-input-x.json',
      outputArtifact: 'components-out-x.json',
    })
    const prompt = await phase.prep({ session: store, sessionId })
    expect(prompt).toContain('Hero')

    await phase.ingest(
      JSON.stringify({
        requests: [{ type: 'add-page', changes: { name: 'Hero', pageCode: 'export function Hero(){}' } }],
      }),
      { session: store, sessionId },
    )
    expect(await store.readArtifact(sessionId, 'components-out-x.json')).not.toBeNull()
    expect(await store.readArtifact(sessionId, 'components-generated.json')).toBeNull()
  })

  describe('pages-input chain (codex P1 #1, part 4/4)', () => {
    // Helper: seed plan.json + plan-input.json + components-input.json as
    // every upstream phase would have done by the time components.ingest runs.
    async function seedUpstreamArtifacts(pages: Array<{ id: string; name: string; route: string }>) {
      await store.writeArtifact(
        sessionId,
        'plan.json',
        JSON.stringify({ pageNames: pages, navigationType: 'header', appName: null }),
      )
      await store.writeArtifact(
        sessionId,
        'plan-input.json',
        JSON.stringify({ message: 'build a CRM', config: { name: 'My App' } }),
      )
      await writeInput(baseInput({ sharedComponents: [spec('Hero')], styleContext: 'Container: max-w-6xl' }))
    }

    it('writes pages-input.json with PageSpec per page minus the anchor (codex P2 #3)', async () => {
      // First page in plan.pageNames is the anchor — anchor phase has already
      // generated its full pageCode and emitted page-<anchorId>.json, so
      // pages-input.json drops it to avoid duplicate per-page generation.
      await seedUpstreamArtifacts([
        { id: 'home', name: 'Home', route: '/' },
        { id: 'leads', name: 'Leads', route: '/leads' },
        { id: 'login', name: 'Login', route: '/login' },
      ])
      await createComponentsPhase().ingest(
        JSON.stringify({
          requests: [{ type: 'add-page', changes: { name: 'Hero', pageCode: 'export function Hero(){}' } }],
        }),
        { session: store, sessionId },
      )

      const raw = await store.readArtifact(sessionId, 'pages-input.json')
      expect(raw).not.toBeNull()
      const pagesInput = JSON.parse(raw!)

      expect(pagesInput.pages).toHaveLength(2)
      expect(pagesInput.pages.map((p: { id: string }) => p.id)).toEqual(['leads', 'login'])
      expect(pagesInput.pages[0].pageType).toBe('app')
      // inferPageTypeFromRoute detects /login → auth
      expect(pagesInput.pages[1].pageType).toBe('auth')

      expect(pagesInput.shared.message).toBe('build a CRM')
      expect(pagesInput.shared.styleContext).toBe('Container: max-w-6xl')
      // routeNote still shows ALL planned routes — they're already on disk
      // so per-page generation should be aware of the full nav.
      expect(pagesInput.shared.routeNote).toContain('/')
      expect(pagesInput.shared.routeNote).toContain('/leads')
      expect(pagesInput.shared.routeNote).toContain('/login')
      expect(pagesInput.shared.alignmentNote).toContain('ALIGNMENT')
    })

    it('skips pages-input.json entirely when only the anchor is planned (single-page app)', async () => {
      // One-page plan → after dropping the anchor, nothing remains to write.
      // pages-input.json is omitted; page phase has nothing to drive.
      await seedUpstreamArtifacts([{ id: 'home', name: 'Home', route: '/' }])
      await createComponentsPhase().ingest(JSON.stringify({ requests: [] }), { session: store, sessionId })

      const raw = await store.readArtifact(sessionId, 'pages-input.json')
      expect(raw).toBeNull()
    })

    it('skips pages-input.json when plan.json is missing (upstream broken)', async () => {
      // Only components-input + plan-input exist. plan.json absent.
      await store.writeArtifact(
        sessionId,
        'plan-input.json',
        JSON.stringify({ message: 'x', config: { name: 'My App' } }),
      )
      await writeInput(baseInput({ sharedComponents: [spec('Hero')] }))

      await createComponentsPhase().ingest(JSON.stringify({ requests: [] }), { session: store, sessionId })

      expect(await store.readArtifact(sessionId, 'pages-input.json')).toBeNull()
    })

    it('skips pages-input.json when plan has no pages', async () => {
      await seedUpstreamArtifacts([])
      await createComponentsPhase().ingest(JSON.stringify({ requests: [] }), { session: store, sessionId })

      expect(await store.readArtifact(sessionId, 'pages-input.json')).toBeNull()
    })

    it('suppresses chain when pagesInputArtifact = null', async () => {
      await seedUpstreamArtifacts([{ id: 'home', name: 'Home', route: '/' }])
      await createComponentsPhase({ pagesInputArtifact: null }).ingest(JSON.stringify({ requests: [] }), {
        session: store,
        sessionId,
      })

      expect(await store.readArtifact(sessionId, 'pages-input.json')).toBeNull()
    })
  })
})
