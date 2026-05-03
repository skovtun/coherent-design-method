import { describe, it, expect } from 'vitest'
import type { SharedComponentsManifest } from '@getcoherent/core'
import { extractAtMentions, resolveAtMentions, buildPinnedComponentsDirective, processAtMentions } from './at-syntax.js'

const manifest: SharedComponentsManifest = {
  shared: [
    {
      id: 'CID-001',
      name: 'Header',
      type: 'layout',
      file: 'components/shared/Header.tsx',
      usedIn: [],
      dependencies: [],
      description: 'Top nav with logo',
    },
    {
      id: 'CID-002',
      name: 'PricingTable',
      type: 'section',
      file: 'components/shared/PricingTable.tsx',
      usedIn: [],
      dependencies: [],
      description: 'Three-tier pricing grid',
      propsInterface: '{ tiers: number }',
    },
    {
      id: 'CID-003',
      name: 'TestimonialGrid',
      type: 'section',
      file: 'components/shared/TestimonialGrid.tsx',
      usedIn: [],
      dependencies: [],
    },
  ],
  nextId: 4,
}

describe('extractAtMentions', () => {
  it('returns empty array for empty / no-mention input', () => {
    expect(extractAtMentions('')).toEqual([])
    expect(extractAtMentions('build a pricing page')).toEqual([])
  })

  it('extracts a single mention', () => {
    expect(extractAtMentions('use @hero')).toEqual(['hero'])
  })

  it('extracts multiple mentions in order of appearance', () => {
    expect(extractAtMentions('build with @PricingTable + @TestimonialGrid')).toEqual([
      'PricingTable',
      'TestimonialGrid',
    ])
  })

  it('extracts CID-XXX references', () => {
    expect(extractAtMentions('regenerate using @CID-001 @CID-002')).toEqual(['CID-001', 'CID-002'])
  })

  it('dedupes case-insensitively, preserving first-seen casing', () => {
    expect(extractAtMentions('use @Hero and @hero and @HERO')).toEqual(['Hero'])
  })

  it('does NOT extract from email addresses (boundary check)', () => {
    const tokens = extractAtMentions('contact me at user@example.com about @PricingTable')
    expect(tokens).toEqual(['PricingTable'])
  })

  it('handles punctuation boundaries (parentheses, commas, periods)', () => {
    expect(extractAtMentions('build (@hero, @pricing). Done.')).toEqual(['hero', 'pricing'])
  })

  it('does not extract @ followed by digits', () => {
    expect(extractAtMentions('see issue @123')).toEqual([])
  })

  it('extracts mention at start of string', () => {
    expect(extractAtMentions('@hero on the landing page')).toEqual(['hero'])
  })
})

describe('resolveAtMentions', () => {
  it('returns empty arrays for empty input', () => {
    expect(resolveAtMentions([], manifest)).toEqual({ resolved: [], unresolved: [] })
  })

  it('resolves CID match (uppercase)', () => {
    const r = resolveAtMentions(['CID-001'], manifest)
    expect(r.resolved.map(c => c.id)).toEqual(['CID-001'])
    expect(r.unresolved).toEqual([])
  })

  it('resolves CID match (lowercase input)', () => {
    const r = resolveAtMentions(['cid-002'], manifest)
    expect(r.resolved.map(c => c.id)).toEqual(['CID-002'])
  })

  it('resolves by exact name (case-insensitive)', () => {
    const r = resolveAtMentions(['pricingtable'], manifest)
    expect(r.resolved.map(c => c.id)).toEqual(['CID-002'])
  })

  it('resolves multiple in input order', () => {
    const r = resolveAtMentions(['TestimonialGrid', 'Header'], manifest)
    expect(r.resolved.map(c => c.id)).toEqual(['CID-003', 'CID-001'])
  })

  it('reports unresolved tokens', () => {
    const r = resolveAtMentions(['Footer', 'PricingTable', 'Carousel'], manifest)
    expect(r.resolved.map(c => c.id)).toEqual(['CID-002'])
    expect(r.unresolved).toEqual(['Footer', 'Carousel'])
  })

  it('dedupes resolved entries even if tokens map to the same component', () => {
    // "CID-001" + "Header" both resolve to CID-001
    const r = resolveAtMentions(['CID-001', 'Header'], manifest)
    expect(r.resolved.length).toBe(1)
    expect(r.resolved[0].id).toBe('CID-001')
  })
})

describe('buildPinnedComponentsDirective', () => {
  it('returns undefined for empty pinned list', () => {
    expect(buildPinnedComponentsDirective([])).toBeUndefined()
  })

  it('builds a MUST USE directive with each pinned entry', () => {
    const directive = buildPinnedComponentsDirective(manifest.shared.slice(0, 2))
    expect(directive).toBeDefined()
    expect(directive!).toContain('USER EXPLICITLY PINNED')
    expect(directive!).toContain('CID-001 Header')
    expect(directive!).toContain('CID-002 PricingTable')
    expect(directive!).toContain('Props: { tiers: number }')
    expect(directive!).toContain('Do NOT skip')
  })

  it('uses correct import paths', () => {
    const directive = buildPinnedComponentsDirective([manifest.shared[1]])
    expect(directive!).toContain("import { PricingTable } from '@/components/shared/PricingTable'")
  })
})

describe('processAtMentions (one-shot helper)', () => {
  it('returns zero-cost shape for messages without @ mentions', () => {
    const r = processAtMentions('build a pricing page', manifest)
    expect(r.directive).toBeUndefined()
    expect(r.unresolvedWarnings).toEqual([])
    expect(r.pinnedCount).toBe(0)
  })

  it('builds directive when mentions resolve', () => {
    const r = processAtMentions('use @PricingTable + @Header', manifest)
    expect(r.directive).toBeDefined()
    expect(r.directive!).toContain('PricingTable')
    expect(r.directive!).toContain('Header')
    expect(r.pinnedCount).toBe(2)
    expect(r.unresolvedWarnings).toEqual([])
  })

  it('returns warnings for unresolved mentions', () => {
    const r = processAtMentions('use @Footer + @PricingTable', manifest)
    expect(r.pinnedCount).toBe(1)
    expect(r.unresolvedWarnings).toEqual([
      '@Footer did not match any shared component (CID or name) — falling back to keyword match.',
    ])
  })

  it('handles message with only unresolved mentions (no directive)', () => {
    const r = processAtMentions('use @Carousel @Footer', manifest)
    expect(r.directive).toBeUndefined()
    expect(r.pinnedCount).toBe(0)
    expect(r.unresolvedWarnings.length).toBe(2)
  })
})
