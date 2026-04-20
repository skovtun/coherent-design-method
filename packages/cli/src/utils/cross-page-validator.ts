/**
 * Cross-Page Validator — catches inconsistencies that single-page validation
 * cannot see.
 *
 * `coherent check` per page validates structure within one file. This file
 * compares STRUCTURES across multiple pages and flags divergence. v1 ships
 * INCONSISTENT_CARD (stat-card drift across pages), which resolves PJ-007
 * (Reports vs Investments stat cards diverged because the plan's
 * sharedComponents.usedBy didn't include /reports, so the per-page generator
 * freelanced a fresh card shape).
 *
 * Design:
 *   - Signature-based clustering: compute a structural signature per stat
 *     card (icon_wrapper × trend element × value size). Same signature =
 *     same cluster. Different signatures = inconsistency candidate.
 *   - Minority-reports model: when ≥2 clusters exist AND one cluster has
 *     strictly fewer occurrences than another, the minority is the outlier.
 *     Warn on the minority with pointers to both clusters.
 *   - Regex-based detection, not AST: cheap, no extra deps, catches the
 *     95% of AI-generated cards that follow predictable shadcn Card patterns.
 *
 * Scope:
 *   - v1 detects stat cards only (<Card> with icon + numeric-emphasized value).
 *   - Future checks (INCONSISTENT_FILTER_BAR, INCONSISTENT_EMPTY_STATE) can
 *     follow the same cluster-then-compare pattern.
 */

import type { QualityIssue } from './types.js'

export interface PageFile {
  path: string
  code: string
}

export type IconWrapper = 'plain' | 'tinted-square' | 'other'
export type TrendElement = 'none' | 'inline-text' | 'badge' | 'arrow-icon'

export interface StatCardSignature {
  icon_wrapper: IconWrapper
  trend: TrendElement
  value_size: 'text-2xl' | 'text-3xl' | 'other'
}

interface StatCardInstance {
  path: string
  signature: StatCardSignature
  snippet: string
}

const ICON_NAMES_RE =
  /\b(DollarSign|TrendingUp|TrendingDown|ArrowUp|ArrowDown|Users|Activity|BarChart|LineChart|PieChart|Package|ShoppingCart|CreditCard|Wallet|Target|Zap|Heart|Star|Award|Gauge|Percent)\b/

const NUMERIC_VALUE_RE =
  /className=["'][^"']*\b(text-2xl|text-3xl|text-4xl)\b[^"']*\bfont-bold\b[^"']*["']\s*>\s*\{?[^<{}]*[\d$€£¥+%.,-]/

const TINTED_SQUARE_RE =
  /<div[^>]*className=["'][^"']*\brounded(-[a-z]+)?\b[^"']*\bbg-[a-z-]+\/\d+\b[^"']*\bp(-\d+|-?[xy]-\d+)\b[^"']*["'][^>]*>[\s\S]*?<[A-Z]\w+\s/m

const ARROW_ICON_RE = /<(ArrowUp|ArrowDown|TrendingUp|TrendingDown)\b/
const BADGE_RE = /<Badge\b/
const INLINE_TREND_TEXT_RE = /[+-]?\d+(\.\d+)?%\s*(from|vs|change|last|prev|month|year|week|day)/i

/**
 * Try to interpret a single <Card>…</Card> block as a stat card. Returns a
 * structural signature if recognized, null otherwise.
 */
export function extractStatCardSignature(cardBlock: string): StatCardSignature | null {
  if (!ICON_NAMES_RE.test(cardBlock)) return null
  if (!NUMERIC_VALUE_RE.test(cardBlock)) return null

  const icon_wrapper: IconWrapper = TINTED_SQUARE_RE.test(cardBlock) ? 'tinted-square' : 'plain'

  const valueIdx = cardBlock.search(NUMERIC_VALUE_RE)
  const arrowIdx = cardBlock.search(ARROW_ICON_RE)
  const hasArrowAfterValue = arrowIdx !== -1 && valueIdx !== -1 && arrowIdx > valueIdx

  let trend: TrendElement = 'none'
  if (BADGE_RE.test(cardBlock)) trend = 'badge'
  else if (hasArrowAfterValue) trend = 'arrow-icon'
  else if (INLINE_TREND_TEXT_RE.test(cardBlock)) trend = 'inline-text'

  const value_size: StatCardSignature['value_size'] = /\btext-2xl\b/.test(cardBlock)
    ? 'text-2xl'
    : /\btext-3xl\b/.test(cardBlock)
      ? 'text-3xl'
      : 'other'

  return { icon_wrapper, trend, value_size }
}

/**
 * Walk a page's code and return every balanced <Card>…</Card> block in
 * document order. Nested Cards are handled; sub-tags like <CardHeader>,
 * <CardTitle>, <CardContent> do not bump the depth counter.
 */
function collectCardBlocks(code: string): string[] {
  const blocks: string[] = []
  const openMatches = [...code.matchAll(/<Card\b/g)]
  let cursor = 0
  for (const open of openMatches) {
    const start = open.index ?? 0
    if (start < cursor) continue // already consumed by a prior (outer) block
    let depth = 1
    let idx = start + open[0].length
    while (idx < code.length) {
      const nextOpen = code.indexOf('<Card', idx)
      const nextClose = code.indexOf('</Card>', idx)
      if (nextClose === -1) break
      if (nextOpen !== -1 && nextOpen < nextClose) {
        const after = code[nextOpen + 5]
        if (!after || /[\s>/]/.test(after)) depth++
        idx = nextOpen + 5
        continue
      }
      depth--
      idx = nextClose + '</Card>'.length
      if (depth === 0) {
        blocks.push(code.slice(start, idx))
        cursor = idx
        break
      }
    }
  }
  return blocks
}

function signatureKey(sig: StatCardSignature): string {
  return `${sig.icon_wrapper}|${sig.trend}|${sig.value_size}`
}

function basename(path: string): string {
  const parts = path.split('/')
  const pageIdx = parts.lastIndexOf('page.tsx')
  if (pageIdx === -1 || pageIdx === 0) return path
  const candidate = parts[pageIdx - 1]
  if (candidate === 'app' || (candidate.startsWith('(') && candidate.endsWith(')'))) return 'home'
  return candidate
}

/**
 * Scan all pages for structural inconsistencies visible only across files.
 * Returns one QualityIssue per minority cluster detected.
 *
 * Emits INCONSISTENT_CARD only when:
 *   - Total stat cards across all pages ≥ 3 (insufficient sample otherwise)
 *   - ≥2 distinct signatures present
 *   - The minority cluster has strictly fewer occurrences than the majority
 */
export function validateCrossPage(pages: PageFile[]): QualityIssue[] {
  const issues: QualityIssue[] = []

  const instances: StatCardInstance[] = []
  for (const page of pages) {
    const cards = collectCardBlocks(page.code)
    for (const card of cards) {
      const sig = extractStatCardSignature(card)
      if (sig) instances.push({ path: page.path, signature: sig, snippet: card.slice(0, 200) })
    }
  }

  if (instances.length < 3) return issues

  const clusters = new Map<string, StatCardInstance[]>()
  for (const inst of instances) {
    const key = signatureKey(inst.signature)
    const list = clusters.get(key) ?? []
    list.push(inst)
    clusters.set(key, list)
  }

  if (clusters.size < 2) return issues

  const sorted = [...clusters.entries()].sort((a, b) => b[1].length - a[1].length)
  const [majorityKey, majorityList] = sorted[0]
  const minorities = sorted.slice(1)

  for (const [minorityKey, minorityList] of minorities) {
    if (minorityList.length >= majorityList.length) continue // tie → don't pick a side

    const majFiles = [...new Set(majorityList.map(i => basename(i.path)))].slice(0, 3)
    const minFiles = [...new Set(minorityList.map(i => basename(i.path)))].slice(0, 3)
    issues.push({
      line: 1,
      type: 'INCONSISTENT_CARD',
      severity: 'warning',
      message: `Stat card shape drift across pages. ${minorityList.length} card(s) on ${minFiles.join(', ')} use ${describeSig(minorityKey)}, while ${majorityList.length} card(s) on ${majFiles.join(', ')} use ${describeSig(majorityKey)}. Extract to a shared StatCard component or align the minority pages to match.`,
    })
  }

  return issues
}

function describeSig(key: string): string {
  const [icon, trend, size] = key.split('|')
  return `${icon} icon + ${trend} trend (${size})`
}
