/// <reference lib="dom" />
import { lookup as dnsLookupDefault } from 'node:dns/promises'
import type { CapturedSnapshot, ComputedStyleSample, ExtractOptions, HeroDetection } from './types.js'
import { defaultRobotsCheck } from './robots-check.js'

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
  goto(url: string, opts: { timeout: number; waitUntil: 'networkidle' | 'load' }): Promise<NavigationResponse | null>
  /**
   * Wait for a load state, rejecting on timeout. Used to reach `networkidle`
   * on a best-effort basis after the document has loaded — see the navigation
   * block in `captureSnapshot` for why this is not part of `goto`.
   */
  waitForLoadState(state: 'networkidle', opts: { timeout: number }): Promise<void>
  evaluate<T>(fn: string | ((...a: unknown[]) => T)): Promise<T>
  evaluate<T, A>(fn: string | ((arg: A) => T), arg: A): Promise<T>
  content(): Promise<string>
  screenshot(opts: { type: 'png'; fullPage: boolean }): Promise<Buffer>
  title(): Promise<string>
  url(): string
  waitForTimeout(ms: number): Promise<void>
  close(): Promise<void>
  /**
   * Intercept every request the page issues — main-frame navigation (initial +
   * each redirect hop) AND subresources (img/script/css/fetch/xhr). Handler
   * returns true to allow, false to abort. The `isNavigation` flag lets the
   * caller treat navigation aborts (which fail page.goto) differently from
   * subresource aborts (which are silent and don't crash navigation).
   *
   * Subresource interception is required for SSRF coverage: a public page can
   * include `<img src="http://169.254.169.254/...">` to probe internal hosts
   * even when the navigation URL itself is fine.
   */
  interceptRequests(handler: (url: string, isNavigation: boolean) => Promise<boolean>): Promise<void>
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
  // Tier 1: semantic <h1>, but ONLY if it's actually visible. SEO/a11y pages
  // often hide an off-screen h1 with sr-only / clip / display:none while the
  // visual hero text lives in styled divs. Pre-iter-4 we accepted any h1 with
  // text, returning hidden metadata as the hero. Now apply the same rect/
  // visibility/opacity gates Tier 2 uses.
  const h1 = document.querySelector<HTMLElement>('h1')
  if (h1) {
    const text = (h1.textContent || '').trim()
    if (text.length > 0) {
      const cs = getComputedStyle(h1)
      const rect = h1.getBoundingClientRect()
      // Visible-rect intersection with viewport. Catches sr-only patterns the
      // basic display/visibility/opacity check misses: position:-9999px (rect
      // off-screen, no intersection) and clip:rect(0,0,0,0) on 1px×1px (rect
      // 1px² below 100px² threshold).
      const vw = (window as Window).innerWidth || 1440
      const vh = (window as Window).innerHeight || 800
      const visW = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0))
      const visH = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0))
      const visibleArea = visW * visH
      // Mirror Tier 2's gating: only block when explicitly hidden. Default
      // opacity computes to '1' in real browsers but happy-dom returns '' →
      // parseFloat('') === NaN, which we accept as visible.
      const visible =
        rect.width > 0 &&
        rect.height > 0 &&
        visibleArea >= 100 &&
        cs.visibility !== 'hidden' &&
        cs.display !== 'none' &&
        parseFloat(cs.opacity) !== 0
      if (visible) {
        const fs = parseFloat(cs.fontSize)
        return {
          text,
          fontSize: Number.isFinite(fs) ? fs : null,
          source: 'h1',
          selector: 'h1',
        }
      }
    }
  }
  // Tier 2: largest visible text in viewport (works for awwwards/larevoltosa custom hero markup)
  type Candidate = { el: Element; size: number; text: string; top: number; depth: number }
  const candidates: Candidate[] = []
  const all = document.querySelectorAll<HTMLElement>('div, span, p, section, article, header, h2, h3, strong, em')
  const vh = (window as Window).innerHeight || 800

  for (const el of Array.from(all)) {
    const rect = el.getBoundingClientRect()
    // Must intersect the viewport at all: a sticky/animated element scrolled
    // fully above the fold has rect.top<0 AND rect.bottom<=0; pre-#96 the
    // size-only ranking masked the hole, but the new top-half bias would
    // otherwise pick those phantom heroes (codex challenge iter-1, P2).
    if (rect.top >= vh) continue
    if (rect.bottom <= 0) continue
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
    // DOM depth: ancestors up to <html>. Shallower = more likely a page-level
    // hero than a deep widget/showcase span.
    let depth = 0
    let p: Element | null = el.parentElement
    while (p) {
      depth++
      p = p.parentElement
    }
    candidates.push({ el, size, text: directText, top: rect.top, depth })
  }
  if (candidates.length === 0) {
    return { text: null, fontSize: null, source: 'none' }
  }

  // Score = fontSize penalized by log of DOM depth. Two candidates of equal
  // size: shallower (closer to <body>) wins. A 2× depth roughly costs 1 score
  // point — meaningful only when sizes are within ~2x. Pure largest-text
  // ordering still wins on big size deltas.
  const score = (c: Candidate): number => c.size / Math.log(c.depth + 2)
  candidates.sort((a, b) => score(b) - score(a))

  // Top-half bias (issue #96 part 1): the page hero almost always lives
  // above the fold's midpoint; below-fold giants are usually project
  // showcases or promotional overlays. When ANY candidate ≥48px sits in
  // the top half of the viewport, prefer the largest-scored among those;
  // otherwise fall back to the global largest. Items with rect.top < 0
  // (scrolled-above-the-fold but still attached) count as top-half.
  const HERO_MIN_SIZE = 48
  const topHalfCutoff = vh / 2
  const topHalfLarge = candidates.filter(c => c.size >= HERO_MIN_SIZE && c.top < topHalfCutoff)
  const winner = topHalfLarge.length > 0 ? topHalfLarge[0] : candidates[0]
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
 * Broad DOM harvest — the breadth pass that the 19-anchor sampler above cannot
 * provide. Walks the visible DOM and keeps every element that carries a
 * value-bearing visual signal (shadow, gradient, border, radius, backdrop-blur,
 * positive z-index) OR renders its own text. Each kept element is tagged with
 * the generic `element` role.
 *
 * Why this exists: real sites (Stripe, Vercel, Linear) render `<div>` + utility
 * classes, not `<h2>`/`<section>`/`<article>`, so the semantic-anchor sampler
 * finds one heading and no cards, and the shadow/gradient/border/type-scale
 * extractors come back nearly empty. This pass feeds those extractors the whole
 * page. It is INTENTIONALLY not consumed by the color / brand-salience / link /
 * form / icon / container extractors (see extractDesignTokens), so the tuned
 * palette logic keeps seeing only the curated anchors.
 *
 * Bounded for cost + noise: scans at most MAX_SCAN elements and keeps at most
 * MAX_KEEP. Self-contained (no outer refs) because it is stringified into
 * page.evaluate.
 */
export function sampleBroadElementsInPage(): Array<{
  selector: string
  role: 'element'
  styles: Record<string, string>
  text: boolean
}> {
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
  const MAX_SCAN = 5000
  const MAX_KEEP = 600
  const out: Array<{ selector: string; role: 'element'; styles: Record<string, string>; text: boolean }> = []
  const all = document.querySelectorAll('*')
  let scanned = 0
  for (let idx = 0; idx < all.length; idx++) {
    if (out.length >= MAX_KEEP || scanned >= MAX_SCAN) break
    scanned++
    const el = all[idx] as HTMLElement
    const rect = el.getBoundingClientRect()
    if (rect.width < 4 || rect.height < 4) continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue

    let hasText = false
    for (let c = 0; c < el.childNodes.length; c++) {
      const node = el.childNodes[c]
      if (node.nodeType === 3 && node.textContent && node.textContent.trim().length > 0) {
        hasText = true
        break
      }
    }
    const g = (k: string) => cs.getPropertyValue(k)
    const shadow = g('box-shadow')
    const bgImage = g('background-image')
    const radius = g('border-radius')
    const border = g('border')
    const backdrop = g('backdrop-filter')
    const zRaw = g('z-index')
    const z = parseInt(zRaw, 10)
    const hasSignal =
      (!!shadow && shadow !== 'none') ||
      (!!bgImage && bgImage !== 'none') ||
      (!!radius && radius !== '0px' && radius !== '') ||
      (!!border && border !== 'none' && !border.startsWith('0px')) ||
      (!!backdrop && backdrop !== 'none' && backdrop !== '') ||
      (Number.isFinite(z) && z > 0)
    if (!hasText && !hasSignal) continue

    const styles: Record<string, string> = {}
    for (let i = 0; i < styleProps.length; i++) {
      const v = cs.getPropertyValue(styleProps[i])
      if (v) styles[styleProps[i]] = v
    }
    out.push({ selector: el.tagName.toLowerCase(), role: 'element', styles, text: hasText })
  }
  return out
}
export const SAMPLE_BROAD_ELEMENTS_SCRIPT = `(${sampleBroadElementsInPage.toString()})()`

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
 * In-page background-mode detection. Returns 'light' | 'dark' | 'cream' based
 * on body background luminance.
 *
 * Default-canvas pages (no body background set) report `rgba(0,0,0,0)` here —
 * parsing that as black mislabeled them `dark`. Walk body → html → fall back
 * to light when every layer is transparent (the browser canvas is white).
 */
export function detectModeInPage(): 'light' | 'dark' | 'cream' {
  function parseOpaqueRgb(raw: string): { r: number; g: number; b: number } | null {
    const m = raw.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
    if (!m) return null
    const alpha = m[4] === undefined ? 1 : parseFloat(m[4])
    if (!Number.isFinite(alpha) || alpha === 0) return null
    return { r: parseInt(m[1], 10), g: parseInt(m[2], 10), b: parseInt(m[3], 10) }
  }
  const layers: { r: number; g: number; b: number } | null =
    parseOpaqueRgb(getComputedStyle(document.body).backgroundColor || '') ||
    parseOpaqueRgb(getComputedStyle(document.documentElement).backgroundColor || '')
  if (!layers) return 'light' // every layer transparent → browser canvas (white)
  const { r, g, b } = layers
  // Rec. 709 luminance
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  if (lum < 0.25) return 'dark'
  // cream = warm light bg (R+G > B by margin, mid-high luminance)
  if (lum > 0.85 && r + g > b * 2.1 && b < 245) return 'cream'
  return 'light'
}
export const DETECT_MODE_SCRIPT = `(${detectModeInPage.toString()})()`

/**
 * In-page meta-description extraction. Returns the meta[name=description] value
 * or empty string. Defined as an exported function (testable in happy-dom) and
 * stringified to an IIFE so page.evaluate gets pure JS — TS-syntax in a string
 * literal silently breaks at runtime because Chromium parses it as JS.
 */
export function extractMetaDescriptionInPage(): string {
  const m = document.querySelector('meta[name="description"]') as HTMLMetaElement | null
  return m ? m.content : ''
}
export const EXTRACT_META_DESCRIPTION_SCRIPT = `(${extractMetaDescriptionInPage.toString()})()`

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
    const [a, b, c, d] = [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10), parseInt(m[4], 10)]
    // IANA IPv4 Special-Purpose Address Registry (RFC 6890 + later updates).
    // We block every non-globally-routable range — codex iter-4 caught us
    // missing CGNAT (100.64/10, hosts Alibaba metadata at 100.100.100.200)
    // and benchmarking (198.18/15). Documentation/multicast/reserved are
    // non-routable but listed defensively for completeness.
    if (a === 0) throw new Error(`URL_INVALID: ${source} resolves to 0.0.0.0/8 current-network (${addr})`)
    if (a === 10) throw new Error(`URL_INVALID: ${source} resolves to private IPv4 10/8 (${addr})`)
    if (a === 100 && b >= 64 && b <= 127)
      throw new Error(`URL_INVALID: ${source} resolves to CGNAT 100.64/10 (${addr})`)
    if (a === 127) throw new Error(`URL_INVALID: ${source} resolves to loopback IPv4 127/8 (${addr})`)
    if (a === 169 && b === 254) throw new Error(`URL_INVALID: ${source} resolves to metadata IPv4 169.254/16 (${addr})`)
    if (a === 172 && b >= 16 && b <= 31)
      throw new Error(`URL_INVALID: ${source} resolves to private IPv4 172.16/12 (${addr})`)
    if (a === 192 && b === 0 && c === 0)
      throw new Error(`URL_INVALID: ${source} resolves to IETF protocol assignment 192.0.0/24 (${addr})`)
    if (a === 192 && b === 0 && c === 2)
      throw new Error(`URL_INVALID: ${source} resolves to TEST-NET-1 192.0.2/24 (${addr})`)
    if (a === 192 && b === 88 && c === 99)
      throw new Error(`URL_INVALID: ${source} resolves to 6to4 anycast 192.88.99/24 (${addr})`)
    if (a === 192 && b === 168) throw new Error(`URL_INVALID: ${source} resolves to private IPv4 192.168/16 (${addr})`)
    if (a === 198 && (b === 18 || b === 19))
      throw new Error(`URL_INVALID: ${source} resolves to benchmarking 198.18/15 (${addr})`)
    if (a === 198 && b === 51 && c === 100)
      throw new Error(`URL_INVALID: ${source} resolves to TEST-NET-2 198.51.100/24 (${addr})`)
    if (a === 203 && b === 0 && c === 113)
      throw new Error(`URL_INVALID: ${source} resolves to TEST-NET-3 203.0.113/24 (${addr})`)
    if (a >= 224 && a <= 239) throw new Error(`URL_INVALID: ${source} resolves to multicast 224/4 (${addr})`)
    if (a >= 240) throw new Error(`URL_INVALID: ${source} resolves to reserved 240/4 (${addr})`)
    if (a === 255 && b === 255 && c === 255 && d === 255)
      throw new Error(`URL_INVALID: ${source} resolves to broadcast 255.255.255.255 (${addr})`)
    return
  }
  // family === 6
  const lower = addr.toLowerCase()
  if (lower === '::1' || lower === '::') throw new Error(`URL_INVALID: ${source} resolves to IPv6 loopback (${addr})`)
  if (lower.startsWith('fe80:')) throw new Error(`URL_INVALID: ${source} resolves to IPv6 link-local (${addr})`)
  if (lower.startsWith('fc') || lower.startsWith('fd'))
    throw new Error(`URL_INVALID: ${source} resolves to IPv6 unique-local fc00::/7 (${addr})`)
  // IPv4-mapped IPv6 — re-check the v4 portion. WHATWG URL canonicalizes
  // `::ffff:127.0.0.1` to `::ffff:7f00:1`, so we must handle both:
  //   dotted form  ::ffff:a.b.c.d
  //   hex form     ::ffff:HHHH:HHHH    (each HHHH is 16 bits = 2 octets)
  const v4mappedDotted = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (v4mappedDotted) {
    assertNotPrivateIp(v4mappedDotted[1], 4, source)
    return
  }
  const v4mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (v4mappedHex) {
    const high = parseInt(v4mappedHex[1], 16)
    const low = parseInt(v4mappedHex[2], 16)
    const dotted = `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`
    assertNotPrivateIp(dotted, 4, source)
  }
}

/** Result of SSRF validation: the bare host + every IP that passed the private-IP check. */
export interface SsrfGuardResult {
  /** Bare hostname (brackets stripped) or IP literal as it appeared in the URL. */
  host: string
  /** Validated IP addresses (one per A/AAAA record for hostnames; one entry for IP literals). */
  addresses: DnsLookupResult[]
}

/**
 * Default SSRF guard. Async because hostnames must be DNS-resolved and every
 * resolved A/AAAA record validated — literal-string checks alone allow trivial
 * bypass via "internal.example → 10.0.0.5".
 *
 * Returns the validated addresses so callers can pin Chromium's resolver to
 * the same IPs (`--host-resolver-rules`), closing the DNS-rebinding window
 * between Node's lookup and Chromium's. Without pinning, an attacker domain
 * with very-short TTL can return a public IP to Node and a private IP to
 * Chromium milliseconds later.
 *
 * Pass `opts.lookup` to inject a stub resolver in tests.
 */
export async function defaultSsrfGuard(rawUrl: string, opts: { lookup?: DnsLookupFn } = {}): Promise<SsrfGuardResult> {
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
    return { host: bareHost, addresses: [{ address: bareHost, family: 4 }] }
  }
  if (ipv6Literal) {
    assertNotPrivateIp(bareHost, 6, 'host')
    return { host: bareHost, addresses: [{ address: bareHost, family: 6 }] }
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
  return { host: bareHost, addresses: addrs }
}

/**
 * Build a Chromium `--host-resolver-rules` value pinning a hostname to the
 * given IPv4/IPv6 addresses. Closes the DNS-rebind window between Node's
 * resolution and Chromium's: the browser will only ever connect to addresses
 * that already passed defaultSsrfGuard.
 *
 * Format per Chromium: "MAP host addr[, MAP host2 addr2 ...]". IPv6 addresses
 * must be bracketed.
 *
 * Caveat: only pins the supplied host. Cross-origin redirects/subresources
 * still hit Chromium's resolver — they get a fresh defaultSsrfGuard call via
 * interceptRequests, but a sufficiently aggressive attacker DNS could rebind
 * between that check and Chromium's connect.
 */
export function buildHostResolverRules(host: string, addresses: DnsLookupResult[]): string {
  if (addresses.length === 0) return ''
  return addresses.map(({ address, family }) => `MAP ${host} ${family === 6 ? `[${address}]` : address}`).join(',')
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

  // Honor robots.txt (RFC 9309). Default ON; pass `honorRobotsTxt: false` to opt out.
  // Fail-open on fetch failure (no robots.txt published = allowed). The robots
  // check runs its own SSRF guard on robots.txt URL via the same guard.
  if (opts.honorRobotsTxt !== false) {
    const guardForRobots = async (u: string): Promise<void> => {
      await guard(u)
    }
    const robotsCheck = opts.robotsCheck ?? ((u: string) => defaultRobotsCheck(u, { ssrfGuard: guardForRobots }))
    const result = await robotsCheck(url)
    if (!result.allowed) {
      throw new Error(`ROBOTS_DISALLOWED: ${result.matchedRule ?? result.reason}`)
    }
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const scrollGraceMs = opts.scrollGraceMs ?? DEFAULT_SCROLL_GRACE_MS
  const settleMs = opts.settleMs ?? 0

  const page = await driver.newPage()
  const startedAt = Date.now()

  // Install per-request guard BEFORE goto so every request is validated against
  // the same SSRF rules: main-frame navigation (initial + each redirect hop)
  // AND subresources. Without subresource coverage, a public page could embed
  // `<img src="http://169.254.169.254/...">` and the browser would fetch it.
  //
  // KNOWN RESIDUAL RISK — cross-origin DNS rebinding (codex iter-5).
  //
  // The initial host is pinned via Chromium `--host-resolver-rules`, so the
  // browser uses exactly the IPs Node validated. For cross-origin redirects
  // and subresources, this guard re-validates each new hostname via Node DNS,
  // but Chromium then performs its OWN DNS lookup for the connect. A
  // sufficiently aggressive attacker DNS (very low TTL, two A records served
  // alternately) can return a public IP to Node and 169.254/10.x to Chromium
  // milliseconds later — bypassing the per-request check for cross-origin.
  //
  // Closing this fully requires a route.fulfill-based proxy: Node fetches
  // every cross-origin URL with its validated IP pinned via `lookup` option,
  // and serves the response back to Chromium. ~80 LOC + TLS SNI + cookie
  // forwarding + content-encoding handling. Deferred to Week 2 hosted-service
  // hardening — for the local CLI tool, the user supplies the URL themselves
  // and the threat surface is limited.
  let blockedNavigation: string | null = null
  await page.interceptRequests(async (reqUrl, isNavigation) => {
    try {
      await guard(reqUrl)
      return true
    } catch (e) {
      // Navigation aborts crash page.goto and need to surface as a clear error.
      // Subresource aborts are silent (the page just renders without that asset).
      if (isNavigation && !blockedNavigation) {
        blockedNavigation = `${reqUrl} (${(e as Error).message})`
      }
      return false
    }
  })

  try {
    // Navigate on `load`, then reach for `networkidle` with whatever is left of
    // the timeout budget. Doing both in one `goto({ waitUntil: 'networkidle' })`
    // means a site whose network NEVER goes quiet (persistent analytics beacons,
    // websockets, polling) is unextractable: goto rejects and we lose a page that
    // was fully rendered seconds earlier. Observed 2026-07-16 on stripe.com and
    // figma.com — 2 of 12 gallery candidates, including the most canonical design
    // system of the set. Same total time budget as before; the only change is the
    // failure path now degrades to a usable capture instead of throwing.
    let response: NavigationResponse | null = null
    try {
      response = await page.goto(url, { timeout: timeoutMs, waitUntil: 'load' })
    } catch (e) {
      if (blockedNavigation) {
        throw new Error(`URL_INVALID: navigation aborted at redirect target ${blockedNavigation}`)
      }
      throw new Error(`NAVIGATION_TIMEOUT: ${(e as Error).message}`)
    }

    let networkSettled = true
    const idleBudgetMs = Math.max(0, timeoutMs - (Date.now() - startedAt))
    if (idleBudgetMs > 0) {
      try {
        await page.waitForLoadState('networkidle', { timeout: idleBudgetMs })
      } catch {
        networkSettled = false
      }
    } else {
      networkSettled = false
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

    // Optional animation settle window. networkidle fires when network goes
    // quiet, but Lottie/fade-in libs often kick off opacity:0→1 transitions
    // AFTER that. Hero detection landing inside the transition window picks
    // footer copyright instead of the actual headline (observed: larevoltosa.es).
    // Default 0 = no behavior change; opt-in via --settle-ms for animation-heavy sites.
    if (settleMs > 0) {
      await page.waitForTimeout(settleMs)
    }

    const [hero, anchorStyles, broadStyles, mediaQueries, mode, copyText, title] = await Promise.all([
      page.evaluate<HeroDetection>(HERO_DETECTION_SCRIPT),
      page.evaluate<ComputedStyleSample[]>(SAMPLE_COMPUTED_STYLES_SCRIPT),
      // The broad harvest can throw on pathological DOMs; degrade to anchors-only
      // rather than fail the whole capture.
      page.evaluate<ComputedStyleSample[]>(SAMPLE_BROAD_ELEMENTS_SCRIPT).catch(() => [] as ComputedStyleSample[]),
      page.evaluate<string[]>(EXTRACT_MEDIA_QUERIES_SCRIPT),
      page.evaluate<'light' | 'dark' | 'cream'>(DETECT_MODE_SCRIPT),
      page.evaluate<string>(EXTRACT_COPY_TEXT_SCRIPT),
      page.title(),
    ])
    // Anchors first (curated roles the color/state extractors read), then the
    // broad harvest (role 'element') that only the value-based extractors use.
    // Null-safe: mocked pages (and pathological evaluates) can return non-arrays.
    const computedStyles = [
      ...(Array.isArray(anchorStyles) ? anchorStyles : []),
      ...(Array.isArray(broadStyles) ? broadStyles : []),
    ]

    const metaDescription = await page.evaluate<string>(EXTRACT_META_DESCRIPTION_SCRIPT).catch(() => '')

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
      networkSettled,
    }
  } finally {
    await page.close().catch(() => {})
  }
}
