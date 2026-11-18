/**
 * Classes that look like Tailwind utilities but produce no CSS: `text-success`
 * after the `--success` token was renamed, `bg-brand/10` for a token that never
 * existed. Tailwind 4 drops them silently, the build passes and the style is
 * just missing. Measured 2026-11-18 (docs/plans/2026-11-18-design-kit-export.md):
 * agents wrote a renamed token's old class in 17 of 30 runs.
 *
 * Asked of the project's own Tailwind (its design system, loaded from the CSS
 * entry), so the answer matches the build: a candidate Tailwind parses as a
 * utility (known root and variants) but compiles to nothing is dead. Classes
 * Tailwind does not parse at all (`press`, `group`, a custom CSS class) are not
 * its business and are never flagged. Tailwind 4 only; v3 returns null.
 *
 * Runs inside the CLI and inside the standalone `scripts/design-check.mjs`, so
 * it imports nothing but node builtins and loads Tailwind from the project.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { classLikeStrings } from './raw-values.js'

export interface ClassChecker {
  /** Project-relative path of the CSS entry the design system was loaded from. */
  entry: string
  /** Tailwind parses it as a utility (known root, value and variants may still be wrong). */
  isUtility(cls: string): boolean
  /** A utility that compiles to no CSS. */
  isDead(cls: string): boolean
}

export interface DeadClass {
  value: string
  line: number
}

const IMPORT_RE = /@import\s+["']tailwindcss["']/
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'out', '.coherent', 'public'])

/** The stylesheet that imports Tailwind (`app/globals.css` in a Next app). */
export function findTailwindEntry(root: string): string | null {
  const found: string[] = []
  const walk = (dir: string, depth: number) => {
    if (depth > 4) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) walk(join(dir, e.name), depth + 1)
      } else if (e.name.endsWith('.css')) {
        const p = join(dir, e.name)
        if (IMPORT_RE.test(readFileSync(p, 'utf-8'))) found.push(p)
      }
    }
  }
  walk(root, 0)
  // Prefer the app's global stylesheet when there are several.
  found.sort((a, b) => Number(!/globals\.css$/.test(a)) - Number(!/globals\.css$/.test(b)) || a.length - b.length)
  return found[0] ?? null
}

interface TailwindDesignSystem {
  candidatesToCss(classes: string[]): (string | null)[]
  parseCandidate(candidate: string): unknown[]
}

type LoadDesignSystem = (css: string, opts: { base: string }) => Promise<TailwindDesignSystem>

/**
 * `@tailwindcss/node`, resolved from the stylesheet's own folder (the app's
 * package in a monorepo): directly, or through the integration the project uses
 * (`@tailwindcss/postcss`, `@tailwindcss/vite`, `@tailwindcss/cli`), which depend on it.
 */
function resolveTailwindNode(from: string): string | null {
  const req = createRequire(from)
  try {
    return req.resolve('@tailwindcss/node')
  } catch {
    /* not a direct dependency */
  }
  for (const via of ['@tailwindcss/postcss', '@tailwindcss/vite', '@tailwindcss/cli']) {
    try {
      return createRequire(req.resolve(`${via}/package.json`)).resolve('@tailwindcss/node')
    } catch {
      /* next */
    }
  }
  return null
}

// One load per stylesheet content: fast and final verification of an edit share it.
const cache = new Map<string, Promise<ClassChecker | null>>()

/** Load the project's Tailwind 4 design system; null when it is not Tailwind 4 or cannot load. */
export function loadClassChecker(root: string): Promise<ClassChecker | null> {
  const entry = findTailwindEntry(root)
  if (!entry) return Promise.resolve(null)
  const css = readFileSync(entry, 'utf-8')
  const key = `${entry}\0${css}`
  let hit = cache.get(key)
  if (!hit) {
    hit = load(root, entry, css)
    cache.set(key, hit)
  }
  return hit
}

async function load(root: string, entry: string, source: string): Promise<ClassChecker | null> {
  try {
    const req = createRequire(entry)
    const twPkg = JSON.parse(readFileSync(req.resolve('tailwindcss/package.json'), 'utf-8')) as { version: string }
    if (Number(twPkg.version.split('.')[0]) < 4) return null
    const nodePath = resolveTailwindNode(entry)
    if (!nodePath) return null
    const mod = (await import(pathToFileURL(nodePath).href)) as { __unstable__loadDesignSystem?: LoadDesignSystem }
    if (!mod.__unstable__loadDesignSystem) return null
    const ds = await mod.__unstable__loadDesignSystem(source, { base: dirname(entry) })
    const info = new Map<string, { utility: boolean; dead: boolean }>()
    const look = (c: string) => {
      let r = info.get(c)
      if (r) return r
      let utility = false
      try {
        utility = ds.parseCandidate(c).length > 0
      } catch {
        utility = false
      }
      const css = utility ? ds.candidatesToCss([c])[0] : null
      // A bare word (`top`, `outline` as a cva variant name) is never reported: utilities
      // without a value either compile (`flex`) or are variant keys walked as strings.
      const base = c.slice(c.lastIndexOf(':') + 1)
      r = { utility, dead: utility && !css && /[-[]/.test(base) }
      info.set(c, r)
      return r
    }
    return {
      entry: relative(root, entry),
      isUtility: c => look(c).utility,
      isDead: c => look(c).dead,
    }
  } catch {
    return null
  }
}

/**
 * Dead classes in a file. A string is a class list when it sits in a class
 * context, or elsewhere when every string of its ternary/array/object is made of
 * Tailwind utilities and, for a single word, another one in the group compiles:
 * `ok ? "text-success" : "text-destructive"` counts; a slug like "my-threads" in a
 * data array or object does not.
 */
export function deadClasses(file: string, text: string, checker: ClassChecker): DeadClass[] {
  const strings = classLikeStrings(file, text)
  const allUtility = (w: string[]) => w.every(x => checker.isUtility(x))
  const hasLive = (w: string[]) => w.some(x => checker.isUtility(x) && !checker.isDead(x))
  const groups = new Map<number, typeof strings>()
  for (const s of strings) if (!s.inClass) groups.set(s.group, [...(groups.get(s.group) ?? []), s])
  const out: DeadClass[] = []
  for (const s of strings) {
    if (!s.inClass) {
      const group = groups.get(s.group) ?? [s]
      // A class map or class ternary: every string in it is utilities, and something in it works.
      if (!group.every(g => allUtility(g.words))) continue
      if (s.words.length < 2 && !group.some(g => g !== s && hasLive(g.words))) continue
    }
    for (const w of s.words) if (checker.isDead(w)) out.push({ value: w, line: s.line })
  }
  return out
}

/** Dead classes in `after` beyond those already in `before` (per value). */
export function addedDeadClasses(before: DeadClass[], after: DeadClass[]): DeadClass[] {
  const left = new Map<string, number>()
  for (const d of before) left.set(d.value, (left.get(d.value) ?? 0) + 1)
  return after.filter(d => {
    const n = left.get(d.value) ?? 0
    if (n > 0) left.set(d.value, n - 1)
    return n === 0
  })
}

export const deadClassProblem = (file: string, d: DeadClass) =>
  `${file}:${d.line} ${d.value} compiles to no CSS (no such token or utility); use an existing token or define it`
