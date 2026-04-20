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
  })

  it('detects tinted-square icon + badge trend', () => {
    const sig = extractStatCardSignature(tintedBadgeStatCard)
    expect(sig).not.toBeNull()
    expect(sig!.icon_wrapper).toBe('tinted-square')
    expect(sig!.trend).toBe('badge')
  })

  it('returns null when card has no numeric value', () => {
    const notAStat = `<Card><CardHeader><CardTitle>Hello</CardTitle></CardHeader></Card>`
    expect(extractStatCardSignature(notAStat)).toBeNull()
  })

  it('returns null when card has no icon', () => {
    const noIcon = `<Card><CardContent><div className="text-2xl font-bold">$100</div></CardContent></Card>`
    expect(extractStatCardSignature(noIcon)).toBeNull()
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
    const msg = issues[0].message
    expect(msg).toMatch(/stat card/i)
    // references at least one file path
    expect(msg).toMatch(/reports|investments/)
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
    // 3 pages with plain (majority), 1 page with tinted (minority)
    const pages: PageFile[] = [
      { path: 'app/(app)/dashboard/page.tsx', code: plainStatCard },
      { path: 'app/(app)/reports/page.tsx', code: plainStatCard },
      { path: 'app/(app)/accounts/page.tsx', code: plainStatCard },
      { path: 'app/(app)/investments/page.tsx', code: tintedBadgeStatCard },
    ]
    const issues = validateCrossPage(pages).filter(i => i.type === 'INCONSISTENT_CARD')
    expect(issues).toHaveLength(1)
    // Issue should reference the minority (investments) as the outlier
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
})
