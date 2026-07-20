#!/usr/bin/env node
/**
 * Differentiation benchmark — puts a NUMBER on the core thesis:
 *   "AI UIs all look the same (Inter, purple gradients, generic card grids);
 *    Coherent makes that impossible."
 *
 * The clean isolation: both arms are the SAME model, the SAME task, a single
 * self-contained page, differing ONLY in whether Coherent's constraint bundle
 * (`coherent prompt`) is injected as the system prompt. So any delta is the
 * constraint layer's effect, not model/pipeline noise.
 *
 *   Arm A (baseline)  — a strong, ordinary "expert frontend engineer" system.
 *                       Represents what v0 / Cursor / bare-Claude produce.
 *   Arm B (coherent)  — the Coherent constraint bundle as the system prompt.
 *
 * Two experiments:
 *   1. SLOP INDEX      — deterministic count of the exact tells CLAUDE.md names
 *                        (Inter, purple/indigo gradients, raw Tailwind colors,
 *                        rounded-lg spam, weak easing, centered-everything,
 *                        generic grid-cols-3) minus Coherent's semantic-token /
 *                        custom-easing signature. Tests "output is not slop".
 *   2. DISTINCTIVENESS — same intent under 3 Coherent atmospheres vs 3 baseline
 *                        runs. Mean pairwise fingerprint distance. Tests the
 *                        real claim "they don't all look the same": Coherent's
 *                        should spread wide, baseline's should cluster.
 *
 * n >= 3 stratified domains, per the benchmark-methodology rule (no n=1 trap).
 * The conclusion is meant to be codex-challenged, not taken at face value.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... node scripts/differentiation-benchmark.mjs \
 *     [--model claude-sonnet-5] [--out <dir>] [--max-tokens 8000]
 *
 * Exit codes: 0 = ran + wrote report · 2 = harness/setup error.
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CLI = resolve(__dirname, '..', 'packages', 'cli', 'dist', 'index.js')

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const MODEL = arg('--model', process.env.CLAUDE_MODEL || 'claude-sonnet-5')
const MAX_TOKENS = Number.parseInt(arg('--max-tokens', '8000'), 10)
const OUT = arg('--out', resolve(__dirname, '..', '.coherent', 'benchmark'))

if (!existsSync(CLI)) {
  console.error(`[bench] CLI not built at ${CLI} — run \`npm run build\` first.`)
  process.exit(2)
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('[bench] ANTHROPIC_API_KEY not set.')
  process.exit(2)
}

// Stratified domains — deliberately spread across page archetypes so a win on
// one type can't carry the result (methodology: n>=3 stratified).
const DOMAINS = [
  { id: 'saas-dashboard', pageType: 'app', intent: 'a project analytics dashboard with stat cards, a usage chart, and a recent-activity table' },
  { id: 'marketing-landing', pageType: 'marketing', intent: 'a landing page for a developer API product with a hero, a feature grid, and a pricing section' },
  { id: 'devtool-settings', pageType: 'app', intent: 'a settings page for a developer tool with sections for profile, API keys, and notification toggles' },
]

// The fixed intent for the distinctiveness experiment.
const DISTINCT_INTENT = { pageType: 'marketing', intent: 'a landing page for a note-taking app with a hero, three feature cards, and a call to action' }

const BASELINE_SYSTEM =
  'You are an expert frontend engineer building with Next.js (App Router), Tailwind CSS, and shadcn/ui. ' +
  'Produce a single, polished, modern, production-quality page component. Return ONLY the raw .tsx file ' +
  'content — no markdown fence, no prose before or after.'

const TASK_SUFFIX =
  '\n\nReturn ONE self-contained Next.js page component (.tsx) for the above. Raw TSX only, no markdown fence, no commentary.'

// ── model call ──────────────────────────────────────────────────────────────
async function callModel(system, user, temperature = 0.7) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const json = await res.json()
  const text = (json.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
  // strip an accidental code fence if the model added one anyway
  return text.replace(/^\s*```(?:tsx?|jsx?)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
}

function coherentBundle(intent, pageType, atmosphere) {
  const args = ['prompt', intent, '--page-type', pageType, '--format', 'plain']
  if (atmosphere) args.push('--atmosphere', atmosphere)
  return execFileSync('node', [CLI, ...args], { encoding: 'utf8', timeout: 60_000 })
}

// ── analysis: slop markers vs Coherent signature ────────────────────────────
function countMatches(s, re) {
  const m = s.match(re)
  return m ? m.length : 0
}

function analyze(tsx) {
  const rawColor = countMatches(
    tsx,
    /\b(?:bg|text|border|ring|from|to|via|fill|stroke)-(?:gray|slate|zinc|neutral|stone|blue|red|green|yellow|purple|indigo|pink|violet|fuchsia)-(?:50|100|200|300|400|500|600|700|800|900|950)\b/g,
  )
  const semantic = countMatches(
    tsx,
    /\b(?:bg|text|border|ring)-(?:primary|secondary|muted|accent|background|foreground|card|popover|destructive)(?:-foreground)?\b/g,
  )
  const interFont = /\bInter\b/.test(tsx) ? 1 : 0
  const purpleGradient = /(?:bg-gradient-to-[a-z]+[^"'`]*?(?:purple|violet|indigo|fuchsia))|(?:(?:from|via|to)-(?:purple|violet|indigo|fuchsia))/i.test(tsx) ? 1 : 0
  const roundedLg = countMatches(tsx, /\brounded-lg\b/g)
  const weakEasing = /\b(?:ease-in-out|transition-all|duration-\d+)\b/.test(tsx) && !/cubic-bezier/.test(tsx) ? 1 : 0
  const customEasing = /cubic-bezier|ease-out-quart/.test(tsx) ? 1 : 0
  const textCenter = countMatches(tsx, /\btext-center\b/g)
  const genericGrid = /\bgrid-cols-3\b/.test(tsx) ? 1 : 0

  // SLOP INDEX — higher = more generic-AI. Weights favor the loudest tells.
  const slopIndex =
    rawColor * 1 + interFont * 3 + purpleGradient * 4 + weakEasing * 2 + genericGrid * 1 + (roundedLg > 6 ? 2 : 0) + (textCenter > 6 ? 1 : 0)
  // SIGNATURE INDEX — higher = more Coherent-idiomatic.
  const signatureIndex = semantic * 1 + customEasing * 4

  return {
    markers: { rawColor, semantic, interFont, purpleGradient, roundedLg, weakEasing, customEasing, textCenter, genericGrid },
    slopIndex,
    signatureIndex,
  }
}

// ── fingerprint for distinctiveness (structure + style approach, not rendered color) ──
function fingerprint(tsx) {
  const fp = new Set()
  // arbitrary hexes + css-var refs (explicit color identity, when present)
  for (const m of tsx.matchAll(/\[#[0-9a-fA-F]{3,8}\]|var\(--[a-z-]+\)/g)) fp.add(m[0].toLowerCase())
  // font hints
  for (const m of tsx.matchAll(/font-(?:sans|serif|mono|\[[^\]]+\])/g)) fp.add(m[0].toLowerCase())
  // layout signature: which container/spacing/columns idioms it reaches for
  for (const m of tsx.matchAll(/\b(?:max-w-\w+|grid-cols-\d+|gap-\d+|py-\d+|rounded-(?:none|sm|md|lg|xl|2xl|3xl|full)|text-(?:left|center)|bg-(?:primary|secondary|accent|muted|background))\b/g))
    fp.add(m[0].toLowerCase())
  return fp
}

function jaccardDistance(a, b) {
  if (a.size === 0 && b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  const union = a.size + b.size - inter
  return union === 0 ? 0 : 1 - inter / union
}

function meanPairwiseDistance(fps) {
  let sum = 0
  let n = 0
  for (let i = 0; i < fps.length; i++)
    for (let j = i + 1; j < fps.length; j++) {
      sum += jaccardDistance(fps[i], fps[j])
      n++
    }
  return n ? sum / n : 0
}

// ── run ─────────────────────────────────────────────────────────────────────
async function main() {
  mkdirSync(OUT, { recursive: true })
  console.error(`[bench] model=${MODEL}  out=${OUT}`)

  // Experiment 1 — slop index across stratified domains.
  console.error('\n[bench] EXPERIMENT 1 — slop index (baseline vs Coherent)')
  const exp1 = []
  for (const d of DOMAINS) {
    console.error(`  · ${d.id} …`)
    const task = `Build ${d.intent}.` + TASK_SUFFIX
    const [aTsx, bTsx] = await Promise.all([
      callModel(BASELINE_SYSTEM, task),
      callModel(coherentBundle(d.intent, d.pageType), task),
    ])
    writeFileSync(join(OUT, `${d.id}.baseline.tsx`), aTsx)
    writeFileSync(join(OUT, `${d.id}.coherent.tsx`), bTsx)
    const a = analyze(aTsx)
    const b = analyze(bTsx)
    exp1.push({ domain: d.id, baseline: a, coherent: b })
    console.error(`    slop:  baseline ${a.slopIndex}  →  coherent ${b.slopIndex}   |   signature: ${a.signatureIndex} → ${b.signatureIndex}`)
  }

  // Experiment 2 — distinctiveness: same intent, 3 atmospheres (B) vs 3 baseline (A).
  console.error('\n[bench] EXPERIMENT 2 — distinctiveness (cross-atmosphere spread vs baseline spread)')
  let atmospheres = []
  try {
    const list = execFileSync('node', [CLI, 'prompt', '--list-atmospheres'], { encoding: 'utf8', timeout: 30_000 })
    atmospheres = [...list.matchAll(/^\s*[-*•]?\s*([a-z][a-z0-9-]{2,})\b/gim)].map(m => m[1]).filter((v, i, a) => a.indexOf(v) === i)
  } catch {
    /* fall back below */
  }
  // pick 3 spread-out atmospheres; fall back to known presets if the list parse is thin
  if (atmospheres.length < 3) atmospheres = ['editorial', 'brutalist', 'playful']
  const picks = [atmospheres[0], atmospheres[Math.floor(atmospheres.length / 2)], atmospheres[atmospheres.length - 1]]
  console.error(`  atmospheres: ${picks.join(', ')}`)

  const task2 = `Build ${DISTINCT_INTENT.intent}.` + TASK_SUFFIX
  const coherentOuts = []
  const baselineOuts = []
  for (let i = 0; i < 3; i++) {
    const [bTsx, aTsx] = await Promise.all([
      callModel(coherentBundle(DISTINCT_INTENT.intent, DISTINCT_INTENT.pageType, picks[i]), task2, 0.7),
      callModel(BASELINE_SYSTEM, task2, 0.9), // higher temp GIVES baseline its best shot at variety
    ])
    writeFileSync(join(OUT, `distinct.coherent.${picks[i]}.tsx`), bTsx)
    writeFileSync(join(OUT, `distinct.baseline.${i}.tsx`), aTsx)
    coherentOuts.push(fingerprint(bTsx))
    baselineOuts.push(fingerprint(aTsx))
  }
  const spreadCoherent = meanPairwiseDistance(coherentOuts)
  const spreadBaseline = meanPairwiseDistance(baselineOuts)

  // ── aggregate ───────────────────────────────────────────────────────────
  const avg = (arr, f) => arr.reduce((s, x) => s + f(x), 0) / arr.length
  const slopBaseline = avg(exp1, e => e.baseline.slopIndex)
  const slopCoherent = avg(exp1, e => e.coherent.slopIndex)
  const sigBaseline = avg(exp1, e => e.baseline.signatureIndex)
  const sigCoherent = avg(exp1, e => e.coherent.signatureIndex)

  const report = {
    model: MODEL,
    ranAt: null, // stamped by the caller; Date.* is intentionally avoided in-harness
    experiment1_slop: {
      perDomain: exp1,
      avgSlopBaseline: +slopBaseline.toFixed(2),
      avgSlopCoherent: +slopCoherent.toFixed(2),
      slopReductionPct: slopBaseline ? +(((slopBaseline - slopCoherent) / slopBaseline) * 100).toFixed(1) : null,
      avgSignatureBaseline: +sigBaseline.toFixed(2),
      avgSignatureCoherent: +sigCoherent.toFixed(2),
    },
    experiment2_distinctiveness: {
      atmospheres: picks,
      spreadCoherent: +spreadCoherent.toFixed(3),
      spreadBaseline: +spreadBaseline.toFixed(3),
      distinctivenessRatio: spreadBaseline ? +(spreadCoherent / spreadBaseline).toFixed(2) : null,
    },
  }
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))

  console.error('\n──────────────────────────────────────────────')
  console.error('DIFFERENTIATION BENCHMARK — RESULT')
  console.error('──────────────────────────────────────────────')
  console.error(`Slop index (lower=better):   baseline ${report.experiment1_slop.avgSlopBaseline}  →  coherent ${report.experiment1_slop.avgSlopCoherent}   (${report.experiment1_slop.slopReductionPct}% reduction)`)
  console.error(`Coherent signature (higher):  baseline ${report.experiment1_slop.avgSignatureBaseline}  →  coherent ${report.experiment1_slop.avgSignatureCoherent}`)
  console.error(`Distinctiveness spread:       baseline ${report.experiment2_distinctiveness.spreadBaseline}  vs  coherent ${report.experiment2_distinctiveness.spreadCoherent}   (${report.experiment2_distinctiveness.distinctivenessRatio}× wider)`)
  console.error(`\nArtifacts + report.json in ${OUT}`)
  console.error('NOTE: codex-challenge these numbers before quoting them (methodology: no n=1, adversarial review).')
}

main().catch(e => {
  console.error('[bench] harness error:', e.message)
  process.exit(2)
})
