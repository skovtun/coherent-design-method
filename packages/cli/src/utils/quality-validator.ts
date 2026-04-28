import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { detectComponentIssues, applyComponentRules } from './component-rules.js'
export type { QualityIssue } from './types.js'
import type { QualityIssue } from './types.js'

const RAW_COLOR_RE =
  /(?:(?:[a-z][a-z0-9-]*:)*)?(?:bg|text|border|ring|outline|shadow|from|to|via|divide|placeholder|decoration|caret|fill|stroke|accent)-(gray|blue|red|green|yellow|purple|pink|indigo|orange|slate|zinc|stone|neutral|emerald|teal|cyan|sky|violet|fuchsia|rose|amber|lime)-\d+/g
const RAW_BW_COLOR_RE =
  /(?:(?:[a-z][a-z0-9-]*:)*)?(?:bg|text|border|ring|outline|shadow|divide|fill|stroke)-(white|black)\b/g
const INLINE_STYLE_COLOR_RE =
  /style=\{[^}]*(color|background|backgroundColor|borderColor)\s*:\s*['"]?(#[0-9a-fA-F]{3,8}|rgb|hsl|red|blue|orange|green|purple|yellow|pink|white|black|gray|grey)\b/gi
const ARBITRARY_COLOR_RE =
  /\b(?:bg|text|border|ring|shadow|fill|stroke|from|to|via)-\[(?:#[0-9a-fA-F]{3,8}|rgb|hsl|color-mix)/gi
const SVG_COLOR_RE = /\b(?:fill|stroke)=["'](?!none|currentColor|url|inherit|transparent)([^"']+)["']/g
const COLOR_PROP_RE = /\b(?:color|accentColor|iconColor|fillColor)=["']#[0-9a-fA-F]{3,8}["']/g
const HEX_IN_CLASS_RE = /className="[^"]*#[0-9a-fA-F]{3,8}[^"]*"/g
const TEXT_BASE_RE = /\btext-base\b/g
const HEAVY_SHADOW_RE = /\bshadow-(md|lg|xl|2xl)\b/g
const TRANSITION_ALL_RE = /\btransition-all\b/g
const EXCESSIVE_PADDING_RE = /\bp-(8|10|12|14|16|20)\b/g
const BANNED_NAMES_RE = /['"](?:John\s+Doe|Jane\s+(?:Smith|Doe)|Acme\s+Corp|TechCorp|SmartFlow|Nexus\s+Inc)['"]/gi
const BANNED_COPY_RE =
  /['"](?:[^'"]*\b(?:Seamless|Elevate|Unleash|Next-Gen|Game-changer|Cutting-edge|Delve)\b[^'"]*)['"]/gi
const SM_BREAKPOINT_RE = /\bsm:/g
const XL_BREAKPOINT_RE = /\bxl:/g
const XXL_BREAKPOINT_RE = /\b2xl:/g
const LARGE_CARD_TITLE_RE = /CardTitle[^>]*className="[^"]*text-(lg|xl|2xl)/g
const RAW_BUTTON_RE = /<button\b/g
const RAW_INPUT_RE = /<input\b/g
const RAW_SELECT_RE = /<select\b/g
const NATIVE_CHECKBOX_RE = /<input[^>]*type\s*=\s*["']checkbox["']/g
const NATIVE_TABLE_RE = /<table\b/g

const PLACEHOLDER_PATTERNS = [
  />\s*Lorem ipsum\b/i,
  />\s*Card content\s*</i,
  />\s*Your (?:text|content) here\s*</i,
  />\s*Description\s*</,
  />\s*Title\s*</,
  /placeholder\s*text/i,
]

const GENERIC_BUTTON_LABELS = />\s*(Submit|OK|Click here|Press here|Go)\s*</i
const IMG_WITHOUT_ALT_RE = /<img\b(?![^>]*\balt\s*=)[^>]*>/g
const INPUT_TAG_RE = /<(?:Input|input)\b[^>]*>/g
const LABEL_FOR_RE = /<Label\b[^>]*htmlFor\s*=/

// Chart placeholders — AI cop-out when it doesn't want to build a real chart.
// Catches the "Chart visualization would go here" family of stub text.
const CHART_PLACEHOLDER_RE =
  /chart\s+(?:visualization|would\s+go\s+here|coming\s+soon|breakdown\s+chart\s+would\s+go|placeholder)|graph\s+(?:coming\s+soon|placeholder)/i

// Empty colored box used as a chart stand-in — <div className="h-[300px] bg-muted"/> with no real content.
// Self-closing or immediately-closing div with h-[N] + bg-{muted,accent,card,secondary} + no children.
const CHART_EMPTY_BOX_RE =
  /<div\s+className="[^"]*\bh-\[(?:\d+px|\d+(?:\.\d+)?rem|\d+vh)\][^"]*\bbg-(?:muted|accent|card|secondary)[^"]*"[^>]*(?:\/>|>\s*<\/div>)/

// toFixed used with currency symbol nearby — AI bypassing Intl.NumberFormat.
// Examples: ${value.toFixed(2)}, $\{amount.toFixed(2)\}, \`$\${x.toFixed(2)}\`
const TO_FIXED_CURRENCY_RE = /\$[^a-zA-Z0-9]{0,5}\{[^}]*\.toFixed\s*\(\s*\d+\s*\)\s*\}/

// Inline object-array literal with 5+ elements inside app/ page/component files.
// Match `const X = [ {...}, {...}, {...}, {...}, {...} ...]` with at least 5 objects.
const INLINE_MOCK_ARRAY_RE = /=\s*\[\s*\{[^\[\]]*?\}(?:\s*,\s*\{[^\[\]]*?\}){4,}\s*,?\s*\]/

// Double-sign rendering — AI manually prefixes + or - to a value that is already
// signed (or could be), producing `--$59.99` / `++$4,850.00` in the UI. Match:
//   ${amount < 0 ? '-' : '+'}$\{value.toFixed(2)}       (JSX expression)
//   `$${amount < 0 ? '-' : '+'}${value.toFixed(2)}`     (template literal)
// Heuristic: ternary producing '-'/'+' next to a currency-formatted value.
const DOUBLE_SIGN_RE = /\?\s*['"][+\-]['"]\s*:\s*['"][+\-]['"]/

function isInsideCommentOrString(line: string, matchIndex: number): boolean {
  const commentIdx = line.indexOf('//')
  if (commentIdx !== -1 && commentIdx < matchIndex) return true
  let inSingle = false
  let inDouble = false
  let inTemplate = false
  for (let i = 0; i < matchIndex; i++) {
    const ch = line[i]
    const prev = i > 0 ? line[i - 1] : ''
    if (prev === '\\') continue
    if (ch === "'" && !inDouble && !inTemplate) inSingle = !inSingle
    if (ch === '"' && !inSingle && !inTemplate) inDouble = !inDouble
    if (ch === '`' && !inSingle && !inDouble) inTemplate = !inTemplate
  }
  return inSingle || inDouble || inTemplate
}

function checkLines(
  code: string,
  pattern: RegExp,
  type: string,
  message: string,
  severity: QualityIssue['severity'],
  skipCommentsAndStrings = false,
): QualityIssue[] {
  const issues: QualityIssue[] = []
  const lines = code.split('\n')
  let inBlockComment = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (skipCommentsAndStrings) {
      if (inBlockComment) {
        const endIdx = line.indexOf('*/')
        if (endIdx !== -1) {
          inBlockComment = false
        }
        continue
      }
      const blockStart = line.indexOf('/*')
      if (blockStart !== -1 && !line.includes('*/')) {
        inBlockComment = true
        continue
      }

      let m: RegExpExecArray | null
      pattern.lastIndex = 0
      while ((m = pattern.exec(line)) !== null) {
        if (!isInsideCommentOrString(line, m.index)) {
          issues.push({ line: i + 1, type, message, severity })
          break
        }
      }
    } else {
      pattern.lastIndex = 0
      if (pattern.test(line)) {
        issues.push({ line: i + 1, type, message, severity })
      }
    }
  }
  return issues
}

/**
 * Count TableHead occurrences in the first TableHeader block and compare against
 * TableCell count in the first body TableRow. Catches the "empty columns"
 * pattern where AI defines Account/Category/Date headers but forgets to render
 * matching <TableCell> elements in rows.
 *
 * Limitations: regex-based, so nested tables or exotic JSX expression children
 * can confuse the heuristic. That's why this emits a warning (not error) —
 * false positives are preferable to missed empty-column bugs.
 */
function detectTableColumnMismatch(code: string): QualityIssue[] {
  const issues: QualityIssue[] = []
  const headerBlock = code.match(/<TableHeader[^>]*>([\s\S]*?)<\/TableHeader>/)
  if (!headerBlock) return issues
  const headCount = (headerBlock[1].match(/<TableHead[\s>]/g) || []).length
  if (headCount === 0) return issues

  const bodyBlock = code.match(/<TableBody[^>]*>([\s\S]*?)<\/TableBody>/)
  if (!bodyBlock) return issues
  const firstRow = bodyBlock[1].match(/<TableRow[^>]*>([\s\S]*?)<\/TableRow>/)
  if (!firstRow) return issues
  const cellCount = (firstRow[1].match(/<TableCell[\s>]/g) || []).length
  if (cellCount === 0) return issues // empty state row, skip

  if (headCount !== cellCount) {
    const lineNum = code.slice(0, headerBlock.index ?? 0).split('\n').length
    issues.push({
      line: lineNum,
      type: 'TABLE_COLUMN_MISMATCH',
      message: `Table has ${headCount} <TableHead> but first body <TableRow> has ${cellCount} <TableCell> — empty columns will render. Match counts.`,
      severity: 'warning',
    })
  }
  return issues
}

/**
 * Filter-bar heuristics — detects two common AI failure modes:
 *
 *   1. FILTER_DUPLICATE — same filter dimension rendered twice (a Category
 *      dropdown AND a Category button, both on the same toolbar). Happens when
 *      AI forgets it already placed one and adds another in a second row.
 *
 *   2. FILTER_HEIGHT_MISMATCH — form controls (Input/Select/Button) in the
 *      same filter block use different h-N classes, making the bar look
 *      uneven. Our rule says h-10 for all. If we see 2+ heights across
 *      these elements in the same block, we warn.
 *
 * Scope: look only inside a "filter block" — a parent element where the word
 * "filter" appears on a nearby line, OR a flex container holding 2+ form
 * controls. This keeps us from matching unrelated controls scattered across a
 * page.
 */
function detectFilterBarIssues(code: string): QualityIssue[] {
  const issues: QualityIssue[] = []

  // Find filter blocks — sections where "filter" or "Filter" appears in a
  // heading/label/className within ~400 chars of form controls.
  const filterBlockRegex = /<div\b[^>]*>[\s\S]{0,1200}?<\/div>/g
  const blocks = code.match(filterBlockRegex) || []
  for (const block of blocks) {
    const looksLikeFilter = /\bfilter\b/i.test(block) || /placeholder=["'](?:Search|All\s)/i.test(block)
    if (!looksLikeFilter) continue

    // Extract SelectValue placeholders (e.g. "All Categories", "Category").
    const selectPlaceholders = [...block.matchAll(/<SelectValue[^>]+placeholder=["']([^"']+)["']/g)].map(m =>
      normalizeFilterLabel(m[1]),
    )

    // Extract Button labels (text content).
    const buttonLabels = [...block.matchAll(/<Button[^>]*>([^<]{2,40})<\/Button>/g)].map(m =>
      normalizeFilterLabel(m[1].trim()),
    )

    // Look for duplicates between Select placeholders and Button labels.
    const selectSet = new Set(selectPlaceholders)
    for (const label of buttonLabels) {
      if (selectSet.has(label)) {
        const lineNum = code.indexOf(block) >= 0 ? code.slice(0, code.indexOf(block)).split('\n').length : 1
        issues.push({
          line: lineNum,
          type: 'FILTER_DUPLICATE',
          message: `Filter dimension "${label}" rendered twice (Select + Button). Pick one.`,
          severity: 'warning',
        })
        break // one warn per block is enough
      }
    }

    // Height mismatch: collect h-N classes from Input/SelectTrigger/Button/DatePicker.
    const heights = new Set<string>()
    const heightRegex =
      /<(?:Input|SelectTrigger|Button|DatePicker)\b[^>]*\bclassName="[^"]*\b(h-\d+|h-\[\d+[a-z]+\])\b[^"]*"/g
    for (const m of block.matchAll(heightRegex)) {
      heights.add(m[1])
    }
    // Also detect completely missing h- on controls adjacent to others that have it.
    // Multiple distinct heights → mismatch.
    if (heights.size >= 2) {
      const lineNum = code.indexOf(block) >= 0 ? code.slice(0, code.indexOf(block)).split('\n').length : 1
      issues.push({
        line: lineNum,
        type: 'FILTER_HEIGHT_MISMATCH',
        message: `Filter controls use different heights (${[...heights].join(', ')}). All should match (h-10 default).`,
        severity: 'warning',
      })
    }
  }

  return issues
}

/**
 * Normalise filter labels so "Categories" and "All Categories" match.
 * Strips common prefixes and trailing plural 's'. Lowercase for comparison.
 */
function normalizeFilterLabel(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^(?:all|select|filter|by)\s+/i, '')
    .replace(/\s+(?:filter|selector|picker)$/i, '')
    .replace(/s$/, '')
    .trim()
}

/**
 * Detect misplaced search icon — AI frequently renders <Search /> as a sibling
 * of <Input /> (icon appears above or below the field) instead of wrapping them
 * in a relative container with the icon absolute-positioned. Criteria:
 *
 *   - an <Input> whose placeholder mentions Search
 *   - no pl-9/pl-10 padding class (required when icon sits inside)
 *   - AND a <Search|<MagnifyingGlass sibling nearby without `absolute` class
 */
function detectSearchIconMisplaced(code: string): QualityIssue[] {
  const issues: QualityIssue[] = []
  const lines = code.split('\n')
  const searchInputRe = /<Input\b[^>]*placeholder=["'][^"']*[Ss]earch[^"']*["'][^>]*>/
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!searchInputRe.test(line)) continue

    // Input already has left padding for the icon — icon likely placed correctly.
    if (/\bpl-(?:9|10|8)\b/.test(line)) continue

    // Look within 3 lines above and below for a Search/MagnifyingGlass icon.
    const windowStart = Math.max(0, i - 3)
    const windowEnd = Math.min(lines.length, i + 4)
    const windowText = lines.slice(windowStart, windowEnd).join('\n')
    const hasIcon = /<(?:Search|MagnifyingGlass)\b/.test(windowText)
    if (!hasIcon) continue

    // Icon already absolute-positioned → correct pattern, skip.
    const iconIsAbsolute = /<(?:Search|MagnifyingGlass)\b[^>]*\babsolute\b/.test(windowText)
    if (iconIsAbsolute) continue

    issues.push({
      line: i + 1,
      type: 'SEARCH_ICON_MISPLACED',
      message:
        'Search icon appears as a sibling of <Input>, not inside. Wrap in <div className="relative"> with icon absolute-positioned and pl-9 on the Input.',
      severity: 'warning',
    })
  }
  return issues
}

/**
 * Overlay sanity checks — Dialog, AlertDialog, Sheet, DropdownMenu, Popover.
 *
 * Covers three classes of bugs:
 *
 *   1. DIALOG_FULL_WIDTH — <DialogContent> / <SheetContent> without a max-w-*
 *      class. Renders edge-to-edge on wide screens with content cramped on
 *      one side. (Seen: Create New Budget modal on a 2400px screen.)
 *
 *   2. DIALOG_CUSTOM_OVERLAY — AI built a custom `<div className="fixed
 *      inset-0 bg-black/50">` overlay near dialog-like content instead of
 *      using shadcn Dialog (which handles overlay + focus trap + Escape).
 *
 *   3. ALERT_DIALOG_NON_DESTRUCTIVE — <AlertDialog> used for a non-destructive
 *      confirmation (create, save, edit). Alert dialogs are reserved for
 *      irreversible destructive actions.
 */
function detectOverlayIssues(code: string): QualityIssue[] {
  const issues: QualityIssue[] = []

  // 1. DIALOG_FULL_WIDTH — DialogContent / SheetContent without an explicit
  //    width cap. max-w-* is the common pattern; Sheet also commonly uses
  //    a plain w-* (w-72, w-80, w-96) since it's a side drawer, not a
  //    centered modal — accept that as sufficient width control.
  const dialogContentRe = /<(Dialog|AlertDialog|Sheet)Content\b([^>]*)>/g
  for (const m of code.matchAll(dialogContentRe)) {
    const kind = m[1]
    const attrs = m[2] || ''
    const hasMaxW = /\bmax-w-(?:sm|md|lg|xl|2xl|3xl|\[[^\]]+\])\b/.test(attrs) || /\bsm:max-w-/.test(attrs)
    const hasFixedWidth = kind === 'Sheet' && /\bw-(?:\d+|\[[^\]]+\]|\w+)\b/.test(attrs)
    if (!hasMaxW && !hasFixedWidth) {
      const lineNum = code.slice(0, m.index ?? 0).split('\n').length
      issues.push({
        line: lineNum,
        type: 'DIALOG_FULL_WIDTH',
        message: `<${kind}Content> without a max-w-* class renders full-width on wide screens. Add max-w-lg (default) or sm:max-w-md for Sheet.`,
        severity: 'error',
      })
    }
  }

  // 2. DIALOG_CUSTOM_OVERLAY — fixed inset-0 with bg-black/darkness and no
  //    shadcn Dialog nearby in the file.
  //    Heuristic: look for the custom overlay class pattern. If file does not
  //    import anything from @/components/ui/dialog — it's likely a custom
  //    overlay, not the shadcn component.
  const customOverlayRe = /<div\s+className="[^"]*\bfixed\s+inset-0\b[^"]*\bbg-(?:black|zinc-\d+|neutral-\d+)[^"]*"/g
  const hasShadcnDialog = /from\s+["']@\/components\/ui\/(?:dialog|alert-dialog|sheet)["']/.test(code)
  for (const m of code.matchAll(customOverlayRe)) {
    if (!hasShadcnDialog) {
      const lineNum = code.slice(0, m.index ?? 0).split('\n').length
      issues.push({
        line: lineNum,
        type: 'DIALOG_CUSTOM_OVERLAY',
        message:
          'Custom fixed inset-0 overlay detected. Use shadcn <Dialog>/<AlertDialog>/<Sheet> — they handle overlay, focus trap, and Escape automatically.',
        severity: 'error',
      })
      break // one warning is enough per file
    }
  }

  // 3. ALERT_DIALOG_NON_DESTRUCTIVE — action text does not look destructive.
  //    Heuristic: AlertDialogAction's children don't contain delete|remove|
  //    cancel|discard|log\s+out|sign\s+out|terminate|revoke.
  const alertActionRe = /<AlertDialogAction\b[^>]*>\s*([^<]+?)\s*<\/AlertDialogAction>/g
  const destructiveVerbs =
    /\b(?:delete|remove|cancel|discard|logout|log\s+out|sign\s+out|terminate|revoke|erase|clear\s+all|reset|wipe|unsubscribe)\b/i
  for (const m of code.matchAll(alertActionRe)) {
    const label = m[1].trim()
    if (label && !destructiveVerbs.test(label)) {
      const lineNum = code.slice(0, m.index ?? 0).split('\n').length
      issues.push({
        line: lineNum,
        type: 'ALERT_DIALOG_NON_DESTRUCTIVE',
        message: `AlertDialog "${label}" doesn't look destructive. AlertDialog is for irreversible actions (delete, cancel subscription, log out). Use a regular Dialog for "${label}".`,
        severity: 'warning',
      })
    }
  }

  return issues
}

export function validatePageQuality(
  code: string,
  validRoutes?: string[],
  pageType?: 'marketing' | 'app' | 'auth',
): QualityIssue[] {
  const issues: QualityIssue[] = []

  // Skip RAW_COLOR inside terminal/code block contexts
  // Check the line itself AND nearby lines (parent elements) for terminal indicators
  const allLines = code.split('\n')
  const isTerminalContext = (lineNum: number): boolean => {
    const start = Math.max(0, lineNum - 20)
    const nearby = allLines.slice(start, lineNum).join(' ')
    if (/font-mono/.test(allLines[lineNum - 1] || '')) return true
    if (/bg-zinc-950|bg-zinc-900/.test(nearby) && /font-mono/.test(nearby)) return true
    return false
  }
  issues.push(
    ...checkLines(
      code,
      RAW_COLOR_RE,
      'RAW_COLOR',
      'Raw Tailwind color detected — use semantic tokens (bg-primary, text-muted-foreground, etc.)',
      'error',
    ).filter(issue => !isTerminalContext(issue.line)),
  )
  issues.push(
    ...checkLines(
      code,
      RAW_BW_COLOR_RE,
      'RAW_COLOR',
      'Use semantic tokens (bg-background, text-foreground) instead of white/black',
      'error',
    ),
  )
  issues.push(
    ...checkLines(
      code,
      INLINE_STYLE_COLOR_RE,
      'inline-style-color',
      'Use semantic Tailwind classes instead of inline style colors',
      'error',
    ),
  )
  issues.push(
    ...checkLines(
      code,
      ARBITRARY_COLOR_RE,
      'arbitrary-color',
      'Use semantic tokens instead of arbitrary color values like bg-[#hex]',
      'error',
    ),
  )
  issues.push(
    ...checkLines(
      code,
      SVG_COLOR_RE,
      'svg-raw-color',
      'Use currentColor or CSS variables for SVG fill/stroke, not raw colors',
      'error',
    ),
  )
  issues.push(
    ...checkLines(
      code,
      COLOR_PROP_RE,
      'color-prop',
      'Use semantic color tokens instead of hex values in color props',
      'error',
    ),
  )
  issues.push(
    ...checkLines(
      code,
      HEX_IN_CLASS_RE,
      'HEX_IN_CLASS',
      'Hex color in className — use CSS variables via semantic tokens',
      'error',
    ),
  )
  issues.push(
    ...checkLines(code, TEXT_BASE_RE, 'TEXT_BASE', 'text-base detected — use text-sm as base font size', 'warning'),
  )
  // HEAVY_SHADOW fires unless the shadow is on a `fixed|absolute|sticky`
  // element — floating chrome (FABs, pinned toolbars, popovers) legitimately
  // want a strong drop shadow, it's the visual affordance.
  const heavyShadowLines = checkLines(
    code,
    HEAVY_SHADOW_RE,
    'HEAVY_SHADOW',
    'Heavy shadow detected — use shadow-sm or none',
    'warning',
  )
  const codeLinesForHs = code.split('\n')
  issues.push(
    ...heavyShadowLines.filter(issue => {
      const line = codeLinesForHs[issue.line - 1] || ''
      return !/\b(?:fixed|absolute|sticky)\b/.test(line)
    }),
  )
  issues.push(
    ...checkLines(
      code,
      TRANSITION_ALL_RE,
      'TRANSITION_ALL',
      'transition-all detected — specify: transition-colors, transition-transform, etc.',
      'warning',
    ),
  )
  issues.push(
    ...checkLines(
      code,
      EXCESSIVE_PADDING_RE,
      'EXCESSIVE_PADDING',
      'Excessive padding (>p-6) — max is p-6 for content areas',
      'warning',
    ),
  )
  issues.push(
    ...checkLines(
      code,
      BANNED_NAMES_RE,
      'BANNED_NAME',
      'Generic placeholder name detected — use diverse, realistic names',
      'warning',
    ),
  )
  issues.push(
    ...checkLines(
      code,
      BANNED_COPY_RE,
      'BANNED_COPY',
      'AI cliché copy detected — write specific, concrete descriptions',
      'warning',
    ),
  )
  issues.push(
    ...checkLines(
      code,
      CHART_PLACEHOLDER_RE,
      'CHART_PLACEHOLDER',
      'Chart placeholder text detected — render a real chart via shadcn Chart (pnpm dlx shadcn@latest add chart) + recharts',
      'error',
    ),
  )
  issues.push(
    ...checkLines(
      code,
      CHART_EMPTY_BOX_RE,
      'CHART_EMPTY_BOX',
      'Empty bg-muted box used as chart stand-in — render a real chart instead',
      'error',
    ),
  )
  issues.push(
    ...checkLines(
      code,
      TO_FIXED_CURRENCY_RE,
      'RAW_NUMBER_FORMAT',
      'toFixed used with currency — use Intl.NumberFormat({ style: "currency", currency: "USD" })',
      'warning',
    ),
  )
  if (INLINE_MOCK_ARRAY_RE.test(code)) {
    const match = code.match(INLINE_MOCK_ARRAY_RE)
    if (match && match.index !== undefined) {
      const lineNum = code.slice(0, match.index).split('\n').length
      issues.push({
        line: lineNum,
        type: 'INLINE_MOCK_DATA',
        message: 'Inline array with 5+ items — extract to src/data/<name>.ts and import',
        severity: 'info',
      })
    }
  }
  // DOUBLE_SIGN severity tiers:
  //   - ERROR:  numeric comparison on the same value being formatted
  //             (`amount > 0 ? '+' : '-'` + `amount.toFixed()` nearby) — the
  //             value is already signed by the formatter, so the prefix will
  //             double up.
  //   - WARN:   type-string comparison (`type === 'credit' ? '+' : '-'` +
  //             `formatCurrency(amount)`) — may or may not double-sign,
  //             depends on whether the formatter or underlying value is
  //             itself signed. The AI-preferred idiom is still
  //             `Intl.NumberFormat({ signDisplay: 'always' })`, so we
  //             surface it — just not as a blocking error.
  const doubleSignLines = checkLines(
    code,
    DOUBLE_SIGN_RE,
    'DOUBLE_SIGN',
    'Manual +/- prefix — if the value is already signed (Intl.NumberFormat output, formatCurrency on a signed value), this renders as ++/-- in the UI. Prefer Intl.NumberFormat with signDisplay: "always".',
    'error',
  )
  const codeLinesForDs = code.split('\n')
  const demotedDoubleSign = doubleSignLines.map(issue => {
    const line = codeLinesForDs[issue.line - 1] || ''
    const isNumericCompare =
      /(?:amount|value|total|balance|change|delta|diff|sum|price|cost|profit|loss|pnl|qty|quantity)\s*[<>!=]=?\s*0\s*\?/i.test(
        line,
      )
    if (!isNumericCompare) return { ...issue, severity: 'warning' as const }
    // If Math.abs() or signDisplay appears in the surrounding 5 lines, the
    // formatter is receiving an unsigned value — the ternary drives sign
    // separately, not doubling it. Demote to info so it stops blocking.
    const windowStart = Math.max(0, issue.line - 3)
    const windowEnd = Math.min(codeLinesForDs.length, issue.line + 2)
    const window = codeLinesForDs.slice(windowStart, windowEnd).join('\n')
    if (/Math\.abs\s*\(|\.abs\s*\(|signDisplay/.test(window)) {
      return { ...issue, severity: 'info' as const }
    }
    return issue
  })
  issues.push(...demotedDoubleSign)
  // TableHead / TableCell column mismatch — AI adds column headers but forgets
  // to render matching body cells, leaving empty columns in the UI.
  const tableMismatchIssues = detectTableColumnMismatch(code)
  issues.push(...tableMismatchIssues)

  // Filter bar issues — duplicate filter for same dimension, control heights
  // that don't match.
  const filterBarIssues = detectFilterBarIssues(code)
  issues.push(...filterBarIssues)

  // Search icon misplaced — AI puts <Search /> as a sibling of <Input> instead
  // of absolute-positioning inside a relative wrapper, so the icon renders
  // above/below the field rather than inside it.
  issues.push(...detectSearchIconMisplaced(code))

  // Overlay patterns — Dialog full-width, custom overlay divs, AlertDialog misuse.
  issues.push(...detectOverlayIssues(code))
  // SM_BREAKPOINT fires often on landing pages (one sm: per section) and
  //   drowns out real issues in the fix report. Roll up to a single summary
  //   info per file: "N sm: breakpoints — consider md:/lg:".
  const smMatches = checkLines(
    code,
    SM_BREAKPOINT_RE,
    'SM_BREAKPOINT',
    'sm: breakpoint — consider if md:/lg: is sufficient',
    'info',
  )
  if (smMatches.length > 0) {
    const firstLine = smMatches[0].line
    const countSuffix = smMatches.length > 1 ? ` (${smMatches.length} occurrences)` : ''
    issues.push({
      line: firstLine,
      type: 'SM_BREAKPOINT',
      message: `sm: breakpoint — consider if md:/lg: is sufficient${countSuffix}`,
      severity: 'info',
    })
  }
  issues.push(
    ...checkLines(
      code,
      XL_BREAKPOINT_RE,
      'XL_BREAKPOINT',
      'xl: breakpoint — consider if md:/lg: is sufficient',
      'info',
    ),
  )
  issues.push(
    ...checkLines(
      code,
      XXL_BREAKPOINT_RE,
      'XXL_BREAKPOINT',
      '2xl: breakpoint — rarely needed, consider xl: instead',
      'warning',
    ),
  )
  issues.push(
    ...checkLines(
      code,
      LARGE_CARD_TITLE_RE,
      'LARGE_CARD_TITLE',
      'Large text on CardTitle — use text-sm font-medium',
      'warning',
    ),
  )

  // Native HTML — always error (Story 3.4: kill native elements)
  // skipCommentsAndStrings=true to avoid false positives on `<button` inside strings/comments
  // Skip native buttons that are intentional: icon-only (aria-label), copy buttons, inline text buttons
  const codeLines = code.split('\n')
  issues.push(
    ...checkLines(
      code,
      RAW_BUTTON_RE,
      'NATIVE_BUTTON',
      'Native <button> — use Button from @/components/ui/button',
      'error',
      true,
    ).filter(issue => {
      const nearby = codeLines.slice(Math.max(0, issue.line - 1), issue.line + 5).join(' ')
      if (nearby.includes('aria-label')) return false
      if (/onClick=\{.*copy/i.test(nearby)) return false
      return true
    }),
  )
  issues.push(
    ...checkLines(
      code,
      RAW_SELECT_RE,
      'NATIVE_SELECT',
      'Native <select> — use Select from @/components/ui/select',
      'error',
      true,
    ),
  )
  issues.push(
    ...checkLines(
      code,
      NATIVE_CHECKBOX_RE,
      'NATIVE_CHECKBOX',
      'Native <input type="checkbox"> — use Switch or Checkbox from @/components/ui/switch or @/components/ui/checkbox',
      'error',
      true,
    ),
  )
  issues.push(
    ...checkLines(
      code,
      NATIVE_TABLE_RE,
      'NATIVE_TABLE',
      'Native <table> — use Table, TableHeader, TableBody, etc. from @/components/ui/table',
      'warning',
      true,
    ),
  )
  const hasInputImport = /import\s.*Input.*from\s+['"]@\/components\/ui\//.test(code)
  if (!hasInputImport) {
    issues.push(
      ...checkLines(
        code,
        RAW_INPUT_RE,
        'RAW_INPUT',
        'Raw <input> element — import and use Input from @/components/ui/input',
        'warning',
        true,
      ),
    )
  }

  for (const pattern of PLACEHOLDER_PATTERNS) {
    const lines = code.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        issues.push({
          line: i + 1,
          type: 'PLACEHOLDER',
          message: 'Placeholder content detected — use real contextual content',
          severity: 'error',
        })
      }
    }
  }

  // Responsive check
  const hasGrid = /\bgrid\b/.test(code)
  const hasResponsive = /\bmd:|lg:/.test(code)
  if (hasGrid && !hasResponsive) {
    issues.push({
      line: 0,
      type: 'NO_RESPONSIVE',
      message: 'Grid layout without responsive breakpoints (md: or lg:)',
      severity: 'warning',
    })
  }

  // --- UX Ruleset checks ---

  // MISSING_ALT: <img> without alt attribute
  issues.push(
    ...checkLines(
      code,
      IMG_WITHOUT_ALT_RE,
      'MISSING_ALT',
      '<img> without alt attribute — add descriptive alt or alt="" for decorative images',
      'error',
    ),
  )

  // GENERIC_BUTTON_TEXT: vague button labels
  issues.push(
    ...checkLines(
      code,
      GENERIC_BUTTON_LABELS,
      'GENERIC_BUTTON_TEXT',
      'Generic button text — use specific verb ("Save changes", "Delete account")',
      'warning',
    ),
  )

  // NO_H1: page should have exactly one h1 (auth pages use CardTitle etc.)
  if (pageType !== 'auth') {
    const h1Matches = code.match(/<h1[\s>]/g)
    if (!h1Matches || h1Matches.length === 0) {
      issues.push({
        line: 0,
        type: 'NO_H1',
        message: 'Page has no <h1> — every page should have exactly one h1 heading',
        severity: 'warning',
      })
    } else if (h1Matches.length > 1) {
      issues.push({
        line: 0,
        type: 'MULTIPLE_H1',
        message: `Page has ${h1Matches.length} <h1> elements — use exactly one per page`,
        severity: 'warning',
      })
    }
  }

  // SKIPPED_HEADING: detect heading level gaps (h1→h3 without h2)
  const headingLevels = [...code.matchAll(/<h([1-6])[\s>]/g)].map(m => parseInt(m[1]))
  const hasCardContext = /\bCard\b|\bCardTitle\b|\bCardHeader\b/.test(code)
  for (let i = 1; i < headingLevels.length; i++) {
    if (headingLevels[i] > headingLevels[i - 1] + 1) {
      issues.push({
        line: 0,
        type: 'SKIPPED_HEADING',
        message: `Heading level skipped: h${headingLevels[i - 1]} → h${headingLevels[i]} — don't skip levels`,
        severity: hasCardContext ? 'info' : 'warning',
      })
      break
    }
  }

  // MISSING_LABEL: Input/Textarea without adjacent Label with htmlFor
  const hasLabelImport = /import\s.*Label.*from\s+['"]@\/components\/ui\//.test(code)
  const inputCount = (code.match(INPUT_TAG_RE) || []).length
  const labelForCount = (code.match(LABEL_FOR_RE) || []).length
  if (hasLabelImport && inputCount > 0 && labelForCount === 0) {
    issues.push({
      line: 0,
      type: 'MISSING_LABEL',
      message: 'Inputs found but no Label with htmlFor — every input must have a visible label',
      severity: 'error',
    })
  }
  if (!hasLabelImport && inputCount > 0 && !/<label\b/i.test(code)) {
    issues.push({
      line: 0,
      type: 'MISSING_LABEL',
      message: 'Inputs found but no Label component — import Label and add htmlFor on each input',
      severity: 'error',
    })
  }

  // PLACEHOLDER_ONLY_LABEL: Input with placeholder but page has no labels at all
  const hasPlaceholder = /placeholder\s*=/.test(code)
  if (hasPlaceholder && inputCount > 0 && labelForCount === 0 && !/<label\b/i.test(code) && !/<Label\b/.test(code)) {
    issues.push({
      line: 0,
      type: 'PLACEHOLDER_ONLY_LABEL',
      message: 'Inputs use placeholder only — add visible Label with htmlFor (placeholder is not a substitute)',
      severity: 'error',
    })
  }

  // MISSING_FOCUS_VISIBLE: interactive elements without focus-visible styles
  const hasInteractive = /<Button\b|<button\b|<a\b/.test(code)
  const hasFocusVisible = /focus-visible:/.test(code)
  const usesShadcnButton = /import\s.*Button.*from\s+['"]@\/components\/ui\//.test(code)
  if (hasInteractive && !hasFocusVisible && !usesShadcnButton) {
    issues.push({
      line: 0,
      type: 'MISSING_FOCUS_VISIBLE',
      message: 'Interactive elements without focus-visible styles — add focus-visible:ring-2 focus-visible:ring-ring',
      severity: 'info',
    })
  }

  // CLICKABLE_DIV: <div> or <span> with onClick but no role/tabIndex — keyboard-inaccessible
  const clickableTagRe = /<(div|span)\b[^>]*\bonClick\s*=[^>]*>/g
  for (const m of code.matchAll(clickableTagRe)) {
    const tag = m[0]
    const hasRole = /\brole\s*=\s*["'](?:button|link|tab|menuitem|option|switch|checkbox)["']/.test(tag)
    const hasTabIndex = /\btabIndex\s*=/.test(tag)
    if (!hasRole || !hasTabIndex) {
      const lineNumber = code.slice(0, m.index || 0).split('\n').length
      issues.push({
        line: lineNumber,
        type: 'CLICKABLE_DIV',
        message: `<${m[1]} onClick> without role and tabIndex — keyboard-inaccessible. Use <button>/<a> or add role="button" + tabIndex={0} + onKeyDown.`,
        severity: 'warning',
      })
      break
    }
  }

  // RAW_IMG_TAG: <img> in Next.js project — use next/image for optimization + CLS prevention
  const rawImgTags = code.match(/<img\b[^>]*>/g) || []
  if (rawImgTags.length > 0) {
    const firstLine = code.slice(0, code.indexOf(rawImgTags[0]!)).split('\n').length
    issues.push({
      line: firstLine,
      type: 'RAW_IMG_TAG',
      message: `<img> tag found — prefer <Image> from next/image for lazy-loading, format negotiation, and CLS-safe dimensions.`,
      severity: 'info',
    })
  }

  // IMAGE_MISSING_DIMENSIONS: <Image> without width+height and without fill — causes CLS
  const nextImageTags = code.match(/<Image\b[^>]*\/?>(?![^<]*<\/Image>)/g) || []
  for (const tag of nextImageTags) {
    const hasWidth = /\bwidth\s*=/.test(tag)
    const hasHeight = /\bheight\s*=/.test(tag)
    const hasFill = /\bfill(\s|=|\/|>)/.test(tag)
    if (!hasFill && (!hasWidth || !hasHeight)) {
      const lineNumber = code.slice(0, code.indexOf(tag)).split('\n').length
      issues.push({
        line: lineNumber,
        type: 'IMAGE_MISSING_DIMENSIONS',
        message:
          '<Image> without width/height (and no fill prop) — causes CLS. Add width={...} height={...} or use fill inside a sized parent.',
        severity: 'warning',
      })
      break
    }
  }

  // MISSING_METADATA: marketing page without SEO metadata — hurts discoverability
  if (pageType === 'marketing') {
    const isClient = /^["']use client["']/m.test(code) || /\n["']use client["']/.test(code)
    const hasMetadata = /export\s+(?:const|async\s+function)\s+(?:metadata|generateMetadata)\b/.test(code)
    if (!isClient && !hasMetadata) {
      issues.push({
        line: 0,
        type: 'MISSING_METADATA',
        message:
          'Marketing page without metadata export — add `export const metadata = { title, description }` for SEO.',
        severity: 'warning',
      })
    }
  }

  // NO_EMPTY_STATE: tables/lists/grids without empty state handling (warning)
  const hasTableOrList = /<Table\b|<table\b|\.map\s*\(|<ul\b|<ol\b/.test(code)
  const hasEmptyCheck =
    /\.length\s*[=!]==?\s*0|\.length\s*>\s*0|\.length\s*<\s*1|No\s+\w+\s+found|empty|no results|EmptyState|empty state/i.test(
      code,
    )
  if (hasTableOrList && !hasEmptyCheck) {
    issues.push({
      line: 0,
      type: 'NO_EMPTY_STATE',
      message: 'List/table/grid without empty state handling — add friendly message + primary action',
      severity: 'warning',
    })
  }

  // NO_LOADING_STATE: data fetching but no loading/skeleton pattern
  const hasDataFetching = /fetch\s*\(|useQuery|useSWR|useEffect\s*\([^)]*fetch|getData|loadData/i.test(code)
  const hasLoadingPattern = /skeleton|Skeleton|spinner|Spinner|isLoading|loading|Loading/.test(code)
  if (hasDataFetching && !hasLoadingPattern) {
    issues.push({
      line: 0,
      type: 'NO_LOADING_STATE',
      message: 'Page with data fetching but no loading/skeleton pattern — add skeleton or spinner',
      severity: 'warning',
    })
  }

  // EMPTY_ERROR_MESSAGE: generic error text
  const hasGenericError =
    /Something went wrong|"Error"|'Error'|>Error<\//.test(code) || /error\.message\s*\|\|\s*["']Error["']/.test(code)
  if (hasGenericError) {
    issues.push({
      line: 0,
      type: 'EMPTY_ERROR_MESSAGE',
      message: 'Generic error message detected — use what happened + why + what to do next',
      severity: 'warning',
    })
  }

  // DESTRUCTIVE_NO_CONFIRM: destructive button without confirmation
  const hasDestructive = /variant\s*=\s*["']destructive["']|Delete|Remove/.test(code)
  const hasConfirm = /AlertDialog|Dialog.*confirm|confirm\s*\(|onConfirm|are you sure/i.test(code)
  if (hasDestructive && !hasConfirm) {
    issues.push({
      line: 0,
      type: 'DESTRUCTIVE_NO_CONFIRM',
      message: 'Destructive action without confirmation dialog — add confirm before execution',
      severity: 'warning',
    })
  }

  // FORM_NO_FEEDBACK: form submit without success/error feedback
  const hasFormSubmit = /<form\b|onSubmit|type\s*=\s*["']submit["']/.test(code)
  const hasFeedback = /toast|success|error|Saved|Saving|saving|setError|setSuccess/i.test(code)
  if (hasFormSubmit && !hasFeedback) {
    issues.push({
      line: 0,
      type: 'FORM_NO_FEEDBACK',
      message: 'Form with submit but no success/error feedback pattern — add "Saving..." then "Saved" or error',
      severity: 'info',
    })
  }

  // NAV_NO_ACTIVE_STATE: navigation without active/current indicator
  const hasNav = /<nav\b|NavLink|navigation|sidebar.*link|Sidebar.*link/i.test(code)
  const hasActiveState = /pathname|active|current|aria-current|data-active/.test(code)
  if (hasNav && !hasActiveState) {
    issues.push({
      line: 0,
      type: 'NAV_NO_ACTIVE_STATE',
      message: 'Navigation without active/current page indicator — add active state for current route',
      severity: 'info',
    })
  }

  if (validRoutes && validRoutes.length > 0) {
    const routeSet = new Set(validRoutes)
    routeSet.add('#')
    // A dynamic route `/transactions/[id]` should match any concrete instance
    // `/transactions/tx-001`, etc. — otherwise detail-page links false-fire.
    // Pre-compute a list of dynamic-route regexes once per file.
    const dynamicRouteRes = validRoutes
      .filter(r => /\[[^\]]+\]/.test(r))
      .map(r => new RegExp('^' + r.replace(/\[[^\]]+\]/g, '[^/]+') + '$'))
    const matchesDynamic = (target: string) => dynamicRouteRes.some(re => re.test(target))
    const lines = code.split('\n')
    // Match `href="..."` but not `data-stale-href="..."` (our own autofix
    // output attribute) or any other `data-X-href`. Negative lookbehind
    // blocks a word or dash right before `href`.
    const linkHrefRe = /(?<![\w-])href\s*=\s*["'](\/[a-z0-9/-]*)["']/gi
    for (let i = 0; i < lines.length; i++) {
      let match
      while ((match = linkHrefRe.exec(lines[i])) !== null) {
        const target = match[1]
        if (
          target === '/' ||
          target.startsWith('/design-system') ||
          target.startsWith('/api') ||
          target.startsWith('/#')
        )
          continue
        if (routeSet.has(target)) continue
        if (matchesDynamic(target)) continue
        issues.push({
          line: i + 1,
          type: 'BROKEN_INTERNAL_LINK',
          message: `Link to "${target}" — route does not exist in project`,
          severity: 'warning',
        })
      }
    }
  }

  // NESTED_INTERACTIVE: Button/button inside Link/a (without asChild)
  const linkBlockRe = /<(?:Link|a)\b[^>]*>[\s\S]*?<\/(?:Link|a)>/g
  let linkMatch
  while ((linkMatch = linkBlockRe.exec(code)) !== null) {
    const block = linkMatch[0]
    if (/<(?:Button|button)\b/.test(block) && !/asChild/.test(block)) {
      issues.push({
        line: 0,
        type: 'NESTED_INTERACTIVE',
        message:
          'Button inside Link without asChild — causes DOM nesting error. Use <Button asChild><Link>...</Link></Button> instead',
        severity: 'error',
      })
      break
    }
  }

  // Nested <a> inside <a>
  const nestedAnchorRe = /<a\b[^>]*>[\s\S]*?<a\b/
  if (nestedAnchorRe.test(code)) {
    issues.push({
      line: 0,
      type: 'NESTED_INTERACTIVE',
      message: 'Nested <a> tags — causes DOM nesting error. Remove inner anchor or restructure',
      severity: 'error',
    })
  }

  // LINK_MISSING_HREF: <Link> or <a> without href attribute
  const linkWithoutHrefRe = /<(?:Link|a)\b(?![^>]*\bhref\s*=)[^>]*>/g
  let linkNoHrefMatch: RegExpExecArray | null
  while ((linkNoHrefMatch = linkWithoutHrefRe.exec(code)) !== null) {
    const matchLine = code.slice(0, linkNoHrefMatch.index).split('\n').length
    issues.push({
      line: matchLine,
      type: 'LINK_MISSING_HREF',
      message: '<Link> or <a> without href prop — causes Next.js runtime error. Add href attribute.',
      severity: 'error',
    })
  }

  // Component variant misuse (e.g. Button without variant="ghost" in nav)
  issues.push(...detectComponentIssues(code))

  // COMPONENT_TOO_LONG: page component over 300 lines - consider extracting sections
  const lineCount = code.split('\n').length
  if (lineCount > 300) {
    issues.push({
      line: 0,
      type: 'COMPONENT_TOO_LONG',
      message: `Page is ${lineCount} lines — consider extracting sections (data table, form, chart) into subcomponents.`,
      severity: 'info',
    })
  }

  // MISSING_ARIA_LABEL: icon-only button/link without aria-label
  const iconButtonRe = /<(?:Button|button)\b([^>]*)>[\s\n]*<(?:[A-Z]\w+)\s[^>]*\/?>[\s\n]*<\/(?:Button|button)>/g
  let iconMatch
  while ((iconMatch = iconButtonRe.exec(code)) !== null) {
    if (!iconMatch[1].includes('aria-label')) {
      const line = code.slice(0, iconMatch.index).split('\n').length
      issues.push({
        line,
        type: 'MISSING_ARIA_LABEL',
        message: 'Icon-only button without aria-label — add aria-label="description" for accessibility',
        severity: 'warning',
      })
    }
  }

  // SMALL_TOUCH_TARGET: size="icon" without sufficient padding/sizing
  const sizeIconRe = /size="icon"[^>]*/g
  let touchMatch
  while ((touchMatch = sizeIconRe.exec(code)) !== null) {
    const context = touchMatch[0]
    if (!/min-h-\[4[4-9]|min-w-\[4[4-9]|p-[3-9]\b|p-2\.5/.test(context)) {
      const line = code.slice(0, touchMatch.index).split('\n').length
      issues.push({
        line,
        type: 'SMALL_TOUCH_TARGET',
        message: 'Icon button may be < 44px touch target — add min-h-[44px] or increase padding',
        severity: 'warning',
      })
    }
  }

  // EMOJI_IN_UI: emoji unicode in JSX
  const emojiRe = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u
  if (emojiRe.test(code)) {
    const lines = code.split('\n')
    const lineIdx = lines.findIndex(l => emojiRe.test(l))
    issues.push({
      line: lineIdx + 1,
      type: 'EMOJI_IN_UI',
      message: 'Emoji character in UI — use Lucide icon instead (vector, scalable, theme-aware)',
      severity: 'warning',
    })
  }

  // v0.14.0 — VISUAL SANITY LAYER v1
  //
  // Three validators catching layout failures observed in 2026-04-27/28
  // dogfood (Notifications page with stuck-on selection backgrounds,
  // Calendar with all-days-highlighted broken grid). The constraint
  // additions in design-constraints.ts are PROBABILISTIC prevention;
  // these are DETERMINISTIC catches that fire when the AI ignored them
  // (per Codex pre-impl gate 2026-04-28: "rules alone are probabilistic
  // — failure mode already escaped compile/lint, need belt + suspenders").

  // BUTTON_NO_VARIANT_IN_MAP (v0.14.1 hotfix): shadcn <Button> used as a
  // list/cell wrapper inside .map() WITHOUT an explicit variant prop.
  // Default Button variant = bg-primary text-primary-foreground, so every
  // mapped item ends up rendering with the primary brand color regardless
  // of what the className tries to add (className only ADDS classes;
  // doesn't override the variant).
  //
  // Reproduced 2026-04-28 dogfood — Calendar (35 day cells) + Notifications
  // (list items) both wrapped <Button> without variant="ghost" inside
  // .map(). v0.14.0 STUCK_ON_SELECTION missed this because className
  // strings don't contain bg-primary literally — bg-primary comes from
  // the variant DEFAULT, which is invisible to text matching.
  //
  // The constraint at design-constraints.ts:218 already says "NEVER use
  // <Button> with custom bg-*/text-* classes... without variant='ghost'".
  // AI ignored it. This validator catches the violation deterministically.
  //
  // v0.14.3: bounded the search to the .map() body only. v0.14.1's regex
  // had unbounded `[\s\S]*?<Button` which could leap from a .map( on line
  // 50 to a stray <Button> on line 139 in a completely separate section.
  // Reproduced as false positive on landing/page.tsx during 2026-04-28
  // dogfood. Now we capture the bounded block (same lookahead trick as
  // the v0.14.2 autofix) and only check Buttons INSIDE that block.
  const buttonMapBlockRe =
    /\.map\s*\(\s*(?:\([^)]*\)|[a-zA-Z_$][\w$]*)\s*=>\s*[\s\S]*?(?=<\/Button>|<\/li>|<\/div>|\)\s*[},])/g
  let buttonMapBlockMatch
  while ((buttonMapBlockMatch = buttonMapBlockRe.exec(code)) !== null) {
    const block = buttonMapBlockMatch[0]
    const openTags = block.match(/<Button\b[^>]*?>/g)
    if (!openTags || openTags.length === 0) continue
    // Find first opening tag without variant.
    let bareTag: string | null = null
    for (const tag of openTags) {
      if (!/\bvariant\s*=/.test(tag)) {
        bareTag = tag
        break
      }
    }
    if (!bareTag) continue
    // Locate the tag in the original code for line number. Search starts
    // at the .map() match index to stay scoped to this block.
    const tagIdx = code.indexOf(bareTag, buttonMapBlockMatch.index)
    const line = tagIdx >= 0 ? code.slice(0, tagIdx).split('\n').length : 1
    issues.push({
      line,
      type: 'BUTTON_NO_VARIANT_IN_MAP',
      message:
        '<Button> inside .map() callback without explicit variant — default variant is bg-primary, every mapped item will render with the brand color. Use variant="ghost" for list rows / cell wrappers, variant="outline" for action buttons.',
      severity: 'error',
    })
    break // one error per file is enough
  }

  // STUCK_ON_SELECTION: unconditional selection background inside .map()
  // callbacks. Pattern: a list item element with bg-primary/accent/etc.
  // class that doesn't go through cn() or a conditional. Every list item
  // ends up looking selected — contrast collapses, text becomes unreadable.
  const mapBlockRe = /\.map\s*\(\s*(?:\([^)]*\)|[a-zA-Z_$][\w$]*)\s*=>\s*(?:\([\s\S]*?\)|[\s\S]*?)(?=\s*\)\s*[},])/g
  const stuckBgRe =
    /<(?:li|div|tr|button|a)\b[^>]*className=("|')[^"']*\b(bg-primary|bg-accent|bg-secondary|bg-destructive)\b[^"']*\1/g
  let mapMatch
  while ((mapMatch = mapBlockRe.exec(code)) !== null) {
    const block = mapMatch[0]
    if (/cn\(|className=\{`|className=\{[a-zA-Z_$]/.test(block)) {
      // Conditional className via cn() or template literal — safe.
      continue
    }
    if (stuckBgRe.test(block)) {
      const line = code.slice(0, mapMatch.index).split('\n').length
      issues.push({
        line,
        type: 'STUCK_ON_SELECTION',
        message:
          'Unconditional selection background inside .map() callback — every list item will look selected. Use conditional cn(isActive && "bg-accent") on the active item only.',
        severity: 'warning',
      })
      break // one warning per file is enough — caller fixes the pattern
    }
    stuckBgRe.lastIndex = 0
  }

  // CALENDAR_OVER_SELECTED: calendar/day grid where many cells carry
  // today/selected styling. AI's today-highlighting often misfires and
  // applies the class to every day cell. Heuristic: file contains
  // calendar markers AND has >= 4 unconditional bg-primary/accent
  // occurrences within a 60-line window.
  const isCalendarShape = /\bcalendar\b|\bgenerate(Days|Calendar)|\bisToday\b|\bsetMonth\b|days\.map\(/i.test(code)
  if (isCalendarShape) {
    const lines = code.split('\n')
    let maxCellsInWindow = 0
    let firstHotLine = -1
    for (let i = 0; i < lines.length; i++) {
      const window = lines.slice(i, i + 60).join('\n')
      // Match unconditional bg-X (NOT inside cn()/template) — sample
      // heuristic: count plain className="...bg-primary..." occurrences.
      const matches = window.match(/className=("|')[^"']*\b(bg-primary|bg-accent)\b[^"']*\1/g) || []
      const unconditional = matches.filter(m => !/cn\(/.test(m)).length
      if (unconditional > maxCellsInWindow) {
        maxCellsInWindow = unconditional
        firstHotLine = i + 1
      }
    }
    if (maxCellsInWindow >= 4) {
      issues.push({
        line: firstHotLine,
        type: 'CALENDAR_OVER_SELECTED',
        message: `Calendar/grid has ${maxCellsInWindow} cells with unconditional bg-primary/accent in a 60-line window — only ONE day should carry today/selected styling. Wrap in cn(isToday(day) && "bg-primary") on the active cell only.`,
        severity: 'warning',
      })
    }
  }

  // CELL_OVERFLOW_NO_CONTAIN: calendar/grid cells with mapped event chips
  // but no overflow containment. Long event titles bleed into adjacent
  // cells. Heuristic: file has calendar shape + maps an events array into
  // span/div children, but neither "truncate" nor "overflow-hidden"
  // appears anywhere in the file.
  if (isCalendarShape) {
    const hasEventMap = /events?\.map\(|appointments?\.map\(|sessions?\.map\(/i.test(code)
    const hasContain = /\btruncate\b|\boverflow-hidden\b|\bline-clamp-/.test(code)
    if (hasEventMap && !hasContain) {
      const lines = code.split('\n')
      const lineIdx = lines.findIndex(l => /events?\.map\(|appointments?\.map\(/i.test(l))
      issues.push({
        line: Math.max(1, lineIdx + 1),
        type: 'CELL_OVERFLOW_NO_CONTAIN',
        message:
          'Calendar/grid maps events into cells without overflow containment — long titles will bleed across cell borders. Add overflow-hidden on the cell + truncate (or line-clamp-N) on text children.',
        severity: 'warning',
      })
    }
  }

  return issues
}

export interface AutoFixContext {
  currentRoute?: string
  knownRoutes?: string[]
  linkMap?: Record<string, string>
}

function resolveHref(linkText: string, context?: AutoFixContext): string {
  if (!context) return '/'
  const text = linkText.trim().toLowerCase()

  if (context.linkMap) {
    for (const [label, route] of Object.entries(context.linkMap)) {
      if (label.toLowerCase() === text) return route
    }
  }

  if (context.knownRoutes) {
    const cleaned = text.replace(/^(back\s+to|go\s+to|view\s+all|see\s+all|return\s+to)\s+/i, '').trim()
    for (const route of context.knownRoutes) {
      const slug = route.split('/').filter(Boolean).pop() || ''
      const routeName = slug.replace(/[-_]/g, ' ')
      if (routeName && cleaned === routeName) return route
    }
  }

  return '/'
}

function replaceRawColors(classes: string, colorMap: Record<string, string>): { result: string; changed: boolean } {
  let changed = false
  let result = classes

  const accentColorRe =
    /\b((?:(?:[a-z][a-z0-9-]*:)*)?)(bg|text|border|ring|outline|shadow|from|to|via|divide|placeholder|decoration|caret|fill|stroke|accent)-(emerald|blue|violet|indigo|purple|teal|cyan|sky|rose|amber|red|green|yellow|pink|orange|fuchsia|lime)-(\d+)(?:\/\d+)?\b/g
  result = result.replace(accentColorRe, (m, statePrefix: string, prefix: string, color: string, shade: string) => {
    const bareNoOpacity = m.replace(statePrefix, '').replace(/\/\d+$/, '')
    if (colorMap[bareNoOpacity]) {
      changed = true
      return statePrefix + colorMap[bareNoOpacity]
    }
    const n = parseInt(shade)
    const isDestructive = color === 'red'
    const restAfterState = m.slice(statePrefix.length)
    const tailOpacity = restAfterState.match(/(\/\d+)$/)?.[0] ?? ''
    const applyShadowTail = (cls: string) => {
      if (!tailOpacity) return statePrefix + cls
      const base = cls.replace(/\/\d+$/, '')
      return statePrefix + base + tailOpacity
    }
    if (prefix === 'shadow') {
      const bgKey = `bg-${color}-${shade}`
      if (colorMap[bgKey]) {
        changed = true
        return applyShadowTail(colorMap[bgKey].replace(/^bg-/, 'shadow-'))
      }
      changed = true
      if (n <= 100) return applyShadowTail(isDestructive ? 'shadow-destructive/10' : 'shadow-primary/10')
      if (n <= 200) return applyShadowTail(isDestructive ? 'shadow-destructive/10' : 'shadow-primary/10')
      if (n <= 400) return applyShadowTail(isDestructive ? 'shadow-destructive/20' : 'shadow-primary/20')
      if (n <= 700) return applyShadowTail(isDestructive ? 'shadow-destructive' : 'shadow-primary')
      return applyShadowTail('shadow-muted')
    }
    if (prefix === 'bg') {
      changed = true
      if (n <= 100) return statePrefix + (isDestructive ? 'bg-destructive/10' : 'bg-primary/10')
      if (n <= 200) return statePrefix + (isDestructive ? 'bg-destructive/10' : 'bg-primary/10')
      if (n <= 400) return statePrefix + (isDestructive ? 'bg-destructive/20' : 'bg-primary/20')
      if (n <= 700) return statePrefix + (isDestructive ? 'bg-destructive' : 'bg-primary')
      return statePrefix + 'bg-muted'
    }
    if (prefix === 'text') {
      changed = true
      if (n <= 300) return statePrefix + 'text-foreground'
      if (n <= 600) return statePrefix + (isDestructive ? 'text-destructive' : 'text-primary')
      return statePrefix + 'text-foreground'
    }
    if (prefix === 'border' || prefix === 'ring' || prefix === 'outline') {
      changed = true
      return statePrefix + (isDestructive ? `${prefix}-destructive` : `${prefix}-primary`)
    }
    if (prefix === 'from' || prefix === 'to' || prefix === 'via') {
      changed = true
      if (n >= 100 && n <= 300)
        return statePrefix + (isDestructive ? `${prefix}-destructive/20` : `${prefix}-primary/20`)
      return statePrefix + (isDestructive ? `${prefix}-destructive` : `${prefix}-primary`)
    }
    return m
  })

  const neutralColorRe =
    /\b((?:(?:[a-z][a-z0-9-]*:)*)?)(bg|text|border|ring|outline|shadow|divide|placeholder|decoration|caret|fill|stroke|accent)-(zinc|slate|gray|neutral|stone)-(\d+)(?:\/\d+)?\b/g
  result = result.replace(neutralColorRe, (m, statePrefix: string, prefix: string, _color: string, shade: string) => {
    const bareNoOpacity = m.replace(statePrefix, '').replace(/\/\d+$/, '')
    if (colorMap[bareNoOpacity]) {
      changed = true
      return statePrefix + colorMap[bareNoOpacity]
    }
    const n = parseInt(shade)
    const restAfterStateNeutral = m.slice(statePrefix.length)
    const tailOpacityNeutral = restAfterStateNeutral.match(/(\/\d+)$/)?.[0] ?? ''
    const applyNeutralShadowTail = (cls: string) => {
      if (!tailOpacityNeutral) return statePrefix + cls
      const base = cls.replace(/\/\d+$/, '')
      return statePrefix + base + tailOpacityNeutral
    }
    if (prefix === 'shadow') {
      const bgKey = `bg-${_color}-${shade}`
      if (colorMap[bgKey]) {
        changed = true
        return applyNeutralShadowTail(colorMap[bgKey].replace(/^bg-/, 'shadow-'))
      }
      changed = true
      if (n <= 300) return applyNeutralShadowTail('shadow-muted')
      if (n <= 700) return applyNeutralShadowTail('shadow-muted')
      return applyNeutralShadowTail('shadow-background')
    }
    if (prefix === 'bg') {
      changed = true
      if (n <= 300) return statePrefix + 'bg-muted'
      if (n <= 700) return statePrefix + 'bg-muted'
      return statePrefix + 'bg-background'
    }
    if (prefix === 'text') {
      changed = true
      if (n <= 300) return statePrefix + 'text-foreground'
      if (n <= 600) return statePrefix + 'text-muted-foreground'
      return statePrefix + 'text-foreground'
    }
    if (prefix === 'border' || prefix === 'ring' || prefix === 'outline') {
      changed = true
      return statePrefix + `${prefix === 'border' ? 'border-border' : `${prefix}-ring`}`
    }
    return m
  })

  return { result, changed }
}

/**
 * Auto-fix simple, safe issues in generated code.
 * Returns { code, fixes } where fixes lists what was changed.
 */
export async function autoFixCode(code: string, context?: AutoFixContext): Promise<{ code: string; fixes: string[] }> {
  const fixes: string[] = []
  let fixed = code

  if (!fixed.includes('\n') && fixed.includes('\\n')) {
    fixed = fixed.replace(/\\n/g, '\n')
    fixes.push('unescaped literal \\n to real newlines')
  }

  // Fix escaped quotes in single-quoted strings (AI outputs: \'text' or 'text.\'' from JSON escaping)
  const beforeQuoteFix = fixed
  // Pattern 1: \' before }, ], or , (AI escaped closing quote in object/array literal)
  fixed = fixed.replace(/\\'(\s*[}\],])/g, "'$1")
  // Pattern 2: \' at end of line (original catch-all)
  fixed = fixed.replace(/(:\s*'.+)\\'(\s*)$/gm, "$1'$2")
  // Pattern 3: \' at start of string values (AI escaped opening quote: title: \'Text')
  fixed = fixed.replace(/:\s*\\'([^']*')/g, ": '$1")
  if (fixed !== beforeQuoteFix) {
    fixes.push('fixed escaped closing quotes in strings')
  }

  // Fix HTML entities in JavaScript code (AI sometimes generates &lt; &gt; &amp; in code)
  // Only replace outside quoted attribute values (="...&lt;...")
  const beforeEntityFix = fixed
  const isInsideAttrValue = (line: string, idx: number): boolean => {
    let inQuote = false
    let inAttr = false
    for (let i = 0; i < idx; i++) {
      if (line[i] === '=' && line[i + 1] === '"') {
        inAttr = true
        inQuote = true
        i++
      } else if (inAttr && line[i] === '"') {
        inAttr = false
        inQuote = false
      }
    }
    return inQuote
  }
  fixed = fixed
    .split('\n')
    .map(line => {
      let l = line
      l = l.replace(/&lt;/g, (m, offset) => (isInsideAttrValue(line, offset) ? m : '<'))
      l = l.replace(/&gt;/g, (m, offset) => (isInsideAttrValue(line, offset) ? m : '>'))
      l = l.replace(/&amp;/g, (m, offset) => (isInsideAttrValue(line, offset) ? m : '&'))
      return l
    })
    .join('\n')
  if (fixed !== beforeEntityFix) {
    fixes.push('Fixed syntax issues')
  }

  // Fix misplaced ) in template literal className: className={`...`})> → className={`...`}>
  const beforeTemplateFix = fixed
  fixed = fixed.replace(/`\)>/g, '`}>')
  if (fixed !== beforeTemplateFix) {
    fixes.push('Fixed syntax issues')
  }

  // Fix unescaped < in JSX text content (AI generates e.g. "<50ms" which is invalid JSX)
  // Only match within a single line, skip content with braces (JSX expressions / JS code)
  // Guard: if text between > and < contains JS expression chars, it's code not JSX text
  const isJsExpr = (text: string) => /[().;=&|!?]/.test(text)
  const beforeLtFix = fixed
  fixed = fixed.replace(/>([^<{}\n]*)<(\d)/g, (m, text, d) => (isJsExpr(text) ? m : `>${text}&lt;${d}`))
  fixed = fixed.replace(/>([^<{}\n]*)<([^/a-zA-Z!{>\n])/g, (m, text, ch) => (isJsExpr(text) ? m : `>${text}&lt;${ch}`))
  if (fixed !== beforeLtFix) {
    fixes.push('escaped < in JSX text content')
  }

  // text-base → text-sm (only in className strings, not in comments/variable names)
  if (/className="[^"]*\btext-base\b[^"]*"/.test(fixed)) {
    fixed = fixed.replace(/className="([^"]*)\btext-base\b([^"]*)"/g, 'className="$1text-sm$2"')
    fixes.push('text-base → text-sm')
  }

  // text-lg/xl in CardTitle context → remove (CardTitle uses font-semibold, no large text needed)
  if (/CardTitle[^>]*className="[^"]*text-(lg|xl|2xl)/.test(fixed)) {
    fixed = fixed.replace(/(CardTitle[^>]*className="[^"]*)text-(lg|xl|2xl)\b/g, '$1')
    fixes.push('large text in CardTitle → removed')
  }

  // shadow-md/lg/xl/2xl → shadow-sm. Skip floating/overlay elements
  // (fixed/absolute/sticky) where a strong shadow is the affordance, not
  // a mistake. Previous implementation used greedy `[^"]*` and only
  // caught the LAST shadow-* per className — now scan each className
  // independently and rewrite every matching token.
  let hadShadowFix = false
  fixed = fixed.replace(/className=("|')([^"']*)(\1)/g, (full, q, cls: string) => {
    if (!/\bshadow-(?:md|lg|xl|2xl)\b/.test(cls)) return full
    if (/\b(?:fixed|absolute|sticky)\b/.test(cls)) return full
    const next = cls.replace(/\bshadow-(?:md|lg|xl|2xl)\b/g, 'shadow-sm')
    if (next === cls) return full
    hadShadowFix = true
    return `className=${q}${next}${q}`
  })
  if (hadShadowFix) fixes.push('heavy shadow → shadow-sm')

  // Ensure 'use client' when React hooks or event handlers are used
  const hasHooks = /\b(useState|useEffect|useRef|useCallback|useMemo|useReducer|useContext)\b/.test(fixed)
  const hasEvents =
    /\b(onClick|onChange|onSubmit|onBlur|onFocus|onKeyDown|onKeyUp|onMouseEnter|onMouseLeave|onScroll|onInput)\s*[={]/.test(
      fixed,
    )
  const hasUseClient = /^['"]use client['"]/.test(fixed.trim())
  if ((hasHooks || hasEvents) && !hasUseClient) {
    fixed = `'use client'\n\n${fixed}`
    fixes.push('added "use client" (client features detected)')
  }

  // Strip metadata export when 'use client' is present (Next.js conflict)
  if (/^['"]use client['"]/.test(fixed.trim()) && /\bexport\s+const\s+metadata\s*:\s*Metadata\s*=\s*\{/.test(fixed)) {
    const metaMatch = fixed.match(/\bexport\s+const\s+metadata\s*:\s*Metadata\s*=\s*\{/)
    if (metaMatch) {
      const start = fixed.indexOf(metaMatch[0])
      const open = fixed.indexOf('{', start)
      let depth = 1,
        i = open + 1
      while (i < fixed.length && depth > 0) {
        if (fixed[i] === '{') depth++
        else if (fixed[i] === '}') depth--
        i++
      }
      const tail = fixed.slice(i)
      const semi = tail.match(/^\s*;/)
      const removeEnd = semi ? i + (semi.index! + semi[0].length) : i
      fixed = (fixed.slice(0, start) + fixed.slice(removeEnd)).replace(/\n{3,}/g, '\n\n').trim()
      fixes.push('removed metadata export (conflicts with "use client")')
    }
  }

  // Native <button> → <Button> with import (skip intentional native buttons)
  const lines = fixed.split('\n')
  let hasReplacedButton = false
  for (let i = 0; i < lines.length; i++) {
    if (!/<button\b/.test(lines[i])) continue
    // Skip intentional native buttons: icon-only (aria-label), copy handlers, inline text buttons
    if (lines[i].includes('aria-label')) continue
    if (/onClick=\{.*copy/i.test(lines[i])) continue
    // Check next few lines for aria-label or copy patterns
    const block = lines.slice(i, i + 5).join(' ')
    if (block.includes('aria-label') || /onClick=\{.*copy/i.test(block)) continue
    lines[i] = lines[i].replace(/<button\b/g, '<Button')
    hasReplacedButton = true
  }
  if (hasReplacedButton) {
    fixed = lines.join('\n')
    fixed = fixed.replace(/<\/button>/g, (_match, _offset) => {
      // Only replace closing tags that correspond to replaced opening tags
      // Simple heuristic: if there are more </Button> than <Button, keep as </button>
      return '</Button>'
    })
    // Recount to fix mismatched closing tags
    const openCount = (fixed.match(/<Button\b/g) || []).length
    const closeCount = (fixed.match(/<\/Button>/g) || []).length
    if (closeCount > openCount) {
      // Too many </Button>, convert extras back
      let excess = closeCount - openCount
      fixed = fixed.replace(/<\/Button>/g, m => {
        if (excess > 0) {
          excess--
          return '</button>'
        }
        return m
      })
    }
    const hasButtonImport = /import\s.*\bButton\b.*from\s+['"]@\/components\/ui\/button['"]/.test(fixed)
    if (!hasButtonImport) {
      const lastImportIdx = fixed.lastIndexOf('\nimport ')
      if (lastImportIdx !== -1) {
        const lineEnd = fixed.indexOf('\n', lastImportIdx + 1)
        fixed =
          fixed.slice(0, lineEnd + 1) + "import { Button } from '@/components/ui/button'\n" + fixed.slice(lineEnd + 1)
      } else {
        const insertAfter = hasUseClient ? fixed.indexOf('\n') + 1 : 0
        fixed =
          fixed.slice(0, insertAfter) + "import { Button } from '@/components/ui/button'\n" + fixed.slice(insertAfter)
      }
    }
    fixes.push('<button> → <Button> (with import)')
  }

  // Native <input> → <Input> with import
  if (/<input\b[^>]*(?:\/>|>)/i.test(fixed) && !fixed.includes('type="hidden"')) {
    const inputLines = fixed.split('\n')
    let hasReplacedInput = false
    for (let i = 0; i < inputLines.length; i++) {
      if (!/<input\b/i.test(inputLines[i])) continue
      if (inputLines[i].includes('type="hidden"') || inputLines[i].includes("type='hidden'")) continue
      inputLines[i] = inputLines[i].replace(/<input\b/gi, '<Input')
      hasReplacedInput = true
    }
    if (hasReplacedInput) {
      fixed = inputLines.join('\n')
      const hasInputImport = /import\s.*\bInput\b.*from\s+['"]@\/components\/ui\/input['"]/.test(fixed)
      if (!hasInputImport) {
        const lastImportIdx = fixed.lastIndexOf('\nimport ')
        if (lastImportIdx !== -1) {
          const lineEnd = fixed.indexOf('\n', lastImportIdx + 1)
          fixed =
            fixed.slice(0, lineEnd + 1) + "import { Input } from '@/components/ui/input'\n" + fixed.slice(lineEnd + 1)
        } else {
          const hasUseClient2 = /^['"]use client['"]/.test(fixed.trim())
          const insertAfter2 = hasUseClient2 ? fixed.indexOf('\n') + 1 : 0
          fixed =
            fixed.slice(0, insertAfter2) + "import { Input } from '@/components/ui/input'\n" + fixed.slice(insertAfter2)
        }
      }
      fixes.push('<input> → <Input> (with import)')
    }
  }

  // Auto-complete missing sub-imports for shadcn composite components
  const compositeComponents: Record<string, string[]> = {
    select: [
      'Select',
      'SelectContent',
      'SelectItem',
      'SelectTrigger',
      'SelectValue',
      'SelectGroup',
      'SelectLabel',
      'SelectSeparator',
      'SelectScrollUpButton',
      'SelectScrollDownButton',
    ],
    dialog: [
      'Dialog',
      'DialogContent',
      'DialogDescription',
      'DialogFooter',
      'DialogHeader',
      'DialogTitle',
      'DialogTrigger',
      'DialogClose',
      'DialogOverlay',
      'DialogPortal',
    ],
    dropdown_menu: [
      'DropdownMenu',
      'DropdownMenuContent',
      'DropdownMenuItem',
      'DropdownMenuLabel',
      'DropdownMenuSeparator',
      'DropdownMenuTrigger',
      'DropdownMenuCheckboxItem',
      'DropdownMenuGroup',
      'DropdownMenuRadioGroup',
      'DropdownMenuRadioItem',
      'DropdownMenuShortcut',
      'DropdownMenuSub',
      'DropdownMenuSubContent',
      'DropdownMenuSubTrigger',
    ],
    table: ['Table', 'TableBody', 'TableCaption', 'TableCell', 'TableFooter', 'TableHead', 'TableHeader', 'TableRow'],
    tabs: ['Tabs', 'TabsContent', 'TabsList', 'TabsTrigger'],
    card: ['Card', 'CardContent', 'CardDescription', 'CardFooter', 'CardHeader', 'CardTitle'],
    alert_dialog: [
      'AlertDialog',
      'AlertDialogAction',
      'AlertDialogCancel',
      'AlertDialogContent',
      'AlertDialogDescription',
      'AlertDialogFooter',
      'AlertDialogHeader',
      'AlertDialogTitle',
      'AlertDialogTrigger',
    ],
    popover: ['Popover', 'PopoverContent', 'PopoverTrigger'],
    command: [
      'Command',
      'CommandDialog',
      'CommandEmpty',
      'CommandGroup',
      'CommandInput',
      'CommandItem',
      'CommandList',
      'CommandSeparator',
      'CommandShortcut',
    ],
    form: ['Form', 'FormControl', 'FormDescription', 'FormField', 'FormItem', 'FormLabel', 'FormMessage'],
  }
  const beforeSubImportFix = fixed
  for (const [uiName, allExports] of Object.entries(compositeComponents)) {
    const importPath = `@/components/ui/${uiName.replace(/_/g, '-')}`
    const importRe = new RegExp(`import\\s*\\{([^}]+)\\}\\s*from\\s*['"]${importPath.replace(/[-/]/g, '\\$&')}['"]`)
    const importMatch = fixed.match(importRe)
    if (!importMatch) continue
    const imported = new Set(
      importMatch[1]
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
    )
    const usedInCode = allExports.filter(e => {
      if (imported.has(e)) return false
      return new RegExp(`<${e}[\\s/>]`).test(fixed) || new RegExp(`</${e}>`).test(fixed)
    })
    if (usedInCode.length > 0) {
      const merged = [...imported, ...usedInCode]
      const newImport = `import { ${merged.join(', ')} } from '${importPath}'`
      fixed = fixed.replace(importRe, newImport)
    }
  }
  if (fixed !== beforeSubImportFix) {
    fixes.push('added missing sub-imports for composite components')
  }

  // Raw Tailwind colors → semantic tokens (context-aware: skip terminal/code blocks)
  const colorMap: Record<string, string> = {
    'bg-zinc-950': 'bg-background',
    'bg-zinc-900': 'bg-background',
    'bg-slate-950': 'bg-background',
    'bg-slate-900': 'bg-background',
    'bg-gray-950': 'bg-background',
    'bg-gray-900': 'bg-background',
    'bg-zinc-800': 'bg-muted',
    'bg-slate-800': 'bg-muted',
    'bg-gray-800': 'bg-muted',
    'bg-zinc-100': 'bg-muted',
    'bg-slate-100': 'bg-muted',
    'bg-gray-100': 'bg-muted',
    'bg-white': 'bg-background',
    'bg-black': 'bg-background',
    'text-white': 'text-foreground',
    'text-black': 'text-foreground',
    'text-zinc-100': 'text-foreground',
    'text-zinc-200': 'text-foreground',
    'text-slate-100': 'text-foreground',
    'text-gray-100': 'text-foreground',
    'text-zinc-400': 'text-muted-foreground',
    'text-zinc-500': 'text-muted-foreground',
    'text-slate-400': 'text-muted-foreground',
    'text-slate-500': 'text-muted-foreground',
    'text-gray-400': 'text-muted-foreground',
    'text-gray-500': 'text-muted-foreground',
    'border-zinc-700': 'border-border',
    'border-zinc-800': 'border-border',
    'border-slate-700': 'border-border',
    'border-gray-700': 'border-border',
    'border-zinc-200': 'border-border',
    'border-slate-200': 'border-border',
    'border-gray-200': 'border-border',
  }

  // Process color replacements per-className to preserve intentional styling
  // in terminal/code blocks (detected by font-mono, bg-zinc-950, or parent context)
  const isCodeContext = (classes: string): boolean =>
    /\bfont-mono\b/.test(classes) || /\bbg-zinc-950\b/.test(classes) || /\bbg-zinc-900\b/.test(classes)

  const isInsideTerminalBlock = (offset: number): boolean => {
    const preceding = fixed.slice(Math.max(0, offset - 600), offset)
    if (!/(bg-zinc-950|bg-zinc-900)/.test(preceding)) return false
    if (!/font-mono/.test(preceding)) return false
    const lastClose = Math.max(preceding.lastIndexOf('</div>'), preceding.lastIndexOf('</section>'))
    const lastTerminal = Math.max(preceding.lastIndexOf('bg-zinc-950'), preceding.lastIndexOf('bg-zinc-900'))
    return lastTerminal > lastClose
  }

  let hadColorFix = false
  fixed = fixed.replace(/className="([^"]*)"/g, (fullMatch, classes: string, offset: number) => {
    if (isCodeContext(classes)) return fullMatch
    if (isInsideTerminalBlock(offset)) return fullMatch

    const { result, changed } = replaceRawColors(classes, colorMap)
    if (changed) hadColorFix = true
    if (result !== classes) return `className="${result}"`
    return fullMatch
  })

  // Replace colors in cn()/clsx()/cva() string arguments (supports one level of nested parens)
  fixed = fixed.replace(/(?:cn|clsx|cva)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, (fullMatch, args: string) => {
    const replaced = args.replace(/"([^"]*)"/g, (_qm, inner: string) => {
      const { result, changed } = replaceRawColors(inner, colorMap)
      if (changed) hadColorFix = true
      return `"${result}"`
    })
    if (replaced !== args) return fullMatch.replace(args, replaced)
    return fullMatch
  })

  // Replace colors in single-quoted className
  fixed = fixed.replace(/className='([^']*)'/g, (fullMatch, classes: string, offset: number) => {
    if (isCodeContext(classes)) return fullMatch
    if (isInsideTerminalBlock(offset)) return fullMatch
    const { result, changed } = replaceRawColors(classes, colorMap)
    if (changed) hadColorFix = true
    if (result !== classes) return `className='${result}'`
    return fullMatch
  })

  // Replace colors in template literal className
  fixed = fixed.replace(/className=\{`([^`]*)`\}/g, (fullMatch, inner: string) => {
    const { result, changed } = replaceRawColors(inner, colorMap)
    if (changed) hadColorFix = true
    if (result !== inner) return `className={\`${result}\`}`
    return fullMatch
  })

  if (hadColorFix) fixes.push('raw colors → semantic tokens')

  // Post-fix re-validation: catch issues introduced or missed by auto-fix (max 1 pass)
  if (hadColorFix) {
    const postFixIssues = validatePageQuality(fixed)
    const postFixErrors = postFixIssues.filter(
      i =>
        i.severity === 'error' &&
        ['raw-color', 'inline-style-color', 'arbitrary-color', 'svg-raw-color', 'color-prop'].includes(i.type),
    )
    if (postFixErrors.length > 0) {
      fixes.push(`post-fix re-validation found ${postFixErrors.length} remaining color issue(s)`)
    }
  }

  // Replace native <select> with shadcn Select
  const selectRe = /<select\b[^>]*>([\s\S]*?)<\/select>/g
  let hadSelectFix = false
  fixed = fixed.replace(selectRe, (_match, inner: string) => {
    const options: Array<{ value: string; label: string }> = []
    const optionRe = /<option\s+value="([^"]*)"[^>]*>([^<]*)<\/option>/g
    let optMatch
    while ((optMatch = optionRe.exec(inner)) !== null) {
      options.push({ value: optMatch[1], label: optMatch[2] })
    }
    if (options.length === 0) return _match
    hadSelectFix = true
    const items = options.map(o => `            <SelectItem value="${o.value}">${o.label}</SelectItem>`).join('\n')
    return `<Select>\n          <SelectTrigger>\n            <SelectValue placeholder="Select..." />\n          </SelectTrigger>\n          <SelectContent>\n${items}\n          </SelectContent>\n        </Select>`
  })
  if (hadSelectFix) {
    fixes.push('<select> → shadcn Select')
    const selectImport = `import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'`
    if (!/from\s+['"]@\/components\/ui\/select['"]/.test(fixed)) {
      const replaced = fixed.replace(
        /(import\s+\{[^}]*\}\s+from\s+['"]@\/components\/ui\/[^'"]+['"])/,
        `$1\n${selectImport}`,
      )
      if (replaced !== fixed) {
        fixed = replaced
      } else {
        fixed = selectImport + '\n' + fixed
      }
    }
  }

  // Fix invalid lucide-react icon imports (AI hallucinating non-existent names)
  const lucideImportMatch = fixed.match(/import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/)
  if (lucideImportMatch) {
    let lucideExports: Set<string> | null = null
    try {
      const { createRequire } = await import('module')
      const require = createRequire(process.cwd() + '/package.json')
      const lr = require('lucide-react')
      lucideExports = new Set(Object.keys(lr).filter(k => /^[A-Z]/.test(k)))
    } catch {
      /* lucide-react not resolvable — skip */
    }

    if (lucideExports) {
      // Collect names imported from NON-lucide sources
      const nonLucideImports = new Set<string>()
      for (const m of fixed.matchAll(/import\s*\{([^}]+)\}\s*from\s*["'](?!lucide-react)([^"']+)["']/g)) {
        m[1]
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
          .forEach(n => nonLucideImports.add(n))
      }

      let rawIconEntries = lucideImportMatch[1]
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)

      // Step 0: Deduplicate entries that resolve to the same local name (keep alias version)
      const seenLocals = new Map<string, number>()
      for (let i = 0; i < rawIconEntries.length; i++) {
        const local = rawIconEntries[i]
          .split(/\s+as\s+/)
          .pop()!
          .trim()
        if (seenLocals.has(local)) {
          const prevIdx = seenLocals.get(local)!
          const prevHasAlias = rawIconEntries[prevIdx].includes(' as ')
          const curHasAlias = rawIconEntries[i].includes(' as ')
          if (curHasAlias && !prevHasAlias) {
            rawIconEntries[prevIdx] = ''
          } else {
            rawIconEntries[i] = ''
          }
          fixes.push(`removed duplicate import ${local}`)
        } else {
          seenLocals.set(local, i)
        }
      }
      rawIconEntries = rawIconEntries.filter(Boolean)

      const iconNames = rawIconEntries.map(entry => {
        const parts = entry.split(/\s+as\s+/)
        return parts[0].trim()
      })

      // Step 1: Remove names that conflict with non-lucide imports (even if valid lucide exports)
      const duplicates = rawIconEntries.filter(entry => {
        const alias = entry
          .split(/\s+as\s+/)
          .pop()!
          .trim()
        return nonLucideImports.has(alias)
      })
      let newImport = rawIconEntries.join(', ')
      for (const dup of duplicates) {
        const escaped = dup.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        newImport = newImport.replace(new RegExp(`${escaped},?\\s*`), '')
        fixes.push(`removed ${dup} from lucide import (conflicts with UI component import)`)
      }

      const ICON_ALIASES: Record<string, string> = {
        Github: 'ExternalLink',
        GitHub: 'ExternalLink',
        Twitter: 'MessageCircle',
        Linkedin: 'Link2',
        LinkedIn: 'Link2',
        Slack: 'MessageSquare',
        Discord: 'MessageCircle',
        Facebook: 'Globe',
        Instagram: 'Camera',
        YouTube: 'Play',
        Youtube: 'Play',
        TikTok: 'Music',
        Reddit: 'MessageSquare',
        Twitch: 'Tv',
        Figma: 'Pen',
        Dribbble: 'Palette',
        Medium: 'FileText',
        WhatsApp: 'Phone',
        Telegram: 'Send',
        Pinterest: 'Pin',
        Spotify: 'Music',
      }

      const invalid = iconNames.filter(name => !lucideExports!.has(name) && !nonLucideImports.has(name))
      if (invalid.length > 0) {
        const replacements: string[] = []
        for (const bad of invalid) {
          const replacement = ICON_ALIASES[bad] || 'Circle'
          if (lucideExports!.has(replacement)) {
            const re = new RegExp(`\\b${bad}\\b`, 'g')
            newImport = newImport.replace(re, replacement)
            fixed = fixed.replace(re, replacement)
            replacements.push(`${bad}→${replacement}`)
          } else {
            const re = new RegExp(`\\b${bad}\\b`, 'g')
            newImport = newImport.replace(re, 'Circle')
            fixed = fixed.replace(re, 'Circle')
            replacements.push(`${bad}→Circle`)
          }
        }
        fixes.push(`invalid lucide icons: ${replacements.join(', ')}`)
      }

      const dedupHappened = seenLocals.size < lucideImportMatch[1].split(',').filter(s => s.trim()).length
      if (duplicates.length > 0 || invalid.length > 0 || dedupHappened) {
        const importedNames = [
          ...new Set(
            newImport
              .split(',')
              .map(s => s.trim())
              .filter(Boolean),
          ),
        ]
        const currentLucideImport = fixed.match(/import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/)
        if (currentLucideImport) {
          fixed = fixed.replace(currentLucideImport[0], `import { ${importedNames.join(', ')} } from "lucide-react"`)
        }
      }
    }
  }

  // Fix unimported icon references in JSX (AI uses <SettingsIcon> without importing)
  const lucideImportMatch2 = fixed.match(/import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/)
  if (lucideImportMatch2) {
    let lucideExports2: Set<string> | null = null
    try {
      const { createRequire } = await import('module')
      const req = createRequire(process.cwd() + '/package.json')
      const lr = req('lucide-react')
      lucideExports2 = new Set(Object.keys(lr).filter(k => /^[A-Z]/.test(k)))
    } catch {
      /* skip */
    }
    if (lucideExports2) {
      // Collect ALL imported local names from ALL import statements (resolving aliases)
      const allImportedNames = new Set<string>()
      for (const m of fixed.matchAll(/import\s*\{([^}]+)\}\s*from/g)) {
        m[1]
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
          .forEach(n => {
            const alias = n
              .split(/\s+as\s+/)
              .pop()!
              .trim()
            allImportedNames.add(alias)
          })
      }
      for (const m of fixed.matchAll(/import\s+([A-Z]\w+)\s+from/g)) {
        allImportedNames.add(m[1])
      }

      const lucideImported = new Set(
        lucideImportMatch2[1]
          .split(',')
          .map(s => s.trim())
          .filter(Boolean),
      )
      const jsxIconRefs = [...new Set([...fixed.matchAll(/<([A-Z][a-zA-Z]*Icon)\s/g)].map(m => m[1]))]
      const missing: string[] = []
      for (const ref of jsxIconRefs) {
        if (allImportedNames.has(ref)) continue
        if (fixed.includes(`function ${ref}`) || fixed.includes(`const ${ref}`)) continue
        const baseName = ref.replace(/Icon$/, '')
        if (lucideExports2.has(ref)) {
          missing.push(ref)
          lucideImported.add(ref)
        } else if (lucideExports2.has(baseName)) {
          const re = new RegExp(`\\b${ref}\\b`, 'g')
          fixed = fixed.replace(re, baseName)
          missing.push(baseName)
          lucideImported.add(baseName)
          fixes.push(`renamed ${ref} → ${baseName} (lucide-react)`)
        } else {
          const fallback = 'Circle'
          const re = new RegExp(`\\b${ref}\\b`, 'g')
          fixed = fixed.replace(re, fallback)
          lucideImported.add(fallback)
          fixes.push(`unknown icon ${ref} → ${fallback}`)
        }
      }
      if (missing.length > 0) {
        const allNames = [...lucideImported]
        const origLine = lucideImportMatch2[0]
        fixed = fixed.replace(origLine, `import { ${allNames.join(', ')} } from "lucide-react"`)
        fixes.push(`added missing lucide imports: ${missing.join(', ')}`)
      }
    }
  }

  // Ensure lucide icons have shrink-0 to prevent flex containers from squishing them
  const lucideNamesMatch = fixed.match(/import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/)
  if (lucideNamesMatch) {
    const lucideNames = new Set(
      lucideNamesMatch[1]
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
    )
    const beforeShrinkFix = fixed
    for (const iconName of lucideNames) {
      const iconRe = new RegExp(`(<${iconName}\\s[^>]*className=")([^"]*)(")`, 'g')
      fixed = fixed.replace(iconRe, (_m, pre: string, classes: string, post: string) => {
        if (/\bshrink-0\b/.test(classes)) return _m
        return `${pre}${classes} shrink-0${post}`
      })
    }
    if (fixed !== beforeShrinkFix) {
      fixes.push('added shrink-0 to icons')
    }
  }

  // Fix Button inside Link → Button asChild wrapping Link
  const linkWithButtonRe = /(<Link\b[^>]*>)\s*(<Button\b(?![^>]*asChild)[^>]*>)([\s\S]*?)<\/Button>\s*<\/Link>/g
  const beforeLinkFix = fixed
  fixed = fixed.replace(linkWithButtonRe, (_match, linkOpen: string, buttonOpen: string, inner: string) => {
    const hrefMatch = linkOpen.match(/href="([^"]*)"/)
    const href = hrefMatch ? hrefMatch[1] : '/'
    const buttonWithAsChild = buttonOpen.replace('<Button', '<Button asChild')
    return `${buttonWithAsChild}<Link href="${href}">${inner.trim()}</Link></Button>`
  })
  if (fixed !== beforeLinkFix) {
    fixes.push('Link>Button → Button asChild>Link (DOM nesting fix)')
  }

  // Fix Button asChild children — add inline-flex for base-ui compatibility
  // When shadcn uses @base-ui/react, asChild is not supported. The child element
  // (Link/a) renders as a nested block, breaking icon layout. Adding inline-flex
  // ensures text + icon stay on one line regardless of the underlying Button impl.
  const beforeAsChildFlex = fixed
  fixed = fixed.replace(
    /(<Button\b[^>]*\basChild\b[^>]*>)\s*(<(?:Link|a)\b)([^>]*)(>)/g,
    (_match, btnOpen: string, childTag: string, childProps: string, close: string) => {
      if (/\binline-flex\b/.test(childProps)) return _match
      if (/className="([^"]*)"/.test(childProps)) {
        const merged = childProps.replace(
          /className="([^"]*)"/,
          (_cm: string, classes: string) => `className="inline-flex items-center gap-2 ${classes}"`,
        )
        return `${btnOpen}${childTag}${merged}${close}`
      }
      return `${btnOpen}${childTag} className="inline-flex items-center gap-2"${close}`
    },
  )
  if (fixed !== beforeAsChildFlex) {
    fixes.push('added inline-flex to Button asChild children (base-ui compat)')
  }

  // Fix <Link> and <a> without href — smart resolution with fallback to "/"
  const beforeLinkHrefFix = fixed
  fixed = fixed.replace(/<(Link|a)\b(?![^>]*\bhref\s*=)([^>]*)>([\s\S]*?)<\/\1>/g, (_match, tag, attrs, children) => {
    const textContent = children.replace(/<[^>]*>/g, '').trim()
    const href = resolveHref(textContent, context)
    return `<${tag} href="${href}"${attrs}>${children}</${tag}>`
  })
  fixed = fixed.replace(/<(Link|a)\b(?![^>]*\bhref\s*=)([^>]*)\/?>/g, '<$1 href="/"$2>')
  if (fixed !== beforeLinkHrefFix) {
    fixes.push('added href to <Link>/<a> missing href')
  }

  // Fix shadcn component variant misuse (e.g. Button without variant="ghost" in nav)
  const { code: fixedByRules, fixes: ruleFixes } = applyComponentRules(fixed)
  if (ruleFixes.length > 0) {
    fixed = fixedByRules
    fixes.push(...ruleFixes)
  }

  // Strip border/outline classes from TabsTrigger page code (component handles its own borders)
  const beforeTabsFix = fixed
  fixed = fixed.replace(
    /(<TabsTrigger\b[^>]*className=")([^"]*)(")/g,
    (_m, pre: string, classes: string, post: string) => {
      const cleaned = classes.replace(/\b(border-input|border\b|outline\b)\s*/g, '').trim()
      if (cleaned !== classes.trim()) return `${pre}${cleaned}${post}`
      return _m
    },
  )
  if (fixed !== beforeTabsFix) {
    fixes.push('stripped border from TabsTrigger (shadcn handles active state)')
  }

  const beforeJunkFix = fixed
  fixed = fixed.replace(/className="([^"]*)"/g, (_match, classes: string) => {
    const cleaned = classes
      .split(/\s+/)
      .filter(c => c !== '-0')
      .join(' ')
    if (cleaned !== classes.trim()) return `className="${cleaned}"`
    return _match
  })
  if (fixed !== beforeJunkFix) {
    fixes.push('removed junk classes (-0)')
  }

  // Clean up double spaces in className that may result from previous fixes
  fixed = fixed.replace(/className="([^"]*)"/g, (_match, inner: string) => {
    const cleaned = inner.replace(/\s{2,}/g, ' ').trim()
    return `className="${cleaned}"`
  })

  // Fix broken placeholder image URLs
  let imgCounter = 1
  const beforeImgFix = fixed

  // /api/placeholder/W/H → picsum
  fixed = fixed.replace(/["']\/api\/placeholder\/(\d+)\/(\d+)["']/g, (_m, w, h) => {
    return `"https://picsum.photos/${w}/${h}?random=${imgCounter++}"`
  })

  // /placeholder-avatar-*.ext → pravatar
  fixed = fixed.replace(/["']\/placeholder-avatar[^"']*["']/g, () => {
    return `"https://i.pravatar.cc/150?u=user${imgCounter++}"`
  })

  // https://via.placeholder.com/WxH → picsum
  fixed = fixed.replace(/["']https?:\/\/via\.placeholder\.com\/(\d+)x?(\d*)(?:\/[^"']*)?\/?["']/g, (_m, w, h) => {
    const height = h || w
    return `"https://picsum.photos/${w}/${height}?random=${imgCounter++}"`
  })

  // /images/*.jpg|png|webp (non-existent local paths) → picsum
  fixed = fixed.replace(/["']\/images\/[^"']+\.(?:jpg|jpeg|png|webp|gif)["']/g, () => {
    return `"https://picsum.photos/800/400?random=${imgCounter++}"`
  })

  // /placeholder.jpg|png or /placeholder-*.jpg|png → picsum
  fixed = fixed.replace(/["']\/placeholder[^"']*\.(?:jpg|jpeg|png|webp)["']/g, () => {
    return `"https://picsum.photos/800/400?random=${imgCounter++}"`
  })

  if (fixed !== beforeImgFix) {
    fixes.push('placeholder images → working URLs (picsum/pravatar)')
  }

  const beforePlaceholder = fixed
  fixed = fixed.replace(
    />(\s*)Lorem ipsum[^<]*/gi,
    '>$1Streamline your workflow with intelligent automation and real-time collaboration tools',
  )
  fixed = fixed.replace(/>(\s*)Card content(\s*)</gi, '>$1View details$2<')
  fixed = fixed.replace(/>(\s*)Your (?:text|content) here(\s*)</gi, '>$1Get started today$2<')
  fixed = fixed.replace(/>(\s*)Description(\s*)</g, '>$1Overview$2<')
  fixed = fixed.replace(/>\s*Title\s*</g, '>Page Title<')
  fixed = fixed.replace(/placeholder\s*text/gi, 'contextual content')
  fixed = fixed.replace(/"John Doe"/g, '"Alex Thompson"')
  fixed = fixed.replace(/'John Doe'/g, "'Alex Thompson'")
  fixed = fixed.replace(/"Jane Doe"/g, '"Sarah Chen"')
  fixed = fixed.replace(/'Jane Doe'/g, "'Sarah Chen'")
  fixed = fixed.replace(/"user@example\.com"/g, '"alex@company.com"')
  fixed = fixed.replace(/'user@example\.com'/g, "'alex@company.com'")
  fixed = fixed.replace(/"test@example\.com"/g, '"team@company.com"')
  fixed = fixed.replace(/'test@example\.com'/g, "'team@company.com'")
  if (fixed !== beforePlaceholder) {
    fixes.push('placeholder content → contextual content')
  }

  const beforeIconProp = fixed
  fixed = fixed.replace(/(\bicon\s*:\s*)React\.ReactNode\b/g, '$1React.ElementType')
  if (fixed !== beforeIconProp) {
    fixes.push('icon prop: ReactNode → ElementType (forwardRef compat)')
  }

  // ─── VISUAL POLISH PASS ────────────────────────────────────────────
  // Deterministic fixes that improve visual quality without AI calls

  // 1. transition-all → transition-colors (safest default, avoids layout janking)
  const beforeTransition = fixed
  fixed = fixed.replace(/\btransition-all\b/g, 'transition-colors')
  if (fixed !== beforeTransition) {
    fixes.push('transition-all → transition-colors')
  }

  // 2. Excessive padding → p-6 max
  const beforePadding = fixed
  fixed = fixed.replace(/\bp-(8|10|12|14|16|20)\b/g, 'p-6')
  if (fixed !== beforePadding) {
    fixes.push('excessive padding → p-6')
  }

  // 3. Add focus-visible to interactive elements missing it
  const beforeFocus = fixed
  // Buttons without focus-visible (that aren't already handled by shadcn Button)
  fixed = fixed.replace(/(<(?:button|a)\s[^>]*className="[^"]*)(hover:[^"]*")/g, (match, before, hover) => {
    if (match.includes('focus-visible:')) return match
    return `${before}focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${hover}`
  })
  if (fixed !== beforeFocus) {
    fixes.push('added focus-visible to interactive elements')
  }

  // 4. Banned placeholder names expansion
  const beforeNames = fixed
  fixed = fixed.replace(/"Jane Smith"/g, '"Elena Vasquez"')
  fixed = fixed.replace(/'Jane Smith'/g, "'Elena Vasquez'")
  fixed = fixed.replace(/"Acme Corp"/g, '"Meridian Labs"')
  fixed = fixed.replace(/'Acme Corp'/g, "'Meridian Labs'")
  fixed = fixed.replace(/"TechCorp"/g, '"Canopy Health"')
  fixed = fixed.replace(/'TechCorp'/g, "'Canopy Health'")
  fixed = fixed.replace(/"SmartFlow"/g, '"Brickwell Partners"')
  fixed = fixed.replace(/'SmartFlow'/g, "'Brickwell Partners'")
  fixed = fixed.replace(/"Nexus Inc"/g, '"Verde Analytics"')
  fixed = fixed.replace(/'Nexus Inc'/g, "'Verde Analytics'")
  if (fixed !== beforeNames) {
    fixes.push('banned names → diverse alternatives')
  }

  // 5. Strip extra borders/shadows from TabsList
  const beforeTabs = fixed
  fixed = fixed.replace(
    /(TabsList[^>]*className="[^"]*)\b(?:border|shadow|ring|border-border|shadow-sm|ring-1)[^"]*(")/g,
    (match, before, after) => {
      // Only strip if it's adding extra decoration beyond default
      const cleaned = match
        .replace(/\bborder(?:-\w+)?\b/g, '')
        .replace(/\bshadow(?:-\w+)?\b/g, '')
        .replace(/\bring(?:-\w+)?\b/g, '')
        .replace(/\s{2,}/g, ' ')
      return cleaned
    },
  )
  if (fixed !== beforeTabs) {
    fixes.push('stripped extra borders from TabsList')
  }

  // 6. DIALOG_FULL_WIDTH — inject max-w-* default into DialogContent/SheetContent.
  //    Matches the validator at line 324. Default: max-w-lg for Dialog/AlertDialog,
  //    sm:max-w-md for Sheet (which animates from the side).
  let hadOverlayWidthFix = false
  fixed = fixed.replace(/<(Dialog|AlertDialog|Sheet)Content\b([^>]*)>/g, (full, kind, attrs) => {
    if (/\bmax-w-(?:sm|md|lg|xl|2xl|3xl|\[[^\]]+\])\b/.test(attrs)) return full
    if (/\bsm:max-w-/.test(attrs)) return full
    // Sheet with fixed w-* is already bounded — don't double-cap.
    if (kind === 'Sheet' && /\bw-(?:\d+|\[[^\]]+\]|\w+)\b/.test(attrs)) return full
    const widthClass = kind === 'Sheet' ? 'sm:max-w-md' : 'max-w-lg'
    // Inject into className if present, else append a className prop.
    if (/className=/.test(attrs)) {
      const patched = attrs.replace(/className=("|')([^"']*)(\1)/, (_m: string, q: string, cls: string, q2: string) => {
        const next = cls.trim() ? `${widthClass} ${cls.trim()}` : widthClass
        return `className=${q}${next}${q2}`
      })
      if (patched !== attrs) {
        hadOverlayWidthFix = true
        return `<${kind}Content${patched}>`
      }
    }
    hadOverlayWidthFix = true
    return `<${kind}Content className="${widthClass}"${attrs}>`
  })
  if (hadOverlayWidthFix) fixes.push('Dialog/Sheet full-width → max-w-* default')

  // 7. SMALL_TOUCH_TARGET — add min-h-[44px] min-w-[44px] to size="icon" buttons.
  //    Validator: size="icon" with no explicit sizing.
  //
  // v0.13.10 SAFETY: the original regex `[^>]*` for attrs stops at the
  // first `>`. JSX prop expressions like `onClick={() => fn()}` contain
  // `>` inside `{...}` — the regex truncates `attrs` mid-expression
  // and the className insertion lands inside the arrow body:
  //   <Button onClick={() = className="..." > stepMonth(-1)}>
  // Real corruption written to user files (dogfood 2026-04-27).
  // Mitigation: bail when `attrs` has unbalanced braces/parens — that
  // signals the regex captured a partial element and we'd corrupt JSX.
  // Cost of bail: validator still warns, no auto-fix. User can apply
  // manually. Better than writing invalid TSX.
  let hadTouchFix = false
  fixed = fixed.replace(/<(?:Button|button)\b([^>]*size=("|')icon\2[^>]*)>/g, (full, attrs) => {
    // Bail check: unbalanced { or ( in attrs means regex truncated
    // mid-expression. Skip rather than corrupt.
    const openBraces = (attrs.match(/\{/g) || []).length
    const closeBraces = (attrs.match(/\}/g) || []).length
    const openParens = (attrs.match(/\(/g) || []).length
    const closeParens = (attrs.match(/\)/g) || []).length
    if (openBraces !== closeBraces || openParens !== closeParens) {
      return full // signals corrupt match — leave element untouched
    }

    if (
      /\bmin-h-\[4[4-9]|\bmin-h-11\b|\bh-11\b|\bmin-w-\[4[4-9]|\bmin-w-11\b|\bw-11\b|\bp-[3-9]\b|\bp-2\.5\b/.test(attrs)
    ) {
      return full
    }
    const touchClasses = 'min-h-[44px] min-w-[44px]'
    if (/className=/.test(attrs)) {
      const patched = attrs.replace(/className=("|')([^"']*)(\1)/, (_m: string, q: string, cls: string, q2: string) => {
        const next = cls.trim() ? `${cls.trim()} ${touchClasses}` : touchClasses
        return `className=${q}${next}${q2}`
      })
      if (patched !== attrs) {
        hadTouchFix = true
        return full.replace(attrs, patched)
      }
    }
    hadTouchFix = true
    return full.replace(/>$/, ` className="${touchClasses}">`)
  })
  if (hadTouchFix) fixes.push('icon buttons → min 44px touch target')

  // 7b. BUTTON_NO_VARIANT_IN_MAP (v0.14.2 auto-fix) — insert variant="ghost" on
  //    shadcn <Button> elements inside .map() callbacks that lack an explicit
  //    variant prop. Companion to the validator added in v0.14.1. ghost is the
  //    correct choice for list rows / cell wrappers (the dominant offending
  //    context — calendar cells, notification rows, sidebar nav). For action
  //    toggles users want variant={isActive ? 'default' : 'outline'} which we
  //    can't infer mechanically, so this auto-fix biases to the ghost case
  //    (~80% of mapped Button usage) and accepts that the remaining 20% may
  //    need a manual variant override after.
  let hadVariantFix = false
  const buttonInMapAutoFixRe =
    /\.map\s*\(\s*(?:\([^)]*\)|[a-zA-Z_$][\w$]*)\s*=>\s*[\s\S]*?(?=<\/Button>|<\/li>|<\/div>|\)\s*[},])/g
  fixed = fixed.replace(buttonInMapAutoFixRe, mapBlock => {
    return mapBlock.replace(/<Button\b([^>]*?)>/g, (full, attrs: string) => {
      // Skip if variant already declared.
      if (/\bvariant\s*=/.test(attrs)) return full
      // Skip if it's a self-closing or non-shadcn case (we already restricted
      // by capitalized Button — this is a defensive belt).
      if (/\bvariant=$/.test(attrs)) return full // mid-edit, skip
      hadVariantFix = true
      // Insert variant="ghost" right after <Button (before any other attrs).
      // Preserves existing attribute order for clean diffs.
      return `<Button variant="ghost"${attrs}>`
    })
  })
  if (hadVariantFix) fixes.push('Button in .map() → variant="ghost"')

  // 8. MISSING_ARIA_LABEL — for icon-only Button/button with a lucide icon child,
  //    infer aria-label from the icon component name. Lucide icons are
  //    PascalCase and semantic (Trash, Edit, X, Menu, Plus, Check), so they
  //    map cleanly to human labels. Skip when aria-label already present or
  //    when the button has visible text.
  const iconAriaRe = /<(Button|button)\b([^>]*)>\s*<([A-Z][A-Za-z0-9]*)\b([^>]*?)(?:\/>|>\s*<\/\3>)\s*<\/\1>/g
  const iconToLabel = (iconName: string): string => {
    // Strip trailing "Icon" suffix ("TrashIcon" → "Trash"), then space-split camelCase.
    const cleaned = iconName.replace(/Icon$/, '')
    const spaced = cleaned.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
    const overrides: Record<string, string> = {
      x: 'Close',
      'more horizontal': 'More options',
      'more vertical': 'More options',
      menu: 'Open menu',
      plus: 'Add',
      minus: 'Remove',
      pencil: 'Edit',
      edit: 'Edit',
      trash: 'Delete',
      'trash 2': 'Delete',
      search: 'Search',
      filter: 'Filter',
      settings: 'Settings',
      check: 'Confirm',
      copy: 'Copy',
      share: 'Share',
      download: 'Download',
      upload: 'Upload',
      'chevron down': 'Expand',
      'chevron up': 'Collapse',
      'chevron left': 'Previous',
      'chevron right': 'Next',
      'arrow right': 'Next',
      'arrow left': 'Back',
      bell: 'Notifications',
      user: 'Account',
      'log out': 'Sign out',
    }
    return overrides[spaced] || cleaned.replace(/([a-z])([A-Z])/g, '$1 $2')
  }
  let hadAriaFix = false
  fixed = fixed.replace(iconAriaRe, (full, tag, attrs, iconName) => {
    if (/\baria-label\s*=/.test(attrs)) return full
    const label = iconToLabel(iconName)
    const newAttrs = (attrs.trimEnd() + ` aria-label="${label}"`).replace(/^\s*/, ' ')
    hadAriaFix = true
    return full.replace(`<${tag}${attrs}>`, `<${tag}${newAttrs}>`)
  })
  if (hadAriaFix) fixes.push('added aria-label to icon-only buttons')

  // 9. DOUBLE_SIGN — the AI writes `{amount > 0 ? '+' : ''}${amount.toFixed(2)}`
  //    where amount is already negative (e.g. -120.50), producing "+-120.50".
  //    Convert to Intl.NumberFormat with signDisplay: 'always' and one call.
  //    We only fix a very narrow, high-confidence pattern: `{X > 0 ? '+' : ''}${formatCurrency(X)}`
  //    or `{X > 0 ? '+' : ''}${X.toFixed(N)}`. Broader patterns are left for manual review.
  const doubleSignPatterns: Array<[RegExp, string]> = [
    [
      /\{\s*([\w.]+)\s*>\s*0\s*\?\s*['"]\+['"]\s*:\s*['"]['"]\s*\}\$?\{?\s*([\w.]+)\.toFixed\((\d+)\)\s*\}?/g,
      (() =>
        '{new Intl.NumberFormat("en-US", { signDisplay: "always", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(0)}')(),
    ],
  ]
  // The callback form above is wrong for capture groups — use a dedicated replace.
  let hadDoubleSign = false
  fixed = fixed.replace(
    /\{\s*([\w.[\]]+)\s*>\s*0\s*\?\s*['"]\+['"]\s*:\s*['"]['"]\s*\}\s*\{?\s*([\w.[\]]+)\.toFixed\((\d+)\)\s*\}?/g,
    (_m, signVar, valueVar, digits) => {
      if (signVar !== valueVar) return _m
      hadDoubleSign = true
      return `{new Intl.NumberFormat("en-US", { signDisplay: "always", minimumFractionDigits: ${digits}, maximumFractionDigits: ${digits} }).format(${valueVar})}`
    },
  )
  // Also catch `{X > 0 ? '+' : ''}{formatCurrency(X)}` / `{X > 0 ? '+' : ''}${formatCurrency(X)}`.
  fixed = fixed.replace(
    /\{\s*([\w.[\]]+)\s*>\s*0\s*\?\s*['"]\+['"]\s*:\s*['"]['"]\s*\}\s*\$?\{\s*([A-Za-z_$][\w.]*)\(([\w.[\]]+)\)\s*\}/g,
    (_m, signVar, fnName, argVar) => {
      if (signVar !== argVar) return _m
      hadDoubleSign = true
      // Preserve the caller's formatter but prefix sign via a small inline helper.
      return `{(${argVar} >= 0 ? "+" : "") + ${fnName}(${argVar}).replace(/^-/, "-")}`
    },
  )
  if (hadDoubleSign) fixes.push('DOUBLE_SIGN → signDisplay or guarded sign')
  void doubleSignPatterns

  // 10. RAW_NUMBER_FORMAT — `$${amount.toFixed(2)}` in JSX is the most common
  //     currency footgun: no thousands separator, wrong locale, no signDisplay.
  //     Replace with a USD Intl.NumberFormat call. Only fire on the exact
  //     `$\{X.toFixed(N)}` or `$${X.toFixed(N)}` shapes — avoid touching
  //     arbitrary toFixed calls that may be non-currency.
  let hadCurrencyFix = false
  fixed = fixed.replace(/\$\{([\w.[\]]+)\.toFixed\(\s*(\d+)\s*\)\}/g, (_m, valueVar, digits) => {
    hadCurrencyFix = true
    return `\${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: ${digits}, maximumFractionDigits: ${digits} }).format(${valueVar})}`
  })
  fixed = fixed.replace(/\$(?=\{)\{([\w.[\]]+)\.toFixed\(\s*(\d+)\s*\)\}/g, (_m, valueVar, digits) => {
    hadCurrencyFix = true
    return `{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: ${digits}, maximumFractionDigits: ${digits} }).format(${valueVar})}`
  })
  if (hadCurrencyFix) fixes.push('toFixed currency → Intl.NumberFormat')

  // 11. RAW_IMG_TAG — `<img src="..." ...>` → `<Image src="..." ...>` from
  //     next/image. Only rewrite when width AND height are explicit (Next
  //     requires them; otherwise the <Image> fires a second validator).
  //     Adds the import if missing.
  let hadImgFix = false
  fixed = fixed.replace(/<img\b([^>]*)\/?>/g, (full, attrs: string) => {
    const hasWidth = /\bwidth\s*=/.test(attrs)
    const hasHeight = /\bheight\s*=/.test(attrs)
    if (!hasWidth || !hasHeight) return full
    const hasSrc = /\bsrc\s*=/.test(attrs)
    if (!hasSrc) return full
    hadImgFix = true
    const normalized = attrs.trimEnd()
    return `<Image${normalized} />`
  })
  if (hadImgFix) {
    const hasImport = /from\s+['"]next\/image['"]/.test(fixed)
    if (!hasImport) {
      const importLine = "import Image from 'next/image'"
      const lastImportIdx = fixed.lastIndexOf('\nimport ')
      if (lastImportIdx !== -1) {
        const lineEnd = fixed.indexOf('\n', lastImportIdx + 1)
        fixed = fixed.slice(0, lineEnd + 1) + importLine + '\n' + fixed.slice(lineEnd + 1)
      } else {
        const hasUseClient = /^['"]use client['"]/.test(fixed.trim())
        const insertAfter = hasUseClient ? fixed.indexOf('\n') + 1 : 0
        fixed = fixed.slice(0, insertAfter) + importLine + '\n' + fixed.slice(insertAfter)
      }
    }
    fixes.push('<img> → <Image> (with import)')
  }

  // 12. BROKEN_INTERNAL_LINK — `href="/missing"` where /missing isn't in
  //     config.pages. Replace with `href="#"` + preserve the original in a
  //     `data-stale-href` attribute so reviewers can see which link died.
  //     Guard: only runs when caller passes knownRoutes (fix + check paths),
  //     so we never rewrite a valid href just because we lack context.
  const staleHrefs: string[] = []
  if (context?.knownRoutes && context.knownRoutes.length > 0) {
    const routeSet = new Set(context.knownRoutes)
    routeSet.add('/')
    // Dynamic routes cover any concrete sibling: /transactions/[id] matches
    // /transactions/tx-002. Build one regex per dynamic route, used below.
    const dynamicRouteRes = context.knownRoutes
      .filter(r => /\[[^\]]+\]/.test(r))
      .map(r => new RegExp('^' + r.replace(/\[[^\]]+\]/g, '[^/]+') + '$'))
    fixed = fixed.replace(/(?<![\w-])href\s*=\s*(["'])(\/[^"'#?]+)\1/g, (full: string, quote: string, href: string) => {
      if (href.startsWith('/design-system') || href.startsWith('/api')) return full
      if (routeSet.has(href)) return full
      if (dynamicRouteRes.some(re => re.test(href))) return full
      staleHrefs.push(href)
      return `href=${quote}#${quote} data-stale-href=${quote}${href}${quote}`
    })
  }
  if (staleHrefs.length > 0) {
    const uniqueHrefs = [...new Set(staleHrefs)]
    fixes.push(
      `broken link(s) → href="#" with data-stale-href: ${uniqueHrefs.slice(0, 3).join(', ')}${uniqueHrefs.length > 3 ? ` +${uniqueHrefs.length - 3} more` : ''}`,
    )
  }

  // 13. CHART_PLACEHOLDER — replace the "Chart ... would go here" / "placeholder"
  //     div content with an animated bar-chart skeleton. Not a real
  //     visualization (that's AI territory), but visually honest: looks like
  //     a chart loading rather than "please come back later" ad copy.
  //     Narrow match: a <div> whose inner text matches the placeholder
  //     regex. Rewrite only the inner content, keep the wrapper className.
  const chartPlaceholderInnerRe =
    /(<div[^>]*h-\[[^\]]+\][^>]*>)([\s\S]*?chart\s+(?:visualization|would\s+go\s+here|breakdown\s+chart\s+would\s+go|placeholder|coming\s+soon)[\s\S]*?)(<\/div>)/gi
  let hadChartFix = false
  fixed = fixed.replace(chartPlaceholderInnerRe, (_m, open: string, _inner: string, close: string) => {
    hadChartFix = true
    const wrapperRewritten = open.replace(
      /className=("|')([^"']*)(\1)/,
      (_cm: string, q: string, cls: string, q2: string) => {
        const cleaned = cls
          .replace(/\bflex\b/g, '')
          .replace(/\bitems-center\b/g, '')
          .replace(/\bjustify-center\b/g, '')
          .replace(/\btext-(?:sm|xs|base|lg|xl)\b/g, '')
          .replace(/\btext-muted-foreground\b/g, '')
          .replace(/\s{2,}/g, ' ')
          .trim()
        const next = `${cleaned} flex items-end gap-2 px-4 pb-4`
        return `className=${q}${next.trim()}${q2}`
      },
    )
    // Explicit bars (not .map()) so NO_EMPTY_STATE — which matches any
    // `.map(` in the file — does not trip on a purely decorative chart stub.
    // `transition-colors` (not `transition-all`) keeps TRANSITION_ALL quiet.
    const bars = [40, 65, 45, 80, 55, 70, 85]
      .map(
        h =>
          `          <div style={{ height: "${h}%" }} className="flex-1 bg-primary/30 rounded-t-sm transition-colors hover:bg-primary/60" aria-hidden />`,
      )
      .join('\n')
    return `${wrapperRewritten}\n${bars}\n        ${close}`
  })
  if (hadChartFix) fixes.push('CHART_PLACEHOLDER → animated skeleton bars')

  return { code: fixed, fixes }
}

export function formatIssues(issues: QualityIssue[]): string {
  if (issues.length === 0) return ''

  const errors = issues.filter(i => i.severity === 'error')
  const warnings = issues.filter(i => i.severity === 'warning')
  const infos = issues.filter(i => i.severity === 'info')

  const lines: string[] = []
  if (errors.length > 0) {
    lines.push(`  ❌ ${errors.length} error(s):`)
    for (const e of errors) {
      lines.push(`     L${e.line}: [${e.type}] ${e.message}`)
    }
  }
  if (warnings.length > 0) {
    lines.push(`  ⚠️  ${warnings.length} warning(s):`)
    for (const w of warnings) {
      lines.push(`     L${w.line}: [${w.type}] ${w.message}`)
    }
  }
  if (infos.length > 0) {
    lines.push(`  ℹ️  ${infos.length} info:`)
    for (const i of infos) {
      lines.push(`     L${i.line}: [${i.type}] ${i.message}`)
    }
  }
  return lines.join('\n')
}

/**
 * One-line summary of quality issues for streaming chat output. Aggregates
 * by severity and inlines the unique rule types so the user knows what's
 * flagged without a multi-line block per page. Returns empty string when
 * there are no issues — caller should branch on truthiness.
 *
 * Example: `1 warning [NO_EMPTY_STATE] · 2 hints [SM_BREAKPOINT, INLINE_MOCK_DATA]`
 */
export function summarizeIssuesCompact(issues: QualityIssue[]): string {
  if (issues.length === 0) return ''
  const errors = issues.filter(i => i.severity === 'error')
  const warnings = issues.filter(i => i.severity === 'warning')
  const infos = issues.filter(i => i.severity === 'info')

  const parts: string[] = []
  const fmt = (label: string, list: QualityIssue[]) => {
    if (list.length === 0) return
    const types = [...new Set(list.map(i => i.type))]
    parts.push(`${list.length} ${label} [${types.join(', ')}]`)
  }
  fmt(errors.length === 1 ? 'error' : 'errors', errors)
  fmt(warnings.length === 1 ? 'warning' : 'warnings', warnings)
  fmt(infos.length === 1 ? 'hint' : 'hints', infos)
  return parts.join(' · ')
}

// ============================================================================
// DESIGN SYSTEM CONSISTENCY
// ============================================================================

export interface ConsistencyWarning {
  type: 'hardcoded-color' | 'arbitrary-spacing' | 'component-duplicate'
  message: string
  line?: number
}

export function checkDesignConsistency(code: string): ConsistencyWarning[] {
  const warnings: ConsistencyWarning[] = []

  const hexPattern = /\[#[0-9a-fA-F]{3,8}\]/g
  for (const match of code.matchAll(hexPattern)) {
    warnings.push({
      type: 'hardcoded-color',
      message: `Hardcoded color ${match[0]} — use a design token (e.g., bg-primary) instead`,
    })
  }

  const spacingPattern = /[pm][trblxy]?-\[\d+px\]/g
  for (const match of code.matchAll(spacingPattern)) {
    warnings.push({
      type: 'arbitrary-spacing',
      message: `Arbitrary spacing ${match[0]} — use Tailwind spacing scale instead`,
    })
  }

  return warnings
}

// ============================================================================
// INCREMENTAL EDIT VERIFICATION
// ============================================================================

export interface VerificationIssue {
  type: 'missing-import' | 'missing-use-client' | 'missing-default-export'
  symbol?: string
  message: string
}

export function verifyIncrementalEdit(before: string, after: string): VerificationIssue[] {
  const issues: VerificationIssue[] = []

  const hookPattern = /\buse[A-Z]\w+\s*\(/
  if (hookPattern.test(after) && !after.includes("'use client'") && !after.includes('"use client"')) {
    issues.push({
      type: 'missing-use-client',
      message: 'Code uses React hooks but missing "use client" directive',
    })
  }

  if (!after.includes('export default')) {
    issues.push({
      type: 'missing-default-export',
      message: 'Missing default export — page component must have a default export',
    })
  }

  const importRegex = /import\s+\{([^}]+)\}\s+from/g
  const beforeImports = new Set<string>()
  const afterImports = new Set<string>()

  for (const match of before.matchAll(importRegex)) {
    match[1].split(',').forEach(s => beforeImports.add(s.trim()))
  }
  for (const match of after.matchAll(importRegex)) {
    match[1].split(',').forEach(s => afterImports.add(s.trim()))
  }

  for (const symbol of beforeImports) {
    if (!afterImports.has(symbol) && symbol.length > 0) {
      const codeWithoutImports = after.replace(/^import\s+.*$/gm, '')
      const symbolRegex = new RegExp(`\\b${symbol}\\b`)
      if (symbolRegex.test(codeWithoutImports)) {
        issues.push({
          type: 'missing-import',
          symbol,
          message: `Import for "${symbol}" was removed but symbol is still used in code`,
        })
      }
    }
  }

  return issues
}

/**
 * Validate all shared components for color consistency.
 * Runs the same validatePageQuality() checks on each shared component file.
 */
export async function validateSharedComponents(projectRoot: string): Promise<QualityIssue[]> {
  const sharedDir = join(projectRoot, 'components', 'shared')
  let files: string[]
  try {
    const entries = await readdir(sharedDir)
    files = entries.filter(f => f.endsWith('.tsx'))
  } catch {
    return [] // No shared components directory
  }

  const allIssues: QualityIssue[] = []
  for (const file of files) {
    const code = await readFile(join(sharedDir, file), 'utf-8')
    const issues = validatePageQuality(code)
    for (const issue of issues) {
      allIssues.push({
        ...issue,
        message: `[shared/${file}] ${issue.message}`,
      })
    }
  }
  return allIssues
}
