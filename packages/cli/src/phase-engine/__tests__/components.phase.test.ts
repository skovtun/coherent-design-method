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

  it('prep throws when input missing', async () => {
    await expect(createComponentsPhase().prep({ session: store, sessionId })).rejects.toThrow(
      /missing required artifact "components-input.json"/,
    )
  })

  it('prep throws on malformed input', async () => {
    await store.writeArtifact(sessionId, 'components-input.json', JSON.stringify({ sharedComponents: 'oops' }))
    await expect(createComponentsPhase().prep({ session: store, sessionId })).rejects.toThrow(
      /must have an array "sharedComponents" and a string "styleContext"/,
    )
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
})
