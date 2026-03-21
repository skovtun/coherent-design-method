import { describe, it, expect } from 'vitest'
import { SharedComponentEntrySchema } from './shared-components-manifest.js'

describe('SharedComponentEntrySchema', () => {
  it('accepts entry with propsInterface', () => {
    const entry = {
      id: 'CID-001',
      name: 'FeatureCard',
      type: 'section',
      file: 'components/shared/feature-card.tsx',
      propsInterface: '{ icon: React.ReactNode; title: string }',
    }
    const result = SharedComponentEntrySchema.parse(entry)
    expect(result.propsInterface).toBe('{ icon: React.ReactNode; title: string }')
  })

  it('allows propsInterface to be omitted', () => {
    const entry = {
      id: 'CID-001',
      name: 'Header',
      type: 'layout',
      file: 'components/shared/header.tsx',
    }
    const result = SharedComponentEntrySchema.parse(entry)
    expect(result.propsInterface).toBeUndefined()
  })
})
