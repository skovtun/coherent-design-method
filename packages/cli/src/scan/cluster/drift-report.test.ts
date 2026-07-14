import { describe, expect, it } from 'vitest'
import type { EvidenceRow } from '../adapters/types.js'
import type { ScanRunMetadata } from '../json-output.js'
import { deterministicLabelAll } from './deterministic-label.js'
import { DRIFT_TOP_N_DEFAULT, serializeDriftReport } from './drift-report.js'
import { precluster } from './precluster.js'

const metadata: ScanRunMetadata = {
  schema_version: '1.0.0',
  adapter: 'blade',
  scanned_at: '2026-05-11T12:00:00.000Z',
  project_root: '/tmp/test-project',
  files_scanned: 3,
  duration_ms: 12,
}

const designPath = '/tmp/test-project/DESIGN.md'

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

function labeledFixture(classStrings: string[]) {
  const rows = classStrings.map((cls, i) => row(cls, `f${i}.blade.php`, i + 1))
  return deterministicLabelAll(precluster(rows))
}

describe('serializeDriftReport', () => {
  it('states the DESIGN.md path and the deferred-comparison disclaimer', () => {
    const out = serializeDriftReport(labeledFixture(['lb-label']), { designPath, metadata })
    expect(out).toContain(`DESIGN.md detected at \`${designPath}\``)
    expect(out).toContain('Semantic comparison deferred — manual review required.')
    expect(out).toContain('no automated semantic comparison')
  })

  it('never claims automated coverage — no matched/covered verdict language', () => {
    const out = serializeDriftReport(labeledFixture(['lb-label', 'lb-field']), { designPath, metadata })
    // Q6 guard: conservative v0 must not emit false-confidence claims.
    expect(out).not.toMatch(/(covered: (yes|no)|drift detected|missing from DESIGN\.md|✓ covered)/i)
  })

  it('lists clusters sorted by member count with stable ids', () => {
    const rows = [
      row('lb-label', 'a.blade.php', 1),
      row('lb-label', 'b.blade.php', 2),
      row('lb-label', 'c.blade.php', 3),
      row('lb-field', 'd.blade.php', 4),
    ]
    const labeled = deterministicLabelAll(precluster(rows))
    const out = serializeDriftReport(labeled, { designPath, metadata })
    const lines = out.split('\n')
    const first = lines.findIndex(l => l.startsWith('| 1 |'))
    expect(first).toBeGreaterThan(-1)
    expect(lines[first]).toContain('| 3 |') // 3 occurrences ranked first
    expect(lines[first + 1]).toContain('| 1 |') // then 1 occurrence
    // stable 8-char hex cluster id present
    expect(lines[first]).toMatch(/`[0-9a-f]{8}`/)
  })

  it('caps the table at topN and reports the omitted count', () => {
    const many = Array.from({ length: 25 }, (_, i) => `unique-class-${i}`)
    const out = serializeDriftReport(labeledFixture(many), { designPath, metadata, topN: 20 })
    expect(out).toContain('top 20 by occurrences')
    expect(out).toContain('_5 smaller clusters omitted')
  })

  it('lists everything when clusters fit within topN (no omitted line)', () => {
    const out = serializeDriftReport(labeledFixture(['a-cls', 'b-cls']), { designPath, metadata })
    expect(out).toContain('top 2 by occurrences')
    expect(out).not.toContain('omitted')
  })

  it('default topN is 20', () => {
    expect(DRIFT_TOP_N_DEFAULT).toBe(20)
  })

  it('includes scan context block', () => {
    const out = serializeDriftReport([], { designPath, metadata })
    expect(out).toContain('- **project:** `/tmp/test-project`')
    expect(out).toContain('- **adapter:** blade')
    expect(out).toContain('- **clusters detected:** 0')
  })

  it('handles empty cluster list without crashing', () => {
    const out = serializeDriftReport([], { designPath, metadata })
    expect(out).toContain('top 0 by occurrences')
    expect(out.endsWith('\n')).toBe(true)
  })
})
