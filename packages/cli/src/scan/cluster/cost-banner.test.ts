import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { confirmLlmRun, estimateCost, formatBanner } from './cost-banner.js'
import type { CostBannerInput } from './cost-banner.js'

function mkBanner(overrides: Partial<CostBannerInput> = {}): CostBannerInput {
  return {
    totalClusters: 100,
    cachedClusters: 60,
    uncachedClusters: 40,
    chunks: 1,
    estimatedInputTokens: 30_000,
    estimatedOutputTokens: 2_000,
    model: 'claude-sonnet-4-6',
    designPath: null,
    designBytes: 0,
    ...overrides,
  }
}

describe('estimateCost', () => {
  it('computes sonnet pricing per MTok', () => {
    expect(estimateCost({ inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(3.0, 2)
    expect(estimateCost({ inputTokens: 0, outputTokens: 1_000_000 })).toBeCloseTo(15.0, 2)
    expect(estimateCost({ inputTokens: 500_000, outputTokens: 100_000 })).toBeCloseTo(1.5 + 1.5, 2)
  })
})

describe('formatBanner', () => {
  it('renders DESIGN.md detected line when present', () => {
    const out = formatBanner(mkBanner({ designPath: './DESIGN.md', designBytes: 18_400 }))
    expect(out).toContain('detected at ./DESIGN.md')
    expect(out).toContain('18.0KB')
  })

  it('renders no-design line when absent', () => {
    const out = formatBanner(mkBanner({ designPath: null, designBytes: 0 }))
    expect(out).toContain('none detected')
  })

  it('shows cache hit/miss split', () => {
    const out = formatBanner(mkBanner({ totalClusters: 1067, cachedClusters: 712, uncachedClusters: 355 }))
    expect(out).toContain('712 hit')
    expect(out).toContain('355 miss')
    expect(out).toContain('1067 total')
  })

  it('formats large token counts as K', () => {
    const out = formatBanner(mkBanner({ estimatedInputTokens: 45_000 }))
    expect(out).toContain('45.0K')
  })

  it('shows a cost RANGE (floor → ceiling) so it never under-quotes repairs', () => {
    // 500K in ($1.50) + 100K out ($1.50) = $3.00 floor; ceiling = 3x = $9.00.
    const out = formatBanner(mkBanner({ estimatedInputTokens: 500_000, estimatedOutputTokens: 100_000 }))
    expect(out).toContain('$3.00–$9.00')
    expect(out).toContain('clean pass → with repair retries')
    expect(out).toContain('--eval-judge adds')
  })
})

describe('confirmLlmRun', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stderrSpy: any
  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })
  afterEach(() => {
    stderrSpy.mockRestore()
  })

  it('returns true when --yes is passed', async () => {
    const result = await confirmLlmRun(mkBanner(), { assumeYes: true, isTTY: true })
    expect(result).toBe(true)
  })

  it('returns true when all clusters cached (no SDK call needed)', async () => {
    const result = await confirmLlmRun(mkBanner({ totalClusters: 100, cachedClusters: 100, uncachedClusters: 0 }), {
      assumeYes: false,
      isTTY: false,
    })
    expect(result).toBe(true)
  })

  it('throws on non-TTY without --yes (CI safety)', async () => {
    await expect(confirmLlmRun(mkBanner(), { assumeYes: false, isTTY: false })).rejects.toThrow(
      /interactive confirmation or `--yes`/,
    )
  })

  it('returns true on "y" input from TTY', async () => {
    const reader = vi.fn().mockResolvedValue('y')
    const result = await confirmLlmRun(mkBanner(), { assumeYes: false, isTTY: true, promptReader: reader })
    expect(result).toBe(true)
    expect(reader).toHaveBeenCalled()
  })

  it('returns true on "YES" (case-insensitive)', async () => {
    const reader = vi.fn().mockResolvedValue('YES')
    const result = await confirmLlmRun(mkBanner(), { assumeYes: false, isTTY: true, promptReader: reader })
    expect(result).toBe(true)
  })

  it('returns false on empty input', async () => {
    const reader = vi.fn().mockResolvedValue('')
    const result = await confirmLlmRun(mkBanner(), { assumeYes: false, isTTY: true, promptReader: reader })
    expect(result).toBe(false)
  })

  it('returns false on "n" input', async () => {
    const reader = vi.fn().mockResolvedValue('n')
    const result = await confirmLlmRun(mkBanner(), { assumeYes: false, isTTY: true, promptReader: reader })
    expect(result).toBe(false)
  })
})
