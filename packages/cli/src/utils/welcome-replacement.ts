/**
 * Welcome-scaffold replacement helper (M15, v0.11).
 *
 * Both rails (API `coherent chat` and skill `/coherent-chat`) share the
 * same problem after the user's first chat: if the generated plan does NOT
 * include a `/` route, the init scaffolded `app/page.tsx` survives and the
 * landing-page-with-marketing-toggle remains "/", on top of the generated
 * /dashboard, /settings, etc. The user asked for an app, but "/" is still
 * the welcome page they saw before they typed anything.
 *
 * `replaceWelcomeWithPrimary` reads `app/page.tsx` (or the post-sidebar
 * `app/(public)/page.tsx`), checks whether it's still Coherent's scaffold
 * via {@link isWelcomeScaffold}, and rewrites it to a `redirect()` to the
 * primary generated route. If the user already manually edited the file
 * (no marker, no signatures), this is a no-op so we never trample.
 *
 * `pickPrimaryRoute` MUST be called with the *generated* pages (from the
 * skill rail's `page-<id>.json` artifacts or the API rail's response
 * batch). It is NOT safe to feed `dsm.config.pages`: `minimal-config.ts`
 * seeds a placeholder Home at `/` during `coherent init`, which would
 * cause this function to always return `/` and the replacement to silently
 * no-op. Codex /codex consult P1 #1.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { isAuthRoute } from '../agents/page-templates.js'
import { WELCOME_MARKER, WELCOME_SIGNATURES } from './welcome-content.js'

export interface PageLite {
  /** Route as written in the plan / generated request. */
  route: string
  /** Type used to bias the primary-route pick (app > marketing > auth). */
  pageType?: 'marketing' | 'app' | 'auth'
}

/**
 * True if `content` looks like a fresh Coherent welcome scaffold —
 * either carries the v1+ marker (preferred) or one of the frozen
 * v0.9/v0.10 signature substrings.
 *
 * This is intentionally fail-closed: every uncertain case (no marker, no
 * signature) returns `false` so user-edited files are never overwritten.
 */
export function isWelcomeScaffold(content: string): boolean {
  if (content.includes(WELCOME_MARKER)) return true
  for (const sig of WELCOME_SIGNATURES) {
    if (content.includes(sig)) return true
  }
  return false
}

/**
 * Choose the route that "/" should redirect to after the first chat.
 *
 * Inputs are the pages produced by the user's request — NEVER the seeded
 * `dsm.config.pages`. The init seed always carries id='home' route='/' and
 * would short-circuit the pick to `/`, no-op'ing replacement (codex P1 #1).
 *
 * Selection order:
 *   1. First app page (sidebar/back-office content the user usually wants)
 *   2. First marketing page
 *   3. First non-auth page
 *   4. null when only `/`-or-auth routes were generated
 */
export function pickPrimaryRoute(generatedPages: readonly PageLite[]): string | null {
  const candidates = generatedPages.filter(p => p.route !== '/')
  if (candidates.length === 0) return null

  const isAuth = (p: PageLite) => p.pageType === 'auth' || isAuthRoute(p.route)
  const nonAuth = candidates.filter(p => !isAuth(p))
  if (nonAuth.length === 0) {
    // Auth-only generation is unusual but fall back to first generated route
    // rather than returning null — the welcome scaffold should still go.
    return candidates[0].route
  }

  const app = nonAuth.find(p => p.pageType === 'app')
  if (app) return app.route
  return nonAuth[0].route
}

/**
 * Both filesystem locations Next.js may serve `/` from in a Coherent
 * project. Header-nav projects have `app/page.tsx`; sidebar-nav projects
 * have `app/(public)/page.tsx` after `regenerateLayout` runs. We replace
 * the scaffold wherever it currently lives.
 *
 * The order matters: when both happen to exist mid-rail (theoretically
 * possible if a previous run was interrupted), we treat `app/page.tsx`
 * as authoritative — `regenerateLayout` will move it into `(public)`
 * later if the nav type calls for it.
 */
const ROOT_PAGE_REL = ['app/page.tsx', 'app/(public)/page.tsx'] as const

function buildRedirectPage(primaryRoute: string): string {
  return `${WELCOME_MARKER}
import { redirect } from 'next/navigation'

export default function HomePage() {
  redirect(${JSON.stringify(primaryRoute)})
}
`
}

export interface ReplaceResult {
  /** True when we actually rewrote a file. */
  replaced: boolean
  /** Filesystem path we touched (relative to project root) when `replaced`. */
  path: string | null
  /** Why we did or didn't replace — for caller logging. */
  reason: 'replaced' | 'not-scaffold' | 'no-root-page' | 'no-primary'
}

/**
 * Rewrite the project's root `/` page (wherever it lives) to redirect to
 * `primaryRoute`, if and only if the current file is still Coherent's
 * welcome scaffold. Idempotent: re-running on an already-replaced project
 * sees a redirect file (no marker → not scaffold) and no-ops.
 *
 * Carries the same `WELCOME_MARKER` line on output so a future change
 * that wants to swap the redirect target (e.g. user adds a real `/`
 * later) can still detect "this is a Coherent-managed redirect, safe to
 * overwrite."
 */
export function replaceWelcomeWithPrimary(opts: {
  projectRoot: string
  primaryRoute: string | null
  /** When true, returns the result without writing — useful for tests / dry-run. */
  dryRun?: boolean
}): ReplaceResult {
  if (!opts.primaryRoute) {
    return { replaced: false, path: null, reason: 'no-primary' }
  }

  for (const rel of ROOT_PAGE_REL) {
    const abs = resolve(opts.projectRoot, rel)
    if (!existsSync(abs)) continue

    const current = readFileSync(abs, 'utf-8')
    if (!isWelcomeScaffold(current)) {
      return { replaced: false, path: rel, reason: 'not-scaffold' }
    }

    if (!opts.dryRun) {
      writeFileSync(abs, buildRedirectPage(opts.primaryRoute), 'utf-8')
    }
    return { replaced: true, path: rel, reason: 'replaced' }
  }

  return { replaced: false, path: null, reason: 'no-root-page' }
}
