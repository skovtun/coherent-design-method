import { describe, it, expect, beforeEach } from 'vitest'
import type { DesignSystemConfig } from '@getcoherent/core'
import { InMemorySessionStore } from '../in-memory-session-store.js'
import {
  createPlanPhase,
  parsePlanResponse,
  parseNavTypeFromPlan,
  extractAppNameFromPrompt,
  type ConfigDelta,
  type PlanArtifact,
  type PlanInput,
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
})
