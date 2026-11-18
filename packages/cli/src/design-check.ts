/**
 * `node scripts/design-check.mjs` — the design checks that keep working
 * without Coherent. `coherent init` copies the built file into the project.
 *
 *   errors   classes that compile to no CSS (a renamed or missing token): exit 1
 *   warnings hardcoded colours, type sizes, spacing, radius, shadow (advisory)
 *
 * Checks what changed since the last commit (git), or the files given, or
 * everything with --all. In the default (git) mode only problems the change adds are
 * reported; named files and --all report everything in them.
 * Uses the project's own `typescript` and Tailwind 4; built from the same
 * source as Coherent's edit verification (governance/raw-values.ts,
 * governance/tailwind-classes.ts), so the two never disagree.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { addedRawValues, rawValues, rawValueWarning } from './governance/raw-values.js'
import { addedDeadClasses, deadClasses, deadClassProblem, loadClassChecker } from './governance/tailwind-classes.js'

const CODE = /\.(tsx|jsx|ts|js)$/
const SKIP = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'out', '.coherent', 'public', 'scripts'])

function git(root: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return null
  }
}

function walk(root: string, dir = root, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (SKIP.has(e) || e.startsWith('.')) continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(root, p, out)
    else if (CODE.test(e) && !e.endsWith('.d.ts')) out.push(relative(root, p))
  }
  return out
}

export async function main(argv: string[], root: string): Promise<number> {
  const all = argv.includes('--all')
  const given = argv.filter(a => !a.startsWith('--'))
  const inGit = git(root, ['rev-parse', '--verify', '-q', 'HEAD']) !== null
  let files: string[]
  if (given.length) files = given.map(f => relative(root, resolve(f)))
  else if (all || !inGit) files = walk(root)
  else {
    const changed = (git(root, ['status', '--porcelain', '--untracked-files=all']) ?? '')
      .split('\n')
      .filter(Boolean)
      .map(l => l.slice(3).split(' -> ').pop()!.replace(/^"|"$/g, ''))
    files = changed.filter(f => CODE.test(f) && existsSync(join(root, f)))
  }
  // Only the default mode (changes since the last commit) reports what the change adds.
  const diffMode = inGit && !all && !given.length
  const before = (f: string): string | null => (diffMode ? git(root, ['show', `HEAD:${f}`]) : null)

  const checker = await loadClassChecker(root)
  const errors: string[] = []
  const warnings: string[] = []
  for (const f of files) {
    if (!existsSync(join(root, f))) continue
    const now = readFileSync(join(root, f), 'utf-8')
    const old = before(f)
    if (checker)
      errors.push(
        ...addedDeadClasses(old === null ? [] : deadClasses(f, old, checker), deadClasses(f, now, checker)).map(d =>
          deadClassProblem(f, d),
        ),
      )
    warnings.push(
      ...addedRawValues(old === null ? [] : rawValues(f, old), rawValues(f, now)).map(v => rawValueWarning(f, v)),
    )
  }

  const scope = given.length ? `${files.length} file(s)` : all || !inGit ? 'all files' : 'changes since the last commit'
  console.log(`design-check: ${scope}${checker ? `, tokens from ${checker.entry}` : ''}`)
  if (!checker) console.log('  classes not checked: not a Tailwind 4 project (or its CSS entry did not load)')
  for (const e of errors) console.log(`  error  ${e}`)
  for (const w of warnings) console.log(`  warn   ${w}`)
  if (!errors.length && !warnings.length) console.log('  ok')
  return errors.length ? 1 : 0
}

// Run when executed directly (not when imported by tests).
if (process.argv[1] && /design-check\.(m?js|ts)$/.test(process.argv[1])) {
  const root = process.cwd()
  main(process.argv.slice(2), root).then(
    code => process.exit(code),
    err => {
      console.error(`design-check failed: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(2)
    },
  )
}
