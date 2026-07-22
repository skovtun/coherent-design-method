import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CapturedSnapshot, SemanticLlmOutput } from '@getcoherent/core'
import { parseSettleMs, SettleMsParseError, isStdoutSink, captureExtraction } from './extract.js'
import { createPlaywrightDriver } from '../url-extract/playwright-driver.js'
import { createAnthropicSemanticCall } from '../url-extract/anthropic-semantic-call.js'
import { captureSnapshot } from '@getcoherent/core'

// The browser and the LLM are the only two things `captureExtraction` cannot
// run in-process. Mock exactly those two boundaries and let everything else
// (SSRF guard, resolver pinning, token extraction, semantic validation,
// driver lifecycle) run for real — that is the part that regresses.
vi.mock('../url-extract/playwright-driver.js', () => ({ createPlaywrightDriver: vi.fn() }))
vi.mock('../url-extract/anthropic-semantic-call.js', () => ({ createAnthropicSemanticCall: vi.fn() }))
vi.mock('@getcoherent/core', async importOriginal => {
  const actual = await importOriginal<typeof import('@getcoherent/core')>()
  return { ...actual, captureSnapshot: vi.fn() }
})

describe('parseSettleMs', () => {
  it('returns undefined when raw is undefined', () => {
    expect(parseSettleMs(undefined)).toBeUndefined()
  })

  it('accepts non-negative integer strings', () => {
    expect(parseSettleMs('0')).toBe(0)
    expect(parseSettleMs('1500')).toBe(1500)
    expect(parseSettleMs('  300  ')).toBe(300)
  })

  it('rejects floats — codex P3 (parseInt would silently truncate "1.5" to 1)', () => {
    expect(() => parseSettleMs('1.5')).toThrow(SettleMsParseError)
    expect(() => parseSettleMs('1.5')).toThrow(/non-negative integer.*1\.5/)
  })

  it('rejects strings with trailing units — codex P3 (parseInt would accept "1s" as 1)', () => {
    expect(() => parseSettleMs('1s')).toThrow(SettleMsParseError)
    expect(() => parseSettleMs('100abc')).toThrow(SettleMsParseError)
    expect(() => parseSettleMs('1500ms')).toThrow(SettleMsParseError)
  })

  it('rejects negatives', () => {
    expect(() => parseSettleMs('-100')).toThrow(SettleMsParseError)
  })

  it('rejects empty / whitespace-only', () => {
    expect(() => parseSettleMs('')).toThrow(SettleMsParseError)
    expect(() => parseSettleMs('   ')).toThrow(SettleMsParseError)
  })

  it('rejects non-decimal numerics', () => {
    expect(() => parseSettleMs('0x10')).toThrow(SettleMsParseError)
    expect(() => parseSettleMs('1e3')).toThrow(SettleMsParseError)
  })
})

describe('isStdoutSink', () => {
  it('matches the canonical stdout sink markers', () => {
    expect(isStdoutSink('-')).toBe(true)
    expect(isStdoutSink('-.json')).toBe(true)
    expect(isStdoutSink('-.md')).toBe(true)
    expect(isStdoutSink('-.markdown')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isStdoutSink('-.MD')).toBe(true)
    expect(isStdoutSink('-.MARKDOWN')).toBe(true)
  })

  it('returns false for file paths and unset', () => {
    expect(isStdoutSink(undefined)).toBe(false)
    expect(isStdoutSink('out.json')).toBe(false)
    expect(isStdoutSink('design.md')).toBe(false)
  })
})

// ── captureExtraction — the pipeline shared by the CLI and the MCP tool ──────
//
// A public IP LITERAL is used as the test URL on purpose: defaultSsrfGuard
// short-circuits literals before DNS, so the suite never touches the network.
const PUBLIC_URL = 'https://93.184.216.34/'

const mockedCreateDriver = vi.mocked(createPlaywrightDriver)
const mockedSemanticCall = vi.mocked(createAnthropicSemanticCall)
const mockedCaptureSnapshot = vi.mocked(captureSnapshot)

function fakeSnapshot(overrides: Partial<CapturedSnapshot> = {}): CapturedSnapshot {
  return {
    url: PUBLIC_URL,
    finalUrl: PUBLIC_URL,
    capturedAt: '2026-07-22T12:00:00.000Z',
    title: 'Example',
    metaDescription: 'An example page',
    mode: 'light',
    screenshotPng: null,
    domHtml: '<html></html>',
    computedStyles: [
      {
        selector: 'body',
        role: 'body',
        styles: {
          color: 'rgb(17, 17, 17)',
          'background-color': 'rgb(255, 255, 255)',
          'font-family': 'Inter, sans-serif',
          'font-size': '16px',
        },
      },
      {
        selector: 'h1',
        role: 'h1',
        styles: { color: 'rgb(17, 17, 17)', 'font-size': '48px', 'font-weight': '700' },
      },
      {
        selector: 'button',
        role: 'button-primary',
        styles: {
          'background-color': 'rgb(99, 91, 255)',
          color: 'rgb(255, 255, 255)',
          'border-radius': '8px',
          padding: '12px 24px',
          transition: 'all 200ms cubic-bezier(0.25, 1, 0.5, 1)',
        },
      },
    ],
    hero: { text: 'Payments infrastructure', fontSize: 48, source: 'h1' },
    copyText: 'Payments infrastructure for the internet',
    mediaQueries: ['(min-width: 768px)'],
    loadTimeMs: 1234,
    networkSettled: true,
    ...overrides,
  }
}

/** A schema-valid semantic payload — colorRoles are pinned to the palette after parse. */
const VALID_SEMANTIC: SemanticLlmOutput = {
  summary: 'Confident fintech with electric indigo on white.',
  colorRoles: [{ hex: '#635bff', role: 'brand' }],
  voice: { tone: ['confident', 'technical'], samples: [{ source: 'hero', text: 'Payments infrastructure' }] },
  density: 'comfortable',
  perCategoryConfidence: { color: { level: 'high' } },
}

function fakeDriver() {
  return { newPage: vi.fn(), close: vi.fn().mockResolvedValue(undefined) }
}

describe('captureExtraction — SSRF gate runs before the browser launches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedCreateDriver.mockResolvedValue(fakeDriver() as never)
    mockedCaptureSnapshot.mockResolvedValue(fakeSnapshot())
  })

  it('refuses loopback and never launches Chromium', async () => {
    await expect(captureExtraction('http://127.0.0.1:8080/')).rejects.toThrow(/loopback/i)
    expect(mockedCreateDriver).not.toHaveBeenCalled()
  })

  it('refuses localhost by name', async () => {
    await expect(captureExtraction('http://localhost:3000/')).rejects.toThrow(/localhost/i)
    expect(mockedCreateDriver).not.toHaveBeenCalled()
  })

  it('refuses the cloud metadata address', async () => {
    await expect(captureExtraction('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(/169\.254/)
    expect(mockedCreateDriver).not.toHaveBeenCalled()
  })

  it('refuses private RFC1918 space', async () => {
    await expect(captureExtraction('http://10.0.0.5/')).rejects.toThrow(/private/i)
    await expect(captureExtraction('http://192.168.1.1/')).rejects.toThrow(/private/i)
    expect(mockedCreateDriver).not.toHaveBeenCalled()
  })

  it('refuses non-http(s) schemes (zod .url() alone would let file:// through)', async () => {
    await expect(captureExtraction('file:///etc/passwd')).rejects.toThrow(/scheme/i)
    expect(mockedCreateDriver).not.toHaveBeenCalled()
  })
})

describe('captureExtraction — driver lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedCaptureSnapshot.mockResolvedValue(fakeSnapshot())
  })

  it('pins Chromium DNS to the validated address and honors headless', async () => {
    const driver = fakeDriver()
    mockedCreateDriver.mockResolvedValue(driver as never)

    await captureExtraction(PUBLIC_URL, { headless: false })

    expect(mockedCreateDriver).toHaveBeenCalledWith({
      headless: false,
      hostResolverRules: 'MAP 93.184.216.34 93.184.216.34',
    })
  })

  it('defaults to headless', async () => {
    mockedCreateDriver.mockResolvedValue(fakeDriver() as never)
    await captureExtraction(PUBLIC_URL)
    expect(mockedCreateDriver).toHaveBeenCalledWith(expect.objectContaining({ headless: true }))
  })

  it('closes the browser on the happy path', async () => {
    const driver = fakeDriver()
    mockedCreateDriver.mockResolvedValue(driver as never)
    await captureExtraction(PUBLIC_URL)
    expect(driver.close).toHaveBeenCalledTimes(1)
  })

  it('closes the browser when the capture throws (no leaked Chromium)', async () => {
    const driver = fakeDriver()
    mockedCreateDriver.mockResolvedValue(driver as never)
    mockedCaptureSnapshot.mockRejectedValue(new Error('NAVIGATION_TIMEOUT'))

    await expect(captureExtraction(PUBLIC_URL)).rejects.toThrow('NAVIGATION_TIMEOUT')
    expect(driver.close).toHaveBeenCalledTimes(1)
  })

  it('surfaces the missing-Playwright hint instead of a cryptic import error', async () => {
    mockedCreateDriver.mockRejectedValue(new Error('PLAYWRIGHT_NOT_INSTALLED: `coherent extract` needs Playwright.'))
    await expect(captureExtraction(PUBLIC_URL)).rejects.toThrow(/PLAYWRIGHT_NOT_INSTALLED/)
  })

  it('forwards timeout and settle windows to the snapshot layer', async () => {
    mockedCreateDriver.mockResolvedValue(fakeDriver() as never)
    await captureExtraction(PUBLIC_URL, { timeoutMs: 45_000, settleMs: 1500 })
    expect(mockedCaptureSnapshot).toHaveBeenCalledWith(PUBLIC_URL, expect.anything(), {
      timeoutMs: 45_000,
      settleMs: 1500,
    })
  })
})

describe('captureExtraction — payload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedCreateDriver.mockResolvedValue(fakeDriver() as never)
    mockedCaptureSnapshot.mockResolvedValue(fakeSnapshot())
  })

  it('returns source + hero + real deterministic tokens, semantic off by default', async () => {
    const payload = await captureExtraction(PUBLIC_URL)

    expect(payload.source).toEqual({
      url: PUBLIC_URL,
      finalUrl: PUBLIC_URL,
      capturedAt: '2026-07-22T12:00:00.000Z',
      mode: 'light',
      title: 'Example',
      loadTimeMs: 1234,
    })
    expect(payload.hero.text).toBe('Payments infrastructure')
    // Token extraction is NOT mocked — the brand color must survive the real pipeline.
    expect(payload.tokens.colors.map(c => c.hex.toLowerCase())).toContain('#635bff')
    expect(payload.tokens.typography.scale.length).toBeGreaterThan(0)
    expect(payload.semantic).toBeNull()
    expect(mockedSemanticCall).not.toHaveBeenCalled()
  })

  it('fires the progress hooks in pipeline order', async () => {
    const order: string[] = []
    await captureExtraction(
      PUBLIC_URL,
      {},
      {
        onLaunch: () => order.push('launch'),
        onNavigate: () => order.push('navigate'),
        onExtract: () => order.push('extract'),
        onCaptured: () => order.push('captured'),
      },
    )
    expect(order).toEqual(['launch', 'navigate', 'extract', 'captured'])
  })
})

describe('captureExtraction — semantic pass', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedCreateDriver.mockResolvedValue(fakeDriver() as never)
    mockedCaptureSnapshot.mockResolvedValue(fakeSnapshot())
  })

  it('attaches the semantic layer when the LLM returns valid output', async () => {
    mockedSemanticCall.mockReturnValue(vi.fn().mockResolvedValue({ text: JSON.stringify(VALID_SEMANTIC) }) as never)
    const onSemanticDone = vi.fn()

    const payload = await captureExtraction(PUBLIC_URL, { semantic: true }, { onSemanticDone })

    expect(payload.semantic?.density).toBe('comfortable')
    expect(payload.semantic?.voice.tone).toContain('confident')
    // colorRoles are pinned to the deterministic palette — #635bff is in it.
    expect(payload.semantic?.colorRoles).toEqual([{ hex: '#635bff', role: 'brand' }])
    expect(onSemanticDone).toHaveBeenCalledTimes(1)
  })

  it('degrades to semantic:null when the LLM output fails schema validation', async () => {
    mockedSemanticCall.mockReturnValue(vi.fn().mockResolvedValue({ text: '{"nope":true}' }) as never)
    const onSemanticError = vi.fn()

    const payload = await captureExtraction(PUBLIC_URL, { semantic: true }, { onSemanticError })

    expect(payload.semantic).toBeNull()
    expect(payload.tokens.colors.length).toBeGreaterThan(0) // deterministic layer survives
    expect(onSemanticError).toHaveBeenCalledWith(expect.stringContaining('LLM output invalid'))
  })

  it('degrades to semantic:null when the LLM call itself throws (missing API key)', async () => {
    mockedSemanticCall.mockImplementation(() => {
      throw new Error('ANTHROPIC_API_KEY is not set')
    })
    const onSemanticError = vi.fn()

    const payload = await captureExtraction(PUBLIC_URL, { semantic: true }, { onSemanticError })

    expect(payload.semantic).toBeNull()
    expect(onSemanticError).toHaveBeenCalledWith(expect.stringContaining('ANTHROPIC_API_KEY'))
  })

  it('still closes the browser when the semantic pass fails', async () => {
    const driver = fakeDriver()
    mockedCreateDriver.mockResolvedValue(driver as never)
    mockedSemanticCall.mockImplementation(() => {
      throw new Error('boom')
    })
    await captureExtraction(PUBLIC_URL, { semantic: true })
    expect(driver.close).toHaveBeenCalledTimes(1)
  })
})
