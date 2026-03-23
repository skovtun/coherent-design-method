import { describe, it, expect } from 'vitest'
import {
  SharedComponentEntrySchema,
  SharedComponentsManifestSchema,
  SharedComponentTypeSchema,
} from './shared-components-manifest.js'

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

describe('SharedComponentTypeSchema', () => {
  it('accepts extended component types', () => {
    const types = ['layout', 'section', 'widget', 'navigation', 'data-display', 'form', 'feedback']
    for (const t of types) {
      expect(SharedComponentTypeSchema.parse(t)).toBe(t)
    }
  })
})

describe('SharedComponentsManifestSchema — extended fields', () => {
  it('parses entry with new fields', () => {
    const manifest = SharedComponentsManifestSchema.parse({
      shared: [
        {
          id: 'CID-001',
          name: 'StatsCard',
          type: 'data-display',
          file: 'components/shared/stats-card.tsx',
          usedIn: ['app/dashboard/page.tsx'],
          description: 'Metric card',
          propsInterface: '{ icon: LucideIcon; value: string }',
          usageExample: '<StatsCard icon={Users} value="1,234" />',
          dependencies: ['lucide-react'],
          source: 'extracted',
        },
      ],
      nextId: 2,
    })
    expect(manifest.shared[0].usageExample).toBe('<StatsCard icon={Users} value="1,234" />')
    expect(manifest.shared[0].dependencies).toEqual(['lucide-react'])
    expect(manifest.shared[0].source).toBe('extracted')
  })

  it('provides defaults for new fields when parsing old format', () => {
    const manifest = SharedComponentsManifestSchema.parse({
      shared: [
        {
          id: 'CID-001',
          name: 'Header',
          type: 'layout',
          file: 'components/shared/header.tsx',
        },
      ],
      nextId: 2,
    })
    expect(manifest.shared[0].usageExample).toBeUndefined()
    expect(manifest.shared[0].dependencies).toEqual([])
    expect(manifest.shared[0].source).toBeUndefined()
  })
})
