// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { detectHeroInPage } from './browser-capture.js'

/**
 * happy-dom does NOT layout, so getBoundingClientRect returns zeros and
 * getComputedStyle returns CSS-cascade-derived values only (no layout).
 * Tier 2 in detectHeroInPage filters by rect.width > 0 — so we patch
 * getBoundingClientRect on test elements to fake layout.
 */
function fakeRect(el: Element, top: number, width: number, height: number): void {
  ;(el as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
    ({
      top,
      left: 0,
      right: width,
      bottom: top + height,
      width,
      height,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect
}

/** happy-dom returns empty fontSize until styles are inlined. Helper inlines them. */
function setStyle(el: Element, css: Record<string, string>): void {
  const inline = Object.entries(css)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ')
  ;(el as HTMLElement).setAttribute('style', inline)
}

describe('detectHeroInPage (3-tier, happy-dom)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.body.removeAttribute('style')
  })

  describe('Tier 1: semantic <h1>', () => {
    it('returns h1 when present and visible (stripe-pattern)', () => {
      document.body.innerHTML = '<h1>Build a real online business</h1>'
      const h1 = document.querySelector('h1')!
      setStyle(h1, { 'font-size': '56px' })
      fakeRect(h1, 100, 800, 90)
      const r = detectHeroInPage()
      expect(r.source).toBe('h1')
      expect(r.text).toBe('Build a real online business')
      expect(r.fontSize).toBe(56)
      expect(r.selector).toBe('h1')
    })

    it('skips empty <h1> and falls to Tier 2', () => {
      document.body.innerHTML = '<h1></h1><div>Pretend Hero</div>'
      const div = document.querySelector('div')!
      setStyle(div, { 'font-size': '72px' })
      fakeRect(div, 100, 800, 200)
      const r = detectHeroInPage()
      expect(r.source).not.toBe('h1')
    })

    // P2 fix coverage (codex iter-4): hidden SEO/a11y h1 + visual hero in
    // styled divs is a common pattern. Pre-fix, we returned the hidden text.
    it('skips display:none h1 and falls to Tier 2', () => {
      document.body.innerHTML = '<h1>Hidden SEO Title</h1><div id="hero">Real Hero</div>'
      const h1 = document.querySelector('h1')!
      setStyle(h1, { 'font-size': '32px', display: 'none' })
      // happy-dom doesn't compute layout for display:none — fakeRect(0,0,0)
      // models how a real browser would report it.
      fakeRect(h1, 0, 0, 0)
      const hero = document.querySelector('#hero')!
      setStyle(hero, { 'font-size': '64px' })
      fakeRect(hero, 100, 800, 100)
      const r = detectHeroInPage()
      expect(r.source).toBe('largest-visible-text')
      expect(r.text).toBe('Real Hero')
    })

    it('skips visibility:hidden h1 (sr-only-style) and falls to Tier 2', () => {
      document.body.innerHTML = '<h1>screenreader only</h1><div id="hero">Visible Hero</div>'
      const h1 = document.querySelector('h1')!
      setStyle(h1, { 'font-size': '24px', visibility: 'hidden' })
      fakeRect(h1, 100, 600, 30) // sr-only often has rect but hidden
      const hero = document.querySelector('#hero')!
      setStyle(hero, { 'font-size': '72px' })
      fakeRect(hero, 100, 800, 100)
      const r = detectHeroInPage()
      expect(r.source).toBe('largest-visible-text')
      expect(r.text).toBe('Visible Hero')
    })

    it('skips opacity:0 h1 and falls to Tier 2', () => {
      document.body.innerHTML = '<h1>fully transparent</h1><div id="hero">Real Hero</div>'
      const h1 = document.querySelector('h1')!
      setStyle(h1, { 'font-size': '40px', opacity: '0' })
      fakeRect(h1, 100, 600, 50)
      const hero = document.querySelector('#hero')!
      setStyle(hero, { 'font-size': '60px' })
      fakeRect(hero, 100, 800, 80)
      const r = detectHeroInPage()
      expect(r.source).toBe('largest-visible-text')
      expect(r.text).toBe('Real Hero')
    })

    // P2 fix coverage (codex iter-5): sr-only patterns that have non-zero rect
    // but are off-screen (left: -9999px) or clipped (1px×1px). Pre-fix these
    // passed the basic visibility check.
    it('skips off-screen position:-9999px h1 (sr-only pattern)', () => {
      document.body.innerHTML = '<h1>off-screen SEO title</h1><div id="hero">Visible Hero</div>'
      const h1 = document.querySelector('h1')!
      setStyle(h1, { 'font-size': '32px', position: 'absolute', left: '-9999px' })
      // Off-screen rect: positioned far left of viewport.
      ;(h1 as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
        ({
          top: 0,
          left: -9999,
          right: -9799,
          bottom: 40,
          width: 200,
          height: 40,
          x: -9999,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect
      const hero = document.querySelector('#hero')!
      setStyle(hero, { 'font-size': '64px' })
      fakeRect(hero, 100, 800, 100)
      const r = detectHeroInPage()
      expect(r.source).toBe('largest-visible-text')
      expect(r.text).toBe('Visible Hero')
    })

    it('skips 1×1px clipped h1 (clip:rect(0,0,0,0) sr-only pattern)', () => {
      document.body.innerHTML = '<h1>clipped a11y title</h1><div id="hero">Real Hero</div>'
      const h1 = document.querySelector('h1')!
      setStyle(h1, { 'font-size': '32px' })
      // 1px × 1px = 1px² visible area, below 100px² threshold.
      fakeRect(h1, 100, 1, 1)
      const hero = document.querySelector('#hero')!
      setStyle(hero, { 'font-size': '64px' })
      fakeRect(hero, 100, 800, 100)
      const r = detectHeroInPage()
      expect(r.source).toBe('largest-visible-text')
      expect(r.text).toBe('Real Hero')
    })
  })

  describe('Tier 2: largest visible text in viewport', () => {
    it('returns largest visible text when h1 absent (awwwards/larevoltosa-pattern)', () => {
      // Custom hero markup: a <div> with display-sized text, no h1 anywhere.
      document.body.innerHTML = `
        <header>
          <div class="logo">site</div>
          <nav><a>menu</a></nav>
        </header>
        <main>
          <div id="hero">EDITORIAL DESIGN STUDIO</div>
          <p>some body copy here, smaller than hero</p>
        </main>
      `
      const hero = document.querySelector('#hero')!
      setStyle(hero, { 'font-size': '93px' }) // larevoltosa Teko 93px display
      fakeRect(hero, 200, 1200, 110)

      const p = document.querySelector('p')!
      setStyle(p, { 'font-size': '16px' })
      fakeRect(p, 320, 800, 24)

      const logo = document.querySelector('.logo')!
      setStyle(logo, { 'font-size': '14px' })
      fakeRect(logo, 20, 60, 20)

      const r = detectHeroInPage()
      expect(r.source).toBe('largest-visible-text')
      expect(r.text).toBe('EDITORIAL DESIGN STUDIO')
      expect(r.fontSize).toBe(93)
      expect(r.selector).toBe('div')
    })

    it('ignores elements outside the viewport', () => {
      document.body.innerHTML = '<div id="below">far below fold</div><div id="hero">visible hero</div>'
      const below = document.querySelector('#below')!
      setStyle(below, { 'font-size': '120px' })
      fakeRect(below, 5000, 1200, 200) // below window.innerHeight

      const hero = document.querySelector('#hero')!
      setStyle(hero, { 'font-size': '48px' })
      fakeRect(hero, 100, 800, 80)

      const r = detectHeroInPage()
      expect(r.text).toBe('visible hero')
      expect(r.fontSize).toBe(48)
    })

    it('ignores zero-size + visibility:hidden + opacity:0 elements', () => {
      document.body.innerHTML = `
        <div id="zero">zero</div>
        <div id="hidden">hidden</div>
        <div id="invisible">invisible</div>
        <div id="hero">real hero</div>
      `
      const zero = document.querySelector('#zero')!
      setStyle(zero, { 'font-size': '200px' })
      fakeRect(zero, 100, 0, 0)

      const hidden = document.querySelector('#hidden')!
      setStyle(hidden, { 'font-size': '200px', visibility: 'hidden' })
      fakeRect(hidden, 100, 800, 100)

      const invisible = document.querySelector('#invisible')!
      setStyle(invisible, { 'font-size': '200px', opacity: '0' })
      fakeRect(invisible, 100, 800, 100)

      const hero = document.querySelector('#hero')!
      setStyle(hero, { 'font-size': '40px' })
      fakeRect(hero, 100, 800, 60)

      const r = detectHeroInPage()
      expect(r.text).toBe('real hero')
    })

    it('ignores wrapper-only elements (no direct text)', () => {
      // A wrapper containing a styled child should not steal the candidate spot.
      document.body.innerHTML = `
        <div id="wrapper"><span id="inner">actual hero</span></div>
        <div id="other">other text</div>
      `
      const wrapper = document.querySelector('#wrapper')!
      // wrapper has no direct text — should be skipped
      fakeRect(wrapper, 100, 800, 100)
      const inner = document.querySelector('#inner')!
      setStyle(inner, { 'font-size': '80px' })
      fakeRect(inner, 100, 600, 80)
      const other = document.querySelector('#other')!
      setStyle(other, { 'font-size': '20px' })
      fakeRect(other, 200, 400, 30)

      const r = detectHeroInPage()
      expect(r.text).toBe('actual hero')
      expect(r.fontSize).toBe(80)
    })
  })

  describe('Tier 2 top-half bias (issue #96 — awwwards pattern)', () => {
    // happy-dom default innerHeight is 800; top-half cutoff = 400.

    it('prefers a top-half hero over a below-fold giant when both ≥48px', () => {
      // Reproduces awwwards.com: real banner above the fold, project-title
      // overlay (HUGE) lower in the viewport. Pre-fix, "ASTRODITHER" won.
      document.body.innerHTML = `
        <h2 id="real-hero">DESIGN INSPIRATION</h2>
        <div id="overlay">FEATURED PROJECT TITLE</div>
      `
      const realHero = document.querySelector('#real-hero')!
      setStyle(realHero, { 'font-size': '64px' })
      fakeRect(realHero, 120, 1200, 80) // top-half (top=120, vh/2=400)

      const overlay = document.querySelector('#overlay')!
      setStyle(overlay, { 'font-size': '126px' }) // bigger
      fakeRect(overlay, 500, 1200, 200) // below midpoint, still in viewport

      const r = detectHeroInPage()
      expect(r.text).toBe('DESIGN INSPIRATION')
      expect(r.fontSize).toBe(64)
      expect(r.source).toBe('largest-visible-text')
    })

    it('falls back to the global-largest below-fold candidate if NO top-half candidate ≥48px exists', () => {
      // Edge case: every above-the-fold text is small (e.g. nav-only header)
      // and the only display-sized text is below the midpoint. Use it.
      document.body.innerHTML = `
        <nav><a id="navlink">menu</a></nav>
        <div id="below-hero">BIG TEXT BELOW MIDPOINT</div>
      `
      const navlink = document.querySelector('#navlink')!
      setStyle(navlink, { 'font-size': '14px' })
      fakeRect(navlink, 20, 60, 18) // top-half, but only 14px (< HERO_MIN_SIZE)

      const below = document.querySelector('#below-hero')!
      setStyle(below, { 'font-size': '92px' })
      fakeRect(below, 600, 1200, 120) // below midpoint, in viewport

      const r = detectHeroInPage()
      expect(r.text).toBe('BIG TEXT BELOW MIDPOINT')
      expect(r.fontSize).toBe(92)
    })

    it('does NOT prefer a top-half text under the 48px hero threshold', () => {
      // A 32px caption in the top half should not trump a real 96px display hero
      // farther down the viewport.
      document.body.innerHTML = `
        <span id="caption">tiny caption</span>
        <div id="display-hero">REAL DISPLAY HERO</div>
      `
      const caption = document.querySelector('#caption')!
      setStyle(caption, { 'font-size': '32px' }) // < HERO_MIN_SIZE
      fakeRect(caption, 50, 200, 20)

      const display = document.querySelector('#display-hero')!
      setStyle(display, { 'font-size': '96px' })
      fakeRect(display, 450, 1200, 130) // just below midpoint

      const r = detectHeroInPage()
      expect(r.text).toBe('REAL DISPLAY HERO')
      expect(r.fontSize).toBe(96)
    })

    it('picks the LARGEST among multiple top-half candidates ≥48px', () => {
      // Two heroes both above midpoint, both ≥48px. Largest wins.
      document.body.innerHTML = `
        <h2 id="primary">PRIMARY HERO</h2>
        <h3 id="secondary">SECONDARY</h3>
      `
      const primary = document.querySelector('#primary')!
      setStyle(primary, { 'font-size': '120px' })
      fakeRect(primary, 80, 1200, 130)

      const secondary = document.querySelector('#secondary')!
      setStyle(secondary, { 'font-size': '64px' })
      fakeRect(secondary, 250, 800, 80)

      const r = detectHeroInPage()
      expect(r.text).toBe('PRIMARY HERO')
      expect(r.fontSize).toBe(120)
    })

    it('treats elements scrolled above the fold (rect.top < 0) as top-half', () => {
      // Edge case: some pages scroll a sticky nav into negative rect.top.
      // Negative top = even more above-the-fold than midpoint.
      document.body.innerHTML = `
        <h2 id="scrolled">SCROLLED HERO</h2>
        <div id="overlay">OVERLAY</div>
      `
      const scrolled = document.querySelector('#scrolled')!
      setStyle(scrolled, { 'font-size': '72px' })
      fakeRect(scrolled, -20, 1200, 90) // top above viewport, still attached

      const overlay = document.querySelector('#overlay')!
      setStyle(overlay, { 'font-size': '110px' })
      fakeRect(overlay, 500, 1200, 130) // below midpoint

      const r = detectHeroInPage()
      expect(r.text).toBe('SCROLLED HERO')
      expect(r.fontSize).toBe(72)
    })
  })

  describe('Tier 3 escape: source none', () => {
    it('returns source:none on truly empty page', () => {
      document.body.innerHTML = ''
      const r = detectHeroInPage()
      expect(r.source).toBe('none')
      expect(r.text).toBeNull()
      expect(r.fontSize).toBeNull()
    })

    it('returns source:none when only structural empty wrappers exist', () => {
      document.body.innerHTML = '<div></div><section></section><header></header>'
      const r = detectHeroInPage()
      expect(r.source).toBe('none')
    })
  })
})
