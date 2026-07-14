/**
 * LLM-judge lane for the eval gate (R12).
 *
 * WHY THIS EXISTS — and why it reverses a codex verdict. The 2026-07-13 R10
 * consult said: no judge, human context-authored ground truth suffices
 * (Sonnet judging Sonnet has correlated bias that temperature 0 does not
 * remove). Three runs later the evidence says the ground truth was never the
 * problem — the STRING COMPARISON is. Labels rejected as "major" failures on
 * the 2026-07-14 run:
 *
 *   "Footer Legal Link List"  vs accepted "Footer Legal Links"   (plural)
 *   "Desktop Nav Center"      vs accepted "Desktop Nav Wrapper"  (synonym)
 *   "Detail Label Term"       vs accepted "Definition Term Label" (word order)
 *
 * All three mean the same thing to a human reading the code. Jaccard does not
 * know that. Patching the matcher (dashes, then stemming, then a lower
 * threshold…) is whack-a-mole that tunes the ruler to the result.
 *
 * BIAS CONTAINMENT — the judge is deliberately weak:
 *
 * 1. RESCUE-ONLY. It only ever sees cases the string matcher already FAILED.
 *    It cannot fail a case the matcher passed, so it can never make the gate
 *    look better than the human ground truth allows on the cases that matter.
 * 2. It cannot rescue a MEANING error. Its verdict space is
 *    adequate | too_narrow | wrong; only `adequate` rescues. An F13-class
 *    over-specialization comes back `too_narrow` and stays a major failure,
 *    so the F13 hard cases still block the flip.
 * 3. It is anchored on the HUMAN acceptable_labels, not asked to invent
 *    truth: the question is "does this label mean the same as one of these
 *    human-authored labels, for this code?" — not "is this a good label?".
 * 4. Every verdict is recorded (`judgeVerdict` on the case) so a rescued run
 *    is auditable after the fact.
 */

import type { LabeledCluster } from './types.js'
import type { EvalCase, EvalReport, ExpectedLabel } from './eval.js'
import { pickSamples } from './samples.js'

export type JudgeVerdict = 'adequate' | 'too_narrow' | 'wrong'

export interface JudgeDecision {
  verdict: JudgeVerdict
  reason: string
}

export interface JudgeRequest {
  cluster_id: string
  actual_label: string
  acceptable_labels: string[]
  must_be_generic: boolean
  tokens: string[]
  occurrences: number
  distinct_files: number
  samples: { file: string; line: number; snippet: string }[]
}

export interface JudgeProvider {
  judge(request: JudgeRequest): Promise<JudgeDecision>
}

export const JUDGE_SYSTEM_RULES = `You are grading labels a different model produced for clusters of UI code.

You are given: the cluster's CSS/class tokens, how widely it is used, real code samples, and a set of ACCEPTABLE labels written by the human who owns this codebase.

Answer ONE question: does the candidate label mean the same thing as at least one acceptable label, for this cluster?

Verdicts:
- "adequate": same meaning as an acceptable label. Wording, word order, plural/singular, and synonyms do NOT matter. "Footer Legal Link List" = "Footer Legal Links". "Detail Label Term" = "Definition Term Label".
- "too_narrow": the candidate names a specific usage seen in the samples, while the cluster is a general-purpose utility (check the spread numbers). Example: calling a subtle-text color used in 25 files "Breadcrumb Separator". If must_be_generic is true, be strict — any usage-specific qualifier is too_narrow.
- "wrong": names a different thing entirely.

Be conservative: when the candidate could plausibly mislead a developer about what the cluster IS, do not say adequate. Grade meaning, never style.`

export function buildJudgeUserPrompt(req: JudgeRequest): string {
  return [
    `Cluster: ${req.cluster_id}`,
    `Tokens: ${req.tokens.join(' ')}`,
    `Spread: ${req.occurrences} occurrences across ${req.distinct_files} distinct files`,
    `must_be_generic: ${req.must_be_generic}`,
    '',
    'Code samples:',
    ...req.samples.map(s => `--- ${s.file}:${s.line}\n${s.snippet}`),
    '',
    `Acceptable labels (human-authored): ${req.acceptable_labels.map(l => `"${l}"`).join(', ')}`,
    `Candidate label to grade: "${req.actual_label}"`,
    '',
    'Return your verdict with the judge_label tool.',
  ].join('\n')
}

export function buildJudgeRequest(labeled: LabeledCluster, expected: ExpectedLabel, samplesPerCase = 3): JudgeRequest {
  const cluster = labeled.cluster
  const samples = pickSamples(cluster.members, samplesPerCase).map(m => ({
    file: m.file,
    line: m.line,
    snippet: m.surrounding_context.trim() || m.raw_class_string,
  }))
  return {
    cluster_id: cluster.cluster_id,
    actual_label: labeled.human_label,
    acceptable_labels: expected.acceptable_labels,
    must_be_generic: expected.must_be_generic === true,
    tokens: cluster.signature.tokens,
    occurrences: cluster.members.length,
    distinct_files: new Set(cluster.members.map(m => m.file)).size,
    samples,
  }
}

export interface JudgedReport extends EvalReport {
  judged: true
  /** Cases the judge rescued from a string-match failure. */
  rescued: string[]
}

/**
 * Re-scores a report using the judge on FAILED cases only. Recomputes the
 * gate from the corrected counts. A case with no live cluster (deterministic
 * fallback / missing from output) is never sent to the judge — there is
 * nothing to grade, and a missing label is a real failure.
 */
export async function applyJudge(
  report: EvalReport,
  actual: LabeledCluster[],
  expectedById: Map<string, ExpectedLabel>,
  provider: JudgeProvider,
  onVerdict?: (clusterId: string, decision: JudgeDecision) => void,
): Promise<JudgedReport> {
  const actualById = new Map(actual.map(l => [l.cluster.cluster_id, l]))
  const rescued: string[] = []
  const cases: EvalCase[] = []

  for (const c of report.cases) {
    const expected = expectedById.get(c.cluster_id)
    const labeled = actualById.get(c.cluster_id)
    if (!c.major || !expected || !labeled || !c.actual_label) {
      cases.push(c)
      continue
    }

    const decision = await provider.judge(buildJudgeRequest(labeled, expected))
    onVerdict?.(c.cluster_id, decision)

    if (decision.verdict === 'adequate') {
      rescued.push(c.cluster_id)
      cases.push({
        ...c,
        major: false,
        reason: `rescued by judge: ${decision.reason}`,
        judgeVerdict: decision.verdict,
      })
    } else {
      cases.push({
        ...c,
        reason: `${c.reason} (judge: ${decision.verdict} — ${decision.reason})`,
        judgeVerdict: decision.verdict,
      })
    }
  }

  return { ...recount(report, cases), judged: true, rescued }
}

/** Recomputes counters + gate from re-scored cases. Mirrors evaluate()'s math. */
function recount(prior: EvalReport, cases: EvalCase[]): EvalReport {
  let major_failures = 0
  let minor_failures = 0
  let hard_major_failures = 0
  let representative_major_failures = 0
  let hard_total = 0
  let representative_total = 0

  for (const c of cases) {
    if (c.hard_case) hard_total++
    else representative_total++
    if (c.major) {
      major_failures++
      if (c.hard_case) hard_major_failures++
      else representative_major_failures++
    }
    if (c.minor) minor_failures++
  }

  const total = cases.length
  const repMajorRate = representative_total === 0 ? 0 : representative_major_failures / representative_total
  const combinedRate = total === 0 ? 0 : (major_failures + minor_failures) / total

  return {
    ...prior,
    total,
    pass: total - major_failures - minor_failures,
    major_failures,
    minor_failures,
    hard_total,
    hard_major_failures,
    representative_total,
    representative_major_failures,
    cases,
    gate: {
      flip_llm_default_ok: repMajorRate <= 0.2 && hard_major_failures === 0,
      needs_prompt_revision: combinedRate > 0.35 || hard_major_failures > 0,
    },
  }
}
