import { describe, it, expect, beforeEach } from 'vitest'
import { InMemorySessionStore } from '../in-memory-session-store.js'
import {
  createAnchorPhase,
  buildAnchorPagePrompt,
  pickAddPageRequest,
  type AnchorArtifact,
  type AnchorInput,
} from '../phases/anchor.js'

const baseHome = (overrides: Partial<{ name: string; route: string }> = {}) => ({
  name: 'Home',
  route: '/',
  ...overrides,
})

describe('buildAnchorPagePrompt (pure)', () => {
  it('emits the auth variant for /login', () => {
    const out = buildAnchorPagePrompt(
      baseHome({ name: 'Login', route: '/login' }),
      'build a SaaS',
      'Login (/login), Dashboard (/dashboard)',
      '/login, /dashboard',
      null,
    )
    expect(out).toContain('entry point')
    expect(out).toContain('authentication form')
    expect(out).toContain('Do NOT include site-wide')
    expect(out).not.toContain('Include a branded site-wide')
  })

  it('emits the dashboard/sidebar variant when group layout is sidebar', () => {
    const plan = {
      groups: [{ id: 'app', layout: 'sidebar', pages: ['/'] }],
      sharedComponents: [],
      pageNotes: {},
      atmosphere: undefined,
    } as unknown as Parameters<typeof buildAnchorPagePrompt>[4]
    const out = buildAnchorPagePrompt(baseHome(), 'build a CRM', '', '', plan)
    expect(out).toContain('Do NOT include a sidebar')
    expect(out).toContain('asymmetric')
  })

  it('emits the default landing variant otherwise', () => {
    const out = buildAnchorPagePrompt(
      baseHome(),
      'build a marketing site',
      'Home (/), About (/about)',
      '/, /about',
      null,
    )
    expect(out).toContain('Include a branded site-wide')
    expect(out).toContain('Hero')
  })
})

describe('pickAddPageRequest (pure)', () => {
  it('returns the first add-page request', () => {
    const out = pickAddPageRequest({
      requests: [
        { type: 'modify-component', target: 'x', changes: {} },
        { type: 'add-page', target: 'new', changes: { id: 'home', pageCode: '<div/>' } },
        { type: 'add-page', target: 'new', changes: { id: 'about', pageCode: '<x/>' } },
      ],
    })
    expect(out?.type).toBe('add-page')
    expect((out?.changes as Record<string, unknown>).id).toBe('home')
  })

  it('returns null when no add-page', () => {
    expect(pickAddPageRequest({ requests: [] })).toBeNull()
    expect(pickAddPageRequest({})).toBeNull()
  })
})

describe('createAnchorPhase', () => {
  let store: InMemorySessionStore
  let sessionId: string

  beforeEach(async () => {
    store = new InMemorySessionStore()
    const meta = await store.create()
    sessionId = meta.uuid
  })

  async function writeInput(input: AnchorInput) {
    await store.writeArtifact(sessionId, 'anchor-input.json', JSON.stringify(input))
  }

  it('exposes phase shape', () => {
    const phase = createAnchorPhase()
    expect(phase.kind).toBe('ai')
    expect(phase.name).toBe('anchor')
  })

  it('prep builds the anchor prompt from anchor-input.json', async () => {
    await writeInput({
      homePage: { name: 'Home', route: '/' },
      message: 'build a marketing site for an agency',
      allPagesList: 'Home (/), About (/about)',
      allRoutes: '/, /about',
      plan: null,
    })
    const prompt = await createAnchorPhase().prep({ session: store, sessionId })
    expect(prompt).toContain('build a marketing site for an agency')
    expect(prompt).toContain('Home (/), About (/about)')
    expect(prompt).toContain('/, /about')
    expect(prompt).toContain('site-wide <header>')
  })

  it('prep throws when anchor-input.json missing', async () => {
    await expect(createAnchorPhase().prep({ session: store, sessionId })).rejects.toThrow(
      /missing required artifact "anchor-input.json"/,
    )
  })

  it('prep throws when anchor-input.json is malformed', async () => {
    await store.writeArtifact(
      sessionId,
      'anchor-input.json',
      JSON.stringify({ homePage: { name: 'Home' }, message: 'x' }),
    )
    await expect(createAnchorPhase().prep({ session: store, sessionId })).rejects.toThrow(
      /must have homePage\{name,route\}, message, allPagesList, allRoutes/,
    )
  })

  it('ingest writes anchor.json with pageCode and request', async () => {
    await writeInput({
      homePage: { name: 'Home', route: '/' },
      message: 'm',
      allPagesList: '',
      allRoutes: '',
      plan: null,
    })
    const aiResponse = JSON.stringify({
      requests: [
        {
          type: 'add-page',
          target: 'new',
          changes: {
            id: 'home',
            name: 'Home',
            route: '/',
            pageCode: '<main className="container max-w-6xl mx-auto py-12"><h1>Hi</h1></main>',
          },
        },
      ],
    })
    await createAnchorPhase().ingest(aiResponse, { session: store, sessionId })

    const out = JSON.parse((await store.readArtifact(sessionId, 'anchor.json'))!) as AnchorArtifact
    expect(out.pageCode).toContain('<main')
    expect(out.request?.type).toBe('add-page')
    expect((out.request?.changes as Record<string, unknown>).id).toBe('home')
  })

  it('ingest writes empty pageCode and null request when AI returns no add-page', async () => {
    await writeInput({
      homePage: { name: 'Home', route: '/' },
      message: 'm',
      allPagesList: '',
      allRoutes: '',
      plan: null,
    })
    await createAnchorPhase().ingest(JSON.stringify({ requests: [] }), { session: store, sessionId })

    const out = JSON.parse((await store.readArtifact(sessionId, 'anchor.json'))!) as AnchorArtifact
    expect(out.pageCode).toBe('')
    expect(out.request).toBeNull()
  })

  it('ingest accepts ```json fenced responses', async () => {
    await writeInput({
      homePage: { name: 'Home', route: '/' },
      message: 'm',
      allPagesList: '',
      allRoutes: '',
      plan: null,
    })
    const aiResponse =
      '```json\n{"requests":[{"type":"add-page","target":"new","changes":{"id":"home","pageCode":"<x/>"}}]}\n```'
    await createAnchorPhase().ingest(aiResponse, { session: store, sessionId })

    const out = JSON.parse((await store.readArtifact(sessionId, 'anchor.json'))!) as AnchorArtifact
    expect(out.pageCode).toBe('<x/>')
  })

  it('ingest accepts a top-level array response', async () => {
    await writeInput({
      homePage: { name: 'Home', route: '/' },
      message: 'm',
      allPagesList: '',
      allRoutes: '',
      plan: null,
    })
    const aiResponse = '[{"type":"add-page","target":"new","changes":{"id":"home","pageCode":"<arr/>"}}]'
    await createAnchorPhase().ingest(aiResponse, { session: store, sessionId })

    const out = JSON.parse((await store.readArtifact(sessionId, 'anchor.json'))!) as AnchorArtifact
    expect(out.pageCode).toBe('<arr/>')
  })

  it('honors custom artifact names', async () => {
    await store.writeArtifact(
      sessionId,
      'anchor-input-x.json',
      JSON.stringify({
        homePage: { name: 'Login', route: '/login' },
        message: 'auth flow',
        allPagesList: 'Login (/login)',
        allRoutes: '/login',
        plan: null,
      }),
    )
    const phase = createAnchorPhase({
      inputArtifact: 'anchor-input-x.json',
      anchorArtifact: 'anchor-x.json',
    })
    const prompt = await phase.prep({ session: store, sessionId })
    expect(prompt).toContain('authentication form')

    await phase.ingest(
      JSON.stringify({
        requests: [{ type: 'add-page', target: 'new', changes: { id: 'login', pageCode: '<form/>' } }],
      }),
      { session: store, sessionId },
    )

    const out = JSON.parse((await store.readArtifact(sessionId, 'anchor-x.json'))!) as AnchorArtifact
    expect(out.pageCode).toBe('<form/>')
  })

  it('artifact pageCode flows into extract-style as the StyleArtifact source', async () => {
    // Integration: anchor → extract-style chain. Anchor writes anchor.json; extract-style reads it.
    const { createExtractStylePhase } = await import('../phases/extract-style.js')

    await writeInput({
      homePage: { name: 'Home', route: '/' },
      message: 'm',
      allPagesList: '',
      allRoutes: '',
      plan: null,
    })
    await createAnchorPhase().ingest(
      JSON.stringify({
        requests: [
          {
            type: 'add-page',
            changes: {
              id: 'home',
              pageCode:
                '<div className="container max-w-6xl mx-auto py-12"><h2 className="text-3xl font-bold">Hi</h2></div>',
            },
          },
        ],
      }),
      { session: store, sessionId },
    )

    await createExtractStylePhase().run({ session: store, sessionId })

    const styleRaw = await store.readArtifact(sessionId, 'style.json')
    expect(styleRaw).not.toBeNull()
    expect(JSON.parse(styleRaw!).styleContext).toContain('Container')
  })
})
