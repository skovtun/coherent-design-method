import { describe, it, expect, beforeEach } from 'vitest'
import { InMemorySessionStore } from '../in-memory-session-store.js'
import { createLogRunPhase } from '../phases/log-run.js'
import type { RunRecord } from '../../utils/run-record.js'

const baseRecord = (overrides: Partial<RunRecord> = {}): RunRecord => ({
  timestamp: '2026-04-23T19:00:00.000Z',
  coherentVersion: '0.9.0',
  intent: 'build a CRM',
  options: { atmosphere: null, dryRun: false, interactive: false },
  atmosphere: null,
  pagesWritten: ['app/page.tsx'],
  sharedComponentsWritten: [],
  durationMs: 12345,
  outcome: 'success',
  ...overrides,
})

describe('createLogRunPhase', () => {
  let store: InMemorySessionStore
  let sessionId: string

  beforeEach(async () => {
    store = new InMemorySessionStore()
    const meta = await store.create()
    sessionId = meta.uuid
  })

  it('exposes phase shape', () => {
    const phase = createLogRunPhase()
    expect(phase.kind).toBe('deterministic')
    expect(phase.name).toBe('log-run')
  })

  it('reads run-record.json, writes run-record.yaml', async () => {
    await store.writeArtifact(sessionId, 'run-record.json', JSON.stringify(baseRecord()))
    await createLogRunPhase().run({ session: store, sessionId })

    const yaml = await store.readArtifact(sessionId, 'run-record.yaml')
    expect(yaml).not.toBeNull()
    expect(yaml).toContain('timestamp: 2026-04-23T19:00:00.000Z')
    expect(yaml).toContain('intent: "build a CRM"')
    expect(yaml).toContain('outcome: success')
    expect(yaml).toContain('durationMs: 12345')
  })

  it('renders validators block when present', async () => {
    await store.writeArtifact(
      sessionId,
      'run-record.json',
      JSON.stringify(
        baseRecord({
          validators: [
            {
              page: 'app/page.tsx',
              issues: [{ type: 'raw-tailwind-color', severity: 'warning', count: 2 }],
            },
          ],
          validatorSummary: { errors: 0, warnings: 2, infos: 0 },
        }),
      ),
    )
    await createLogRunPhase().run({ session: store, sessionId })

    const yaml = (await store.readArtifact(sessionId, 'run-record.yaml'))!
    expect(yaml).toContain('validators:')
    expect(yaml).toContain('raw-tailwind-color')
    expect(yaml).toContain('validatorSummary:')
    expect(yaml).toContain('warnings: 2')
  })

  it('throws when input artifact missing', async () => {
    await expect(createLogRunPhase().run({ session: store, sessionId })).rejects.toThrow(
      /missing required artifact "run-record.json"/,
    )
  })

  it('throws on invalid JSON', async () => {
    await store.writeArtifact(sessionId, 'run-record.json', 'not json')
    await expect(createLogRunPhase().run({ session: store, sessionId })).rejects.toThrow(/is not valid JSON/)
  })

  it('throws when required fields are missing', async () => {
    await store.writeArtifact(
      sessionId,
      'run-record.json',
      JSON.stringify({ timestamp: '2026-04-23T19:00:00Z', intent: 'x' }),
    )
    await expect(createLogRunPhase().run({ session: store, sessionId })).rejects.toThrow(/must be a valid RunRecord/)
  })

  it('throws when outcome has wrong type', async () => {
    await store.writeArtifact(sessionId, 'run-record.json', JSON.stringify({ ...baseRecord(), outcome: 42 }))
    await expect(createLogRunPhase().run({ session: store, sessionId })).rejects.toThrow(/must be a valid RunRecord/)
  })

  it('honors custom artifact names', async () => {
    await store.writeArtifact(sessionId, 'run-input-x.json', JSON.stringify(baseRecord({ intent: 'custom path' })))
    const phase = createLogRunPhase({
      inputArtifact: 'run-input-x.json',
      outputArtifact: 'run-output-x.yaml',
    })
    await phase.run({ session: store, sessionId })

    const yaml = await store.readArtifact(sessionId, 'run-output-x.yaml')
    expect(yaml).toContain('intent: "custom path"')
    // Default-name artifacts must not exist when custom names used.
    expect(await store.readArtifact(sessionId, 'run-record.yaml')).toBeNull()
  })

  it('renders error field when outcome=error', async () => {
    await store.writeArtifact(
      sessionId,
      'run-record.json',
      JSON.stringify(baseRecord({ outcome: 'error', error: 'AI provider 503' })),
    )
    await createLogRunPhase().run({ session: store, sessionId })

    const yaml = (await store.readArtifact(sessionId, 'run-record.yaml'))!
    expect(yaml).toContain('outcome: error')
    expect(yaml).toContain('error: "AI provider 503"')
  })
})
