#!/usr/bin/env node
/**
 * Live quality canary — the thing whose absence let a broken flagship ship for a
 * month (PJ-016). Runs ONE real end-to-end generation against the live model and
 * asserts the output is actually usable, then exits non-zero if it isn't.
 *
 * This complements the deterministic `generation-canary.test.ts` (which locks
 * the parse/normalize chain with no API cost): this one catches MODEL DRIFT —
 * a future model or prompt change that regresses real generation quality — which
 * no offline test can see.
 *
 * Not wired into per-PR CI on purpose: it costs an API call and ~8 min. Run it
 * nightly (scheduled workflow) or before a release. See
 * docs/runbooks/quality-canary.md.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... node scripts/quality-canary.mjs [--min-score 60] [--prompt "..."]
 *
 * Exit codes: 0 = healthy · 1 = quality gate failed · 2 = harness/setup error.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CLI = resolve(__dirname, '..', 'packages', 'cli', 'dist', 'index.js')

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const MIN_SCORE = Number.parseInt(arg('--min-score', '60'), 10)
const PROMPT = arg('--prompt', 'build a landing page for a coffee subscription service')
const MIN_FULL_RATIO = 0.7 // at least 70% of generated pages must have real code

if (!existsSync(CLI)) {
  console.error(`[canary] CLI not built at ${CLI} — run \`npm run build\` first.`)
  process.exit(2)
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('[canary] ANTHROPIC_API_KEY not set.')
  process.exit(2)
}

const work = mkdtempSync(join(tmpdir(), 'coherent-canary-'))
const proj = join(work, 'app')
let failures = []

function run(args, opts = {}) {
  return execFileSync('node', [CLI, ...args], {
    cwd: opts.cwd ?? proj,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    input: opts.input ?? '',
    timeout: opts.timeout ?? 600_000,
    env: process.env,
  })
}

try {
  console.error('[canary] init…')
  run(['init', 'app', '--skill-mode'], { cwd: work, input: '\n\n\n\n\n\n\n\n' })

  console.error(`[canary] generating: "${PROMPT}" (this takes several minutes)…`)
  // A full multi-page generation with adaptive thinking can run 10-15 min; give
  // it a generous ceiling so a slow-but-healthy run isn't a false failure.
  const gen = run(['chat', PROMPT], { timeout: 1_200_000 })

  // Gate 1: the anchor page produced code (Phase 3 is the linchpin).
  if (/no code — AI may have failed/.test(gen) && /Phase 3\/6/.test(gen)) {
    failures.push('anchor page (Phase 3) produced no code')
  }

  // Gate 2: enough pages have full code.
  const m = gen.match(/Generated\s+(\d+)\s+pages?\s+\((\d+)\s+with full code/)
  if (m) {
    const total = Number(m[1])
    const full = Number(m[2])
    const ratio = total ? full / total : 0
    console.error(`[canary] pages with full code: ${full}/${total} (${Math.round(ratio * 100)}%)`)
    if (ratio < MIN_FULL_RATIO) failures.push(`only ${full}/${total} pages have full code (< ${MIN_FULL_RATIO * 100}%)`)
  }

  // Gate 3: at least one non-trivial page file actually exists on disk.
  const appDir = join(proj, 'app')
  let bigPages = 0
  const walk = dir => {
    if (!existsSync(dir)) return
    for (const e of readdirSync(dir)) {
      const p = join(dir, e)
      const s = statSync(p)
      if (s.isDirectory()) walk(p)
      else if (e === 'page.tsx' && s.size > 1500) bigPages++
    }
  }
  walk(appDir)
  console.error(`[canary] substantial page files on disk: ${bigPages}`)
  if (bigPages === 0) failures.push('no substantial (>1.5KB) page.tsx written to disk')

  // Gate 4: coherent check score.
  let score = null
  try {
    const check = run(['check'])
    const sm = check.match(/Quality Score:\s*(\d+)\/100/)
    if (sm) score = Number(sm[1])
  } catch (e) {
    // check exits non-zero on quality failure; still parse its stdout.
    const out = (e.stdout || '').toString()
    const sm = out.match(/Quality Score:\s*(\d+)\/100/)
    if (sm) score = Number(sm[1])
  }
  console.error(`[canary] quality score: ${score ?? 'n/a'}/100 (min ${MIN_SCORE})`)
  if (score !== null && score < MIN_SCORE) failures.push(`quality score ${score} < ${MIN_SCORE}`)
} catch (e) {
  console.error('[canary] harness error:', e.message)
  rmSync(work, { recursive: true, force: true })
  process.exit(2)
}

rmSync(work, { recursive: true, force: true })

if (failures.length) {
  console.error('\n[canary] ✗ QUALITY GATE FAILED:')
  for (const f of failures) console.error('  - ' + f)
  process.exit(1)
}
console.error('\n[canary] ✓ healthy — generation produced usable, scored output.')
process.exit(0)
