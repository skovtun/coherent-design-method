import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateSharedComponent } from './SharedComponentGenerator.js'
import { writeFile, readFile } from 'fs/promises'

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

    const manifestWriteCall = vi.mocked(writeFile).mock.calls.find(
      (call) => String(call[0]).includes('coherent.components.json'),
    )
    expect(manifestWriteCall).toBeDefined()
    const savedManifest = JSON.parse(manifestWriteCall![1] as string)
    expect(savedManifest.shared[0].propsInterface).toBe('{ title: string }')
  })

  it('omits propsInterface when not provided', async () => {
    await generateSharedComponent('/tmp/test-project', {
      name: 'Header',
      type: 'layout',
    })

    const manifestWriteCall = vi.mocked(writeFile).mock.calls.find(
      (call) => String(call[0]).includes('coherent.components.json'),
    )
    expect(manifestWriteCall).toBeDefined()
    const savedManifest = JSON.parse(manifestWriteCall![1] as string)
    expect(savedManifest.shared[0].propsInterface).toBeUndefined()
  })
})
