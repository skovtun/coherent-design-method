/**
 * coherent edit "<request>" — scoped prompt edits on any Next.js project.
 *
 * Flow: code-derived graph → routed plan → impact preview → transaction →
 * guarded write → typecheck (one repair pass) → rendered check of affected and
 * control routes → report. `coherent edit --undo [id]` restores byte-for-byte.
 */
import chalk from 'chalk'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { createInterface } from 'readline'
import { ClaudeClient } from '../utils/claude.js'
import { buildGraph, type ProjectGraph } from '../governance/graph.js'
import { scanLeaks } from '../governance/privacy.js'
import {
  APPLY_SYSTEM,
  buildApplyPrompt,
  parseApplyOutput,
  planEdit,
  type Completer,
  type PlanWithImpact,
} from '../governance/router.js'
import {
  beginTransaction,
  commitTransaction,
  hashTree,
  listTransactions,
  rollbackTransaction,
  type TxChanges,
} from '../governance/transaction.js'
import {
  captureRoutes,
  concreteUrl,
  diffRatio,
  loadPreviewParams,
  shotsForTree,
  typecheck,
  type Shot,
} from '../governance/verify.js'
import { createHash } from 'crypto'

export interface EditOptions {
  dir?: string
  yes?: boolean
  dryRun?: boolean
  url?: string
  undo?: string | boolean
  force?: boolean
  visual?: boolean
}

export interface EditReport {
  request: string
  plan: PlanWithImpact
  txId: string
  changes: TxChanges
  outOfPlan: string[]
  typecheck: { ok: boolean; errors: string[]; repaired: boolean }
  visual?: { route: string; viewport: string; diff: number; expected: 'change' | 'same'; pass: boolean }[]
  /** False when no affected route rendered any difference: the edit did not visibly land. */
  landed: boolean
  buildError?: string
  ok: boolean
}

async function confirm(q: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const a = await new Promise<string>(r => rl.question(q, r))
  rl.close()
  return /^y(es)?$/i.test(a.trim())
}

function printPlan(plan: PlanWithImpact, graph: ProjectGraph) {
  const total = Object.values(graph.nodes).filter(n => n.kind === 'page').length
  console.log(chalk.bold(`\nScope: ${plan.scope}`) + chalk.dim(`  — ${plan.rationale}`))
  if (plan.modify.length) console.log(`  modify: ${plan.modify.join(', ')}`)
  if (plan.create.length) console.log(`  create: ${plan.create.join(', ')}`)
  const pageEdits = plan.modify.filter(f => graph.nodes[f]?.kind === 'page').map(f => graph.nodes[f].route!)
  const routes = [...new Set([...plan.impact.routes, ...pageEdits])].sort()
  console.log(`  affects ${routes.length}/${total} pages: ${routes.join(', ') || '(none yet — new files only)'}`)
  if (plan.question) console.log(chalk.yellow(`  ? ${plan.question}`))
}

function writeFiles(root: string, files: Record<string, string>) {
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true })
    writeFileSync(join(root, p), c)
  }
}

const treeKey = (root: string) =>
  createHash('sha256')
    .update(JSON.stringify(hashTree(root)))
    .digest('hex')
    .slice(0, 16)

export function affectedRoutes(plan: PlanWithImpact, graph: ProjectGraph): string[] {
  const own = plan.modify.filter(f => graph.nodes[f]?.kind === 'page').map(f => graph.nodes[f].route!)
  return [...new Set([...plan.impact.routes, ...own])].sort()
}

export async function runEdit(request: string, opts: EditOptions, llm: Completer): Promise<EditReport | null> {
  const root = resolve(opts.dir ?? process.cwd())
  const graph = buildGraph(root)

  const plan = await planEdit(request, graph, llm)
  printPlan(plan, graph)
  if (opts.dryRun) return null
  if (!opts.yes && !(await confirm('Apply? [y/N] '))) return null

  const affected = affectedRoutes(plan, graph)
  const params = loadPreviewParams(root)
  const pages = Object.values(graph.nodes)
    .filter(n => n.kind === 'page')
    .map(n => n.route!)
  const controls = pages.filter(r => !affected.includes(r) && concreteUrl(r, params)).slice(0, 2)
  const variantPages = plan.modify.filter(f => graph.nodes[f]?.kind === 'page').map(f => graph.nodes[f].route!)
  const targets = [
    // A variant is opt-in: only the pages the plan edits may change; every other
    // consumer of the component is a control that must render identically.
    ...affected.map(r => ({
      route: r,
      expected: plan.scope === 'variant' && !variantPages.includes(r) ? ('same' as const) : ('change' as const),
    })),
    ...controls.map(r => ({ route: r, expected: 'same' as const })),
  ]
    .map(t => ({ ...t, url: concreteUrl(t.route, params) }))
    .filter((t): t is { route: string; expected: 'change' | 'same'; url: string } => !!t.url)
    .slice(0, 6)

  let visual = opts.visual !== false
  const runDir = join(root, '.coherent', 'edits', new Date().toISOString().replace(/[:.]/g, '-'))
  const shoot = (key: string) =>
    opts.url ? captureRoutes(opts.url, targets, join(runDir, key)) : shotsForTree(root, treeKey(root), targets)
  let before: Shot[] = []
  if (visual) {
    try {
      before = await shoot('before')
    } catch (e) {
      // A missing browser or a broken pre-existing build must not block the edit itself.
      visual = false
      console.log(chalk.yellow(`⚠ Rendered check skipped: ${String((e as Error).message).split('\n')[0]}`))
      console.log(chalk.dim('  Fix: npx playwright install chromium; make sure `next build` passes before editing.'))
    }
  }

  const tx = beginTransaction(root, request)
  const prompt = buildApplyPrompt(request, plan, graph)
  writeFiles(root, parseApplyOutput(await llm(APPLY_SYSTEM, prompt), plan))

  let tc = typecheck(root)
  let repaired = false
  if (!tc.ok) {
    const fix = await llm(
      APPLY_SYSTEM,
      `${buildApplyPrompt(request, plan, buildGraph(root))}\n\n## TypeScript errors after your edit — fix them, same files only\n${tc.errors.slice(0, 30).join('\n')}`,
    )
    writeFiles(root, parseApplyOutput(fix, plan))
    tc = typecheck(root)
    repaired = tc.ok
  }
  const committed = commitTransaction(root, tx)
  const changes = committed.changes!
  const allowed = new Set([...plan.modify, ...plan.create])
  const outOfPlan = [...changes.created, ...changes.modified, ...changes.deleted].filter(f => !allowed.has(f))

  let visualRes: EditReport['visual']
  let buildError: string | undefined
  if (visual && tc.ok) {
    try {
      const after = await shoot('after')
      visualRes = []
      for (const b of before) {
        const a = after.find(x => x.route === b.route && x.viewport === b.viewport)!
        const t = targets.find(x => x.route === b.route)!
        const diff = await diffRatio(b.path, a.path)
        visualRes.push({
          route: b.route,
          viewport: b.viewport,
          diff,
          expected: t.expected,
          pass: t.expected === 'same' ? diff === 0 : true,
        })
      }
    } catch (e) {
      buildError = String((e as Error).message)
    }
  }
  // Controls must be pixel-identical. "Change" routes are judged together: the
  // edit must visibly land somewhere in its impact set, but a page that imports
  // a component without rendering it under current data may legitimately stay put.
  const expectedChange = (visualRes ?? []).filter(v => v.expected === 'change')
  const landed = !visualRes || !expectedChange.length || expectedChange.some(v => v.diff > 0)
  const ok = tc.ok && !buildError && outOfPlan.length === 0 && landed && (visualRes ?? []).every(v => v.pass)
  const report: EditReport = {
    request,
    plan,
    txId: tx.id,
    changes,
    outOfPlan,
    typecheck: { ...tc, repaired },
    visual: visualRes,
    landed,
    buildError,
    ok,
  }
  mkdirSync(runDir, { recursive: true })
  writeFileSync(join(runDir, 'report.json'), JSON.stringify(report, null, 2))
  return report
}

function printReport(r: EditReport) {
  const c = r.changes
  console.log(
    `\nChanged: ${[...c.modified.map(f => `~ ${f}`), ...c.created.map(f => `+ ${f}`), ...c.deleted.map(f => `- ${f}`)].join('\n         ')}`,
  )
  console.log(
    r.outOfPlan.length
      ? chalk.red(`Out-of-plan changes: ${r.outOfPlan.join(', ')}`)
      : chalk.green('Write set: only planned files'),
  )
  console.log(
    r.typecheck.ok
      ? chalk.green(`TypeScript: clean${r.typecheck.repaired ? ' (after 1 repair pass)' : ''}`)
      : chalk.red(
          `TypeScript: ${r.typecheck.errors.length} error(s)\n  ${r.typecheck.errors.slice(0, 5).join('\n  ')}`,
        ),
  )
  if (r.buildError) console.log(chalk.red(`Build: ${r.buildError.split('\n').slice(0, 8).join('\n  ')}`))
  if (r.visual && !r.landed) console.log(chalk.red('Edit did not visibly change any affected page'))
  for (const v of r.visual ?? []) {
    const mark = !v.pass ? chalk.red('✗') : v.expected === 'change' && v.diff === 0 ? chalk.dim('·') : chalk.green('✓')
    console.log(
      `  ${mark} ${v.route} ${v.viewport}: ${(v.diff * 100).toFixed(2)}% pixels changed (expected ${v.expected})`,
    )
  }
  console.log(
    `\n${r.ok ? chalk.green('OK') : chalk.red('NEEDS ATTENTION')} — undo with: coherent edit --undo ${r.txId}`,
  )
}

export async function editCommand(request: string | undefined, opts: EditOptions) {
  const root = resolve(opts.dir ?? process.cwd())
  if (opts.undo) {
    const ids = listTransactions(root)
    const id = opts.undo === true || opts.undo === 'last' ? ids[ids.length - 1] : String(opts.undo)
    if (!id) throw new Error('No edit transactions to undo')
    const undone = rollbackTransaction(root, id, { force: opts.force })
    console.log(
      chalk.green(
        `Restored ${id}: ${undone.modified.length} modified, ${undone.created.length} created removed, ${undone.deleted.length} deleted restored. Tree verified byte-identical.`,
      ),
    )
    return
  }
  if (!request) throw new Error('Usage: coherent edit "<what to change>"')

  const leaks = scanLeaks(buildGraph(root)).filter(l => l.identity.severity === 'error')
  if (leaks.length) {
    console.log(chalk.red(`⚠ ${leaks.length} environment identity leak(s) in source (real name/email/home path):`))
    for (const l of leaks.slice(0, 5)) console.log(chalk.red(`  ${l.file}:${l.line} ${l.identity.kind} — ${l.excerpt}`))
  }
  const client = ClaudeClient.create()
  const report = await runEdit(request, opts, (s, u) => client.complete(s, u))
  if (report) printReport(report)
}
