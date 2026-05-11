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
