import { describe, it, expect } from 'vitest'
import { createEntry } from './SharedComponentsRegistry.js'

describe('createEntry with propsInterface', () => {
  it('includes propsInterface in created entry', () => {
    const manifest = { shared: [], nextId: 1 }
    const { entry } = createEntry(manifest, {
      name: 'FeatureCard',
      type: 'section',
      file: 'components/shared/feature-card.tsx',
      propsInterface: '{ title: string; description: string }',
    })
    expect(entry.propsInterface).toBe('{ title: string; description: string }')
  })

  it('omits propsInterface when not provided', () => {
    const manifest = { shared: [], nextId: 1 }
    const { entry } = createEntry(manifest, {
      name: 'Header',
      type: 'layout',
      file: 'components/shared/header.tsx',
    })
    expect(entry.propsInterface).toBeUndefined()
  })
})
