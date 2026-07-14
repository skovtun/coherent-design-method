import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { evaluate, formatEvalReport, loadExpected, type ExpectedFile } from './eval.js'
import type { LabeledCluster } from './types.js'

function labeled(id: string, label: string, role?: string): LabeledCluster {
  return {
    cluster: {
      cluster_id: id,
      signature: { kind: 'inline_classes', tokens: ['x'] },
      members: [],
    },
    human_label: label,
    suggested_role: role,
    confidence: 0.9,
    source: 'llm',
  }
}

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'coh-eval-'))
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('loadExpected', () => {
  it('parses well-formed file', () => {
    const path = join(tmp, 'exp.json')
    writeFileSync(
      path,
      JSON.stringify({
        clusters: [{ cluster_id: 'a', acceptable_labels: ['Field label'], expected_role: 'label.field' }],
      }),
    )
    const file = loadExpected(path)
    expect(file.clusters[0].cluster_id).toBe('a')
  })

  it('throws on malformed JSON', () => {
    const path = join(tmp, 'exp.json')
    writeFileSync(path, '{ no clusters: true }')
    expect(() => loadExpected(path)).toThrow()
  })

  it('throws when clusters key missing', () => {
    const path = join(tmp, 'exp.json')
    writeFileSync(path, JSON.stringify({ wrong: 'shape' }))
    expect(() => loadExpected(path)).toThrow(/clusters/)
  })
})

describe('evaluate', () => {
  const expected: ExpectedFile = {
    clusters: [
      { cluster_id: 'a', acceptable_labels: ['Field label', 'Form label'], expected_role: 'label.field' },
      { cluster_id: 'b', acceptable_labels: ['Primary CTA'] },
    ],
  }

  it('reports all pass when actual matches', () => {
    const actual = [labeled('a', 'Field label', 'label.field'), labeled('b', 'Primary CTA')]
    const report = evaluate(actual, expected)
    expect(report.total).toBe(2)
    expect(report.pass).toBe(2)
    expect(report.major_failures).toBe(0)
    expect(report.minor_failures).toBe(0)
    expect(report.gate.flip_llm_default_ok).toBe(true)
  })

  it('flags major failure for wrong label', () => {
    const actual = [labeled('a', 'Random nonsense', 'label.field'), labeled('b', 'Primary CTA')]
    const report = evaluate(actual, expected)
    expect(report.major_failures).toBe(1)
    expect(report.cases[0].reason).toContain('not in acceptable set')
  })

  it('flags minor failure for wrong role only', () => {
    const actual = [labeled('a', 'Field label', 'wrong.role'), labeled('b', 'Primary CTA')]
    const report = evaluate(actual, expected)
    expect(report.major_failures).toBe(0)
    expect(report.minor_failures).toBe(1)
  })

  it('flags missing cluster as major', () => {
    const actual = [labeled('a', 'Field label', 'label.field')]
    const report = evaluate(actual, expected)
    expect(report.major_failures).toBe(1)
    expect(report.cases[1].reason).toContain('missing')
  })

  it('case-insensitive label match', () => {
    const actual = [labeled('a', 'FIELD LABEL', 'label.field'), labeled('b', 'primary cta')]
    const report = evaluate(actual, expected)
    expect(report.pass).toBe(2)
  })

  it('fuzzy-matches phrase supersets ("App Layout Shell" ⊇ "App Layout")', () => {
    const exp: ExpectedFile = { clusters: [{ cluster_id: 'a', acceptable_labels: ['App Layout'] }] }
    const report = evaluate([labeled('a', 'App Layout Shell')], exp)
    expect(report.major_failures).toBe(0)
    expect(report.pass).toBe(1)
  })

  it('fuzzy-matches high token overlap ("Form Input Field" vs "Form Field")', () => {
    const exp: ExpectedFile = { clusters: [{ cluster_id: 'a', acceptable_labels: ['Form Field'] }] }
    const report = evaluate([labeled('a', 'Form Input Field')], exp)
    expect(report.major_failures).toBe(0)
  })

  it('still fails genuinely different labels (fuzzy does not over-rescue)', () => {
    // "Breadcrumb Link" vs "Hover Link" share only "link" → Jaccard 1/3 < 0.6 → major.
    const exp: ExpectedFile = { clusters: [{ cluster_id: 'a', acceptable_labels: ['Hover Link'] }] }
    const report = evaluate([labeled('a', 'Breadcrumb Link')], exp)
    expect(report.major_failures).toBe(1)
  })

  it('blocks --llm default when major rate > 20%', () => {
    const exp: ExpectedFile = {
      clusters: Array.from({ length: 10 }, (_, i) => ({
        cluster_id: `id-${i}`,
        acceptable_labels: ['Correct'],
      })),
    }
    const actual = exp.clusters.map((c, i) => labeled(c.cluster_id, i < 3 ? 'Wrong' : 'Correct'))
    const report = evaluate(actual, exp)
    expect(report.major_failures).toBe(3)
    expect(report.gate.flip_llm_default_ok).toBe(false)
  })

  it('flags prompt-revision when combined rate > 35%', () => {
    const exp: ExpectedFile = {
      clusters: Array.from({ length: 10 }, (_, i) => ({
        cluster_id: `id-${i}`,
        acceptable_labels: ['Correct'],
        expected_role: 'label.field',
      })),
    }
    // 2 major + 2 minor = 4/10 = 40%
    const actual = exp.clusters.map((c, i) => {
      if (i < 2) return labeled(c.cluster_id, 'Wrong')
      if (i < 4) return labeled(c.cluster_id, 'Correct', 'wrong.role')
      return labeled(c.cluster_id, 'Correct', 'label.field')
    })
    const report = evaluate(actual, exp)
    expect(report.gate.needs_prompt_revision).toBe(true)
  })
})

describe('evaluate v2 — hard-case suite (R10, codex verdict 1)', () => {
  it('any hard-case major blocks the flip even when representative rate passes', () => {
    const exp: ExpectedFile = {
      clusters: [
        { cluster_id: 'hard-1', acceptable_labels: ['Muted Text'], hard_case: true },
        ...Array.from({ length: 10 }, (_, i) => ({
          cluster_id: `rep-${i}`,
          acceptable_labels: ['Correct'],
        })),
      ],
    }
    const actual = [
      labeled('hard-1', 'Something Else Entirely'),
      ...exp.clusters.slice(1).map(c => labeled(c.cluster_id, 'Correct')),
    ]
    const report = evaluate(actual, exp)
    expect(report.representative_major_failures).toBe(0)
    expect(report.hard_major_failures).toBe(1)
    expect(report.gate.flip_llm_default_ok).toBe(false)
    expect(report.gate.needs_prompt_revision).toBe(true)
  })

  it('representative rate is computed excluding hard cases', () => {
    const exp: ExpectedFile = {
      clusters: [
        { cluster_id: 'hard-1', acceptable_labels: ['A'], hard_case: true },
        { cluster_id: 'rep-1', acceptable_labels: ['B'] },
        { cluster_id: 'rep-2', acceptable_labels: ['C'] },
      ],
    }
    const actual = [labeled('hard-1', 'A'), labeled('rep-1', 'B'), labeled('rep-2', 'Wrong Thing Zz')]
    const report = evaluate(actual, exp)
    expect(report.hard_total).toBe(1)
    expect(report.representative_total).toBe(2)
    expect(report.representative_major_failures).toBe(1)
    // 1/2 = 50% > 20% → blocked by representative rate
    expect(report.gate.flip_llm_default_ok).toBe(false)
  })

  it('passes the gate when hard cases pass and representative rate ≤ 20%', () => {
    const exp: ExpectedFile = {
      clusters: [
        { cluster_id: 'hard-1', acceptable_labels: ['Muted Text'], hard_case: true, must_be_generic: true },
        ...Array.from({ length: 5 }, (_, i) => ({
          cluster_id: `rep-${i}`,
          acceptable_labels: ['Correct'],
        })),
      ],
    }
    const actual = [
      labeled('hard-1', 'Muted Text'),
      ...exp.clusters.slice(1).map(c => labeled(c.cluster_id, 'Correct')),
    ]
    const report = evaluate(actual, exp)
    expect(report.gate.flip_llm_default_ok).toBe(true)
    expect(report.gate.needs_prompt_revision).toBe(false)
  })
})

describe('evaluate v2 — must_be_generic (F13, codex verdict 4)', () => {
  it('fails a too-specific label that the symmetric fuzzy match would accept', () => {
    const exp: ExpectedFile = {
      clusters: [{ cluster_id: 'a', acceptable_labels: ['Muted Text'], must_be_generic: true }],
    }
    // Jaccard 2/3 ≥ 0.6 AND phrase-superset — symmetric match would PASS this.
    const report = evaluate([labeled('a', 'Breadcrumb Muted Text')], exp)
    expect(report.major_failures).toBe(1)
    expect(report.cases[0].reason).toContain('too specific')
  })

  it('accepts an equally-generic or more-generic label', () => {
    const exp: ExpectedFile = {
      clusters: [
        { cluster_id: 'a', acceptable_labels: ['Muted Caption Text'], must_be_generic: true },
        { cluster_id: 'b', acceptable_labels: ['Muted Text'], must_be_generic: true },
      ],
    }
    const report = evaluate([labeled('a', 'Muted Text'), labeled('b', 'muted text')], exp)
    expect(report.major_failures).toBe(0)
  })

  it('without must_be_generic the same specific label still passes (regression guard)', () => {
    const exp: ExpectedFile = { clusters: [{ cluster_id: 'a', acceptable_labels: ['Muted Text'] }] }
    const report = evaluate([labeled('a', 'Breadcrumb Muted Text')], exp)
    expect(report.major_failures).toBe(0)
  })
})

describe('evaluate v2 — max_confidence + meta', () => {
  it('flags confidence above max_confidence as minor', () => {
    const exp: ExpectedFile = {
      clusters: [{ cluster_id: 'a', acceptable_labels: ['Field label'], max_confidence: 0.5 }],
    }
    // labeled() fixture sets confidence 0.9 > 0.5
    const report = evaluate([labeled('a', 'Field label')], exp)
    expect(report.minor_failures).toBe(1)
    expect(report.cases[0].reason).toContain('confidence')
  })

  it('echoes meta into the report and the formatted output', () => {
    const exp: ExpectedFile = {
      meta: { corpus: 'pilot-blade-v1', eval_version: 'r10-v2', seed: 42 },
      clusters: [{ cluster_id: 'a', acceptable_labels: ['X'] }],
    }
    const report = evaluate([labeled('a', 'X')], exp)
    expect(report.meta?.corpus).toBe('pilot-blade-v1')
    expect(formatEvalReport(report)).toContain('pilot-blade-v1')
  })

  it('formatted report shows hard-case and representative breakdown', () => {
    const exp: ExpectedFile = {
      clusters: [
        { cluster_id: 'h', acceptable_labels: ['A'], hard_case: true },
        { cluster_id: 'r', acceptable_labels: ['B'] },
      ],
    }
    const out = formatEvalReport(evaluate([labeled('h', 'Zz Qq'), labeled('r', 'B')], exp))
    expect(out).toContain('hard cases:')
    expect(out).toContain('zero-tolerance')
    expect(out).toContain('MAJOR/HARD')
  })
})

describe('formatEvalReport', () => {
  it('produces a human-readable summary', () => {
    const expected: ExpectedFile = {
      clusters: [{ cluster_id: 'a', acceptable_labels: ['X'] }],
    }
    const report = evaluate([labeled('a', 'Y')], expected)
    const out = formatEvalReport(report)
    expect(out).toContain('Eval:')
    expect(out).toContain('major failures: 1')
    expect(out).toContain('MAJOR')
  })
})
