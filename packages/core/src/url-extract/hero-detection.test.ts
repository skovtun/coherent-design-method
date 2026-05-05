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
    it('returns h1 when present (stripe-pattern)', () => {
      document.body.innerHTML = '<h1>Build a real online business</h1>'
      const h1 = document.querySelector('h1')!
      setStyle(h1, { 'font-size': '56px' })
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
