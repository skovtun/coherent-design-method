import { resolve } from 'path'
import { existsSync, readFileSync } from 'fs'
import { findConfig, exitNotCoherent, warnIfVolatile } from '../../utils/find-config.js'
import { DesignSystemManager, loadManifest, type DesignSystemConfig } from '@getcoherent/core'
import { readFile } from '../../utils/files.js'
import chalk from 'chalk'
import { type ArchitecturePlan, getPageGroup } from './plan-generator.js'
import { isAuthRoute } from '../../agents/page-templates.js'

const MARKETING_ROUTES = new Set(['', 'landing', 'pricing', 'about', 'contact', 'blog', 'features'])

/** Skip placeholder / near-empty root pages when reusing split-generation style anchor */
export const MIN_ANCHOR_PAGE_CODE_CHARS = 120

const AUTH_ROUTE_SLUGS = new Set([
  'login',
  'signin',
  'sign-in',
  'register',
  'sign-up',
  'signup',
  'forgot-password',
  'reset-password',
])

/**
 * Whether a route lives under `app/(auth)/` (not the same as `requiresAuth` on dashboard pages).
 */
export function inferRouteUsesAuthSegment(route: string): boolean {
  const slug = route.replace(/^\//, '').split('/')[0] || ''
  return AUTH_ROUTE_SLUGS.has(slug)
}

/**
 * Read existing page source for split-generation style anchor (Phase 3).
 * Returns null if missing or too short (placeholder).
 */
export function readAnchorPageCodeFromDisk(projectRoot: string, route: string): string | null {
  const useAuthSegment = inferRouteUsesAuthSegment(route)
  const abs = routeToFsPath(projectRoot, route, useAuthSegment)
  if (!existsSync(abs)) return null
  let code: string
  try {
    code = readFileSync(abs, 'utf-8')
  } catch {
    return null
  }
  if (code.trim().length < MIN_ANCHOR_PAGE_CODE_CHARS) return null
  return code
}

export function isMarketingRoute(route: string): boolean {
  const slug = route.replace(/^\//, '').split('/')[0] || ''
  return MARKETING_ROUTES.has(slug)
}

export function routeToFsPath(projectRoot: string, route: string, isAuthOrPlan?: boolean | ArchitecturePlan): string {
  const plan = typeof isAuthOrPlan === 'object' ? isAuthOrPlan : undefined
  const isAuth = typeof isAuthOrPlan === 'boolean' ? isAuthOrPlan : false
  const slug = route.replace(/^\//, '')

  if (!slug) return resolve(projectRoot, 'app', 'page.tsx')

  if (isAuth || isAuthRoute(route)) return resolve(projectRoot, 'app', '(auth)', slug || 'login', 'page.tsx')

  if (plan) {
    const group = getPageGroup(route, plan)
    if (group) return resolve(projectRoot, 'app', `(${group.id})`, slug, 'page.tsx')
  }

  if (isMarketingRoute(route)) return resolve(projectRoot, 'app', slug, 'page.tsx')
  return resolve(projectRoot, 'app', '(app)', slug, 'page.tsx')
}

export function routeToRelPath(route: string, isAuthOrPlan?: boolean | ArchitecturePlan): string {
  const plan = typeof isAuthOrPlan === 'object' ? isAuthOrPlan : undefined
  const isAuth = typeof isAuthOrPlan === 'boolean' ? isAuthOrPlan : false
  const slug = route.replace(/^\//, '')

  if (!slug) return 'app/page.tsx'

  if (isAuth || isAuthRoute(route)) return `app/(auth)/${slug || 'login'}/page.tsx`

  if (plan) {
    const group = getPageGroup(route, plan)
    if (group) return `app/(${group.id})/${slug}/page.tsx`
  }

  if (isMarketingRoute(route)) return `app/${slug}/page.tsx`
  return `app/(app)/${slug}/page.tsx`
}

export const AUTH_SYNONYMS: Record<string, string> = {
  '/register': '/signup',
  '/registration': '/signup',
  '/sign-up': '/signup',
  '/signin': '/login',
  '/sign-in': '/login',
}

export function deduplicatePages(
  pages: Array<{ name: string; id: string; route: string }>,
): Array<{ name: string; id: string; route: string }> {
  const canonicalize = (route: string) => AUTH_SYNONYMS[route] || route
  const normalize = (route: string) => canonicalize(route).replace(/\/$/, '')
  const seen = new Map<string, number>()
  return pages.filter((page, idx) => {
    const norm = normalize(page.route)
    if (seen.has(norm)) return false
    seen.set(norm, idx)
    return true
  })
}

export function extractComponentIdsFromCode(code: string): Set<string> {
  const ids = new Set<string>()
  const allMatches = code.matchAll(/@\/components\/((?:ui\/)?[a-z0-9-]+)/g)
  for (const m of allMatches) {
    if (!m[1]) continue
    let id = m[1]
    if (id.startsWith('ui/')) id = id.slice(3)
    if (id === 'shared' || id.startsWith('shared/')) continue
    if (id) ids.add(id)
  }
  return ids
}

/**
 * Extract imported symbol names from a TS/TSX source file. Used to compute
 * import deltas for the post-chat change summary — gives the user concrete
 * signal that the AI added/removed components they expect.
 *
 * Returns a flat set across all `import { a, b } from "..."` statements.
 */
export function extractImportedNames(code: string): Set<string> {
  const names = new Set<string>()
  const re = /import\s*\{\s*([^}]+)\s*\}\s*from\s*["'][^"']+["']/g
  for (const m of code.matchAll(re)) {
    const list = m[1].split(',').map(n => n.trim().replace(/\s+as\s+\w+/, ''))
    for (const n of list) if (n) names.add(n)
  }
  return names
}

export async function warnInlineDuplicates(
  projectRoot: string,
  pageName: string,
  route: string,
  pageCode: string,
  manifest: { shared: Array<{ id: string; name: string; type: string; file: string }> },
  plan?: ArchitecturePlan,
): Promise<{ missingPlannedImports: Array<{ name: string; importPath: string }> }> {
  const result = { missingPlannedImports: [] as Array<{ name: string; importPath: string }> }
  const reusable = manifest.shared.filter(e => e.type !== 'layout')
  if (reusable.length === 0) return result

  // Build a set of component names this page should use (from plan)
  const plannedForPage = plan
    ? new Set(plan.sharedComponents.filter(c => c.usedBy.includes(route)).map(c => c.name))
    : null

  for (const e of reusable) {
    // If plan exists, only warn about components planned for this page
    if (plannedForPage && !plannedForPage.has(e.name)) continue

    const kebab = e.file.replace(/^components\/shared\//, '').replace(/\.tsx$/, '')
    const hasImport = pageCode.includes(`@/components/shared/${kebab}`)
    if (hasImport) continue

    if (plannedForPage) {
      result.missingPlannedImports.push({ name: e.name, importPath: `@/components/shared/${kebab}` })
      console.log(
        chalk.yellow(
          `\n⚠ Page "${pageName}" should use shared component ${e.name} (per architecture plan) but it's not imported. Import from @/components/shared/${kebab}`,
        ),
      )
      continue
    }

    const sameNameAsTag = new RegExp(`<\\/?${e.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s>]`).test(pageCode)
    if (sameNameAsTag) {
      console.log(
        chalk.yellow(
          `\n⚠ Page "${pageName}" contains inline code similar to ${e.id} (${e.name}). Consider using the shared component instead.`,
        ),
      )
      continue
    }
    try {
      const fullPath = resolve(projectRoot, e.file)
      const sharedSnippet = (await readFile(fullPath)).slice(0, 600)
      const sharedTokens = new Set(sharedSnippet.match(/\b[a-zA-Z0-9-]{4,}\b/g) ?? [])
      const pageTokens: string[] = pageCode.match(/\b[a-zA-Z0-9-]+\b/g) ?? []
      let overlap = 0
      for (const t of sharedTokens) {
        if (pageTokens.includes(t)) overlap++
      }
      const overlapRatio = sharedTokens.size > 0 ? overlap / sharedTokens.size : 0
      if (overlap >= 25 && overlapRatio >= 0.7) {
        console.log(
          chalk.yellow(
            `\n⚠ Page "${pageName}" contains inline code similar to ${e.id} (${e.name}). Consider using the shared component instead.`,
          ),
        )
      }
    } catch {
      // ignore read errors
    }
  }
  return result
}

/**
 * Auto-inject missing shared component imports into page code.
 * Adds import statements for planned components that AI failed to include.
 */
export function injectMissingSharedImports(
  code: string,
  missingImports: Array<{ name: string; importPath: string }>,
): string {
  if (missingImports.length === 0) return code

  const importLines = missingImports.map(m => `import { ${m.name} } from '${m.importPath}'`).join('\n')

  // Insert after the last existing import or after "use client"
  const lastImportIdx = code.lastIndexOf('\nimport ')
  if (lastImportIdx !== -1) {
    const lineEnd = code.indexOf('\n', lastImportIdx + 1)
    return code.slice(0, lineEnd + 1) + importLines + '\n' + code.slice(lineEnd + 1)
  }

  // Fallback: after "use client" directive
  const useClientMatch = code.match(/^['"]use client['"]\s*\n/m)
  if (useClientMatch) {
    const insertAt = (useClientMatch.index ?? 0) + useClientMatch[0].length
    return code.slice(0, insertAt) + importLines + '\n' + code.slice(insertAt)
  }

  // Last resort: prepend
  return importLines + '\n' + code
}

export async function loadConfig(configPath: string): Promise<DesignSystemConfig> {
  if (!existsSync(configPath)) {
    throw new Error(
      `Design system config not found at ${configPath}\n` + 'Run "coherent init" first to create a project.',
    )
  }

  const manager = new DesignSystemManager(configPath)
  await manager.load()
  return manager.getConfig()
}

export function requireProject(): { root: string; configPath: string } {
  const project = findConfig()
  if (!project) {
    exitNotCoherent()
  }
  warnIfVolatile(project.root)
  return project
}

export async function resolveTargetFlags(
  message: string,
  options: { component?: string; page?: string; token?: string },
  config: DesignSystemConfig,
  projectRoot: string,
): Promise<string> {
  if (options.component) {
    const manifest = await loadManifest(projectRoot)
    const target = options.component
    const entry = manifest.shared.find(
      s => s.name.toLowerCase() === target.toLowerCase() || s.id.toLowerCase() === target.toLowerCase(),
    )
    if (entry) {
      const filePath = resolve(projectRoot, entry.file)
      let currentCode = ''
      if (existsSync(filePath)) {
        currentCode = readFileSync(filePath, 'utf-8')
      }
      const codeSnippet = currentCode
        ? `\n\nCurrent code of ${entry.name} page:\n\`\`\`tsx\n${currentCode}\n\`\`\``
        : `\n\n${entry.name} page does not exist yet — generate it from scratch based on the request below.`
      return `Modify the shared component ${entry.name} (${entry.id}, file: ${entry.file}): ${message}. Read the current code below and apply the requested changes. Return the full updated component code as pageCode.${codeSnippet}`
    }
    console.log(chalk.yellow(`\n⚠️  Component "${target}" not found in shared components.`))
    console.log(chalk.dim('   Available: ' + manifest.shared.map(s => `${s.id} ${s.name}`).join(', ')))
    console.log(chalk.dim('   Proceeding with message as-is...\n'))
  }

  if (options.page) {
    const target = options.page
    const page = resolvePageByFuzzyMatch(config.pages, target)
    if (page) {
      const relPath = page.route === '/' ? 'app/page.tsx' : `app${page.route}/page.tsx`
      const filePath = resolve(projectRoot, relPath)
      let currentCode = ''
      if (existsSync(filePath)) {
        currentCode = readFileSync(filePath, 'utf-8')
      }
      const codeSnippet = currentCode ? `\n\nCurrent code of ${page.name} page:\n\`\`\`tsx\n${currentCode}\n\`\`\`` : ''
      return `Update page "${page.name}" (id: ${page.id}, route: ${page.route}, file: ${relPath}): ${message}. Read the current code below and apply the requested changes.${codeSnippet}`
    }
    console.log(chalk.yellow(`\n⚠️  Page "${target}" not found.`))
    console.log(chalk.dim('   Available: ' + config.pages.map(p => `${p.id} (${p.route})`).join(', ')))
    console.log(chalk.dim('   Proceeding with message as-is...\n'))
  }

  if (options.token) {
    const target = options.token
    return `Change design token "${target}": ${message}. Update the token value in design-system.config.ts and ensure globals.css reflects the change.`
  }

  return message
}

/**
 * Best-effort resolution of a user-provided page identifier to an actual page
 * in the config.
 *
 * The user may type `--page accounts` when the page's id is `account`, or
 * `--page settings` when the route is `/settings`. Without this, the old
 * strict-equals match fell back to "page not found" → pipeline regenerated
 * the whole project.
 *
 * Match order, first win:
 *   1. Exact id / name / route match (backward compatibility).
 *   2. Plural ↔ singular swap (accounts → account, settings → setting).
 *   3. Prefix match on id / name slug (3+ char prefix).
 *   4. Route contains target as a path segment.
 *
 * Returns null when no reasonable match found. Caller warns and falls through
 * to free-text interpretation.
 */
export function resolvePageByFuzzyMatch<T extends { id: string; name: string; route: string }>(
  pages: readonly T[],
  target: string,
): T | null {
  const t = target.toLowerCase().trim().replace(/^\//, '')
  if (!t) return null

  // 1. Exact match (same logic as before)
  const exact = pages.find(
    p =>
      p.name.toLowerCase() === t ||
      p.id.toLowerCase() === t ||
      p.route === '/' + t ||
      p.route === target ||
      p.route.slice(1).toLowerCase() === t,
  )
  if (exact) return exact

  // 2. Plural ↔ singular swap
  const toggle = t.endsWith('s') ? t.slice(0, -1) : t + 's'
  const swapped = pages.find(
    p => p.name.toLowerCase() === toggle || p.id.toLowerCase() === toggle || p.route.slice(1).toLowerCase() === toggle,
  )
  if (swapped) return swapped

  // 3. Prefix match (only if user supplied 3+ chars to avoid misfires on /a or /my)
  if (t.length >= 3) {
    const prefix = pages.find(p => p.id.toLowerCase().startsWith(t) || p.name.toLowerCase().startsWith(t))
    if (prefix) return prefix
  }

  // 4. Route segment match (e.g. target "detail" → /accounts/[id] does NOT match,
  //    but "accounts" → /accounts/[id] picks the list page because the first
  //    segment matches)
  const segMatch = pages.find(p => {
    const segments = p.route.split('/').filter(Boolean)
    return segments[0]?.toLowerCase() === t
  })
  if (segMatch) return segMatch

  return null
}

/**
 * Detects broad "build an app/site/platform" intent in a user message.
 *
 * Why: Without this, phrases like "create me ui for a financial app" miss the
 * keyword-count threshold and fall into the single-shot parseModification path
 * — one blocking LLM call with no visible progress. This regex promotes them to
 * the staged splitGeneratePages pipeline (Phase 1/6…6/6) so the user sees work
 * happening.
 *
 * Scope: matches {verb} … {multi-page noun}. Keeps "create a dashboard" (single
 * screen) and "build login page" out by limiting the noun set to things that
 * imply >1 page.
 */
const BROAD_APP_INTENT_RE =
  /\b(?:create|build|generate|make|design|scaffold|develop|start)\b[^.!?\n]{0,60}\b(?:app|application|web.?app|website|site|saas|platform|portal|product|mvp|prototype|project|tool|system|suite)\b/i

export function hasBroadAppIntent(message: string): boolean {
  return BROAD_APP_INTENT_RE.test(message)
}

/**
 * Resolve `--page X` to a concrete page entry without mutating the message.
 *
 * Counterpart to `resolveTargetFlags`, which wraps the original message in a
 * long prompt that embeds the full page code. That wrapping forces the LLM to
 * return a full-page regen (pageCode field populated) — which negates the
 * surgical edit path in modification-handler.ts.
 *
 * This helper is used by the surgical `--page X` path in chat.ts: when it
 * returns a page, chat.ts bypasses `parseModification` entirely and submits
 * `{ type: 'update-page', target: page.id, changes: { instruction: msg } }`
 * directly. `applyModification`'s `update-page` case then reads the file from
 * disk and calls `ai.editPageCode(currentCode, instruction, ...)` — a single
 * LLM call focused on minimal-diff edits.
 *
 * Returns `null` when `--page X` was not set OR the target doesn't resolve
 * (caller falls back to the legacy free-text path).
 */
export function resolveExplicitPageTarget<T extends { id: string; name: string; route: string }>(
  options: { page?: string; component?: string; token?: string },
  pages: readonly T[],
): T | null {
  if (options.component || options.token) return null
  if (!options.page) return null
  return resolvePageByFuzzyMatch(pages, options.page)
}

export interface SpinnerLike {
  text: string
  /** Optional ora field — when present and `false`, heartbeat skips updates. */
  isSpinning?: boolean
}

export interface HeartbeatStage {
  /** Seconds after heartbeat start when this text should appear. */
  after: number
  text: string
}

/**
 * Rotates spinner text through stages while a long blocking call runs.
 *
 * Why: parseModification is one awaited LLM call (can take 30–90s on broad
 * prompts). A static "Parsing your request..." makes it look frozen. This ticks
 * spinner.text at the configured elapsed marks so the user sees liveness.
 *
 * In non-TTY environments (CI, piped output) the spinner frame is invisible, so
 * each stage is also emitted to stderr via `console.error` — progress still
 * reaches logs.
 *
 * `spinner.isSpinning` (ora) is checked on each tick to avoid overwriting text
 * on a spinner the caller has already stopped/failed.
 *
 * Returns a stop() function — call it in a `finally` to clear the interval.
 */
export function startSpinnerHeartbeat(spinner: SpinnerLike, stages: HeartbeatStage[]): () => void {
  if (stages.length === 0) return () => {}
  const sorted = [...stages].sort((a, b) => a.after - b.after)
  const started = Date.now()
  const isTTY = typeof process !== 'undefined' && !!process.stderr?.isTTY
  let nextIdx = 0
  const timer = setInterval(() => {
    const elapsed = (Date.now() - started) / 1000
    while (nextIdx < sorted.length && elapsed >= sorted[nextIdx].after) {
      const stage = sorted[nextIdx]
      if (spinner.isSpinning !== false) {
        spinner.text = stage.text
        if (!isTTY) console.error(chalk.dim(`  … ${stage.text}`))
      }
      nextIdx++
    }
    if (nextIdx >= sorted.length) clearInterval(timer)
  }, 1000)
  if (typeof (timer as any).unref === 'function') (timer as any).unref()
  return () => clearInterval(timer)
}

/**
 * Error thrown by `withRequestTimeout` when the deadline is reached.
 *
 * `.code === 'REQUEST_TIMEOUT'` lets callers distinguish this from other
 * failures (e.g., the existing `RESPONSE_TRUNCATED` flow in chat.ts).
 */
export class RequestTimeoutError extends Error {
  readonly code = 'REQUEST_TIMEOUT'
  constructor(
    public readonly label: string,
    public readonly timeoutMs: number,
  ) {
    super(
      `${label} timed out after ${Math.round(timeoutMs / 1000)}s. Set COHERENT_REQUEST_TIMEOUT_MS to raise the limit.`,
    )
    this.name = 'RequestTimeoutError'
  }
}

/**
 * Default request timeout read once from env. `0` disables the timeout.
 *
 * Why module-level: avoids re-parsing per call and per fork. If a user sets
 * this via `.env`, they've already loaded it before the CLI starts.
 */
const DEFAULT_TIMEOUT_MS = (() => {
  const raw = process.env.COHERENT_REQUEST_TIMEOUT_MS
  if (!raw) return 180_000
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return 180_000
  return parsed
})()

export function getDefaultRequestTimeoutMs(): number {
  return DEFAULT_TIMEOUT_MS
}

/**
 * Races a promise against a timeout so a single hung LLM call can't freeze the
 * CLI indefinitely.
 *
 * Legacy mode: the underlying request is NOT cancelled (the passed Promise
 * has already started). Use `withAbortableTimeout` instead whenever the
 * callee supports `AbortSignal` — that variant actually kills the HTTP
 * request and stops metering tokens.
 *
 * Pass `timeoutMs: 0` to disable (mainly for tests that mock providers).
 */
export async function withRequestTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  if (timeoutMs <= 0) return promise
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RequestTimeoutError(label, timeoutMs)), timeoutMs)
    if (typeof (timer as any).unref === 'function') (timer as any).unref()
  })
  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Runs a request factory with a timeout that actually aborts the in-flight
 * call via `AbortController`.
 *
 * Why: `withRequestTimeout` races a Promise that's already started, so the
 * HTTP request keeps running and tokens keep getting metered even after the
 * timeout fires. `withAbortableTimeout` creates the controller up-front and
 * passes its signal to the factory — the provider SDK then aborts the fetch.
 *
 * Pass `timeoutMs: 0` to disable (the controller still exists but its abort
 * is never triggered, so the request runs to completion).
 */
export async function withAbortableTimeout<T>(
  startRequest: (signal: AbortSignal) => Promise<T>,
  label: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  if (timeoutMs > 0) {
    timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
    if (typeof (timer as any).unref === 'function') (timer as any).unref()
  }
  try {
    return await startRequest(controller.signal)
  } catch (err) {
    if (timedOut) throw new RequestTimeoutError(label, timeoutMs)
    throw err
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Single source of truth for "should this message go to splitGeneratePages?"
 *
 * Kept alongside `hasBroadAppIntent` so all the trigger conditions live in one
 * tested place. Threshold is 3 (down from 4) — three mentioned page names is
 * already enough output to risk JSON truncation in a single-shot call.
 */
const MULTI_PAGE_KEYWORD_RE =
  /\b(?:registration|about|catalog?|account|contact|pricing|dashboard|settings|login|sign.?up|blog|portfolio|features|checkout|orders?|invoices?|analytics|reports?|billing|members?|teams?|projects?|tasks?|customers?|inventory|products?)\b/gi

const PAGES_COLON_RE = /\b(pages?|sections?|screens?)\s*[:]\s*\w/i

export const MULTI_PAGE_KEYWORD_THRESHOLD = 3

export function isMultiPageRequest(message: string): boolean {
  if (hasBroadAppIntent(message)) return true
  if (PAGES_COLON_RE.test(message)) return true
  const matches = message.match(MULTI_PAGE_KEYWORD_RE)
  return (matches?.length ?? 0) >= MULTI_PAGE_KEYWORD_THRESHOLD
}

/**
 * Measures elapsed time for a phase and logs it when `COHERENT_DEBUG=1`.
 *
 * Use as a lightweight `console.time`/`timeEnd` replacement — we want timing
 * info in a single place, guarded by the project-wide DEBUG flag, not scattered
 * `if (DEBUG) console.time(...)` pairs.
 */
export function startPhaseTimer(label: string): () => void {
  const debug = process.env.COHERENT_DEBUG === '1'
  if (!debug) return () => {}
  const started = Date.now()
  return () => {
    const elapsed = Date.now() - started
    console.error(chalk.dim(`  [timing] ${label}: ${(elapsed / 1000).toFixed(1)}s`))
  }
}
