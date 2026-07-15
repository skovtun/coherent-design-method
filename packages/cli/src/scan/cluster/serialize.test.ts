import { describe, expect, it } from 'vitest'
import type { EvidenceRow } from '../adapters/types.js'
import type { ScanRunMetadata } from '../json-output.js'
import { deterministicLabelAll } from './deterministic-label.js'
import { precluster } from './precluster.js'
import { serializeCohereDesign } from './serialize.js'

const metadata: ScanRunMetadata = {
  schema_version: '1.0.0',
  adapter: 'blade',
  scanned_at: '2026-05-11T12:00:00.000Z',
  project_root: '/tmp/test-project',
  files_scanned: 3,
  duration_ms: 12,
}

function row(
  raw_class_string: string,
  file: string,
  line: number,
  kind: EvidenceRow['kind'] = 'inline_classes',
): EvidenceRow {
  return {
    file,
    line,
    kind,
    raw_class_string,
    surrounding_context: '',
  }
}

describe('serializeCohereDesign', () => {
  it('emits DRAFT banner', () => {
    const out = serializeCohereDesign([], { metadata })
    expect(out).toContain('# Coherent Design (DRAFT)')
    expect(out).toContain('DRAFT — auto-generated from code. Not canonical')
  })

  it('includes scan metadata block', () => {
    const out = serializeCohereDesign([], { metadata })
    expect(out).toContain('- **adapter:** blade')
    expect(out).toContain('- **files scanned:** 3')
    expect(out).toContain('- **scan duration:** 12 ms')
  })

  it('serializes deterministic clusters', () => {
    const rows = [
      row('lb-label', 'a.blade.php', 1),
      row('lb-label', 'b.blade.php', 2),
      row('lb-field', 'c.blade.php', 3),
    ]
    const clusters = precluster(rows)
    const labeled = deterministicLabelAll(clusters)
    const out = serializeCohereDesign(labeled, { metadata })
    // Deterministic label is now the clean class signature, no -cluster-hash suffix.
    expect(out).toContain('### lb-label')
    expect(out).toContain('### lb-field')
    expect(out).not.toMatch(/-cluster-[0-9a-f]{8}/)
    expect(out).toContain('**occurrences:** 2')
    expect(out).toContain('**source:** deterministic')
  })

  it('groups by kind in summary table', () => {
    const rows = [
      row('btn-primary', 'a.blade.php', 1, 'inline_classes'),
      row('btn-secondary', 'b.blade.php', 2, 'inline_classes'),
      row('btn', 'c.blade.php', 3, 'raw_button_tag'),
    ]
    const labeled = deterministicLabelAll(precluster(rows))
    const out = serializeCohereDesign(labeled, { metadata })
    expect(out).toContain('## Summary')
    expect(out).toMatch(/Inline class bags.+2/)
    expect(out).toMatch(/Raw `<button>` elements.+1/)
  })

  it('shows up to N samples with file:line', () => {
    const rows = Array.from({ length: 10 }, (_, i) => row('lb-label', `file-${i}.blade.php`, i + 1))
    const labeled = deterministicLabelAll(precluster(rows))
    const out = serializeCohereDesign(labeled, {
      metadata,
      samplesPerCluster: 3,
    })
    const sampleLines = out.split('\n').filter(l => l.includes('.blade.php:'))
    expect(sampleLines).toHaveLength(3)
  })

  it('prefers distinct files in samples (Q4)', () => {
    const rows: EvidenceRow[] = [
      row('lb-label', 'file-a.blade.php', 1),
      row('lb-label', 'file-a.blade.php', 5),
      row('lb-label', 'file-b.blade.php', 2),
      row('lb-label', 'file-c.blade.php', 3),
    ]
    const labeled = deterministicLabelAll(precluster(rows))
    const out = serializeCohereDesign(labeled, {
      metadata,
      samplesPerCluster: 3,
    })
    expect(out).toContain('`file-a.blade.php:1`')
    expect(out).toContain('`file-b.blade.php:2`')
    expect(out).toContain('`file-c.blade.php:3`')
  })

  it('truncates very long token lists', () => {
    const tokens = Array.from({ length: 20 }, (_, i) => `tk${i}`).join(' ')
    const labeled = deterministicLabelAll(precluster([row(tokens, 'a.blade.php', 1)]))
    const out = serializeCohereDesign(labeled, { metadata })
    expect(out).toContain('_(+')
    expect(out).toContain(' more)_')
  })

  it('is deterministic across runs (same input → same output)', () => {
    const rows = [
      row('lb-label', 'a.blade.php', 1),
      row('lb-field', 'b.blade.php', 2),
      row('btn primary', 'c.blade.php', 3, 'raw_button_tag'),
    ]
    const a = serializeCohereDesign(deterministicLabelAll(precluster(rows)), { metadata })
    const b = serializeCohereDesign(deterministicLabelAll(precluster(rows.slice().reverse())), { metadata })
    expect(a).toBe(b)
  })

  it('sorts clusters within a kind by member count (largest first)', () => {
    const rows = [
      row('rare-class', 'a.blade.php', 1),
      row('common-class', 'b.blade.php', 1),
      row('common-class', 'c.blade.php', 1),
      row('common-class', 'd.blade.php', 1),
    ]
    const labeled = deterministicLabelAll(precluster(rows))
    const out = serializeCohereDesign(labeled, { metadata })
    const commonIdx = out.indexOf('### common-class')
    const rareIdx = out.indexOf('### rare-class')
    expect(commonIdx).toBeGreaterThan(0)
    expect(rareIdx).toBeGreaterThan(commonIdx)
  })
})
