import { detectComponentIssues, applyComponentRules } from './component-rules.js'
export type { QualityIssue } from './types.js'
import type { QualityIssue } from './types.js'

const RAW_COLOR_RE =
  /(?:(?:hover|focus|active|group-hover|focus-visible|focus-within):)?(?:bg|text|border|ring|outline|from|to|via)-(gray|blue|red|green|yellow|purple|pink|indigo|orange|slate|zinc|stone|neutral|emerald|teal|cyan|sky|violet|fuchsia|rose|amber|lime)-\d+/g
const HEX_IN_CLASS_RE = /className="[^"]*#[0-9a-fA-F]{3,8}[^"]*"/g
const TEXT_BASE_RE = /\btext-base\b/g
const HEAVY_SHADOW_RE = /\bshadow-(md|lg|xl|2xl)\b/g
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
      HEX_IN_CLASS_RE,
      'HEX_IN_CLASS',
      'Hex color in className — use CSS variables via semantic tokens',
      'error',
    ),
  )
  issues.push(
    ...checkLines(code, TEXT_BASE_RE, 'TEXT_BASE', 'text-base detected — use text-sm as base font size', 'warning'),
  )
  issues.push(
    ...checkLines(code, HEAVY_SHADOW_RE, 'HEAVY_SHADOW', 'Heavy shadow detected — use shadow-sm or none', 'warning'),
  )
  issues.push(
    ...checkLines(
      code,
      SM_BREAKPOINT_RE,
      'SM_BREAKPOINT',
      'sm: breakpoint — consider if md:/lg: is sufficient',
      'info',
    ),
  )
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
    const lines = code.split('\n')
    const linkHrefRe = /href\s*=\s*["'](\/[a-z0-9/-]*)["']/gi
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
        if (!routeSet.has(target)) {
          issues.push({
            line: i + 1,
            type: 'BROKEN_INTERNAL_LINK',
            message: `Link to "${target}" — route does not exist in project`,
            severity: 'warning',
          })
        }
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
    /\b((?:(?:hover|focus|active|group-hover|focus-visible|focus-within):)?)(bg|text|border|ring|outline|from|to|via)-(emerald|blue|violet|indigo|purple|teal|cyan|sky|rose|amber|red|green|yellow|pink|orange|fuchsia|lime)-(\d+)\b/g
  result = result.replace(accentColorRe, (m, statePrefix: string, prefix: string, color: string, shade: string) => {
    const bare = m.replace(statePrefix, '')
    if (colorMap[bare]) {
      changed = true
      return statePrefix + colorMap[bare]
    }
    const n = parseInt(shade)
    const isDestructive = color === 'red'
    if (prefix === 'bg') {
      if (n >= 500 && n <= 700) {
        changed = true
        return statePrefix + (isDestructive ? 'bg-destructive' : 'bg-primary')
      }
      if (n >= 100 && n <= 200) {
        changed = true
        return statePrefix + (isDestructive ? 'bg-destructive/10' : 'bg-primary/10')
      }
      if (n >= 300 && n <= 400) {
        changed = true
        return statePrefix + (isDestructive ? 'bg-destructive/20' : 'bg-primary/20')
      }
      if (n >= 800) {
        changed = true
        return statePrefix + 'bg-muted'
      }
    }
    if (prefix === 'text') {
      if (n >= 400 && n <= 600) {
        changed = true
        return statePrefix + (isDestructive ? 'text-destructive' : 'text-primary')
      }
      if (n >= 100 && n <= 300) {
        changed = true
        return statePrefix + 'text-foreground'
      }
      if (n >= 700) {
        changed = true
        return statePrefix + 'text-foreground'
      }
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
    /\b((?:(?:hover|focus|active|group-hover|focus-visible|focus-within):)?)(bg|text|border|ring|outline)-(zinc|slate|gray|neutral|stone)-(\d+)\b/g
  result = result.replace(neutralColorRe, (m, statePrefix: string, prefix: string, _color: string, shade: string) => {
    const bare = m.replace(statePrefix, '')
    if (colorMap[bare]) {
      changed = true
      return statePrefix + colorMap[bare]
    }
    const n = parseInt(shade)
    if (prefix === 'bg') {
      if (n >= 800) {
        changed = true
        return statePrefix + 'bg-background'
      }
      if (n >= 100 && n <= 300) {
        changed = true
        return statePrefix + 'bg-muted'
      }
    }
    if (prefix === 'text') {
      if (n >= 100 && n <= 300) {
        changed = true
        return statePrefix + 'text-foreground'
      }
      if (n >= 400 && n <= 600) {
        changed = true
        return statePrefix + 'text-muted-foreground'
      }
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

  // Fix escaped closing quotes in single-quoted strings (AI outputs: 'text.\'' → unterminated)
  const beforeQuoteFix = fixed
  // Pattern 1: \' before }, ], or , (AI escaped closing quote in object/array literal)
  fixed = fixed.replace(/\\'(\s*[}\],])/g, "'$1")
  // Pattern 2: \' at end of line (original catch-all)
  fixed = fixed.replace(/(:\s*'.+)\\'(\s*)$/gm, "$1'$2")
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
      l = l.replace(/&lt;=/g, (m, offset) => (isInsideAttrValue(line, offset) ? m : '<='))
      l = l.replace(/&gt;=/g, (m, offset) => (isInsideAttrValue(line, offset) ? m : '>='))
      l = l.replace(/&amp;&amp;/g, (m, offset) => (isInsideAttrValue(line, offset) ? m : '&&'))
      l = l.replace(/([\w)\]])\s*&lt;\s*([\w(])/g, (m, p1, p2, offset) =>
        isInsideAttrValue(line, offset) ? m : `${p1} < ${p2}`,
      )
      l = l.replace(/([\w)\]])\s*&gt;\s*([\w(])/g, (m, p1, p2, offset) =>
        isInsideAttrValue(line, offset) ? m : `${p1} > ${p2}`,
      )
      return l
    })
    .join('\n')
  if (fixed !== beforeEntityFix) {
    fixes.push('Fixed syntax issues')
  }

  // Fix unescaped < in JSX text content (AI generates e.g. "<50ms" which is invalid JSX)
  // Only match within a single line, skip content with braces (JSX expressions / JS code)
  const beforeLtFix = fixed
  fixed = fixed.replace(/>([^<{}\n]*)<(\d)/g, '>$1&lt;$2')
  fixed = fixed.replace(/>([^<{}\n]*)<([^/a-zA-Z!{>\n])/g, '>$1&lt;$2')
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

  // shadow-md/lg/xl/2xl → shadow-sm
  if (/className="[^"]*\bshadow-(md|lg|xl|2xl)\b[^"]*"/.test(fixed)) {
    fixed = fixed.replace(/className="([^"]*)\bshadow-(md|lg|xl|2xl)\b([^"]*)"/g, 'className="$1shadow-sm$3"')
    fixes.push('heavy shadow → shadow-sm')
  }

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

      const iconNames = lucideImportMatch[1]
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)

      // Step 1: Remove names that conflict with non-lucide imports (even if valid lucide exports)
      const duplicates = iconNames.filter(name => nonLucideImports.has(name))
      let newImport = lucideImportMatch[1]
      for (const dup of duplicates) {
        newImport = newImport.replace(new RegExp(`\\b${dup}\\b,?\\s*`), '')
        fixes.push(`removed ${dup} from lucide import (conflicts with UI component import)`)
      }

      // Step 2: Replace truly invalid lucide names (hallucinated icons not imported elsewhere)
      const invalid = iconNames.filter(name => !lucideExports!.has(name) && !nonLucideImports.has(name))
      if (invalid.length > 0) {
        const fallback = 'Circle'
        for (const bad of invalid) {
          const re = new RegExp(`\\b${bad}\\b`, 'g')
          newImport = newImport.replace(re, fallback)
          fixed = fixed.replace(re, fallback)
        }
        fixes.push(`invalid lucide icons → ${fallback}: ${invalid.join(', ')}`)
      }

      if (duplicates.length > 0 || invalid.length > 0) {
        const importedNames = [
          ...new Set(
            newImport
              .split(',')
              .map(s => s.trim())
              .filter(Boolean),
          ),
        ]
        const originalImportLine = lucideImportMatch[0]
        fixed = fixed.replace(originalImportLine, `import { ${importedNames.join(', ')} } from "lucide-react"`)
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
      // Collect ALL imported names from ALL import statements (not just lucide)
      const allImportedNames = new Set<string>()
      for (const m of fixed.matchAll(/import\s*\{([^}]+)\}\s*from/g)) {
        m[1]
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
          .forEach(n => allImportedNames.add(n))
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
    const cleaned = classes.split(/\s+/).filter(c => c !== '-0').join(' ')
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
