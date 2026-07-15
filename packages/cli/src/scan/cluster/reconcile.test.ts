import { describe, expect, it } from 'vitest'
import { reconcileLabelOutput, unresolvedIds } from './reconcile.js'
import type { RawLabelOutput } from './providers/types.js'

const good = (id: string, label = 'Field label'): RawLabelOutput => ({
  cluster_id: id,
  human_label: label,
  suggested_role: 'label.field',
  confidence: 0.9,
})

describe('reconcileLabelOutput — happy path', () => {
  it('ok=true when all IDs present and valid', () => {
    const ids = ['a', 'b', 'c']
    const out = ids.map(id => good(id))
    const r = reconcileLabelOutput(ids, out)
    expect(r.ok).toBe(true)
    expect(r.valid).toHaveLength(3)
    expect(r.missing).toEqual([])
    expect(r.extra).toEqual([])
    expect(r.duplicate).toEqual([])
    expect(r.invalid).toEqual([])
  })

  it('preserves expected-id order in valid[]', () => {
    const ids = ['b', 'a', 'c']
    const out = [good('a'), good('b'), good('c')]
    const r = reconcileLabelOutput(ids, out)
    expect(r.valid.map(v => v.cluster_id)).toEqual(['b', 'a', 'c'])
  })

  it('trims human_label whitespace', () => {
    const r = reconcileLabelOutput(['a'], [{ ...good('a'), human_label: '  Field label  ' }])
    expect(r.valid[0].human_label).toBe('Field label')
  })
})

describe('reconcileLabelOutput — failure modes', () => {
  it('reports missing IDs', () => {
    const r = reconcileLabelOutput(['a', 'b'], [good('a')])
    expect(r.ok).toBe(false)
    expect(r.missing).toEqual(['b'])
  })

  it('reports extra IDs (hallucinated)', () => {
    const r = reconcileLabelOutput(['a'], [good('a'), good('x')])
    expect(r.extra).toEqual(['x'])
    expect(r.valid).toHaveLength(1)
  })

  it('reports duplicates and keeps only first', () => {
    const r = reconcileLabelOutput(['a'], [good('a', 'First'), good('a', 'Second')])
    expect(r.duplicate).toEqual(['a'])
    expect(r.valid).toHaveLength(1)
    expect(r.valid[0].human_label).toBe('First')
  })

  it('rejects label too short', () => {
    const r = reconcileLabelOutput(['a'], [{ ...good('a'), human_label: 'X' }])
    expect(r.invalid).toHaveLength(1)
    expect(r.invalid[0].reason).toContain('too short')
    expect(r.valid).toHaveLength(0)
  })

  it('rejects label too long', () => {
    const r = reconcileLabelOutput(['a'], [{ ...good('a'), human_label: 'x'.repeat(80) }])
    expect(r.invalid[0].reason).toContain('too long')
  })

  it('rejects trailing period', () => {
    const r = reconcileLabelOutput(['a'], [{ ...good('a'), human_label: 'Field label.' }])
    expect(r.invalid[0].reason).toContain('period')
  })

  it('rejects confidence out of range', () => {
    const r = reconcileLabelOutput(['a'], [{ ...good('a'), confidence: 1.5 }])
    expect(r.invalid[0].reason).toContain('[0, 1]')
  })

  it('rejects missing confidence', () => {
    const r = reconcileLabelOutput(
      ['a'],
      [{ cluster_id: 'a', human_label: 'Field label' } as unknown as RawLabelOutput],
    )
    expect(r.invalid[0].reason).toContain('confidence')
  })

  it('drops a malformed suggested_role but keeps the label (does NOT invalidate)', () => {
    // 2026-07-15: "layout.label-value-row" (kebab segment) used to nuke a
    // perfect human_label to a deterministic fallback. Now the role is dropped
    // and the label survives.
    const r = reconcileLabelOutput(['a'], [{ ...good('a'), suggested_role: 'layout.label-value-row' }])
    expect(r.ok).toBe(true)
    expect(r.invalid).toEqual([])
    expect(r.valid).toHaveLength(1)
    expect(r.valid[0].human_label).toBe(good('a').human_label)
    expect(r.valid[0].suggested_role).toBeUndefined()
  })

  it('drops a Title-Case suggested_role too, still keeps the label', () => {
    const r = reconcileLabelOutput(['a'], [{ ...good('a'), suggested_role: 'Button-Primary' }])
    expect(r.ok).toBe(true)
    expect(r.valid[0].suggested_role).toBeUndefined()
  })

  it('still invalidates on a bad REQUIRED field (human_label), unaffected by role handling', () => {
    const r = reconcileLabelOutput(['a'], [{ cluster_id: 'a', human_label: '.', confidence: 0.8 }])
    expect(r.ok).toBe(false)
    expect(r.invalid).toHaveLength(1)
  })

  it('accepts omitted suggested_role', () => {
    const r = reconcileLabelOutput(['a'], [{ cluster_id: 'a', human_label: 'X label', confidence: 0.8 }])
    expect(r.ok).toBe(true)
  })

  it('accepts dot.case role with up to 4 segments', () => {
    const ok = ['button', 'button.primary', 'a.b.c', 'a.b.c.d']
    for (const role of ok) {
      const r = reconcileLabelOutput(['a'], [{ ...good('a'), suggested_role: role }])
      expect(r.ok).toBe(true)
    }
  })

  it('drops a role with 5+ segments but keeps the label', () => {
    const r = reconcileLabelOutput(['a'], [{ ...good('a'), suggested_role: 'a.b.c.d.e' }])
    expect(r.ok).toBe(true)
    expect(r.valid[0].suggested_role).toBeUndefined()
  })
})

describe('unresolvedIds', () => {
  it('returns IDs absent from valid[]', () => {
    const ids = ['a', 'b', 'c']
    const r = reconcileLabelOutput(ids, [good('a'), good('c')])
    expect(unresolvedIds(r, ids)).toEqual(['b'])
  })
})
