export interface QualityIssue {
  line: number
  type: string
  message: string
  severity: 'error' | 'warning' | 'info'
}

const RAW_COLOR_RE = /(?:bg|text|border)-(gray|blue|red|green|yellow|purple|pink|indigo|orange|slate|zinc|stone|neutral|emerald|teal|cyan|sky|violet|fuchsia|rose|amber|lime)-\d+/g
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

function checkLines(code: string, pattern: RegExp, type: string, message: string, severity: QualityIssue['severity'], skipCommentsAndStrings = false): QualityIssue[] {
  const issues: QualityIssue[] = []
  const lines = code.split('\n')
  let inBlockComment = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (skipCommentsAndStrings) {
      if (inBlockComment) {
        const endIdx = line.indexOf('*/')
        if (endIdx !== -1) { inBlockComment = false }
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

export function validatePageQuality(code: string, validRoutes?: string[]): QualityIssue[] {
  const issues: QualityIssue[] = []

  // Skip RAW_COLOR on lines with font-mono (terminal/code blocks use intentional raw colors)
  issues.push(...checkLines(code, RAW_COLOR_RE, 'RAW_COLOR', 'Raw Tailwind color detected — use semantic tokens (bg-primary, text-muted-foreground, etc.)', 'error')
    .filter(issue => {
      const line = code.split('\n')[issue.line - 1] || ''
      return !line.includes('font-mono')
    }))
  issues.push(...checkLines(code, HEX_IN_CLASS_RE, 'HEX_IN_CLASS', 'Hex color in className — use CSS variables via semantic tokens', 'error'))
  issues.push(...checkLines(code, TEXT_BASE_RE, 'TEXT_BASE', 'text-base detected — use text-sm as base font size', 'warning'))
  issues.push(...checkLines(code, HEAVY_SHADOW_RE, 'HEAVY_SHADOW', 'Heavy shadow detected — use shadow-sm or none', 'warning'))
  issues.push(...checkLines(code, SM_BREAKPOINT_RE, 'SM_BREAKPOINT', 'sm: breakpoint — consider if md:/lg: is sufficient', 'info'))
  issues.push(...checkLines(code, XL_BREAKPOINT_RE, 'XL_BREAKPOINT', 'xl: breakpoint — consider if md:/lg: is sufficient', 'info'))
  issues.push(...checkLines(code, XXL_BREAKPOINT_RE, 'XXL_BREAKPOINT', '2xl: breakpoint — rarely needed, consider xl: instead', 'warning'))
  issues.push(...checkLines(code, LARGE_CARD_TITLE_RE, 'LARGE_CARD_TITLE', 'Large text on CardTitle — use text-sm font-medium', 'warning'))

  // Native HTML — always error (Story 3.4: kill native elements)
  // skipCommentsAndStrings=true to avoid false positives on `<button` inside strings/comments
  issues.push(...checkLines(code, RAW_BUTTON_RE, 'NATIVE_BUTTON', 'Native <button> — use Button from @/components/ui/button', 'error', true))
  issues.push(...checkLines(code, RAW_SELECT_RE, 'NATIVE_SELECT', 'Native <select> — use Select from @/components/ui/select', 'error', true))
  issues.push(...checkLines(code, NATIVE_CHECKBOX_RE, 'NATIVE_CHECKBOX', 'Native <input type="checkbox"> — use Switch or Checkbox from @/components/ui/switch or @/components/ui/checkbox', 'error', true))
  issues.push(...checkLines(code, NATIVE_TABLE_RE, 'NATIVE_TABLE', 'Native <table> — use Table, TableHeader, TableBody, etc. from @/components/ui/table', 'warning', true))
  const hasInputImport = /import\s.*Input.*from\s+['"]@\/components\/ui\//.test(code)
  if (!hasInputImport) {
    issues.push(...checkLines(code, RAW_INPUT_RE, 'RAW_INPUT', 'Raw <input> element — import and use Input from @/components/ui/input', 'warning', true))
  }

  for (const pattern of PLACEHOLDER_PATTERNS) {
    const lines = code.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        issues.push({ line: i + 1, type: 'PLACEHOLDER', message: 'Placeholder content detected — use real contextual content', severity: 'error' })
      }
    }
  }

  // Responsive check
  const hasGrid = /\bgrid\b/.test(code)
  const hasResponsive = /\bmd:|lg:/.test(code)
  if (hasGrid && !hasResponsive) {
    issues.push({ line: 0, type: 'NO_RESPONSIVE', message: 'Grid layout without responsive breakpoints (md: or lg:)', severity: 'warning' })
  }

  // --- UX Ruleset checks ---

  // MISSING_ALT: <img> without alt attribute
  issues.push(...checkLines(code, IMG_WITHOUT_ALT_RE, 'MISSING_ALT', '<img> without alt attribute — add descriptive alt or alt="" for decorative images', 'error'))

  // GENERIC_BUTTON_TEXT: vague button labels
  issues.push(...checkLines(code, GENERIC_BUTTON_LABELS, 'GENERIC_BUTTON_TEXT', 'Generic button text — use specific verb ("Save changes", "Delete account")', 'warning'))

  // NO_H1: page should have exactly one h1
  const h1Matches = code.match(/<h1[\s>]/g)
  if (!h1Matches || h1Matches.length === 0) {
    issues.push({ line: 0, type: 'NO_H1', message: 'Page has no <h1> — every page should have exactly one h1 heading', severity: 'warning' })
  } else if (h1Matches.length > 1) {
    issues.push({ line: 0, type: 'MULTIPLE_H1', message: `Page has ${h1Matches.length} <h1> elements — use exactly one per page`, severity: 'warning' })
  }

  // SKIPPED_HEADING: detect heading level gaps (h1→h3 without h2)
  const headingLevels = [...code.matchAll(/<h([1-6])[\s>]/g)].map(m => parseInt(m[1]))
  for (let i = 1; i < headingLevels.length; i++) {
    if (headingLevels[i] > headingLevels[i - 1] + 1) {
      issues.push({ line: 0, type: 'SKIPPED_HEADING', message: `Heading level skipped: h${headingLevels[i - 1]} → h${headingLevels[i]} — don't skip levels`, severity: 'warning' })
      break
    }
  }

  // MISSING_LABEL: Input/Textarea without adjacent Label with htmlFor
  const hasLabelImport = /import\s.*Label.*from\s+['"]@\/components\/ui\//.test(code)
  const inputCount = (code.match(INPUT_TAG_RE) || []).length
  const labelForCount = (code.match(LABEL_FOR_RE) || []).length
  if (hasLabelImport && inputCount > 0 && labelForCount === 0) {
    issues.push({ line: 0, type: 'MISSING_LABEL', message: 'Inputs found but no Label with htmlFor — every input must have a visible label', severity: 'error' })
  }
  if (!hasLabelImport && inputCount > 0 && !/<label\b/i.test(code)) {
    issues.push({ line: 0, type: 'MISSING_LABEL', message: 'Inputs found but no Label component — import Label and add htmlFor on each input', severity: 'error' })
  }

  // PLACEHOLDER_ONLY_LABEL: Input with placeholder but page has no labels at all
  const hasPlaceholder = /placeholder\s*=/.test(code)
  if (hasPlaceholder && inputCount > 0 && labelForCount === 0 && !/<label\b/i.test(code) && !/<Label\b/.test(code)) {
    issues.push({ line: 0, type: 'PLACEHOLDER_ONLY_LABEL', message: 'Inputs use placeholder only — add visible Label with htmlFor (placeholder is not a substitute)', severity: 'error' })
  }

  // MISSING_FOCUS_VISIBLE: interactive elements without focus-visible styles
  const hasInteractive = /<Button\b|<button\b|<a\b/.test(code)
  const hasFocusVisible = /focus-visible:/.test(code)
  const usesShadcnButton = /import\s.*Button.*from\s+['"]@\/components\/ui\//.test(code)
  if (hasInteractive && !hasFocusVisible && !usesShadcnButton) {
    issues.push({ line: 0, type: 'MISSING_FOCUS_VISIBLE', message: 'Interactive elements without focus-visible styles — add focus-visible:ring-2 focus-visible:ring-ring', severity: 'info' })
  }

  // NO_EMPTY_STATE: tables/lists/grids without empty state handling (warning)
  const hasTableOrList = /<Table\b|<table\b|\.map\s*\(|<ul\b|<ol\b/.test(code)
  const hasEmptyCheck = /\.length\s*[=!]==?\s*0|\.length\s*>\s*0|\.length\s*<\s*1|No\s+\w+\s+found|empty|no results|EmptyState|empty state/i.test(code)
  if (hasTableOrList && !hasEmptyCheck) {
    issues.push({ line: 0, type: 'NO_EMPTY_STATE', message: 'List/table/grid without empty state handling — add friendly message + primary action', severity: 'warning' })
  }

  // NO_LOADING_STATE: data fetching but no loading/skeleton pattern
  const hasDataFetching = /fetch\s*\(|useQuery|useSWR|useEffect\s*\([^)]*fetch|getData|loadData/i.test(code)
  const hasLoadingPattern = /skeleton|Skeleton|spinner|Spinner|isLoading|loading|Loading/.test(code)
  if (hasDataFetching && !hasLoadingPattern) {
    issues.push({ line: 0, type: 'NO_LOADING_STATE', message: 'Page with data fetching but no loading/skeleton pattern — add skeleton or spinner', severity: 'warning' })
  }

  // EMPTY_ERROR_MESSAGE: generic error text
  const hasGenericError = /Something went wrong|"Error"|'Error'|>Error<\//.test(code) || /error\.message\s*\|\|\s*["']Error["']/.test(code)
  if (hasGenericError) {
    issues.push({ line: 0, type: 'EMPTY_ERROR_MESSAGE', message: 'Generic error message detected — use what happened + why + what to do next', severity: 'warning' })
  }

  // DESTRUCTIVE_NO_CONFIRM: destructive button without confirmation
  const hasDestructive = /variant\s*=\s*["']destructive["']|Delete|Remove/.test(code)
  const hasConfirm = /AlertDialog|Dialog.*confirm|confirm\s*\(|onConfirm|are you sure/i.test(code)
  if (hasDestructive && !hasConfirm) {
    issues.push({ line: 0, type: 'DESTRUCTIVE_NO_CONFIRM', message: 'Destructive action without confirmation dialog — add confirm before execution', severity: 'warning' })
  }

  // FORM_NO_FEEDBACK: form submit without success/error feedback
  const hasFormSubmit = /<form\b|onSubmit|type\s*=\s*["']submit["']/.test(code)
  const hasFeedback = /toast|success|error|Saved|Saving|saving|setError|setSuccess/i.test(code)
  if (hasFormSubmit && !hasFeedback) {
    issues.push({ line: 0, type: 'FORM_NO_FEEDBACK', message: 'Form with submit but no success/error feedback pattern — add "Saving..." then "Saved" or error', severity: 'info' })
  }

  // NAV_NO_ACTIVE_STATE: navigation without active/current indicator
  const hasNav = /<nav\b|NavLink|navigation|sidebar.*link|Sidebar.*link/i.test(code)
  const hasActiveState = /pathname|active|current|aria-current|data-active/.test(code)
  if (hasNav && !hasActiveState) {
    issues.push({ line: 0, type: 'NAV_NO_ACTIVE_STATE', message: 'Navigation without active/current page indicator — add active state for current route', severity: 'info' })
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
        if (target === '/' || target.startsWith('/design-system') || target.startsWith('/api') || target.startsWith('/#')) continue
        if (!routeSet.has(target)) {
          issues.push({ line: i + 1, type: 'BROKEN_INTERNAL_LINK', message: `Link to "${target}" — route does not exist in project`, severity: 'warning' })
        }
      }
    }
  }

  return issues
}

/**
 * Auto-fix simple, safe issues in generated code.
 * Returns { code, fixes } where fixes lists what was changed.
 */
export function autoFixCode(code: string): { code: string; fixes: string[] } {
  const fixes: string[] = []
  let fixed = code

  // Fix escaped closing quotes in single-quoted strings (AI outputs: 'text.\'' → unterminated)
  // Line-by-line: ': value\' at end-of-line means AI escaped the closing quote
  const beforeQuoteFix = fixed
  fixed = fixed.replace(/(:\s*'.+)\\'(\s*)$/gm, "$1'$2")
  if (fixed !== beforeQuoteFix) {
    fixes.push('fixed escaped closing quotes in strings')
  }

  // Fix unescaped < in JSX text content (AI generates e.g. "<50ms" which is invalid JSX)
  // Must NOT touch valid JSX: <Component, </Component>, <>, {expression}
  const beforeLtFix = fixed
  fixed = fixed.replace(/>([^<]*)<(\d)/g, '>$1&lt;$2')
  fixed = fixed.replace(/>([^<]*)<([^/a-zA-Z!{>])/g, '>$1&lt;$2')
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
  const hasEvents = /\b(onClick|onChange|onSubmit|onBlur|onFocus|onKeyDown|onKeyUp|onMouseEnter|onMouseLeave|onScroll|onInput)\s*[={]/.test(fixed)
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
      let depth = 1, i = open + 1
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

  // Native <button> → <Button> with import
  const nativeButtonRe = /<button\b/g
  if (nativeButtonRe.test(fixed)) {
    fixed = fixed.replace(/<button\b/g, '<Button')
    fixed = fixed.replace(/<\/button>/g, '</Button>')
    const hasButtonImport = /import\s.*\bButton\b.*from\s+['"]@\/components\/ui\/button['"]/.test(fixed)
    if (!hasButtonImport) {
      const lastImportIdx = fixed.lastIndexOf('\nimport ')
      if (lastImportIdx !== -1) {
        const lineEnd = fixed.indexOf('\n', lastImportIdx + 1)
        fixed = fixed.slice(0, lineEnd + 1)
          + "import { Button } from '@/components/ui/button'\n"
          + fixed.slice(lineEnd + 1)
      } else {
        const insertAfter = hasUseClient ? fixed.indexOf('\n') + 1 : 0
        fixed = fixed.slice(0, insertAfter)
          + "import { Button } from '@/components/ui/button'\n"
          + fixed.slice(insertAfter)
      }
    }
    fixes.push('<button> → <Button> (with import)')
  }

  // Raw Tailwind colors → semantic tokens (context-aware: skip terminal/code blocks)
  const colorMap: Record<string, string> = {
    'bg-zinc-950': 'bg-background', 'bg-zinc-900': 'bg-background', 'bg-slate-950': 'bg-background', 'bg-slate-900': 'bg-background', 'bg-gray-950': 'bg-background', 'bg-gray-900': 'bg-background',
    'bg-zinc-800': 'bg-muted', 'bg-slate-800': 'bg-muted', 'bg-gray-800': 'bg-muted',
    'bg-zinc-100': 'bg-muted', 'bg-slate-100': 'bg-muted', 'bg-gray-100': 'bg-muted',
    'bg-white': 'bg-background', 'bg-black': 'bg-background',
    'text-white': 'text-foreground', 'text-black': 'text-foreground',
    'text-zinc-100': 'text-foreground', 'text-zinc-200': 'text-foreground', 'text-slate-100': 'text-foreground', 'text-gray-100': 'text-foreground',
    'text-zinc-400': 'text-muted-foreground', 'text-zinc-500': 'text-muted-foreground', 'text-slate-400': 'text-muted-foreground', 'text-slate-500': 'text-muted-foreground', 'text-gray-400': 'text-muted-foreground', 'text-gray-500': 'text-muted-foreground',
    'border-zinc-700': 'border-border', 'border-zinc-800': 'border-border', 'border-slate-700': 'border-border', 'border-gray-700': 'border-border',
    'border-zinc-200': 'border-border', 'border-slate-200': 'border-border', 'border-gray-200': 'border-border',
  }

  // Process color replacements per-className to preserve intentional styling
  // in terminal/code blocks (detected by font-mono, bg-zinc-950, or pre/code context)
  const isCodeContext = (classes: string): boolean =>
    /\bfont-mono\b/.test(classes) || /\bbg-zinc-950\b/.test(classes) || /\bbg-zinc-900\b/.test(classes)

  let hadColorFix = false
  fixed = fixed.replace(/className="([^"]*)"/g, (fullMatch, classes: string) => {
    if (isCodeContext(classes)) return fullMatch

    let result = classes
    const accentColorRe = /\b(bg|text|border)-(emerald|blue|violet|indigo|purple|teal|cyan|sky|rose|amber)-(\d+)\b/g
    result = result.replace(accentColorRe, (m, prefix: string, _color: string, shade: string) => {
      if (colorMap[m]) { hadColorFix = true; return colorMap[m] }
      const n = parseInt(shade)
      if (prefix === 'bg') {
        if (n >= 500 && n <= 700) { hadColorFix = true; return 'bg-primary' }
        if (n >= 100 && n <= 200) { hadColorFix = true; return 'bg-primary/10' }
        if (n >= 800) { hadColorFix = true; return 'bg-muted' }
      }
      if (prefix === 'text') {
        if (n >= 400 && n <= 600) { hadColorFix = true; return 'text-primary' }
        if (n >= 100 && n <= 300) { hadColorFix = true; return 'text-foreground' }
      }
      if (prefix === 'border') {
        hadColorFix = true; return 'border-primary'
      }
      return m
    })
    const neutralColorRe = /\b(bg|text|border)-(zinc|slate|gray|neutral|stone)-(\d+)\b/g
    result = result.replace(neutralColorRe, (m, prefix: string, _color: string, shade: string) => {
      if (colorMap[m]) { hadColorFix = true; return colorMap[m] }
      const n = parseInt(shade)
      if (prefix === 'bg') {
        if (n >= 800) { hadColorFix = true; return 'bg-background' }
        if (n >= 100 && n <= 300) { hadColorFix = true; return 'bg-muted' }
      }
      if (prefix === 'text') {
        if (n >= 100 && n <= 300) { hadColorFix = true; return 'text-foreground' }
        if (n >= 400 && n <= 600) { hadColorFix = true; return 'text-muted-foreground' }
      }
      if (prefix === 'border') {
        hadColorFix = true; return 'border-border'
      }
      return m
    })

    if (result !== classes) return `className="${result}"`
    return fullMatch
  })
  if (hadColorFix) fixes.push('raw colors → semantic tokens')

  // Clean up double spaces in className that may result from previous fixes
  fixed = fixed.replace(/className="([^"]*)"/g, (_match, inner: string) => {
    const cleaned = inner.replace(/\s{2,}/g, ' ').trim()
    return `className="${cleaned}"`
  })

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
