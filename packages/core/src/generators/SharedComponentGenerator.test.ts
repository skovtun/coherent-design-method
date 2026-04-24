import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateSharedComponent, toSharedFileName } from './SharedComponentGenerator.js'
import { writeFile, readFile } from 'fs/promises'

describe('toSharedFileName', () => {
  it('kebab-cases a regular CamelCase name', () => {
    expect(toSharedFileName('PricingCard')).toBe('pricing-card')
  })

  it('kebab-cases a single-word name', () => {
    expect(toSharedFileName('Header')).toBe('header')
  })

  it('kebab-cases a space-separated name', () => {
    expect(toSharedFileName('Main Header')).toBe('main-header')
  })

  // Regression guard for v0.7.12+: "DSButton" used to collapse to "dsbutton"
  // because the original regex only split on `[a-z][A-Z]` transitions and
  // missed acronyms. The scaffolder wrote `components/shared/dsbutton.tsx`
  // while the layout integrator imported `@/components/shared/ds-button` —
  // every fresh `coherent init` project 500'd on first `coherent preview`.
  it('splits an acronym at the start of the name', () => {
    expect(toSharedFileName('DSButton')).toBe('ds-button')
  })

  it('splits an acronym at the start of a longer name', () => {
    expect(toSharedFileName('APIKey')).toBe('api-key')
  })

  it('splits nested acronyms correctly', () => {
    expect(toSharedFileName('XMLHttpRequest')).toBe('xml-http-request')
  })
})

vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(JSON.stringify({ shared: [], nextId: 1 })),
}))

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
}))

describe('generateSharedComponent passes propsInterface to createEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ shared: [], nextId: 1 }))
  })

  it('passes propsInterface through to the registry entry', async () => {
    const result = await generateSharedComponent('/tmp/test-project', {
      name: 'FeatureCard',
      type: 'section',
      code: 'export function FeatureCard() { return <div /> }',
      propsInterface: '{ title: string }',
    })

    expect(result.name).toBe('FeatureCard')
    expect(result.file).toBe('components/shared/feature-card.tsx')

    const manifestWriteCall = vi
      .mocked(writeFile)
      .mock.calls.find(call => String(call[0]).includes('coherent.components.json'))
    expect(manifestWriteCall).toBeDefined()
    const savedManifest = JSON.parse(manifestWriteCall![1] as string)
    expect(savedManifest.shared[0].propsInterface).toBe('{ title: string }')
  })

  it('omits propsInterface when not provided', async () => {
    await generateSharedComponent('/tmp/test-project', {
      name: 'Header',
      type: 'layout',
    })

    const manifestWriteCall = vi
      .mocked(writeFile)
      .mock.calls.find(call => String(call[0]).includes('coherent.components.json'))
    expect(manifestWriteCall).toBeDefined()
    const savedManifest = JSON.parse(manifestWriteCall![1] as string)
    expect(savedManifest.shared[0].propsInterface).toBeUndefined()
  })
})
