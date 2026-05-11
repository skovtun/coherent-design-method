import { describe, expect, it } from 'vitest'
import type { EvidenceRow } from '../adapters/types.js'
import { precluster } from './precluster.js'
import { canonicalSignature, clusterId, normalizeToken, tokenize } from './signature.js'

function row(raw_class_string: string, file = 'a.blade.php', line = 1): EvidenceRow {
  return {
    file,
    line,
    kind: 'inline_classes',
    raw_class_string,
    surrounding_context: '',
  }
}

describe('signature', () => {
  it('normalizes bracket arbitrary values to [*]', () => {
    expect(normalizeToken('bg-[#fff]')).toBe('bg-[*]')
    expect(normalizeToken('min-h-[100dvh]')).toBe('min-h-[*]')
    expect(normalizeToken('px-4')).toBe('px-4')
  })

  it('tokenize trims, splits, and normalizes', () => {
    expect(tokenize('  px-4   py-2  ')).toEqual(['px-4', 'py-2'])
    expect(tokenize('bg-[#fff] text-black')).toEqual(['bg-[*]', 'text-black'])
  })

  it('keeps px-4 and px-6 separate (no semantic abstraction in v0)', () => {
    const a = canonicalSignature('inline_classes', 'px-4 py-2')
    const b = canonicalSignature('inline_classes', 'px-6 py-2')
    expect(clusterId(a)).not.toBe(clusterId(b))
  })

  it('produces same cluster_id regardless of token order', () => {
    const a = canonicalSignature('inline_classes', 'bg-blue-500 px-4')
    const b = canonicalSignature('inline_classes', 'px-4 bg-blue-500')
    expect(clusterId(a)).toBe(clusterId(b))
  })

  it('different kinds with same tokens are different clusters', () => {
    const a = canonicalSignature('inline_classes', 'btn primary')
    const b = canonicalSignature('raw_button_tag', 'btn primary')
    expect(clusterId(a)).not.toBe(clusterId(b))
  })

  it('cluster_id is 8-char hex (stable hash)', () => {
    const sig = canonicalSignature('inline_classes', 'lb-label')
    const id = clusterId(sig)
    expect(id).toMatch(/^[0-9a-f]{8}$/)
    // Deterministic across runs:
    expect(clusterId(sig)).toBe(id)
  })

  it('collapses bracket variants into one signature', () => {
    const a = canonicalSignature('inline_classes', 'bg-[#fff] p-4')
    const b = canonicalSignature('inline_classes', 'bg-[#000] p-4')
    expect(clusterId(a)).toBe(clusterId(b))
  })
})

describe('precluster', () => {
  it('groups exact matches', () => {
    const rows = [
      row('lb-label', 'a.blade.php', 1),
      row('lb-label', 'b.blade.php', 2),
      row('lb-field', 'c.blade.php', 3),
    ]
    const clusters = precluster(rows)
    expect(clusters).toHaveLength(2)
    const labels = clusters.map(c => c.signature.tokens.join(' ')).sort()
    expect(labels).toEqual(['lb-field', 'lb-label'])
  })

  it('treats token order as equivalent', () => {
    const rows = [row('px-4 bg-blue-500'), row('bg-blue-500 px-4')]
    const clusters = precluster(rows)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].members).toHaveLength(2)
  })

  it('keeps kinds separate even with same tokens', () => {
    const a: EvidenceRow = {
      ...row('btn'),
      kind: 'inline_classes',
    }
    const b: EvidenceRow = {
      ...row('btn'),
      kind: 'raw_button_tag',
    }
    const clusters = precluster([a, b])
    expect(clusters).toHaveLength(2)
  })

  it('output is sorted by cluster_id (deterministic)', () => {
    const rows = [row('z-token'), row('a-token'), row('m-token')]
    const a = precluster(rows)
    const b = precluster(rows.slice().reverse())
    expect(a.map(c => c.cluster_id)).toEqual(b.map(c => c.cluster_id))
  })
})
