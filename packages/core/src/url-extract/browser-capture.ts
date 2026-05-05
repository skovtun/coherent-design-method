/// <reference lib="dom" />
import { lookup as dnsLookupDefault } from 'node:dns/promises'
import type { CapturedSnapshot, ComputedStyleSample, ExtractOptions, HeroDetection } from './types.js'

export const DEFAULT_TIMEOUT_MS = 30_000
export const DEFAULT_SCROLL_GRACE_MS = 1_000

/**
 * Playwright Response shape: methods not properties (status() and url() return synchronously).
 * We don't depend on Playwright at this layer — defining the minimal contract here.
 */
export interface NavigationResponse {
  status(): number
  url(): string
}

/** Result of a DNS A/AAAA lookup. Matches node:dns/promises lookup({all:true}) shape. */
export interface DnsLookupResult {
  address: string
  family: 4 | 6
}

export type DnsLookupFn = (hostname: string, opts: { all: true }) => Promise<DnsLookupResult[]>

export interface PageLike {
  goto(url: string, opts: { timeout: number; waitUntil: 'networkidle' }): Promise<NavigationResponse | null>
  evaluate<T>(fn: string | ((...a: unknown[]) => T)): Promise<T>
  evaluate<T, A>(fn: string | ((arg: A) => T), arg: A): Promise<T>
  content(): Promise<string>
  screenshot(opts: { type: 'png'; fullPage: boolean }): Promise<Buffer>
  title(): Promise<string>
  url(): string
  waitForTimeout(ms: number): Promise<void>
  close(): Promise<void>
  /**
   * Intercept every main-frame navigation request (initial + each redirect hop).
   * Handler returns true to allow, false to abort. Subresource requests pass through.
   */
  interceptMainFrameRequests(handler: (url: string) => Promise<boolean>): Promise<void>
}

export interface BrowserDriverFactory {
  newPage(): Promise<PageLike>
  close(): Promise<void>
}

/**
 * In-page hero detection. Runs inside the target page's window.
 * 3-tier per dogfood finding (2026-05-04): semantic h1 → largest visible text → null
 * Tier 3 (multimodal LLM) is dispatched by the orchestrator when this returns source: 'none'.
 *
 * Exported as a function reference so it can be unit-tested in jsdom without spinning a real browser.
 */
export function detectHeroInPage(): HeroDetection {
  // Tier 1: semantic <h1>
  const h1 = document.querySelector('h1')
  if (h1 && (h1.textContent || '').trim().length > 0) {
    const fs = parseFloat(getComputedStyle(h1).fontSize)
    return {
      text: (h1.textContent || '').trim(),
      fontSize: Number.isFinite(fs) ? fs : null,
      source: 'h1',
      selector: 'h1',
    }
  }
  // Tier 2: largest visible text in viewport (works for awwwards/larevoltosa custom hero markup)
  const candidates: { el: Element; size: number; text: string }[] = []
  const all = document.querySelectorAll<HTMLElement>('div, span, p, section, article, header, h2, h3, strong, em')
  const vh = (window as Window).innerHeight || 800
  for (const el of Array.from(all)) {
    const rect = el.getBoundingClientRect()
    if (rect.top >= vh) continue
    if (rect.width <= 0 || rect.height <= 0) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue
    // skip wrapper-only elements (text only counts if it's directly in this node, not deep descendants)
    const directText = Array.from(el.childNodes)
      .filter(n => n.nodeType === 3)
      .map(n => (n.textContent || '').trim())
      .filter(Boolean)
      .join(' ')
    if (directText.length < 2) continue
    const size = parseFloat(cs.fontSize)
    if (!Number.isFinite(size)) continue
    candidates.push({ el, size, text: directText })
  }
  if (candidates.length === 0) {
    return { text: null, fontSize: null, source: 'none' }
  }
  candidates.sort((a, b) => b.size - a.size)
  const winner = candidates[0]
  return {
    text: winner.text,
    fontSize: winner.size,
    source: 'largest-visible-text',
    selector: winner.el.tagName.toLowerCase(),
  }
}

/**
 * Stringified form for execution inside Playwright's `page.evaluate`.
 * Page eval needs a self-contained function string (no module references).
 */
export const HERO_DETECTION_SCRIPT = `(${detectHeroInPage.toString()})()`

/**
 * In-page sampler. Returns one ComputedStyleSample per representative element.
 * Roles per design doc §"DOM sampling strategy".
 */
export function sampleComputedStylesInPage(): ComputedStyleSample[] {
  const styleProps = [
    'color',
    'background',
    'background-color',
    'background-image',
    'font-family',
    'font-size',
    'font-weight',
    'line-height',
    'letter-spacing',
    'border',
    'border-radius',
    'box-shadow',
    'padding',
    'margin',
    'gap',
    'transition',
    'transition-duration',
    'transition-timing-function',
    'transition-property',
    'outline',
    'outline-offset',
    'opacity',
    'text-decoration',
    'backdrop-filter',
    'z-index',
    'max-width',
  ]
  const grab = (
    el: Element,
    role: ComputedStyleSample['role'],
    pseudo?: ComputedStyleSample['pseudo'],
  ): ComputedStyleSample | null => {
    if (!el) return null
    const cs = getComputedStyle(el as Element, pseudo ? `:${pseudo}` : null)
    const styles: Record<string, string> = {}
    for (const k of styleProps) {
      const v = cs.getPropertyValue(k)
      if (v) styles[k] = v
    }
    const sel = (el as HTMLElement).tagName.toLowerCase() + ((el as HTMLElement).id ? '#' + (el as HTMLElement).id : '')
    return { selector: sel, role, styles, ...(pseudo ? { pseudo } : {}) }
  }
  const samples: ComputedStyleSample[] = []
  const push = (s: ComputedStyleSample | null) => {
    if (s) samples.push(s)
  }

  push(grab(document.body, 'body'))
  push(grab(document.documentElement, 'page'))

  // headings — first occurrence per level
  for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const) {
    const el = document.querySelector(tag)
    if (el) push(grab(el, tag))
  }
  // first paragraph
  const p = document.querySelector('p')
  if (p) push(grab(p, 'p'))

  // primary CTA: largest button by area
  const buttons = Array.from(document.querySelectorAll<HTMLElement>('button, a[role="button"], [class*="btn"]'))
  if (buttons.length > 0) {
    buttons.sort((a, b) => {
      const ar = a.getBoundingClientRect()
      const br = b.getBoundingClientRect()
      return br.width * br.height - ar.width * ar.height
    })
    push(grab(buttons[0], 'button-primary'))
    if (buttons[1]) push(grab(buttons[1], 'button-secondary'))
  }
  // first link in body (skip nav)
  const link = document.querySelector('main a, article a, section a') || document.querySelector('a')
  if (link) push(grab(link, 'a'))
  // first input + select
  const input = document.querySelector('input:not([type="hidden"])')
  if (input) push(grab(input, 'input'))
  const select = document.querySelector('select')
  if (select) push(grab(select, 'select'))
  // svg as icon proxy
  const svg = document.querySelector('svg')
  if (svg) push(grab(svg, 'icon'))
  // landmarks
  const nav = document.querySelector('nav')
  if (nav) push(grab(nav, 'nav'))
  const footer = document.querySelector('footer')
  if (footer) push(grab(footer, 'footer'))
  // largest section as hero card proxy
  const sections = Array.from(document.querySelectorAll<HTMLElement>('section, header'))
  if (sections.length > 0) {
    sections.sort((a, b) => {
      const ar = a.getBoundingClientRect()
      const br = b.getBoundingClientRect()
      return br.width * br.height - ar.width * ar.height
    })
    push(grab(sections[0], 'section'))
  }
  // card-like: max-w + bg + padding
  const cardCandidate = Array.from(
    document.querySelectorAll<HTMLElement>('[class*="card"], article, [class*="Card"]'),
  ).find(el => {
    const cs = getComputedStyle(el)
    return (
      cs.maxWidth !== 'none' && cs.padding !== '0px' && cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)'
    )
  })
  if (cardCandidate) push(grab(cardCandidate, 'card'))

  return samples
}
export const SAMPLE_COMPUTED_STYLES_SCRIPT = `(${sampleComputedStylesInPage.toString()})()`

/**
 * In-page extraction of @media query rule text from all reachable stylesheets.
 * Cross-origin sheets throw on .cssRules access — caught silently per sheet.
 */
export function extractMediaQueriesInPage(): string[] {
  const out = new Set<string>()
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | null = null
    try {
      rules = (sheet as CSSStyleSheet).cssRules
    } catch {
      continue // CORS-restricted
    }
    if (!rules) continue
    for (const rule of Array.from(rules)) {
      if (rule.constructor.name === 'CSSMediaRule' || (rule as CSSMediaRule).media) {
        const media = (rule as CSSMediaRule).media?.mediaText
        if (media) out.add(media)
      }
    }
  }
  return Array.from(out)
}
export const EXTRACT_MEDIA_QUERIES_SCRIPT = `(${extractMediaQueriesInPage.toString()})()`

/**
 * In-page background-mode detection. Returns 'light' | 'dark' | 'cream' based on body background luminance.
 */
export function detectModeInPage(): 'light' | 'dark' | 'cream' {
  const cs = getComputedStyle(document.body)
  const bg = cs.backgroundColor || 'rgb(255, 255, 255)'
  const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!m) return 'light'
  const [r, g, b] = [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)]
  // Rec. 709 luminance
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  if (lum < 0.25) return 'dark'
  // cream = warm light bg (R+G > B by margin, mid-high luminance)
  if (lum > 0.85 && r + g > b * 2.1 && b < 245) return 'cream'
  return 'light'
}
export const DETECT_MODE_SCRIPT = `(${detectModeInPage.toString()})()`

/**
 * In-page copy-text extraction. Pulls hero + first H2 + first paragraph + CTA labels.
 * Truncated at 4KB for LLM context budget.
 */
export function extractCopyTextInPage(): string {
  const parts: string[] = []
  const hero = document.querySelector('h1')
  if (hero?.textContent) parts.push(hero.textContent.trim())
  const meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null
  if (meta?.content) parts.push(meta.content.trim())
  const h2 = document.querySelector('h2')
  if (h2?.textContent) parts.push(h2.textContent.trim())
  const p = document.querySelector('main p, article p, section p, p')
  if (p?.textContent) parts.push(p.textContent.trim().slice(0, 500))
  const ctas = Array.from(document.querySelectorAll<HTMLElement>('button, a[role="button"]'))
    .slice(0, 5)
    .map(el => (el.textContent || '').trim())
    .filter(Boolean)
  if (ctas.length > 0) parts.push('CTAs: ' + ctas.join(' | '))
  return parts.join('\n\n').slice(0, 4096)
}
export const EXTRACT_COPY_TEXT_SCRIPT = `(${extractCopyTextInPage.toString()})()`

const MAX_REDIRECT_HOPS = 3

/**
 * Throws if `addr` is a private/loopback/metadata IP. Caller passes raw IP literal
 * (either from the URL hostname or from a DNS lookup result).
 */
function assertNotPrivateIp(addr: string, family: 4 | 6, source: string): void {
  if (family === 4) {
    const m = addr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (!m) return
    const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)]
    if (a === 0) throw new Error(`URL_INVALID: ${source} resolves to 0.0.0.0/8 (${addr})`)
    if (a === 10) throw new Error(`URL_INVALID: ${source} resolves to private IPv4 10/8 (${addr})`)
    if (a === 127) throw new Error(`URL_INVALID: ${source} resolves to loopback IPv4 127/8 (${addr})`)
    if (a === 169 && b === 254) throw new Error(`URL_INVALID: ${source} resolves to metadata IPv4 169.254/16 (${addr})`)
    if (a === 172 && b >= 16 && b <= 31)
      throw new Error(`URL_INVALID: ${source} resolves to private IPv4 172.16/12 (${addr})`)
    if (a === 192 && b === 168) throw new Error(`URL_INVALID: ${source} resolves to private IPv4 192.168/16 (${addr})`)
    return
  }
  // family === 6
  const lower = addr.toLowerCase()
  if (lower === '::1' || lower === '::') throw new Error(`URL_INVALID: ${source} resolves to IPv6 loopback (${addr})`)
  if (lower.startsWith('fe80:')) throw new Error(`URL_INVALID: ${source} resolves to IPv6 link-local (${addr})`)
  if (lower.startsWith('fc') || lower.startsWith('fd'))
    throw new Error(`URL_INVALID: ${source} resolves to IPv6 unique-local fc00::/7 (${addr})`)
  // IPv4-mapped IPv6 (::ffff:10.0.0.1) — re-check the v4 portion
  const v4mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (v4mapped) assertNotPrivateIp(v4mapped[1], 4, source)
}

/**
 * Default SSRF guard. Async because hostnames must be DNS-resolved and every
 * resolved A/AAAA record validated — literal-string checks alone allow trivial
 * bypass via "internal.example → 10.0.0.5".
 *
 * Pass `opts.lookup` to inject a stub resolver in tests.
 */
export async function defaultSsrfGuard(rawUrl: string, opts: { lookup?: DnsLookupFn } = {}): Promise<void> {
  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    throw new Error(`URL_INVALID: ${rawUrl}`)
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`URL_INVALID: scheme ${u.protocol} not allowed`)
  }
  const host = u.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0') {
    throw new Error('URL_INVALID: localhost')
  }
  // Strip IPv6 brackets for parsing.
  const bareHost = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
  const ipv4Literal = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(bareHost)
  const ipv6Literal = bareHost.includes(':')
  if (ipv4Literal) {
    assertNotPrivateIp(bareHost, 4, 'host')
    return
  }
  if (ipv6Literal) {
    assertNotPrivateIp(bareHost, 6, 'host')
    return
  }
  // Hostname — must DNS-resolve and validate every A/AAAA address.
  const lookup = opts.lookup ?? (dnsLookupDefault as unknown as DnsLookupFn)
  let addrs: DnsLookupResult[]
  try {
    addrs = await lookup(bareHost, { all: true })
  } catch (e) {
    throw new Error(`URL_INVALID: dns_lookup_failed for ${bareHost}: ${(e as Error).message}`)
  }
  if (addrs.length === 0) {
    throw new Error(`URL_INVALID: dns_lookup_empty for ${bareHost}`)
  }
  for (const { address, family } of addrs) {
    assertNotPrivateIp(address, family, bareHost)
  }
}

/**
 * Top-level capture. Drives a Playwright-shaped PageLike through navigation + sampling.
 * Pure orchestration; no Playwright import here so this file stays runnable in jsdom for tests.
 *
 * If `opts.capture` is provided, returns its result directly (for testing/mocks).
 */
export async function captureSnapshot(
  url: string,
  driver: BrowserDriverFactory,
  opts: ExtractOptions = {},
): Promise<CapturedSnapshot> {
  if (opts.capture) return opts.capture(url, opts)

  const guard = opts.ssrfGuard || defaultSsrfGuard
  await guard(url)

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const scrollGraceMs = opts.scrollGraceMs ?? DEFAULT_SCROLL_GRACE_MS

  const page = await driver.newPage()
  const startedAt = Date.now()

  // Install per-request guard BEFORE goto so every redirect hop is validated
  // against the same SSRF rules. Without this, a public URL that 302s to
  // 169.254.169.254 would be fetched before any post-goto check could fire.
  let blockedRedirect: string | null = null
  await page.interceptMainFrameRequests(async reqUrl => {
    try {
      await guard(reqUrl)
      return true
    } catch (e) {
      if (!blockedRedirect) blockedRedirect = `${reqUrl} (${(e as Error).message})`
      return false
    }
  })

  try {
    let response: NavigationResponse | null = null
    try {
      response = await page.goto(url, { timeout: timeoutMs, waitUntil: 'networkidle' })
    } catch (e) {
      if (blockedRedirect) {
        throw new Error(`URL_INVALID: navigation aborted at redirect target ${blockedRedirect}`)
      }
      throw new Error(`NAVIGATION_TIMEOUT: ${(e as Error).message}`)
    }

    const status = response?.status() ?? 0
    if (status >= 400) {
      if (status === 403 || status === 429 || status === 503) {
        throw new Error(`BOT_BLOCKED_${status}`)
      }
      throw new Error(`NAVIGATION_FAILED: status ${status}`)
    }
    const finalUrl = response?.url() ?? page.url()

    // Scroll to bottom + grace to surface lazy content.
    await page.evaluate(`window.scrollTo(0, document.body.scrollHeight)`)
    await page.waitForTimeout(scrollGraceMs)
    await page.evaluate(`window.scrollTo(0, 0)`)
    await page.waitForTimeout(150)

    const [hero, computedStyles, mediaQueries, mode, copyText, title] = await Promise.all([
      page.evaluate<HeroDetection>(HERO_DETECTION_SCRIPT),
      page.evaluate<ComputedStyleSample[]>(SAMPLE_COMPUTED_STYLES_SCRIPT),
      page.evaluate<string[]>(EXTRACT_MEDIA_QUERIES_SCRIPT),
      page.evaluate<'light' | 'dark' | 'cream'>(DETECT_MODE_SCRIPT),
      page.evaluate<string>(EXTRACT_COPY_TEXT_SCRIPT),
      page.title(),
    ])

    const metaDescription = await page
      .evaluate<string>(
        `(() => { const m = document.querySelector('meta[name="description"]'); return m ? (m as HTMLMetaElement).content : ''; })()`,
      )
      .catch(() => '')

    const domHtml = await page.content()
    let screenshotPng: Buffer | null = null
    try {
      screenshotPng = await page.screenshot({ type: 'png', fullPage: false })
    } catch {
      screenshotPng = null
    }

    return {
      url,
      finalUrl,
      capturedAt: new Date().toISOString(),
      title: title || '',
      metaDescription: metaDescription || undefined,
      mode,
      screenshotPng,
      domHtml,
      computedStyles,
      hero,
      copyText,
      mediaQueries,
      loadTimeMs: Date.now() - startedAt,
    }
  } finally {
    await page.close().catch(() => {})
  }
}
