import { describe, it, expect, beforeEach } from 'vitest'
import { InMemorySessionStore } from '../in-memory-session-store.js'
import {
  createExtractStylePhase,
  extractStyleContext,
  type AnchorArtifact,
  type StyleArtifact,
} from '../phases/extract-style.js'

describe('extractStyleContext (pure)', () => {
  it('returns empty string when nothing interesting is found', () => {
    expect(extractStyleContext('')).toBe('')
    expect(extractStyleContext('<div>hello</div>')).toBe('')
  })

  it('captures container, card, color, spacing patterns', () => {
    const tsx = `
      <div className="container max-w-6xl mx-auto">
        <Card className="rounded-lg border shadow-sm">
          <section className="py-12 md:py-16">
            <h2 className="text-3xl font-bold">Heading</h2>
            <p className="text-muted-foreground">Body</p>
            <div className="gap-4 grid-cols-3">
              <button className="hover:bg-muted px-4 py-2 rounded-md">Go</button>
            </div>
          </section>
        </Card>
      </div>
    `
    const out = extractStyleContext(tsx)
    expect(out).toContain('STYLE CONTEXT')
    expect(out).toContain('Container')
    expect(out).toContain('py-12')
    expect(out).toContain('text-3xl font-bold')
    expect(out).toContain('text-muted-foreground')
  })
})

describe('createExtractStylePhase', () => {
  let store: InMemorySessionStore
  let sessionId: string

  beforeEach(async () => {
    store = new InMemorySessionStore()
    const meta = await store.create()
    sessionId = meta.uuid
  })

  it('reads anchor.json, writes style.json', async () => {
    const anchor: AnchorArtifact = {
      pageCode: '<div className="container max-w-6xl mx-auto py-12"><h1 className="text-3xl font-bold">Hi</h1></div>',
    }
    await store.writeArtifact(sessionId, 'anchor.json', JSON.stringify(anchor))

    const phase = createExtractStylePhase()
    expect(phase.kind).toBe('deterministic')
    expect(phase.name).toBe('extract-style')
    await phase.run({ session: store, sessionId })

    const styleRaw = await store.readArtifact(sessionId, 'style.json')
    expect(styleRaw).not.toBeNull()
    const style = JSON.parse(styleRaw!) as StyleArtifact
    expect(style.styleContext).toContain('STYLE CONTEXT')
    expect(style.styleContext).toContain('Container')
  })

  it('emits empty styleContext when anchor has nothing interesting', async () => {
    await store.writeArtifact(sessionId, 'anchor.json', JSON.stringify({ pageCode: '<div>plain</div>' }))
    await createExtractStylePhase().run({ session: store, sessionId })
    const style = JSON.parse((await store.readArtifact(sessionId, 'style.json'))!) as StyleArtifact
    expect(style.styleContext).toBe('')
  })

  it('gracefully no-ops when anchor artifact is missing (v0.11.4)', async () => {
    // Pre-v0.11.4 this threw → CLI exited 1 → user saw `❌ extract-style
    // run failed`. Plan-only sessions (delete-page, update-token, etc.)
    // legitimately have no anchor.json because anchor's prep() emitted
    // PHASE_SKIP_SENTINEL — extract-style following silently no-ops
    // instead of cascading the failure.
    const phase = createExtractStylePhase()
    await expect(phase.run({ session: store, sessionId })).resolves.toBeUndefined()
    // No style artifact was written.
    expect(await store.readArtifact(sessionId, 'style.json')).toBeNull()
  })

  it('throws when anchor artifact has wrong shape', async () => {
    await store.writeArtifact(sessionId, 'anchor.json', JSON.stringify({ notPageCode: 'oops' }))
    const phase = createExtractStylePhase()
    await expect(phase.run({ session: store, sessionId })).rejects.toThrow(/must have a string "pageCode" field/)
  })

  it('honors custom artifact names', async () => {
    await store.writeArtifact(
      sessionId,
      'anchor-override.json',
      JSON.stringify({ pageCode: '<div className="py-12">x</div>' }),
    )
    const phase = createExtractStylePhase({
      anchorArtifact: 'anchor-override.json',
      styleArtifact: 'style-override.json',
    })
    await phase.run({ session: store, sessionId })
    const style = JSON.parse((await store.readArtifact(sessionId, 'style-override.json'))!) as StyleArtifact
    expect(style.styleContext).toContain('py-12')
  })

  describe('components-input chain (codex P1 #1, part 3/4)', () => {
    it('writes components-input.json with empty sharedComponents + derived styleContext', async () => {
      await store.writeArtifact(
        sessionId,
        'anchor.json',
        JSON.stringify({ pageCode: '<div className="container max-w-6xl mx-auto py-12">x</div>' }),
      )
      await createExtractStylePhase().run({ session: store, sessionId })

      const raw = await store.readArtifact(sessionId, 'components-input.json')
      expect(raw).not.toBeNull()
      const input = JSON.parse(raw!)
      // v0.9.0 skill-mode ships with no separate architecture-plan phase;
      // sharedComponents is empty and the components phase produces zero
      // components. This is documented as a functional-but-less-rich MVP.
      expect(input.sharedComponents).toEqual([])
      expect(input.styleContext).toContain('STYLE CONTEXT')
      expect(input.styleContext).toContain('py-12')
    })

    it('suppresses chain when componentsInputArtifact = null', async () => {
      await store.writeArtifact(sessionId, 'anchor.json', JSON.stringify({ pageCode: '<div>x</div>' }))
      await createExtractStylePhase({ componentsInputArtifact: null }).run({ session: store, sessionId })

      expect(await store.readArtifact(sessionId, 'components-input.json')).toBeNull()
    })

    it('honors a custom componentsInputArtifact name', async () => {
      await store.writeArtifact(sessionId, 'anchor.json', JSON.stringify({ pageCode: '<div>x</div>' }))
      await createExtractStylePhase({ componentsInputArtifact: 'components-input-x.json' }).run({
        session: store,
        sessionId,
      })

      expect(await store.readArtifact(sessionId, 'components-input.json')).toBeNull()
      expect(await store.readArtifact(sessionId, 'components-input-x.json')).not.toBeNull()
    })
  })
})
