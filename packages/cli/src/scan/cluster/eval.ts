/**
 * Rerunnable eval harness for B-2b (v2 shape per R10 + codex consult
 * 2026-07-13). Codex Q10: 5 cases too small → 20-30 is the target sample.
 *
 * Two suites in one expected.json:
 *   - representative set (percentage gate) — seeded stratified sample.
 *   - hard-case suite (`hard_case: true`) — zero-tolerance: ANY major
 *     failure in it blocks the flip, regardless of the representative rate.
 *     Rationale: with ~25 cases and a 20% threshold, all known-hard cases
 *     could fail while the combined gate still passed (codex verdict 1).
 *
 * Mislabel taxonomy:
 *   - major: human_label materially wrong, OR too specific on a
 *     `must_be_generic` cluster (F13 class of error — codex verdict 4).
 *   - minor: suggested_role wrong, OR confidence above `max_confidence`.
 *
 * Gate thresholds:
 *   - representative major > 20% → do NOT flip `--llm` to default
 *   - any hard-case major        → do NOT flip
 *   - overall major + minor > 35% → prompt revision required
 *   - any ID-contract failure after repair (caller's responsibility)
 *
 * This is a VERSIONED PILOT GATE, not a permanent benchmark (codex
 * verdict 6): single-project ground truth is vulnerable to prompt
 * overfitting and corpus drift. `meta` records corpus + version; held-out
 * multi-project suites are future work.
 *
 * PRIVACY: expected.json embeds pilot-project-derived strings AND
 * cluster_ids (unsalted sha256 prefixes of low-entropy class signatures —
 * dictionary-recoverable, codex verdict 5). The file lives OUTSIDE this
 * repo, referenced via `--eval <path>`.
 */

import { readFileSync } from 'node:fs'
import type { LabeledCluster } from './types.js'

export interface ExpectedLabel {
  cluster_id: string
  acceptable_labels: string[]
  expected_role?: string
  /** Zero-tolerance suite membership. Any major here blocks the flip. */
  hard_case?: boolean
  /**
   * F13 scope semantics: the cluster is a high-spread generic utility and
   * the label must NOT be more specific than the acceptable set. With this
   * flag, matching is asymmetric — extra qualifying tokens beyond an
   * acceptable label ("Breadcrumb Muted Text" vs "Muted Text") FAIL, while
   * the symmetric fuzzy match would have passed them.
   */
  must_be_generic?: boolean
  /** Confidence ceiling; actual confidence above it counts as minor. */
  max_confidence?: number
}

export interface ExpectedFileMeta {
  /** Private corpus label, e.g. "pilot-blade-v1". Never the project's real name. */
  corpus?: string
  eval_version?: string
  seed?: number
}

export interface ExpectedFile {
  meta?: ExpectedFileMeta
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
  hard_case?: boolean
  /** Set only when the judge lane ran on this case (see eval-judge.ts). */
  judgeVerdict?: 'adequate' | 'too_narrow' | 'wrong'
}

export interface EvalReport {
  total: number
  pass: number
  major_failures: number
  minor_failures: number
  /** Hard-case suite (zero-tolerance) breakdown. */
  hard_total: number
  hard_major_failures: number
  /** Representative (non-hard) major rate drives the percentage gate. */
  representative_total: number
  representative_major_failures: number
  cases: EvalCase[]
  meta?: ExpectedFileMeta
  /** Gate verdict per codex Q10 + R10 v2. */
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
  let hard_total = 0
  let hard_major_failures = 0
  let representative_total = 0
  let representative_major_failures = 0

  for (const exp of expected.clusters) {
    const isHard = exp.hard_case === true
    if (isHard) hard_total++
    else representative_total++

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
        hard_case: isHard || undefined,
      })
      major_failures++
      if (isHard) hard_major_failures++
      else representative_major_failures++
      continue
    }

    const labelOk = exp.must_be_generic
      ? matchesAnyGeneric(got.human_label, exp.acceptable_labels)
      : matchesAny(got.human_label, exp.acceptable_labels)
    const roleOk = !exp.expected_role || got.suggested_role === exp.expected_role
    const confidenceOk =
      exp.max_confidence === undefined || typeof got.confidence !== 'number' || got.confidence <= exp.max_confidence
    const isMajor = !labelOk
    const isMinor = labelOk && (!roleOk || !confidenceOk)
    if (isMajor) {
      major_failures++
      if (isHard) hard_major_failures++
      else representative_major_failures++
    }
    if (isMinor) minor_failures++

    cases.push({
      cluster_id: exp.cluster_id,
      major: isMajor,
      minor: isMinor,
      reason: isMajor
        ? exp.must_be_generic && matchesAny(got.human_label, exp.acceptable_labels)
          ? `label "${got.human_label}" too specific for a must_be_generic cluster`
          : `label "${got.human_label}" not in acceptable set`
        : isMinor
          ? !roleOk
            ? `role "${got.suggested_role ?? '(none)'}" != expected "${exp.expected_role}"`
            : `confidence ${got.confidence?.toFixed(2)} > max ${exp.max_confidence?.toFixed(2)}`
          : 'ok',
      actual_label: got.human_label,
      actual_role: got.suggested_role,
      acceptable_labels: exp.acceptable_labels,
      expected_role: exp.expected_role,
      hard_case: isHard || undefined,
    })
  }

  const total = expected.clusters.length
  const pass = total - major_failures - minor_failures
  const repMajorRate = representative_total === 0 ? 0 : representative_major_failures / representative_total
  const combinedRate = total === 0 ? 0 : (major_failures + minor_failures) / total

  return {
    total,
    pass,
    major_failures,
    minor_failures,
    hard_total,
    hard_major_failures,
    representative_total,
    representative_major_failures,
    cases,
    meta: expected.meta,
    gate: {
      flip_llm_default_ok: repMajorRate <= 0.2 && hard_major_failures === 0,
      needs_prompt_revision: combinedRate > 0.35 || hard_major_failures > 0,
    },
  }
}

/**
 * Label match — exact-normalized OR fuzzy (phrase-superset / token-Jaccard ≥ 0.6).
 *
 * Rationale (2026-07-11 B-2b eval run): the original exact-string match punished
 * the LLM for benign phrasing variance — "Form Input Field" vs accepted "Form
 * Field", "App Layout Shell" vs "App Layout" — inflating major-failure rate.
 * Fuzzy match rescues those without rescuing genuinely-different labels ("Wrong"
 * vs "Correct" share no tokens → still fail).
 *
 * The deeper 2026-07-11 miscalibration — ground truth authored from token
 * signatures instead of the labeler's context — is addressed by the R10
 * authoring workflow (eval-authoring.ts), not by matching mechanics.
 */
function matchesAny(actual: string, acceptable: string[]): boolean {
  const a = norm(actual)
  const aTokens = tokenize(a)
  return acceptable.some(x => {
    const e = norm(x)
    if (e === a) return true
    // whole-phrase superset either direction ("App Layout Shell" ⊇ "App Layout")
    if (a.includes(e) || e.includes(a)) return true
    const eTokens = tokenize(e)
    // stemmed token-set superset ("Footer Legal Link List" ⊇ "Footer Legal Links")
    if (isSuperset(aTokens, eTokens) || isSuperset(eTokens, aTokens)) return true
    // token-set Jaccard ≥ 0.6 ("Form Input Field" vs "Form Field" = 2/3)
    let inter = 0
    for (const t of aTokens) if (eTokens.has(t)) inter++
    const union = new Set([...aTokens, ...eTokens]).size
    return union > 0 && inter / union >= 0.6
  })
}

function isSuperset(big: Set<string>, small: Set<string>): boolean {
  if (small.size === 0) return false
  for (const t of small) if (!big.has(t)) return false
  return true
}

/**
 * Asymmetric match for `must_be_generic` clusters (codex verdict 4): the
 * actual label may be equal to or MORE generic than an acceptable label,
 * but never more specific. "Muted Text" passes against ["Muted Caption
 * Text"]; "Breadcrumb Muted Text" fails against ["Muted Text"] even though
 * the symmetric superset/Jaccard rules would accept it.
 */
function matchesAnyGeneric(actual: string, acceptable: string[]): boolean {
  const a = norm(actual)
  const aTokens = tokenize(a)
  return acceptable.some(x => {
    const e = norm(x)
    if (e === a) return true
    // actual must be a token-subset of the acceptable label: no extra qualifiers.
    return aTokens.size > 0 && isSuperset(tokenize(e), aTokens)
  })
}

/**
 * Token-level stemming for the eval matcher. English plural only — enough for
 * design-system nouns. The 2026-07-14 run failed "Footer Legal Link List"
 * against accepted "Footer Legal Links" purely on `link` vs `links`: identical
 * meaning, Jaccard 0.4, counted major.
 *
 * Deliberately crude: no Porter stemmer, no lemmatizer. Over-stemming risk on
 * design vocabulary is near zero ("status" → "statu" never collides with a
 * real label token in a way that changes a verdict), and a real stemmer is a
 * dependency this harness does not need.
 */
function stem(token: string): string {
  if (token.length <= 3) return token
  if (token.endsWith('ies')) return token.slice(0, -3) + 'y'
  if (token.endsWith('ses') || token.endsWith('xes') || token.endsWith('ches') || token.endsWith('shes')) {
    return token.slice(0, -2)
  }
  if (token.endsWith('s') && !token.endsWith('ss') && !token.endsWith('us')) return token.slice(0, -1)
  return token
}

function tokenize(normalized: string): Set<string> {
  return new Set(
    normalized
      .split(' ')
      .filter(Boolean)
      .map(t => stem(t)),
  )
}

/**
 * Normalization treats hyphens/en/em dashes as spaces: the 2026-07-13 run
 * failed a semantically-correct hard case on "Label–rule–value detail row"
 * (en dashes) vs acceptable "Label-Value Row" — punctuation, not meaning.
 */
function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[-‐‑–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function formatEvalReport(report: EvalReport): string {
  const lines: string[] = [
    `Eval: ${report.pass}/${report.total} pass` +
      (report.meta?.corpus
        ? ` (corpus: ${report.meta.corpus}${report.meta.eval_version ? `, ${report.meta.eval_version}` : ''})`
        : ''),
    `  major failures: ${report.major_failures}`,
    `  minor failures: ${report.minor_failures}`,
    `  representative: ${report.representative_total - report.representative_major_failures}/${report.representative_total} (gate ≤ 20% major)`,
    `  hard cases:     ${report.hard_total - report.hard_major_failures}/${report.hard_total} (zero-tolerance)`,
    '',
    `Gate: --llm-default ${report.gate.flip_llm_default_ok ? 'OK' : 'BLOCKED'}, prompt-revision ${report.gate.needs_prompt_revision ? 'REQUIRED' : 'not required'}`,
    '',
  ]
  const rescuedCount = report.cases.filter(c => c.judgeVerdict === 'adequate' && !c.major).length
  if (rescuedCount > 0) lines.push(`Judge rescued ${rescuedCount} case(s) from string-match failure.`, '')

  const fails = report.cases.filter(c => c.major || c.minor)
  if (fails.length > 0) {
    lines.push('Failures:')
    for (const f of fails.slice(0, 20)) {
      const tag = f.major ? (f.hard_case ? 'MAJOR/HARD' : 'MAJOR') : 'minor'
      lines.push(`  [${tag}] ${f.cluster_id}: ${f.reason}`)
    }
    if (fails.length > 20) lines.push(`  …and ${fails.length - 20} more`)
  }
  return lines.join('\n')
}
