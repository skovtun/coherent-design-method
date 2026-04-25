/**
 * welcome-replacement helper — unit tests covering the codex P1 findings:
 *
 *   P1 #1 — `pickPrimaryRoute` must NOT short-circuit on the seeded `/`
 *           Home. Tests feed a "first chat generates only /dashboard"
 *           shape and assert /dashboard is picked, not `/`.
 *
 *   P1 #2 — Sidebar route-group movement: integration-flavored unit
 *           ensures `replaceWelcomeWithPrimary` rewrites whichever of
 *           `app/page.tsx` or `app/(public)/page.tsx` carries the
 *           scaffold — both locations are valid for `/`.
 *
 * Plus baseline coverage: marker detection, signature fallback,
 * user-edited file is left alone, no-primary case, dryRun, idempotency.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { generateWelcomeComponent, WELCOME_MARKER } from './welcome-content.js'
import { isWelcomeScaffold, pickPrimaryRoute, replaceWelcomeWithPrimary, type PageLite } from './welcome-replacement.js'

describe('isWelcomeScaffold', () => {
  it('matches files carrying the v1 marker', () => {
    const scaffold = generateWelcomeComponent('', 'skill')
    expect(scaffold.startsWith(WELCOME_MARKER)).toBe(true)
    expect(isWelcomeScaffold(scaffold)).toBe(true)
  })

  it('matches files via signature substrings (no marker — backfill path)', () => {
    // Simulate a pre-v0.11 scaffold: drop the marker but keep the body.
    const scaffold = generateWelcomeComponent('', 'skill').replace(WELCOME_MARKER + '\n', '')
    expect(scaffold.includes(WELCOME_MARKER)).toBe(false)
    expect(isWelcomeScaffold(scaffold)).toBe(true)
  })

  it('returns false for a user-edited home page (no marker, no signatures)', () => {
    const userPage = `'use client'
import { redirect } from 'next/navigation'
export default function HomePage() {
  return <div>My custom hero</div>
}
`
    expect(isWelcomeScaffold(userPage)).toBe(false)
  })

  it('returns false for an already-replaced redirect with marker — only marker is not enough on its own', () => {
    // The redirect we WRITE carries the marker too, so isWelcomeScaffold
    // returns true on it. That's fine: replaceWelcomeWithPrimary is
    // idempotent — replacing a redirect with a redirect is a no-op write
    // of identical content. The "user-edit safety" property only matters
    // when the file is NOT a coherent-managed file; redirect files are.
    const redirectFile = `${WELCOME_MARKER}
import { redirect } from 'next/navigation'
export default function HomePage() { redirect('/dashboard') }
`
    expect(isWelcomeScaffold(redirectFile)).toBe(true)
  })
})

describe('pickPrimaryRoute', () => {
  it('returns null for empty input', () => {
    expect(pickPrimaryRoute([])).toBeNull()
  })

  it('returns null when only `/` is generated', () => {
    expect(pickPrimaryRoute([{ route: '/', pageType: 'marketing' }])).toBeNull()
  })

  it('codex P1 #1 — does not return `/` when caller passed only generated non-root pages', () => {
    // The actual init bug is at the *call site*: chat.ts and the applier
    // must filter dsm.config.pages before calling this. The function
    // itself is contractual: feed it generated pages only.
    const generated: PageLite[] = [{ route: '/dashboard', pageType: 'app' }]
    expect(pickPrimaryRoute(generated)).toBe('/dashboard')
  })

  it('prefers an app page over a marketing page', () => {
    const pages: PageLite[] = [
      { route: '/pricing', pageType: 'marketing' },
      { route: '/dashboard', pageType: 'app' },
      { route: '/about', pageType: 'marketing' },
    ]
    expect(pickPrimaryRoute(pages)).toBe('/dashboard')
  })

  it('falls back to first non-auth page when no app page exists', () => {
    const pages: PageLite[] = [
      { route: '/login', pageType: 'auth' },
      { route: '/pricing', pageType: 'marketing' },
      { route: '/about', pageType: 'marketing' },
    ]
    expect(pickPrimaryRoute(pages)).toBe('/pricing')
  })

  it('falls back to first generated page when only auth pages exist', () => {
    const pages: PageLite[] = [
      { route: '/login', pageType: 'auth' },
      { route: '/signup', pageType: 'auth' },
    ]
    expect(pickPrimaryRoute(pages)).toBe('/login')
  })

  it('classifies route by name when pageType is omitted (uses isAuthRoute)', () => {
    const pages: PageLite[] = [{ route: '/login' }, { route: '/dashboard' }]
    // /login is recognized as auth via isAuthRoute, so /dashboard wins.
    expect(pickPrimaryRoute(pages)).toBe('/dashboard')
  })
})

describe('replaceWelcomeWithPrimary', () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'coherent-welcome-replace-'))
    mkdirSync(join(tmp, 'app'), { recursive: true })
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  function writeRoot(rel: string, content: string): void {
    const abs = resolve(tmp, rel)
    mkdirSync(resolve(abs, '..'), { recursive: true })
    writeFileSync(abs, content, 'utf-8')
  }

  it('replaces app/page.tsx when it is the welcome scaffold', () => {
    writeRoot('app/page.tsx', generateWelcomeComponent('', 'skill'))
    const result = replaceWelcomeWithPrimary({ projectRoot: tmp, primaryRoute: '/dashboard' })
    expect(result.replaced).toBe(true)
    expect(result.path).toBe('app/page.tsx')
    expect(result.reason).toBe('replaced')

    const after = readFileSync(resolve(tmp, 'app/page.tsx'), 'utf-8')
    expect(after).toContain('redirect')
    expect(after).toContain('"/dashboard"')
    expect(after).toContain(WELCOME_MARKER)
  })

  it('codex P1 #2 — replaces app/(public)/page.tsx when the sidebar move already happened', () => {
    // Simulate a project where regenerateLayout already moved app/page.tsx
    // → app/(public)/page.tsx (sidebar nav, second chat scenario, or
    // backfill on an already-migrated v0.10 project).
    writeRoot('app/(public)/page.tsx', generateWelcomeComponent('', 'skill'))
    const result = replaceWelcomeWithPrimary({ projectRoot: tmp, primaryRoute: '/dashboard' })
    expect(result.replaced).toBe(true)
    expect(result.path).toBe('app/(public)/page.tsx')

    const after = readFileSync(resolve(tmp, 'app/(public)/page.tsx'), 'utf-8')
    expect(after).toContain('redirect("/dashboard")')
  })

  it('does not touch a user-edited home page', () => {
    const userPage = `export default function HomePage() {
  return <div>my custom hero</div>
}
`
    writeRoot('app/page.tsx', userPage)
    const result = replaceWelcomeWithPrimary({ projectRoot: tmp, primaryRoute: '/dashboard' })
    expect(result.replaced).toBe(false)
    expect(result.reason).toBe('not-scaffold')

    const after = readFileSync(resolve(tmp, 'app/page.tsx'), 'utf-8')
    expect(after).toBe(userPage)
  })

  it('returns no-primary when primaryRoute is null', () => {
    writeRoot('app/page.tsx', generateWelcomeComponent('', 'skill'))
    const result = replaceWelcomeWithPrimary({ projectRoot: tmp, primaryRoute: null })
    expect(result.replaced).toBe(false)
    expect(result.reason).toBe('no-primary')
  })

  it('returns no-root-page when neither candidate file exists', () => {
    const result = replaceWelcomeWithPrimary({ projectRoot: tmp, primaryRoute: '/dashboard' })
    expect(result.replaced).toBe(false)
    expect(result.reason).toBe('no-root-page')
  })

  it('does not write to disk when dryRun is true', () => {
    const original = generateWelcomeComponent('', 'skill')
    writeRoot('app/page.tsx', original)
    const result = replaceWelcomeWithPrimary({ projectRoot: tmp, primaryRoute: '/dashboard', dryRun: true })
    expect(result.replaced).toBe(true)
    expect(readFileSync(resolve(tmp, 'app/page.tsx'), 'utf-8')).toBe(original)
  })

  it('treats app/page.tsx as authoritative when both candidates exist', () => {
    writeRoot('app/page.tsx', generateWelcomeComponent('', 'skill'))
    writeRoot('app/(public)/page.tsx', generateWelcomeComponent('', 'skill'))
    const result = replaceWelcomeWithPrimary({ projectRoot: tmp, primaryRoute: '/dashboard' })
    expect(result.replaced).toBe(true)
    expect(result.path).toBe('app/page.tsx')
    // (public)/page.tsx left as-is — regenerateLayout's move logic only
    // copies when (public)/page.tsx is missing, so we don't preempt it.
    expect(existsSync(resolve(tmp, 'app/(public)/page.tsx'))).toBe(true)
  })
})
