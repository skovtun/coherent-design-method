import { describe, it, expect, beforeEach } from 'vitest'
import type { DesignSystemConfig, ModificationRequest } from '@getcoherent/core'
import { InMemorySessionStore } from '../in-memory-session-store.js'
import {
  computeSessionShape,
  createPlanPhase,
  parsePlanResponse,
  parseNavTypeFromPlan,
  extractAppNameFromPrompt,
  type ConfigDelta,
  type PlanArtifact,
  type PlanInput,
  type SessionShape,
} from '../phases/plan.js'

const baseConfig = (overrides: Partial<DesignSystemConfig> = {}): DesignSystemConfig =>
  ({
    name: 'My App',
    pages: [],
    navigation: { type: 'header' },
    ...overrides,
  }) as unknown as DesignSystemConfig

describe('parsePlanResponse (pure)', () => {
  it('parses a plain JSON object', () => {
    const out = parsePlanResponse('{"appName":"X","requests":[]}')
    expect(out).toEqual({ appName: 'X', requests: [] })
  })

  it('strips a ```json fence', () => {
    const out = parsePlanResponse('```json\n{"requests":[]}\n```')
    expect(out).toEqual({ requests: [] })
  })

  it('strips a bare ``` fence', () => {
    const out = parsePlanResponse('```\n{"requests":[]}\n```')
    expect(out).toEqual({ requests: [] })
  })

  it('wraps a top-level array under "requests"', () => {
    const out = parsePlanResponse('[{"type":"add-page","changes":{"name":"Home","route":"/"}}]')
    expect(out).toEqual({
      requests: [{ type: 'add-page', changes: { name: 'Home', route: '/' } }],
    })
  })

  it('throws on a non-object root', () => {
    expect(() => parsePlanResponse('"hello"')).toThrow(/did not parse to an object/)
    expect(() => parsePlanResponse('42')).toThrow(/did not parse to an object/)
  })

  it('throws on invalid JSON', () => {
    expect(() => parsePlanResponse('not json')).toThrow()
  })
})

describe('parseNavTypeFromPlan (re-exported)', () => {
  it('returns navigation.type when valid', () => {
    expect(parseNavTypeFromPlan({ navigation: { type: 'sidebar' } })).toBe('sidebar')
    expect(parseNavTypeFromPlan({ navigation: { type: 'both' } })).toBe('both')
  })
  it('defaults to header on missing/invalid', () => {
    expect(parseNavTypeFromPlan({})).toBe('header')
    expect(parseNavTypeFromPlan({ navigation: { type: 'bogus' } })).toBe('header')
  })
})

describe('extractAppNameFromPrompt (re-exported)', () => {
  it('extracts from "called X"', () => {
    expect(extractAppNameFromPrompt('build an app called TaskFlow')).toBe('TaskFlow')
  })
  it('returns null when nothing plausible', () => {
    expect(extractAppNameFromPrompt('add a login page')).toBeNull()
  })
})

describe('createPlanPhase', () => {
  let store: InMemorySessionStore
  let sessionId: string

  beforeEach(async () => {
    store = new InMemorySessionStore()
    const meta = await store.create()
    sessionId = meta.uuid
  })

  async function writeInput(input: PlanInput) {
    await store.writeArtifact(sessionId, 'plan-input.json', JSON.stringify(input))
  }

  it('exposes phase shape', () => {
    const phase = createPlanPhase()
    expect(phase.kind).toBe('ai')
    expect(phase.name).toBe('plan')
  })

  it('prep builds the plan-only prompt from plan-input.json', async () => {
    await writeInput({ message: 'build a todo app', config: baseConfig() })
    const phase = createPlanPhase()
    const prompt = await phase.prep({ session: store, sessionId })
    expect(prompt).toContain('build a todo app')
    expect(prompt).toContain('You are a web app planner')
    expect(prompt).toContain('"appName"')
  })

  it('prep throws when plan-input.json missing', async () => {
    const phase = createPlanPhase()
    await expect(phase.prep({ session: store, sessionId })).rejects.toThrow(
      /missing required artifact "plan-input.json"/,
    )
  })

  it('prep throws when plan-input.json malformed', async () => {
    await store.writeArtifact(sessionId, 'plan-input.json', JSON.stringify({ message: 'x' }))
    const phase = createPlanPhase()
    await expect(phase.prep({ session: store, sessionId })).rejects.toThrow(
      /must have a string "message" and an object "config"/,
    )
  })

  it('ingest writes plan.json with pages, nav, appName', async () => {
    await writeInput({ message: 'build a CRM', config: baseConfig() })
    const aiResponse = JSON.stringify({
      appName: 'PipelineCRM',
      requests: [
        { type: 'add-page', changes: { id: 'home', name: 'Home', route: '/' } },
        { type: 'add-page', changes: { id: 'leads', name: 'Leads', route: '/leads' } },
      ],
      navigation: { type: 'sidebar' },
    })
    await createPlanPhase().ingest(aiResponse, { session: store, sessionId })

    const planRaw = await store.readArtifact(sessionId, 'plan.json')
    expect(planRaw).not.toBeNull()
    const plan = JSON.parse(planRaw!) as PlanArtifact
    expect(plan.pageNames).toEqual([
      { name: 'Home', id: 'home', route: '/' },
      { name: 'Leads', id: 'leads', route: '/leads' },
    ])
    expect(plan.navigationType).toBe('sidebar')
    expect(plan.appName).toBe('PipelineCRM')
  })

  it('ingest writes config-delta.json: name (explicit prompt wins) + non-header nav', async () => {
    await writeInput({ message: 'build an app called TaskFlow', config: baseConfig() })
    const aiResponse = JSON.stringify({
      appName: 'AISuggestion',
      requests: [{ type: 'add-page', changes: { id: 'home', name: 'Home', route: '/' } }],
      navigation: { type: 'sidebar' },
    })
    await createPlanPhase().ingest(aiResponse, { session: store, sessionId })

    const deltaRaw = await store.readArtifact(sessionId, 'config-delta.json')
    expect(deltaRaw).not.toBeNull()
    const delta = JSON.parse(deltaRaw!) as ConfigDelta
    expect(delta.name).toBe('TaskFlow')
    expect(delta.navigationType).toBe('sidebar')
  })

  it('ingest falls back to plan.appName when config.name is "My App" and no explicit prompt name', async () => {
    await writeInput({ message: 'add a dashboard and a settings page', config: baseConfig() })
    const aiResponse = JSON.stringify({
      appName: 'AdminPortal',
      requests: [],
      navigation: { type: 'header' },
    })
    await createPlanPhase().ingest(aiResponse, { session: store, sessionId })

    const delta = JSON.parse((await store.readArtifact(sessionId, 'config-delta.json'))!) as ConfigDelta
    expect(delta.name).toBe('AdminPortal')
  })

  it('ingest does NOT override config.name when it is already user-set', async () => {
    await writeInput({
      message: 'add a dashboard',
      config: baseConfig({ name: 'MyExistingProject' }),
    })
    const aiResponse = JSON.stringify({
      appName: 'AISuggestion',
      requests: [],
      navigation: { type: 'header' },
    })
    await createPlanPhase().ingest(aiResponse, { session: store, sessionId })

    // Default nav, custom name already set, no explicit prompt name → no delta to write
    const deltaRaw = await store.readArtifact(sessionId, 'config-delta.json')
    expect(deltaRaw).toBeNull()
  })

  it('ingest skips writing config-delta when nothing changes', async () => {
    await writeInput({
      message: 'add a settings page',
      config: baseConfig({ name: 'AlreadySet' }),
    })
    const aiResponse = JSON.stringify({
      requests: [{ type: 'add-page', changes: { id: 'settings', name: 'Settings', route: '/settings' } }],
      navigation: { type: 'header' },
    })
    await createPlanPhase().ingest(aiResponse, { session: store, sessionId })

    expect(await store.readArtifact(sessionId, 'config-delta.json')).toBeNull()
  })

  it('ingest merges into an existing config-delta.json (last-writer-wins per field)', async () => {
    await store.writeArtifact(
      sessionId,
      'config-delta.json',
      JSON.stringify({ name: 'PriorName', navigationType: 'header' }),
    )
    await writeInput({
      message: 'build an app called Override',
      config: baseConfig(),
    })
    const aiResponse = JSON.stringify({
      requests: [],
      navigation: { type: 'sidebar' },
    })
    await createPlanPhase().ingest(aiResponse, { session: store, sessionId })

    const delta = JSON.parse((await store.readArtifact(sessionId, 'config-delta.json'))!) as ConfigDelta
    expect(delta.name).toBe('Override')
    expect(delta.navigationType).toBe('sidebar')
  })

  it('ingest skips navigationType when default header', async () => {
    await writeInput({ message: 'build a CRM called Acme', config: baseConfig() })
    const aiResponse = JSON.stringify({
      requests: [],
      navigation: { type: 'header' },
    })
    await createPlanPhase().ingest(aiResponse, { session: store, sessionId })

    const delta = JSON.parse((await store.readArtifact(sessionId, 'config-delta.json'))!) as ConfigDelta
    expect(delta.navigationType).toBeUndefined()
    expect(delta.name).toBe('Acme')
  })

  it('ingest accepts ```json fenced responses', async () => {
    await writeInput({ message: 'build a todo app', config: baseConfig() })
    const aiResponse = '```json\n{"requests":[],"navigation":{"type":"both"},"appName":"Todoer"}\n```'
    await createPlanPhase().ingest(aiResponse, { session: store, sessionId })

    const plan = JSON.parse((await store.readArtifact(sessionId, 'plan.json'))!) as PlanArtifact
    expect(plan.navigationType).toBe('both')
    expect(plan.appName).toBe('Todoer')
  })

  it('ingest accepts a top-level array response', async () => {
    await writeInput({ message: 'add a login page', config: baseConfig() })
    const aiResponse = '[{"type":"add-page","changes":{"id":"login","name":"Login","route":"/login"}}]'
    await createPlanPhase().ingest(aiResponse, { session: store, sessionId })

    const plan = JSON.parse((await store.readArtifact(sessionId, 'plan.json'))!) as PlanArtifact
    expect(plan.pageNames).toEqual([{ name: 'Login', id: 'login', route: '/login' }])
    expect(plan.navigationType).toBe('header')
    expect(plan.appName).toBeNull()
  })

  it('honors custom artifact names', async () => {
    await store.writeArtifact(
      sessionId,
      'plan-input-x.json',
      JSON.stringify({ message: 'build an admin dashboard', config: baseConfig() }),
    )
    const phase = createPlanPhase({
      inputArtifact: 'plan-input-x.json',
      planArtifact: 'plan-x.json',
      configDeltaArtifact: 'delta-x.json',
    })
    const prompt = await phase.prep({ session: store, sessionId })
    expect(prompt).toContain('build an admin dashboard')

    const aiResponse = JSON.stringify({
      requests: [],
      navigation: { type: 'sidebar' },
      appName: 'AdminX',
    })
    await phase.ingest(aiResponse, { session: store, sessionId })

    expect(await store.readArtifact(sessionId, 'plan-x.json')).not.toBeNull()
    const delta = JSON.parse((await store.readArtifact(sessionId, 'delta-x.json'))!) as ConfigDelta
    expect(delta.navigationType).toBe('sidebar')
    expect(delta.name).toBe('AdminX')
  })

  describe('anchor-input chain (codex P1 #1, part 2/4)', () => {
    it('writes anchor-input.json with homePage = first page + all pages/routes', async () => {
      await writeInput({ message: 'build a CRM', config: baseConfig() })
      const aiResponse = JSON.stringify({
        appName: 'PipelineCRM',
        requests: [
          { type: 'add-page', changes: { id: 'home', name: 'Home', route: '/' } },
          { type: 'add-page', changes: { id: 'leads', name: 'Leads', route: '/leads' } },
          { type: 'add-page', changes: { id: 'deals', name: 'Deals', route: '/deals' } },
        ],
        navigation: { type: 'sidebar' },
      })
      await createPlanPhase().ingest(aiResponse, { session: store, sessionId })

      const anchorRaw = await store.readArtifact(sessionId, 'anchor-input.json')
      expect(anchorRaw).not.toBeNull()
      const anchor = JSON.parse(anchorRaw!)
      expect(anchor.homePage).toEqual({ name: 'Home', route: '/', id: 'home' })
      expect(anchor.message).toBe('build a CRM')
      expect(anchor.allPagesList).toBe('Home, Leads, Deals')
      expect(anchor.allRoutes).toBe('/, /leads, /deals')
      // plan: null is intentional — v0.9.0 skill rail has no separate
      // architecture-plan phase yet. Anchor's prompt builder handles null.
      expect(anchor.plan).toBeNull()
    })

    it('skips anchor-input.json when plan produces no add-page requests', async () => {
      // Empty plans correctly leave the rail at plan — no homePage to anchor on.
      // The next `_phase prep anchor` call will fail with a "missing artifact"
      // error that accurately describes the situation.
      await writeInput({ message: 'just change the color', config: baseConfig() })
      const aiResponse = JSON.stringify({
        requests: [],
        navigation: { type: 'header' },
      })
      await createPlanPhase().ingest(aiResponse, { session: store, sessionId })

      expect(await store.readArtifact(sessionId, 'anchor-input.json')).toBeNull()
    })

    it('suppresses chain when anchorInputArtifact = null', async () => {
      // Escape hatch for upstream callers that seed anchor-input.json
      // themselves (e.g. chat rail passing through its own architecture plan).
      await writeInput({ message: 'build a todo app', config: baseConfig() })
      const aiResponse = JSON.stringify({
        requests: [{ type: 'add-page', changes: { id: 'home', name: 'Home', route: '/' } }],
        navigation: { type: 'header' },
      })
      await createPlanPhase({ anchorInputArtifact: null }).ingest(aiResponse, { session: store, sessionId })

      expect(await store.readArtifact(sessionId, 'anchor-input.json')).toBeNull()
    })

    it('honors a custom anchorInputArtifact name', async () => {
      await writeInput({ message: 'build a site', config: baseConfig() })
      const aiResponse = JSON.stringify({
        requests: [{ type: 'add-page', changes: { id: 'home', name: 'Home', route: '/' } }],
        navigation: { type: 'header' },
      })
      await createPlanPhase({ anchorInputArtifact: 'anchor-input-custom.json' }).ingest(aiResponse, {
        session: store,
        sessionId,
      })

      expect(await store.readArtifact(sessionId, 'anchor-input.json')).toBeNull()
      expect(await store.readArtifact(sessionId, 'anchor-input-custom.json')).not.toBeNull()
    })
  })
})

describe('computeSessionShape (v0.11.4 — pure)', () => {
  function req(type: string, changes: Record<string, unknown> = {}): ModificationRequest {
    return { type, target: 'x', changes } as ModificationRequest
  }

  it('empty input → minimum shape, hasOnlyNoAiRequests=false (no claim of work)', () => {
    const shape = computeSessionShape([])
    expect(shape).toEqual<SessionShape>({
      requestTypes: [],
      hasAddPage: false,
      hasOnlyNoAiRequests: false,
      phases: ['plan', 'apply'],
      needsFix: false,
    })
  })

  it('plan-only delete → 2-phase shape, hasOnlyNoAiRequests=true, needsFix=false', () => {
    const shape = computeSessionShape([req('delete-page')])
    expect(shape).toEqual<SessionShape>({
      requestTypes: ['delete-page'],
      hasAddPage: false,
      hasOnlyNoAiRequests: true,
      phases: ['plan', 'apply'],
      needsFix: false,
    })
  })

  it('full add-page → 6-phase shape, hasAddPage=true, needsFix=true', () => {
    const shape = computeSessionShape([req('add-page')])
    expect(shape).toEqual<SessionShape>({
      requestTypes: ['add-page'],
      hasAddPage: true,
      hasOnlyNoAiRequests: false,
      phases: ['plan', 'anchor', 'extract-style', 'components', 'page', 'apply'],
      needsFix: true,
    })
  })

  it('rename pattern [delete-page X, add-page Y] → full pipeline (because of add-page)', () => {
    const shape = computeSessionShape([req('delete-page'), req('add-page')])
    // Mixed sessions need add-page generation; the deletes are handled
    // by the modification applier in step 7. hasOnlyNoAiRequests is
    // false even though delete-page IS no-AI — adds are not.
    expect(shape.hasAddPage).toBe(true)
    expect(shape.hasOnlyNoAiRequests).toBe(false)
    expect(shape.phases).toEqual(['plan', 'anchor', 'extract-style', 'components', 'page', 'apply'])
    expect(shape.needsFix).toBe(true)
    expect(shape.requestTypes).toEqual(['add-page', 'delete-page']) // sorted unique
  })

  it('multiple no-AI types → still plan-only, requestTypes deduped + sorted', () => {
    const shape = computeSessionShape([
      req('delete-page'),
      req('delete-component'),
      req('update-token'),
      req('delete-page'), // duplicate
    ])
    expect(shape.requestTypes).toEqual(['delete-component', 'delete-page', 'update-token'])
    expect(shape.hasOnlyNoAiRequests).toBe(true)
    expect(shape.phases).toEqual(['plan', 'apply'])
    expect(shape.needsFix).toBe(false)
  })

  it('codex P1 — update-navigation is NOT classified as no-AI plan-only', () => {
    // The applier marks update-navigation as deferred, but item-level
    // changes are not actually applied (only nav.type via config-delta).
    // If we claimed hasOnlyNoAiRequests=true, the skill body would
    // surface a successful completion when the actual nav mutation was
    // silently skipped. Codex audit point.
    const shape = computeSessionShape([req('update-navigation')])
    expect(shape.hasOnlyNoAiRequests).toBe(false)
  })

  it('unknown type alone → also NOT classified as no-AI (modification applier will hard-fail)', () => {
    // The modification applier throws on unsupported types like
    // update-page / link-shared. If we claimed plan-only success and
    // skipped to session end, the throw would surface as "session end
    // failed" — which IS the right outcome, but we'd prefer the skill
    // body to surface the unsupported-type error before invoking session
    // end. Either way: hasOnlyNoAiRequests=false because some applier
    // can't apply this.
    const shape = computeSessionShape([req('update-page')])
    expect(shape.hasOnlyNoAiRequests).toBe(false)
    // hasAddPage stays false too — update-page is not add-page.
    expect(shape.hasAddPage).toBe(false)
  })
})

describe('plan ingest writes session-shape.json (v0.11.4)', () => {
  let store: InMemorySessionStore
  let sessionId: string
  beforeEach(async () => {
    store = new InMemorySessionStore()
    const meta = await store.create()
    sessionId = meta.uuid
    await store.writeArtifact(
      sessionId,
      'plan-input.json',
      JSON.stringify({ message: 'rename Transactions to Activity', config: baseConfig() }),
    )
  })

  it('writes shape derived from plan response requests', async () => {
    const aiResponse = JSON.stringify({
      requests: [
        { type: 'delete-page', target: 'transactions' },
        { type: 'add-page', changes: { id: 'activity', name: 'Activity', route: '/activity' } },
      ],
      navigation: { type: 'header' },
    })
    await createPlanPhase().ingest(aiResponse, { session: store, sessionId })

    const raw = await store.readArtifact(sessionId, 'session-shape.json')
    expect(raw).not.toBeNull()
    const shape = JSON.parse(raw!) as SessionShape
    expect(shape.hasAddPage).toBe(true)
    expect(shape.hasOnlyNoAiRequests).toBe(false)
    expect(shape.phases).toEqual(['plan', 'anchor', 'extract-style', 'components', 'page', 'apply'])
    expect(shape.requestTypes).toEqual(['add-page', 'delete-page'])
  })

  it('writes plan-only shape for pure delete-page', async () => {
    const aiResponse = JSON.stringify({
      requests: [{ type: 'delete-page', target: 'profile' }],
      navigation: { type: 'header' },
    })
    await createPlanPhase().ingest(aiResponse, { session: store, sessionId })

    const raw = await store.readArtifact(sessionId, 'session-shape.json')
    expect(raw).not.toBeNull()
    const shape = JSON.parse(raw!) as SessionShape
    expect(shape).toEqual<SessionShape>({
      requestTypes: ['delete-page'],
      hasAddPage: false,
      hasOnlyNoAiRequests: true,
      phases: ['plan', 'apply'],
      needsFix: false,
    })
  })

  it('skips writing shape when plan response has no requests', async () => {
    const aiResponse = JSON.stringify({ requests: [], navigation: { type: 'header' } })
    await createPlanPhase().ingest(aiResponse, { session: store, sessionId })
    expect(await store.readArtifact(sessionId, 'session-shape.json')).toBeNull()
  })

  it('honors custom sessionShapeArtifact name', async () => {
    const aiResponse = JSON.stringify({
      requests: [{ type: 'delete-page', target: 'profile' }],
      navigation: { type: 'header' },
    })
    await createPlanPhase({ sessionShapeArtifact: 'shape-custom.json' }).ingest(aiResponse, {
      session: store,
      sessionId,
    })
    expect(await store.readArtifact(sessionId, 'session-shape.json')).toBeNull()
    expect(await store.readArtifact(sessionId, 'shape-custom.json')).not.toBeNull()
  })

  it('null sessionShapeArtifact → no shape file written', async () => {
    const aiResponse = JSON.stringify({
      requests: [{ type: 'delete-page', target: 'profile' }],
      navigation: { type: 'header' },
    })
    await createPlanPhase({ sessionShapeArtifact: null }).ingest(aiResponse, { session: store, sessionId })
    expect(await store.readArtifact(sessionId, 'session-shape.json')).toBeNull()
  })
})
