/**
 * Rerunnable eval harness for B-2b. Codex Q10: 5 cases too small → 20-30
 * is the target sample size. Mislabel taxonomy:
 *   - major: human_label materially wrong
 *   - minor: suggested_role wrong OR confidence badly inflated
 *
 * Gate thresholds:
 *   - major > 20%        → do NOT flip `--llm` to default
 *   - major + minor > 35% → prompt revision required
 *   - any ID-contract failure after repair (caller's responsibility)
 */

import { readFileSync } from 'node:fs'
import type { LabeledCluster } from './types.js'

export interface ExpectedLabel {
  cluster_id: string
  acceptable_labels: string[]
  expected_role?: string
}

export interface ExpectedFile {
  clusters: ExpectedLabel[]
}

export interface EvalCase {
  cluster_id: string
  major: boolean
  minor: boolean
  reason: string
  actual_label: string
  actual_role?: string
  acceptable_labels: string[]
  expected_role?: string
}

export interface EvalReport {
  total: number
  pass: number
  major_failures: number
  minor_failures: number
  cases: EvalCase[]
  /** Gate verdict per codex Q10. */
  gate: {
    flip_llm_default_ok: boolean
    needs_prompt_revision: boolean
  }
}

export function loadExpected(path: string): ExpectedFile {
  const raw = readFileSync(path, 'utf8')
  const parsed = JSON.parse(raw) as ExpectedFile
  if (!parsed.clusters || !Array.isArray(parsed.clusters)) {
    throw new Error(`eval: ${path} missing "clusters" array`)
  }
  return parsed
}

export function evaluate(actual: LabeledCluster[], expected: ExpectedFile): EvalReport {
  const actualById = new Map(actual.map(l => [l.cluster.cluster_id, l]))
  const cases: EvalCase[] = []
  let major_failures = 0
  let minor_failures = 0

  for (const exp of expected.clusters) {
    const got = actualById.get(exp.cluster_id)
    if (!got) {
      cases.push({
        cluster_id: exp.cluster_id,
        major: true,
        minor: false,
        reason: 'missing from output',
        actual_label: '',
        acceptable_labels: exp.acceptable_labels,
        expected_role: exp.expected_role,
      })
      major_failures++
      continue
    }

    const labelOk = matchesAny(got.human_label, exp.acceptable_labels)
    const roleOk = !exp.expected_role || got.suggested_role === exp.expected_role
    const isMajor = !labelOk
    const isMinor = labelOk && !roleOk
    if (isMajor) major_failures++
    if (isMinor) minor_failures++

    cases.push({
      cluster_id: exp.cluster_id,
      major: isMajor,
      minor: isMinor,
      reason: isMajor
        ? `label "${got.human_label}" not in acceptable set`
        : isMinor
          ? `role "${got.suggested_role ?? '(none)'}" != expected "${exp.expected_role}"`
          : 'ok',
      actual_label: got.human_label,
      actual_role: got.suggested_role,
      acceptable_labels: exp.acceptable_labels,
      expected_role: exp.expected_role,
    })
  }

  const total = expected.clusters.length
  const pass = total - major_failures - minor_failures
  const majorRate = total === 0 ? 0 : major_failures / total
  const combinedRate = total === 0 ? 0 : (major_failures + minor_failures) / total

  return {
    total,
    pass,
    major_failures,
    minor_failures,
    cases,
    gate: {
      flip_llm_default_ok: majorRate <= 0.2,
      needs_prompt_revision: combinedRate > 0.35,
    },
  }
}

function matchesAny(actual: string, acceptable: string[]): boolean {
  const norm = (s: string) => s.trim().toLowerCase()
  const a = norm(actual)
  return acceptable.some(x => norm(x) === a)
}

export function formatEvalReport(report: EvalReport): string {
  const lines: string[] = [
    `Eval: ${report.pass}/${report.total} pass`,
    `  major failures: ${report.major_failures}`,
    `  minor failures: ${report.minor_failures}`,
    '',
    `Gate: --llm-default ${report.gate.flip_llm_default_ok ? 'OK' : 'BLOCKED'}, prompt-revision ${report.gate.needs_prompt_revision ? 'REQUIRED' : 'not required'}`,
    '',
  ]
  const fails = report.cases.filter(c => c.major || c.minor)
  if (fails.length > 0) {
    lines.push('Failures:')
    for (const f of fails.slice(0, 20)) {
      const tag = f.major ? 'MAJOR' : 'minor'
      lines.push(`  [${tag}] ${f.cluster_id}: ${f.reason}`)
    }
    if (fails.length > 20) lines.push(`  …and ${fails.length - 20} more`)
  }
  return lines.join('\n')
}
