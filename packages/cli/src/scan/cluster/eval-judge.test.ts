import { describe, expect, it, vi } from 'vitest'
import {
  applyJudge,
  buildJudgeRequest,
  buildJudgeUserPrompt,
  type JudgeDecision,
  type JudgeProvider,
} from './eval-judge.js'
import { evaluate, type ExpectedFile, type ExpectedLabel } from './eval.js'
import type { LabeledCluster } from './types.js'

function labeled(id: string, label: string, memberCount = 3, files = 2): LabeledCluster {
  return {
    cluster: {
      cluster_id: id,
      signature: { kind: 'inline_classes', tokens: ['text-muted'] },
      members: Array.from({ length: memberCount }, (_, i) => ({
        file: `views/f${i % files}.blade.php`,
        line: i + 1,
        kind: 'inline_classes' as const,
        raw_class_string: 'text-muted',
        surrounding_context: `<p class="text-muted">line ${i}</p>`,
      })),
    },
    human_label: label,
    confidence: 0.9,
    source: 'llm',
  }
}

class MockJudge implements JudgeProvider {
  calls = 0
  constructor(private decide: (id: string) => JudgeDecision) {}
  async judge(req: { cluster_id: string }): Promise<JudgeDecision> {
    this.calls++
    return this.decide(req.cluster_id)
  }
}

const expectedMap = (clusters: ExpectedLabel[]) => new Map(clusters.map(c => [c.cluster_id, c]))

describe('applyJudge — rescue-only contract', () => {
  it('rescues a string-match failure the judge calls adequate', async () => {
    const exp: ExpectedFile = { clusters: [{ cluster_id: 'a', acceptable_labels: ['Desktop Nav Wrapper'] }] }
    const actual = [labeled('a', 'Desktop Nav Center')]
    const before = evaluate(actual, exp)
    expect(before.major_failures).toBe(1)

    const judge = new MockJudge(() => ({ verdict: 'adequate', reason: 'same wrapper element' }))
    const after = await applyJudge(before, actual, expectedMap(exp.clusters), judge)

    expect(after.major_failures).toBe(0)
    expect(after.rescued).toEqual(['a'])
    expect(after.gate.flip_llm_default_ok).toBe(true)
    expect(after.cases[0].judgeVerdict).toBe('adequate')
    expect(after.cases[0].reason).toContain('rescued by judge')
  })

  it('does NOT rescue a meaning error (too_narrow stays major — F13 keeps blocking)', async () => {
    const exp: ExpectedFile = {
      clusters: [{ cluster_id: 'a', acceptable_labels: ['Subtle Text'], hard_case: true, must_be_generic: true }],
    }
    const actual = [labeled('a', 'Breadcrumb Separator', 47, 25)]
    const before = evaluate(actual, exp)

    const judge = new MockJudge(() => ({ verdict: 'too_narrow', reason: 'names one usage of a 25-file utility' }))
    const after = await applyJudge(before, actual, expectedMap(exp.clusters), judge)

    expect(after.hard_major_failures).toBe(1)
    expect(after.gate.flip_llm_default_ok).toBe(false)
    expect(after.rescued).toEqual([])
    expect(after.cases[0].reason).toContain('too_narrow')
  })

  it('does not rescue a "wrong" verdict', async () => {
    const exp: ExpectedFile = { clusters: [{ cluster_id: 'a', acceptable_labels: ['Sticky Sidebar'] }] }
    const actual = [labeled('a', 'Modal Trigger')]
    const judge = new MockJudge(() => ({ verdict: 'wrong', reason: 'different element' }))
    const after = await applyJudge(evaluate(actual, exp), actual, expectedMap(exp.clusters), judge)
    expect(after.major_failures).toBe(1)
  })

  it('never grades a case the string matcher PASSED (cannot make the gate stricter)', async () => {
    const exp: ExpectedFile = { clusters: [{ cluster_id: 'a', acceptable_labels: ['Muted Text'] }] }
    const actual = [labeled('a', 'Muted Text')]
    const judge = new MockJudge(() => ({ verdict: 'wrong', reason: 'should never be asked' }))
    const after = await applyJudge(evaluate(actual, exp), actual, expectedMap(exp.clusters), judge)
    expect(judge.calls).toBe(0)
    expect(after.major_failures).toBe(0)
  })

  it('never grades a case with no label (missing / fallback stays a failure)', async () => {
    const exp: ExpectedFile = { clusters: [{ cluster_id: 'ghost', acceptable_labels: ['Anything'] }] }
    const judge = new MockJudge(() => ({ verdict: 'adequate', reason: 'should never be asked' }))
    const after = await applyJudge(evaluate([], exp), [], expectedMap(exp.clusters), judge)
    expect(judge.calls).toBe(0)
    expect(after.major_failures).toBe(1)
    expect(after.cases[0].reason).toContain('missing from output')
  })

  it('recomputes representative vs hard counters after rescues', async () => {
    const exp: ExpectedFile = {
      clusters: [
        { cluster_id: 'h', acceptable_labels: ['Subtle Text'], hard_case: true },
        { cluster_id: 'r1', acceptable_labels: ['Card Heading'] },
        { cluster_id: 'r2', acceptable_labels: ['Table Header Cell'] },
      ],
    }
    const actual = [labeled('h', 'Subtle Text'), labeled('r1', 'Card Section Header'), labeled('r2', 'Zz Qq')]
    const judge = new MockJudge(id =>
      id === 'r1' ? { verdict: 'adequate', reason: 'synonym' } : { verdict: 'wrong', reason: 'no' },
    )
    const after = await applyJudge(evaluate(actual, exp), actual, expectedMap(exp.clusters), judge)

    expect(after.rescued).toEqual(['r1'])
    expect(after.representative_major_failures).toBe(1)
    expect(after.hard_major_failures).toBe(0)
    expect(after.judged).toBe(true)
  })

  it('fires the verdict callback for every graded case', async () => {
    const exp: ExpectedFile = { clusters: [{ cluster_id: 'a', acceptable_labels: ['X Y'] }] }
    const actual = [labeled('a', 'Totally Different')]
    const seen: string[] = []
    await applyJudge(
      evaluate(actual, exp),
      actual,
      expectedMap(exp.clusters),
      new MockJudge(() => ({ verdict: 'wrong', reason: 'nope' })),
      id => seen.push(id),
    )
    expect(seen).toEqual(['a'])
  })
})

describe('buildJudgeRequest / prompt', () => {
  it('carries spread, tokens and the same samples the labeler saw', () => {
    const req = buildJudgeRequest(labeled('a', 'Breadcrumb Separator', 47, 25), {
      cluster_id: 'a',
      acceptable_labels: ['Subtle Text'],
      must_be_generic: true,
    })
    expect(req.occurrences).toBe(47)
    expect(req.distinct_files).toBe(25)
    expect(req.must_be_generic).toBe(true)
    expect(req.samples.length).toBeLessThanOrEqual(3)
    expect(req.tokens).toContain('text-muted')
  })

  it('user prompt shows spread, acceptable labels and the candidate', () => {
    const prompt = buildJudgeUserPrompt(
      buildJudgeRequest(labeled('a', 'Breadcrumb Separator', 47, 25), {
        cluster_id: 'a',
        acceptable_labels: ['Subtle Text', 'Muted Text'],
        must_be_generic: true,
      }),
    )
    expect(prompt).toContain('47 occurrences across 25 distinct files')
    expect(prompt).toContain('must_be_generic: true')
    expect(prompt).toContain('"Subtle Text"')
    expect(prompt).toContain('Candidate label to grade: "Breadcrumb Separator"')
  })
})
