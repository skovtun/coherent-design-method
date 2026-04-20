import { describe, it, expect } from 'vitest'
import { validateCrossPage, extractStatCardSignature, type PageFile } from './cross-page-validator.js'

const plainStatCard = `
<Card>
  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
    <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
    <DollarSign className="h-4 w-4 text-muted-foreground" />
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold">$45,231.89</div>
    <p className="text-xs text-muted-foreground">+20.1% from last month</p>
  </CardContent>
</Card>`

const tintedBadgeStatCard = `
<Card>
  <CardContent className="p-6">
    <div className="flex items-center gap-4">
      <div className="rounded-lg bg-primary/10 p-2">
        <DollarSign className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1">
        <p className="text-sm text-muted-foreground">Revenue</p>
        <p className="text-3xl font-bold">$45,231</p>
        <Badge variant="success">+20.1%</Badge>
      </div>
    </div>
  </CardContent>
</Card>`

describe('extractStatCardSignature', () => {
  it('detects plain icon + inline trend', () => {
    const sig = extractStatCardSignature(plainStatCard)
    expect(sig).not.toBeNull()
    expect(sig!.icon_wrapper).toBe('plain')
    expect(sig!.trend).toBe('inline-text')
    expect(sig!.value_size).toBe('text-2xl')
  })

  it('detects tinted-square icon + badge trend', () => {
    const sig = extractStatCardSignature(tintedBadgeStatCard)
    expect(sig).not.toBeNull()
    expect(sig!.icon_wrapper).toBe('tinted-square')
    expect(sig!.trend).toBe('badge')
    expect(sig!.value_size).toBe('text-3xl')
  })

  it('returns null when card has no numeric value', () => {
    const notAStat = `<Card><CardHeader><CardTitle>Hello</CardTitle></CardHeader></Card>`
    expect(extractStatCardSignature(notAStat)).toBeNull()
  })

  it('returns null when card has no icon', () => {
    const noIcon = `<Card><CardContent><div className="text-2xl font-bold">$100</div></CardContent></Card>`
    expect(extractStatCardSignature(noIcon)).toBeNull()
  })

  // v2 fix: ICON_TAG_RE requires JSX tag context, not prose match.
  it('does not false-positive on icon words appearing in copy text', () => {
    const prose = `
<Card>
  <CardContent>
    <CardTitle>Award-winning product</CardTitle>
    <div className="text-2xl font-bold">$100M</div>
    <p>Trusted by Users everywhere</p>
  </CardContent>
</Card>`
    expect(extractStatCardSignature(prose)).toBeNull()
  })

  // v2 fix: NUMERIC_VALUE_RE now tolerates JSX expressions as values.
  it('recognizes JSX expression values like {formatCurrency(total)}', () => {
    const exprCard = `
<Card>
  <CardContent>
    <DollarSign className="h-4 w-4" />
    <div className="text-2xl font-bold">{formatCurrency(total)}</div>
    <p>+5% vs last month</p>
  </CardContent>
</Card>`
    const sig = extractStatCardSignature(exprCard)
    expect(sig).not.toBeNull()
    expect(sig!.value_size).toBe('text-2xl')
  })

  // v2 fix: NUMERIC_VALUE_RE accepts both class orderings (font-bold first or text-Nxl first).
  it('is order-independent for text-Nxl and font-bold within className', () => {
    const reordered = `
<Card>
  <DollarSign className="h-4 w-4" />
  <div className="font-bold text-2xl">$100</div>
</Card>`
    const sig = extractStatCardSignature(reordered)
    expect(sig).not.toBeNull()
    expect(sig!.value_size).toBe('text-2xl')
  })

  // v2 fix: text-4xl now a first-class signature value (not collapsed to 'other').
  it('promotes text-4xl to a distinct value_size signature', () => {
    const big = `
<Card>
  <DollarSign className="h-4 w-4" />
  <div className="text-4xl font-bold">$1B</div>
</Card>`
    const sig = extractStatCardSignature(big)
    expect(sig).not.toBeNull()
    expect(sig!.value_size).toBe('text-4xl')
  })

  // v2 fix: trend=badge only when Badge appears AFTER the value. A status chip
  // in CardHeader (before value) should NOT be misclassified as trend.
  it('ignores Badge elements that appear before the value (status chip in header)', () => {
    const cardWithHeaderBadge = `
<Card>
  <CardHeader>
    <CardTitle>Revenue</CardTitle>
    <Badge variant="outline">Live</Badge>
    <DollarSign className="h-4 w-4" />
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold">$45,231</div>
    <p>+5% from last week</p>
  </CardContent>
</Card>`
    const sig = extractStatCardSignature(cardWithHeaderBadge)
    expect(sig).not.toBeNull()
    expect(sig!.trend).toBe('inline-text')
  })

  // v2 fix: when an arrow-shaped icon (TrendingUp) is the HEADER icon, trend
  // should fall through — not be falsely classified arrow-icon based on
  // position-unaware detection.
  it('does not classify arrow-icon when arrow appears before the value', () => {
    const headerArrow = `
<Card>
  <CardHeader>
    <CardTitle>Growth</CardTitle>
    <TrendingUp className="h-4 w-4" />
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold">$1M</div>
    <p>+12% from prev quarter</p>
  </CardContent>
</Card>`
    const sig = extractStatCardSignature(headerArrow)
    expect(sig).not.toBeNull()
    expect(sig!.trend).toBe('inline-text')
  })
})

describe('validateCrossPage', () => {
  it('emits no issue when all pages use the same stat-card shape', () => {
    const pages: PageFile[] = [
      { path: 'app/(app)/dashboard/page.tsx', code: `${plainStatCard}\n${plainStatCard}` },
      { path: 'app/(app)/reports/page.tsx', code: plainStatCard },
    ]
    const issues = validateCrossPage(pages)
    expect(issues.filter(i => i.type === 'INCONSISTENT_CARD')).toHaveLength(0)
  })

  it('emits INCONSISTENT_CARD when two pages use different shapes', () => {
    const pages: PageFile[] = [
      { path: 'app/(app)/reports/page.tsx', code: `${plainStatCard}\n${plainStatCard}` },
      { path: 'app/(app)/investments/page.tsx', code: tintedBadgeStatCard },
    ]
    const issues = validateCrossPage(pages).filter(i => i.type === 'INCONSISTENT_CARD')
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].message).toMatch(/stat card/i)
    expect(issues[0].message).toMatch(/reports|investments/)
  })

  it('does not flag when only one card exists across all pages (insufficient sample)', () => {
    const pages: PageFile[] = [{ path: 'app/page.tsx', code: plainStatCard }]
    const issues = validateCrossPage(pages).filter(i => i.type === 'INCONSISTENT_CARD')
    expect(issues).toHaveLength(0)
  })

  it('does not flag when all pages use the same shape across many cards', () => {
    const pages: PageFile[] = [
      { path: 'app/(app)/dashboard/page.tsx', code: `${plainStatCard}\n${plainStatCard}\n${plainStatCard}` },
      { path: 'app/(app)/reports/page.tsx', code: `${plainStatCard}\n${plainStatCard}` },
      { path: 'app/(app)/investments/page.tsx', code: plainStatCard },
    ]
    const issues = validateCrossPage(pages).filter(i => i.type === 'INCONSISTENT_CARD')
    expect(issues).toHaveLength(0)
  })

  it('groups divergent cards by cluster and reports minority cluster', () => {
    const pages: PageFile[] = [
      { path: 'app/(app)/dashboard/page.tsx', code: plainStatCard },
      { path: 'app/(app)/reports/page.tsx', code: plainStatCard },
      { path: 'app/(app)/accounts/page.tsx', code: plainStatCard },
      { path: 'app/(app)/investments/page.tsx', code: tintedBadgeStatCard },
    ]
    const issues = validateCrossPage(pages).filter(i => i.type === 'INCONSISTENT_CARD')
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('investments')
  })

  it('ignores pages with no stat cards at all', () => {
    const pages: PageFile[] = [
      { path: 'app/page.tsx', code: '<div>Hello world</div>' },
      { path: 'app/(app)/reports/page.tsx', code: plainStatCard },
      { path: 'app/(app)/investments/page.tsx', code: plainStatCard },
    ]
    const issues = validateCrossPage(pages).filter(i => i.type === 'INCONSISTENT_CARD')
    expect(issues).toHaveLength(0)
  })

  // v2 fix: boundary — exactly 3 instances with 2-vs-1 split should emit.
  it('respects the minimum sample boundary: emits at exactly 3 instances (2 vs 1 split)', () => {
    const pages: PageFile[] = [
      { path: 'app/(app)/a/page.tsx', code: plainStatCard },
      { path: 'app/(app)/b/page.tsx', code: plainStatCard },
      { path: 'app/(app)/c/page.tsx', code: tintedBadgeStatCard },
    ]
    const issues = validateCrossPage(pages).filter(i => i.type === 'INCONSISTENT_CARD')
    expect(issues).toHaveLength(1)
  })

  // v2 fix: tie case — equal-size clusters should NOT emit (validator only
  // picks a side when majority is clear).
  it('does not emit when clusters are tied in size', () => {
    const pages: PageFile[] = [
      { path: 'app/(app)/a/page.tsx', code: plainStatCard },
      { path: 'app/(app)/b/page.tsx', code: plainStatCard },
      { path: 'app/(app)/c/page.tsx', code: tintedBadgeStatCard },
      { path: 'app/(app)/d/page.tsx', code: tintedBadgeStatCard },
    ]
    const issues = validateCrossPage(pages).filter(i => i.type === 'INCONSISTENT_CARD')
    expect(issues).toHaveLength(0)
  })

  // v2 fix: multi-minority — with 3 distinct clusters (3/2/1), one warning
  // per non-majority cluster (2 warnings total).
  it('emits one warning per minority cluster when ≥3 clusters exist', () => {
    // Create a third distinct shape: plain icon + no trend, text-2xl
    const plainNoTrend = `
<Card>
  <CardHeader><DollarSign /></CardHeader>
  <CardContent><div className="text-2xl font-bold">$100</div></CardContent>
</Card>`
    const pages: PageFile[] = [
      { path: 'app/(app)/a/page.tsx', code: plainStatCard }, // plain, inline-text
      { path: 'app/(app)/b/page.tsx', code: plainStatCard },
      { path: 'app/(app)/c/page.tsx', code: plainStatCard },
      { path: 'app/(app)/d/page.tsx', code: tintedBadgeStatCard }, // tinted, badge
      { path: 'app/(app)/e/page.tsx', code: tintedBadgeStatCard },
      { path: 'app/(app)/f/page.tsx', code: plainNoTrend }, // plain, none
    ]
    const issues = validateCrossPage(pages).filter(i => i.type === 'INCONSISTENT_CARD')
    expect(issues).toHaveLength(2)
  })

  // v2 fix: self-closing <Card /> should not corrupt sibling card detection.
  it('handles self-closing <Card /> without corrupting following cards', () => {
    const pageWithSelfClose = `
<Card />
${plainStatCard}
${plainStatCard}`
    const pages: PageFile[] = [
      { path: 'app/(app)/a/page.tsx', code: pageWithSelfClose },
      { path: 'app/(app)/b/page.tsx', code: tintedBadgeStatCard },
    ]
    // Should detect 2 plain + 1 tinted = minority flag on tinted
    const issues = validateCrossPage(pages).filter(i => i.type === 'INCONSISTENT_CARD')
    expect(issues).toHaveLength(1)
  })

  // v2 fix: ReDoS guard — pathological className should not hang.
  it('completes in reasonable time on pathological className input (ReDoS guard)', () => {
    const pathological = '<div className="' + 'bg-a/1 rounded p-1 '.repeat(500) + '">hi</div>\n' + plainStatCard
    const pages: PageFile[] = [
      { path: 'app/(app)/a/page.tsx', code: pathological },
      { path: 'app/(app)/b/page.tsx', code: plainStatCard },
      { path: 'app/(app)/c/page.tsx', code: tintedBadgeStatCard },
    ]
    const start = Date.now()
    validateCrossPage(pages)
    const elapsed = Date.now() - start
    // Pre-fix: 500 tokens hung for ~60s. Post-fix should be <100ms even
    // with the pathological input. Cap at 2000ms for CI slack.
    expect(elapsed).toBeLessThan(2000)
  })

  // v2 fix: malformed JSX should not crash the whole pass.
  it('does not crash on malformed JSX in one file', () => {
    const malformed = '<Card><unclosed<<>>>'
    const pages: PageFile[] = [
      { path: 'app/(app)/a/page.tsx', code: malformed },
      { path: 'app/(app)/b/page.tsx', code: plainStatCard },
      { path: 'app/(app)/c/page.tsx', code: plainStatCard },
      { path: 'app/(app)/d/page.tsx', code: tintedBadgeStatCard },
    ]
    expect(() => validateCrossPage(pages)).not.toThrow()
  })
})
