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
 * v2 (PR #28 review fixes):
 *   - ReDoS in TINTED_SQUARE_RE replaced with split-attribute-then-check
 *     approach (no catastrophic backtracking).
 *   - Self-closing <Card /> now skipped correctly (no parser corruption).
 *   - ICON_NAMES_RE requires JSX tag context (`<DollarSign` not bare "Award"
 *     in prose).
 *   - `value_size` extracted from the actual numeric-emphasized element's
 *     className group, not a free-text scan; `text-4xl` now a first-class
 *     signature value.
 *   - Arrow/Badge trend detection requires position after the value (matches
 *     existing arrow behaviour; fixes header-icon false positives).
 *   - NUMERIC_VALUE_RE simplified to two order-independent className checks
 *     + tolerates JSX expressions ({variable}) as values.
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
  value_size: 'text-2xl' | 'text-3xl' | 'text-4xl' | 'other'
}

interface StatCardInstance {
  path: string
  signature: StatCardSignature
  snippet: string
}

// Icons must appear as JSX tags (`<DollarSign`), not as prose. This rules
// out false positives on common English words like "Award" or "Target" that
// appear in CardTitle / copy text.
const ICON_TAG_RE =
  /<(DollarSign|TrendingUp|TrendingDown|ArrowUp|ArrowDown|Users|Activity|BarChart|LineChart|PieChart|Package|ShoppingCart|CreditCard|Wallet|Target|Zap|Heart|Star|Award|Gauge|Percent)\b/

// Match a className attribute that contains BOTH text-Nxl AND font-bold, in
// either order. Captures the size class in group 1. Content after the tag
// opening can be literal digits, currency, percent, or a {expr} JSX
// expression — all three shapes count as numeric-emphasized.
const NUMERIC_VALUE_RE =
  /className=["'](?=[^"']*\b(text-2xl|text-3xl|text-4xl)\b)(?=[^"']*\bfont-bold\b)[^"']*["']\s*>\s*(?:\{[^}]*\}|[^<{}]*[\d$€£¥+%.,-])/

const ARROW_ICON_RE = /<(ArrowUp|ArrowDown|TrendingUp|TrendingDown)\b/g
const BADGE_RE = /<Badge\b/g

const INLINE_TREND_TEXT_RE = /[+-]?\d+(\.\d+)?%\s*(from|vs|change|last|prev|month|year|week|day)/i

/**
 * Detect "tinted-square" icon wrapper: a <div> with className containing
 * `rounded`, `bg-<tint>/<n>`, and padding, containing a capital-tag child.
 *
 * v2 fix: replaces the previous monolithic regex (which had three unanchored
 * `[^"']*\b<token>\b` groups and a `[\s\S]*?` tail — catastrophic backtracking
 * on pathological className strings, verified ReDoS at 500 tokens = ~60s hang).
 *
 * New approach: find each div's className as a whole string, test the three
 * tokens independently (no alternation backtracking), then look a bounded
 * window ahead for a capital-tag child. Linear time.
 */
function hasTintedSquare(cardBlock: string): boolean {
  const divRe = /<div[^>]*className=(["'])([^"']*)\1[^>]*>/g
  const LOOKAHEAD_CHARS = 300
  for (const m of cardBlock.matchAll(divRe)) {
    const classes = m[2]
    if (!/\brounded(-[a-z]+)?\b/.test(classes)) continue
    if (!/\bbg-[a-z-]+\/\d+\b/.test(classes)) continue
    if (!/\bp(-\d+|[xy]-\d+)\b/.test(classes)) continue
    const tagEnd = (m.index ?? 0) + m[0].length
    const window = cardBlock.slice(tagEnd, tagEnd + LOOKAHEAD_CHARS)
    if (/<[A-Z]\w+\s/.test(window)) return true
  }
  return false
}

/**
 * Try to interpret a single <Card>…</Card> block as a stat card. Returns a
 * structural signature if recognized, null otherwise.
 */
export function extractStatCardSignature(cardBlock: string): StatCardSignature | null {
  if (!ICON_TAG_RE.test(cardBlock)) return null
  const valueMatch = cardBlock.match(NUMERIC_VALUE_RE)
  if (!valueMatch) return null

  const icon_wrapper: IconWrapper = hasTintedSquare(cardBlock) ? 'tinted-square' : 'plain'

  // Position of the numeric value element — used to decide whether trend
  // elements (arrow, badge) are header decoration (before value) or actual
  // trend indicators (after value).
  const valueIdx = valueMatch.index ?? 0
  const afterValue = cardBlock.slice(valueIdx)

  const hasArrowAfterValue = ARROW_ICON_RE.test(afterValue)
  const hasBadgeAfterValue = BADGE_RE.test(afterValue)
  // Reset lastIndex on stateful /g regexes so subsequent card checks
  // start clean. Without this, iterating matchAll under the hood reuses
  // stale cursor positions on repeated calls.
  ARROW_ICON_RE.lastIndex = 0
  BADGE_RE.lastIndex = 0

  let trend: TrendElement = 'none'
  if (hasBadgeAfterValue) trend = 'badge'
  else if (hasArrowAfterValue) trend = 'arrow-icon'
  else if (INLINE_TREND_TEXT_RE.test(cardBlock)) trend = 'inline-text'

  // Extract value_size from the ACTUAL value element's className capture
  // group — not a free-text scan over the whole block. The previous
  // implementation returned whichever text-Nxl it found first, which could
  // be an unrelated header/section class.
  const valueSizeCapture = valueMatch[1]
  const value_size: StatCardSignature['value_size'] =
    valueSizeCapture === 'text-2xl' || valueSizeCapture === 'text-3xl' || valueSizeCapture === 'text-4xl'
      ? valueSizeCapture
      : 'other'

  return { icon_wrapper, trend, value_size }
}

/**
 * Walk a page's code and return every balanced <Card>…</Card> block in
 * document order. Nested Cards are handled; sub-tags like <CardHeader>,
 * <CardTitle>, <CardContent> do not bump the depth counter.
 *
 * v2 fix: self-closing `<Card />` tags are now detected and skipped
 * correctly. The previous implementation treated `<Card />` as a regular
 * opener, inflating the depth counter for enclosing Cards and corrupting
 * block boundaries for sibling cards.
 */
function collectCardBlocks(code: string): string[] {
  const blocks: string[] = []
  const openMatches = [...code.matchAll(/<Card\b/g)]
  let cursor = 0
  for (const open of openMatches) {
    const start = open.index ?? 0
    if (start < cursor) continue // already consumed by a prior (outer) block

    // Detect self-closing <Card .../>: scan to the first unquoted '>' and
    // check if the preceding character is '/'. Self-closing Cards have no
    // content to interpret; skip past them.
    const tagCloseIdx = findTagCloseIdx(code, start)
    if (tagCloseIdx === -1) continue
    if (code[tagCloseIdx - 1] === '/') {
      cursor = tagCloseIdx + 1
      continue
    }

    let depth = 1
    let idx = tagCloseIdx + 1
    while (idx < code.length) {
      const nextOpen = code.indexOf('<Card', idx)
      const nextClose = code.indexOf('</Card>', idx)
      if (nextClose === -1) break
      if (nextOpen !== -1 && nextOpen < nextClose) {
        const after = code[nextOpen + 5]
        if (!after || /[\s>/]/.test(after)) {
          const nestedCloseIdx = findTagCloseIdx(code, nextOpen)
          if (nestedCloseIdx !== -1 && code[nestedCloseIdx - 1] !== '/') {
            depth++
          }
          idx = nestedCloseIdx === -1 ? nextOpen + 5 : nestedCloseIdx + 1
        } else {
          idx = nextOpen + 5
        }
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

/**
 * Find the index of the '>' that closes the JSX tag starting at `start`.
 * Tolerates '>' inside quoted attribute values.
 */
function findTagCloseIdx(code: string, start: number): number {
  let quote: string | null = null
  for (let i = start; i < code.length; i++) {
    const c = code[i]
    if (quote) {
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      continue
    }
    if (c === '>') return i
  }
  return -1
}

function signatureKey(sig: StatCardSignature): string {
  return `${sig.icon_wrapper}|${sig.trend}|${sig.value_size}`
}

function basename(path: string): string {
  const parts = path.split('/')
  const pageIdx = parts.lastIndexOf('page.tsx')
  if (pageIdx === -1 || pageIdx === 0) return path
  // Walk backward past route-group segments like `(app)` or `(marketing)`
  // to find the real route slug. A plain `app/(app)/page.tsx` has no real
  // slug → 'home'; `app/(marketing)/page.tsx` also collapses to 'home'
  // because it IS the marketing home, and the distinction between route
  // groups at the top-level doesn't matter for drift reporting (the user
  // has at most one "home" page per group).
  for (let i = pageIdx - 1; i >= 0; i--) {
    const seg = parts[i]
    if (seg === 'app') return 'home'
    if (seg.startsWith('(') && seg.endsWith(')')) continue
    return seg
  }
  return path
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
    let cards: string[] = []
    try {
      cards = collectCardBlocks(page.code)
    } catch {
      // Malformed JSX — skip this file quietly rather than failing the
      // whole cross-page pass. A single bad page shouldn't blind the
      // validator to drift elsewhere.
      continue
    }
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
