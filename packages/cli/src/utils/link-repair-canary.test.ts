import { describe, it, expect } from 'vitest'
import { autoFixCode } from './quality-validator.js'

describe('link repair — dead-target rewrite', () => {
  it('rewrites a link to a route with no file → href="#" + data-stale-href', async () => {
    const page = `export default function Home() {
  return <div><a href="/sign-up">Join</a><a href="/checkout">Buy</a></div>
}`
    const { code, fixes } = await autoFixCode(page, { knownRoutes: ['/', '/checkout'], currentRoute: '/' })
    // The dead link's LIVE href becomes "#", original preserved in data-stale-href.
    expect(code).toMatch(/<a href="#" data-stale-href="\/sign-up"/)
    // The valid link is untouched.
    expect(code).toMatch(/<a href="\/checkout"/)
    expect(fixes.join(' ')).toMatch(/broken link/i)
  })
})

describe('link counting — check must ignore the repair marker', () => {
  // This is the exact regex `coherent check` uses to find live internal links.
  // It must NOT match `data-stale-href="/x"` (an already-repaired dead link,
  // whose live href is "#"), or repaired links get double-counted as broken and
  // tank the quality score — the bug behind "7 broken links" on a repaired page.
  const linkHrefRe = /(?<![\w-])href\s*=\s*["'](\/[a-z0-9/-]*)["']/gi

  function liveLinks(code: string): string[] {
    const out: string[] = []
    let m
    while ((m = linkHrefRe.exec(code)) !== null) out.push(m[1])
    linkHrefRe.lastIndex = 0
    return out
  }

  it('counts a live href but not a data-stale-href marker', () => {
    const code = '<a href="#" data-stale-href="/sign-up"></a><a href="/pricing"></a>'
    expect(liveLinks(code)).toEqual(['/pricing'])
  })

  it('a fully-repaired page reports zero live internal links', () => {
    const code =
      '<Link href="#" data-stale-href="/sign-up" /><Link href="#" data-stale-href="/pricing" /><Link href="#" data-stale-href="/contact" />'
    expect(liveLinks(code)).toEqual([])
  })
})
