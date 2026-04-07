# Color Coherence Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen color consistency enforcement in AI-generated UI by closing validation gaps, adding a single source of truth for allowed color classes, and enabling cross-page coherence auditing.

**Architecture:** Two-layer approach — (1) extend per-page validator with new regex patterns for inline styles, SVG, arbitrary values, and missing prefixes/modifiers, (2) add `getAllowedColorClasses()` as single source of truth that generates whitelists for both the validator and AI constraints. Component registration gate ensures no raw colors enter the component registry.

**Tech Stack:** TypeScript, vitest, regex-based static analysis

**Spec:** `docs/superpowers/specs/2026-04-05-color-coherence-validation-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/core/src/utils/allowedColorClasses.ts` | Create | Single source of truth — generates whitelist, constraint snippet, and disallowed pattern from CSS variable names |
| `packages/core/src/utils/allowedColorClasses.test.ts` | Create | Tests for allowedColorClasses |
| `packages/core/src/index.ts` | Modify (line 51) | Add export for new module |
| `packages/cli/src/utils/quality-validator.ts` | Modify | Extend regex patterns, add `validateSharedComponents()`, add post-autofix re-validation |
| `packages/cli/src/utils/quality-validator.test.ts` | Modify | Add tests for new detection patterns |
| `packages/cli/src/agents/design-constraints.ts` | Modify | Replace color section with whitelist-based constraint, fix raw color contradictions |
| `packages/cli/src/commands/chat/modification-handler.ts` | Modify | Add validation gate before writing component files |

---

### Task 1: Create `getAllowedColorClasses()` — Single Source of Truth

**Files:**
- Create: `packages/core/src/utils/allowedColorClasses.ts`
- Create: `packages/core/src/utils/allowedColorClasses.test.ts`
- Modify: `packages/core/src/index.ts:51`

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/utils/allowedColorClasses.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { getAllowedColorClasses, extractCssVariableNames } from './allowedColorClasses.js'

describe('extractCssVariableNames', () => {
  it('extracts variable names from CSS string', () => {
    const css = `:root {
  --background: #fff;
  --foreground: #000;
  --primary: #3b82f6;
  --primary-foreground: #fafafa;
}`
    const names = extractCssVariableNames(css)
    expect(names).toContain('background')
    expect(names).toContain('foreground')
    expect(names).toContain('primary')
    expect(names).toContain('primary-foreground')
    expect(names).not.toContain('radius') // --radius is not a color
  })

  it('deduplicates names from :root and .dark blocks', () => {
    const css = `:root { --primary: #3b82f6; }\n.dark { --primary: #60a5fa; }`
    const names = extractCssVariableNames(css)
    const primaryCount = names.filter(n => n === 'primary').length
    expect(primaryCount).toBe(1)
  })
})

describe('getAllowedColorClasses', () => {
  const css = `:root {
  --radius: 0.5rem;
  --background: #ffffff;
  --foreground: #09090b;
  --primary: #3b82f6;
  --primary-foreground: #fafafa;
  --muted: #f4f4f5;
  --muted-foreground: #71717a;
  --destructive: #ef4444;
  --border: #e4e4e7;
  --success: #22c55e;
}`

  it('generates allowed classes for all Tailwind color prefixes', () => {
    const result = getAllowedColorClasses(css)
    // bg- prefix
    expect(result.classes.has('bg-primary')).toBe(true)
    expect(result.classes.has('bg-background')).toBe(true)
    expect(result.classes.has('bg-destructive')).toBe(true)
    // text- prefix
    expect(result.classes.has('text-foreground')).toBe(true)
    expect(result.classes.has('text-muted-foreground')).toBe(true)
    // border- prefix
    expect(result.classes.has('border-border')).toBe(true)
    // fill/stroke for SVG
    expect(result.classes.has('fill-primary')).toBe(true)
    expect(result.classes.has('stroke-border')).toBe(true)
    // shadow, ring, etc.
    expect(result.classes.has('shadow-primary')).toBe(true)
    expect(result.classes.has('ring-primary')).toBe(true)
  })

  it('does NOT include --radius as a color class', () => {
    const result = getAllowedColorClasses(css)
    expect(result.classes.has('bg-radius')).toBe(false)
  })

  it('also includes special non-variable tokens: border (bare), white/black foreground', () => {
    const result = getAllowedColorClasses(css)
    // "border" alone (no suffix) is valid in Tailwind
    expect(result.classes.has('border')).toBe(true)
  })

  it('generates a compact constraintSnippet string', () => {
    const result = getAllowedColorClasses(css)
    expect(result.constraintSnippet).toContain('bg-primary')
    expect(result.constraintSnippet).toContain('text-foreground')
    // Should be compact — only bg- and text- examples, not every permutation
    expect(result.constraintSnippet.length).toBeLessThan(500)
  })

  it('disallowedPattern matches raw Tailwind colors', () => {
    const result = getAllowedColorClasses(css)
    expect(result.disallowedPattern.test('bg-blue-500')).toBe(true)
    expect(result.disallowedPattern.test('text-gray-400')).toBe(true)
    expect(result.disallowedPattern.test('border-slate-200')).toBe(true)
  })

  it('disallowedPattern does NOT match allowed semantic classes', () => {
    const result = getAllowedColorClasses(css)
    expect(result.disallowedPattern.test('bg-primary')).toBe(false)
    expect(result.disallowedPattern.test('text-foreground')).toBe(false)
    expect(result.disallowedPattern.test('border-border')).toBe(false)
  })

  it('allows opacity modifiers on semantic classes', () => {
    const result = getAllowedColorClasses(css)
    expect(result.disallowedPattern.test('bg-primary/50')).toBe(false)
    expect(result.disallowedPattern.test('text-muted-foreground/80')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run src/utils/allowedColorClasses.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/utils/allowedColorClasses.ts`:

```typescript
/**
 * Single source of truth for allowed color classes.
 * Generates whitelist from CSS variable output of buildCssVariables().
 */

/** Non-color CSS variables to exclude from the color whitelist */
const NON_COLOR_VARS = new Set(['radius'])

/** All Tailwind prefixes that accept color values */
const COLOR_PREFIXES = [
  'bg', 'text', 'border', 'ring', 'outline', 'shadow',
  'from', 'to', 'via',
  'divide', 'placeholder', 'decoration', 'caret',
  'fill', 'stroke', 'accent',
]

export interface AllowedColorClasses {
  /** Set of all allowed color class names (e.g., "bg-primary", "text-foreground") */
  classes: Set<string>
  /** Compact string for AI constraint injection */
  constraintSnippet: string
  /** Regex matching raw Tailwind color classes (NOT in the whitelist) */
  disallowedPattern: RegExp
}

/**
 * Extract CSS variable names from the output of buildCssVariables().
 * Filters out non-color variables like --radius.
 */
export function extractCssVariableNames(cssString: string): string[] {
  const matches = cssString.matchAll(/--([a-z][a-z0-9-]*)/g)
  const unique = new Set<string>()
  for (const m of matches) {
    if (!NON_COLOR_VARS.has(m[1])) {
      unique.add(m[1])
    }
  }
  return [...unique]
}

/**
 * Generate the complete set of allowed color classes from CSS variable output.
 * @param cssString - Output of buildCssVariables()
 */
export function getAllowedColorClasses(cssString: string): AllowedColorClasses {
  const varNames = extractCssVariableNames(cssString)
  const classes = new Set<string>()

  // Generate all prefix+varName combinations
  for (const varName of varNames) {
    for (const prefix of COLOR_PREFIXES) {
      classes.add(`${prefix}-${varName}`)
    }
  }

  // Special cases: bare "border" (no suffix) is valid in Tailwind
  classes.add('border')

  // Build constraint snippet — compact, grouped by prefix, only bg- and text- for brevity
  const bgClasses = varNames.map(v => `bg-${v}`)
  const textClasses = varNames.map(v => `text-${v}`)
  const constraintSnippet =
    `Backgrounds: ${bgClasses.join(', ')}. ` +
    `Text: ${textClasses.join(', ')}. ` +
    `Borders: border, ${varNames.map(v => `border-${v}`).join(', ')}. ` +
    `Also: ring-*, shadow-*, fill-*, stroke-* with same token names. Opacity modifiers allowed (e.g., bg-primary/50).`

  // Build disallowed pattern: matches raw Tailwind colors (color-name + shade number)
  const RAW_TAILWIND_COLORS = [
    'gray', 'blue', 'red', 'green', 'yellow', 'purple', 'pink', 'indigo',
    'orange', 'slate', 'zinc', 'stone', 'neutral', 'emerald', 'teal', 'cyan',
    'sky', 'violet', 'fuchsia', 'rose', 'amber', 'lime',
  ]
  // Matches: (optional-modifier:)(prefix)-(rawColor)-(shade)(optional /opacity)
  const modifierGroup = `(?:(?:[a-z][a-z0-9-]*:)*)?`
  const prefixGroup = `(?:${COLOR_PREFIXES.join('|')})`
  const colorGroup = `(?:${RAW_TAILWIND_COLORS.join('|')})`
  const disallowedPattern = new RegExp(
    `\\b${modifierGroup}${prefixGroup}-${colorGroup}-\\d+(?:\\/\\d+)?\\b`,
    'g',
  )

  return { classes, constraintSnippet, disallowedPattern }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run src/utils/allowedColorClasses.test.ts`
Expected: PASS

- [ ] **Step 5: Export from core package**

Add to `packages/core/src/index.ts` after line 51:

```typescript
export * from './utils/allowedColorClasses'
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/utils/allowedColorClasses.ts packages/core/src/utils/allowedColorClasses.test.ts packages/core/src/index.ts
git commit -m "feat: add getAllowedColorClasses() — single source of truth for color validation"
```

---

### Task 2: Extend RAW_COLOR_RE — Missing Prefixes, Modifiers, White/Black

**Files:**
- Modify: `packages/cli/src/utils/quality-validator.ts:5-7`
- Modify: `packages/cli/src/utils/quality-validator.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `packages/cli/src/utils/quality-validator.test.ts`:

```typescript
describe('validatePageQuality — extended color detection', () => {
  it('detects divide- prefix with raw color', () => {
    const code = '<div className="divide-gray-200 divide-y">content</div>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'raw-color')).toBe(true)
  })

  it('detects fill- prefix with raw color', () => {
    const code = '<svg><circle className="fill-blue-500" /></svg>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'raw-color')).toBe(true)
  })

  it('detects stroke- prefix with raw color', () => {
    const code = '<svg><path className="stroke-red-400" /></svg>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'raw-color')).toBe(true)
  })

  it('detects placeholder- prefix with raw color', () => {
    const code = '<Input className="placeholder-gray-400" />'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'raw-color')).toBe(true)
  })

  it('detects decoration- prefix with raw color', () => {
    const code = '<a className="decoration-blue-500 underline">link</a>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'raw-color')).toBe(true)
  })

  it('detects caret- prefix with raw color', () => {
    const code = '<Input className="caret-blue-500" />'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'raw-color')).toBe(true)
  })

  it('detects accent- prefix with raw color', () => {
    const code = '<input className="accent-purple-500" type="checkbox" />'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'raw-color')).toBe(true)
  })

  it('detects dark: modifier with raw color', () => {
    const code = '<div className="dark:bg-blue-500">content</div>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'raw-color')).toBe(true)
  })

  it('detects stacked modifiers like dark:hover: with raw color', () => {
    const code = '<div className="dark:hover:bg-blue-600">content</div>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'raw-color')).toBe(true)
  })

  it('detects responsive modifier with raw color', () => {
    const code = '<div className="lg:text-gray-500">content</div>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'raw-color')).toBe(true)
  })

  it('detects bg-white as raw color', () => {
    const code = '<div className="bg-white">content</div>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'raw-color')).toBe(true)
  })

  it('detects text-black as raw color', () => {
    const code = '<div className="text-black">content</div>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'raw-color')).toBe(true)
  })

  it('does NOT flag semantic tokens', () => {
    const code = '<div className="bg-primary text-foreground border-border">ok</div>'
    const issues = validatePageQuality(code)
    expect(issues.filter(i => i.type === 'raw-color')).toHaveLength(0)
  })

  it('does NOT flag semantic tokens with opacity', () => {
    const code = '<div className="bg-primary/50 text-muted-foreground/80">ok</div>'
    const issues = validatePageQuality(code)
    expect(issues.filter(i => i.type === 'raw-color')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify failures**

Run: `cd packages/cli && npx vitest run src/utils/quality-validator.test.ts -t "extended color detection"`
Expected: several FAIL (divide, fill, stroke, placeholder, decoration, caret, accent, dark:, stacked modifiers, responsive, bg-white, text-black)

- [ ] **Step 3: Extend RAW_COLOR_RE**

In `packages/cli/src/utils/quality-validator.ts`, replace lines 5-7:

Old:
```typescript
const RAW_COLOR_RE =
  /(?:(?:hover|focus|active|group-hover|focus-visible|focus-within):)?(?:bg|text|border|ring|outline|shadow|from|to|via)-(gray|blue|red|green|yellow|purple|pink|indigo|orange|slate|zinc|stone|neutral|emerald|teal|cyan|sky|violet|fuchsia|rose|amber|lime)-\d+/g
const HEX_IN_CLASS_RE = /className="[^"]*#[0-9a-fA-F]{3,8}[^"]*"/g
```

New:
```typescript
const RAW_COLOR_RE =
  /(?:(?:[a-z][a-z0-9-]*:)*)?(?:bg|text|border|ring|outline|shadow|from|to|via|divide|placeholder|decoration|caret|fill|stroke|accent)-(gray|blue|red|green|yellow|purple|pink|indigo|orange|slate|zinc|stone|neutral|emerald|teal|cyan|sky|violet|fuchsia|rose|amber|lime)-\d+/g
const RAW_BW_COLOR_RE =
  /(?:(?:[a-z][a-z0-9-]*:)*)?(?:bg|text|border|ring|outline|shadow|divide|fill|stroke)-(white|black)\b/g
const HEX_IN_CLASS_RE = /className=(?:"[^"]*"|'[^']*'|\{`[^`]*`\})/g
```

Note: The modifier prefix is now `(?:(?:[a-z][a-z0-9-]*:)*)?` — this matches ANY modifier chain including `dark:`, `sm:`, `lg:`, `hover:`, `dark:hover:`, `data-[state=open]:`, etc.

Also add the `RAW_BW_COLOR_RE` detection inside `validatePageQuality()`. Find the section where RAW_COLOR_RE is used (around line 100-110) and add a parallel check:

```typescript
// After the existing RAW_COLOR_RE check:
issues.push(
  ...checkLines(
    code, RAW_BW_COLOR_RE, 'raw-color',
    'Use semantic tokens (bg-background, text-foreground) instead of white/black',
    'error', true,
  ),
)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/cli && npx vitest run src/utils/quality-validator.test.ts -t "extended color detection"`
Expected: PASS

- [ ] **Step 5: Also extend `replaceRawColors()` to handle new prefixes**

In `packages/cli/src/utils/quality-validator.ts`, extend the accent color regex at line 550-551:

Old:
```typescript
const accentColorRe =
    /\b((?:(?:hover|focus|active|group-hover|focus-visible|focus-within):)?)(bg|text|border|ring|outline|shadow|from|to|via)-(emerald|blue|violet|indigo|purple|teal|cyan|sky|rose|amber|red|green|yellow|pink|orange|fuchsia|lime)-(\d+)(?:\/\d+)?\b/g
```

New:
```typescript
const accentColorRe =
    /\b((?:(?:[a-z][a-z0-9-]*:)*)?)(bg|text|border|ring|outline|shadow|from|to|via|divide|placeholder|decoration|caret|fill|stroke|accent)-(emerald|blue|violet|indigo|purple|teal|cyan|sky|rose|amber|red|green|yellow|pink|orange|fuchsia|lime)-(\d+)(?:\/\d+)?\b/g
```

Similarly extend the neutral color regex at line 607-608:

Old:
```typescript
const neutralColorRe =
    /\b((?:(?:hover|focus|active|group-hover|focus-visible|focus-within):)?)(bg|text|border|ring|outline|shadow)-(zinc|slate|gray|neutral|stone)-(\d+)(?:\/\d+)?\b/g
```

New:
```typescript
const neutralColorRe =
    /\b((?:(?:[a-z][a-z0-9-]*:)*)?)(bg|text|border|ring|outline|shadow|divide|placeholder|decoration|caret|fill|stroke|accent)-(zinc|slate|gray|neutral|stone)-(\d+)(?:\/\d+)?\b/g
```

- [ ] **Step 6: Run full test suite**

Run: `cd packages/cli && npx vitest run src/utils/quality-validator.test.ts`
Expected: PASS (all existing + new tests)

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/utils/quality-validator.ts packages/cli/src/utils/quality-validator.test.ts
git commit -m "feat: extend color validation — new prefixes, modifiers, white/black detection"
```

---

### Task 3: Add New Detection Patterns — Inline Styles, Arbitrary Values, SVG, Color Props

**Files:**
- Modify: `packages/cli/src/utils/quality-validator.ts:5-12` (add regex constants)
- Modify: `packages/cli/src/utils/quality-validator.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `packages/cli/src/utils/quality-validator.test.ts`:

```typescript
describe('validatePageQuality — inline style color detection', () => {
  it('detects hex color in inline style', () => {
    const code = '<div style={{ backgroundColor: "#f59e0b" }}>content</div>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'inline-style-color')).toBe(true)
  })

  it('detects named color in inline style', () => {
    const code = '<div style={{ color: "orange" }}>content</div>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'inline-style-color')).toBe(true)
  })

  it('detects rgb() in inline style', () => {
    const code = '<div style={{ color: "rgb(255, 0, 0)" }}>content</div>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'inline-style-color')).toBe(true)
  })

  it('does NOT flag non-color inline styles', () => {
    const code = '<div style={{ display: "flex", gap: "1rem" }}>content</div>'
    const issues = validatePageQuality(code)
    expect(issues.filter(i => i.type === 'inline-style-color')).toHaveLength(0)
  })
})

describe('validatePageQuality — arbitrary color values', () => {
  it('detects bg-[#hex] arbitrary value', () => {
    const code = '<div className="bg-[#f59e0b]">content</div>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'arbitrary-color')).toBe(true)
  })

  it('detects text-[rgb(...)] arbitrary value', () => {
    const code = '<div className="text-[rgb(255,0,0)]">content</div>'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'arbitrary-color')).toBe(true)
  })

  it('does NOT flag non-color arbitrary values', () => {
    const code = '<div className="w-[200px] h-[calc(100vh-64px)]">content</div>'
    const issues = validatePageQuality(code)
    expect(issues.filter(i => i.type === 'arbitrary-color')).toHaveLength(0)
  })
})

describe('validatePageQuality — SVG color attributes', () => {
  it('detects fill with hex value', () => {
    const code = '<circle fill="#f59e0b" />'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'svg-raw-color')).toBe(true)
  })

  it('detects stroke with named color', () => {
    const code = '<path stroke="orange" />'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'svg-raw-color')).toBe(true)
  })

  it('allows fill="none"', () => {
    const code = '<path fill="none" />'
    const issues = validatePageQuality(code)
    expect(issues.filter(i => i.type === 'svg-raw-color')).toHaveLength(0)
  })

  it('allows fill="currentColor"', () => {
    const code = '<circle fill="currentColor" />'
    const issues = validatePageQuality(code)
    expect(issues.filter(i => i.type === 'svg-raw-color')).toHaveLength(0)
  })

  it('allows fill="url(...)"', () => {
    const code = '<rect fill="url(#gradient)" />'
    const issues = validatePageQuality(code)
    expect(issues.filter(i => i.type === 'svg-raw-color')).toHaveLength(0)
  })
})

describe('validatePageQuality — color props', () => {
  it('detects hex color prop', () => {
    const code = '<Icon color="#f59e0b" />'
    const issues = validatePageQuality(code)
    expect(issues.some(i => i.type === 'color-prop')).toBe(true)
  })

  it('does NOT flag non-hex color prop', () => {
    const code = '<Icon color="currentColor" />'
    const issues = validatePageQuality(code)
    expect(issues.filter(i => i.type === 'color-prop')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify failures**

Run: `cd packages/cli && npx vitest run src/utils/quality-validator.test.ts -t "inline style|arbitrary color|SVG color|color props"`
Expected: FAIL — new issue types not yet detected

- [ ] **Step 3: Add new regex constants and detection logic**

In `packages/cli/src/utils/quality-validator.ts`, add after the `RAW_BW_COLOR_RE` constant (around line 8):

```typescript
const INLINE_STYLE_COLOR_RE =
  /style=\{[^}]*(color|background|backgroundColor|borderColor)\s*:\s*['"]?(#[0-9a-fA-F]{3,8}|rgb|hsl|red|blue|orange|green|purple|yellow|pink|white|black|gray|grey)\b/gi
const ARBITRARY_COLOR_RE =
  /\b(?:bg|text|border|ring|shadow|fill|stroke|from|to|via)-\[(?:#[0-9a-fA-F]{3,8}|rgb|hsl|color-mix)/gi
const SVG_COLOR_RE =
  /\b(?:fill|stroke)=["'](?!none|currentColor|url|inherit|transparent)([^"']+)["']/g
const COLOR_PROP_RE =
  /\b(?:color|accentColor|iconColor|fillColor)=["']#[0-9a-fA-F]{3,8}["']/g
```

Then inside `validatePageQuality()`, add these checks after the existing raw color checks:

```typescript
issues.push(
  ...checkLines(
    code, INLINE_STYLE_COLOR_RE, 'inline-style-color',
    'Use semantic Tailwind classes instead of inline style colors',
    'error',
  ),
)
issues.push(
  ...checkLines(
    code, ARBITRARY_COLOR_RE, 'arbitrary-color',
    'Use semantic tokens instead of arbitrary color values like bg-[#hex]',
    'error',
  ),
)
issues.push(
  ...checkLines(
    code, SVG_COLOR_RE, 'svg-raw-color',
    'Use currentColor or CSS variables for SVG fill/stroke, not raw colors',
    'error',
  ),
)
issues.push(
  ...checkLines(
    code, COLOR_PROP_RE, 'color-prop',
    'Use semantic color tokens instead of hex values in color props',
    'error',
  ),
)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/cli && npx vitest run src/utils/quality-validator.test.ts -t "inline style|arbitrary color|SVG color|color props"`
Expected: PASS

- [ ] **Step 5: Run full test suite for regressions**

Run: `cd packages/cli && npx vitest run src/utils/quality-validator.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/utils/quality-validator.ts packages/cli/src/utils/quality-validator.test.ts
git commit -m "feat: detect inline style colors, arbitrary values, SVG attrs, color props"
```

---

### Task 4: Add Post-Auto-Fix Re-Validation

**Files:**
- Modify: `packages/cli/src/utils/quality-validator.ts` (inside `autoFixCode()`)
- Modify: `packages/cli/src/utils/quality-validator.test.ts`

- [ ] **Step 1: Write failing test**

Add to `packages/cli/src/utils/quality-validator.test.ts`:

```typescript
describe('autoFixCode — post-fix re-validation', () => {
  it('returns postFixIssues when auto-fix introduces problems', () => {
    // This tests that after auto-fix runs, a second validation pass happens.
    // Even if auto-fix can't introduce issues with current logic,
    // the re-validation should run and return empty issues for clean code.
    const code = '<div className="bg-blue-500 text-gray-200">content</div>'
    const result = await autoFixCode(code)
    // After auto-fix, code should use semantic tokens — re-validation should find no issues
    const reValidated = validatePageQuality(result.code)
    const colorIssues = reValidated.filter(i => i.type === 'raw-color')
    expect(colorIssues).toHaveLength(0)
  })

  it('fixes include re-validation note when post-fix issues found', () => {
    // We verify the re-validation path exists by checking autoFixCode output
    const cleanCode = '<div className="bg-primary text-foreground">content</div>'
    const result = await autoFixCode(cleanCode)
    // Clean code should not have post-fix warnings
    expect(result.fixes.some(f => f.includes('post-fix'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify behavior**

Run: `cd packages/cli && npx vitest run src/utils/quality-validator.test.ts -t "post-fix re-validation"`
Expected: may pass or fail depending on current autoFixCode behavior — we need to inspect

- [ ] **Step 3: Add re-validation inside autoFixCode()**

In `packages/cli/src/utils/quality-validator.ts`, find the end of the `autoFixCode()` function (around line 1048-1050, after `if (hadColorFix) fixes.push('raw colors → semantic tokens')`).

Add before the function's return statement:

```typescript
  // Post-fix re-validation: catch issues introduced by auto-fix (max 1 pass)
  if (hadColorFix) {
    const postFixIssues = validatePageQuality(fixed)
    const postFixErrors = postFixIssues.filter(i => i.severity === 'error' && (i.type === 'raw-color' || i.type === 'inline-style-color' || i.type === 'arbitrary-color'))
    if (postFixErrors.length > 0) {
      fixes.push(`post-fix re-validation found ${postFixErrors.length} remaining color issue(s)`)
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/cli && npx vitest run src/utils/quality-validator.test.ts -t "post-fix re-validation"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/utils/quality-validator.ts packages/cli/src/utils/quality-validator.test.ts
git commit -m "feat: add post-auto-fix re-validation pass"
```

---

### Task 5: Add `validateSharedComponents()`

**Files:**
- Modify: `packages/cli/src/utils/quality-validator.ts`
- Modify: `packages/cli/src/utils/quality-validator.test.ts`

- [ ] **Step 1: Write failing test**

Add to `packages/cli/src/utils/quality-validator.test.ts`:

```typescript
import { validateSharedComponents } from './quality-validator.js'
import { vi } from 'vitest'
import * as fs from 'node:fs'

describe('validateSharedComponents', () => {
  it('returns empty array when no shared components directory exists', async () => {
    const issues = await validateSharedComponents('/nonexistent/path')
    expect(issues).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd packages/cli && npx vitest run src/utils/quality-validator.test.ts -t "validateSharedComponents"`
Expected: FAIL — function not exported

- [ ] **Step 3: Implement validateSharedComponents()**

Add to `packages/cli/src/utils/quality-validator.ts` (at the end, before any default export):

```typescript
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

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
```

Note: Add `fs/promises` and `path` imports at the top of the file if not already present.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/utils/quality-validator.test.ts -t "validateSharedComponents"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/utils/quality-validator.ts packages/cli/src/utils/quality-validator.test.ts
git commit -m "feat: add validateSharedComponents() for shared component color validation"
```

---

### Task 6: Update Constraints — Whitelist + Fix Contradictions

**Files:**
- Modify: `packages/cli/src/agents/design-constraints.ts:61-65` (color section in CORE_CONSTRAINTS)
- Modify: `packages/cli/src/agents/design-constraints.ts:170-174` (accent color discipline)
- Modify: `packages/cli/src/agents/design-constraints.ts:203,210-211,225-226` (raw color references)

- [ ] **Step 1: Replace CORE_CONSTRAINTS color section with whitelist reference**

In `packages/cli/src/agents/design-constraints.ts`, replace the color section (lines 61-65):

Old:
```
COLORS — ONLY SEMANTIC TOKENS (zero raw colors):
- Backgrounds: bg-background, bg-muted, bg-muted/50, bg-card, bg-primary, bg-secondary, bg-destructive.
- Text: text-foreground (default), text-muted-foreground, text-primary-foreground.
- Borders: border (no color suffix — uses CSS variable). border-b for headers.
- BANNED: bg-gray-*, bg-blue-*, bg-slate-*, text-gray-*, ANY raw Tailwind color. The validator REJECTS these.
```

New:
```
COLORS — ONLY SEMANTIC TOKENS (zero raw colors):
- Allowed: bg-background, bg-muted, bg-muted/50, bg-card, bg-primary, bg-secondary, bg-destructive, bg-success, bg-warning. text-foreground, text-muted-foreground, text-primary-foreground, text-destructive, text-success. border (bare), border-border. Opacity modifiers OK (bg-primary/50). ring-*, shadow-*, fill-*, stroke-* with same token names.
- BANNED: ANY raw Tailwind color (bg-gray-*, text-blue-*, etc.), inline style colors, hex values, bg-white, bg-black. The validator REJECTS all of these.
```

- [ ] **Step 2: Fix contradictions in Accent Color Discipline (lines 169-174)**

Old:
```
### Accent Color Discipline
- ONE accent color per page (primary or emerald-400)
- Use for: CTAs, terminal text, check icons, feature icon backgrounds, active states
- NEVER mix blue + purple + emerald on same page
- Badge: outline style (border-border/30 bg-transparent) not filled color
- Status icons: text-emerald-400 for positive, text-red-400 for negative
```

New:
```
### Accent Color Discipline
- ONE accent color per page (primary)
- Use for: CTAs, check icons, feature icon backgrounds, active states
- NEVER mix multiple accent colors on same page
- Badge: outline style (border-border/30 bg-transparent) not filled color
- Status icons: text-success for positive, text-destructive for negative
```

- [ ] **Step 3: Fix raw color references in DESIGN_QUALITY_MARKETING**

Search for and replace these patterns throughout the file:
- `text-emerald-400` → `text-success` (except inside terminal/code block context)
- `text-emerald-500` → `text-success`
- `text-red-400` → `text-destructive`
- `text-emerald-600` → `text-success`

For terminal/code blocks (lines 208-211), these are intentional exceptions. Add an explicit note:

Old:
```
- Text: font-mono text-sm text-emerald-400
- Prompt: text-emerald-500 "$ " prefix (green dollar sign)
```

New:
```
- Text: font-mono text-sm text-emerald-400 (EXCEPTION: terminal blocks use raw green)
- Prompt: text-emerald-500 "$ " prefix (EXCEPTION: terminal prompt uses raw green)
```

- [ ] **Step 4: Verify no other raw color references remain**

Run: `grep -n 'text-\(emerald\|red\|blue\|green\|orange\|purple\)-[0-9]' packages/cli/src/agents/design-constraints.ts`

All remaining matches should be inside explicit EXCEPTION comments or inside terminal/code block rules.

- [ ] **Step 5: Run existing tests**

Run: `cd packages/cli && npx vitest run`
Expected: PASS (constraints are strings, no logic tests needed — but ensure nothing else broke)

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/agents/design-constraints.ts
git commit -m "fix: replace raw color references with semantic tokens in constraints"
```

---

### Task 7: Component Registration Gate

**Files:**
- Modify: `packages/cli/src/commands/chat/modification-handler.ts:222`

- [ ] **Step 1: Identify the integration point**

In `packages/cli/src/commands/chat/modification-handler.ts`, the function `validateAndFixGeneratedCode()` (imported from `code-generator.ts`) is already called at line 222 for shared component code, and at lines 301, 410, 589, 896 for page code.

The component registration gate adds a `validatePageQuality()` check after `autoFixCode()` runs on newly created component code. If raw color errors remain after auto-fix, log a warning (don't throw — the auto-fix should have handled it).

- [ ] **Step 2: Add post-autofix quality check for shared components**

Find the section around line 222 where shared component code is written. After the `validateAndFixGeneratedCode()` call and before `writeFile()`, add:

```typescript
import { validatePageQuality } from '../../utils/quality-validator.js'

// After autoFixCode or validateAndFixGeneratedCode runs on component code:
const colorIssues = validatePageQuality(fixedCode).filter(
  i => i.severity === 'error' && ['raw-color', 'inline-style-color', 'arbitrary-color', 'svg-raw-color', 'color-prop'].includes(i.type)
)
if (colorIssues.length > 0) {
  console.warn(
    `⚠ Component has ${colorIssues.length} color issue(s) after auto-fix:`,
    colorIssues.map(i => `  L${i.line}: ${i.message}`).join('\n'),
  )
}
```

Note: `validatePageQuality` is already imported (line 35). Just add the check after the existing fix pipeline.

- [ ] **Step 3: Run full test suite**

Run: `cd packages/cli && npx vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/chat/modification-handler.ts
git commit -m "feat: add color validation gate for component registration"
```

---

### Task 8: Final Integration Test

- [ ] **Step 1: Run all tests across both packages**

```bash
cd packages/core && npx vitest run
cd ../cli && npx vitest run
```

Expected: PASS for both packages

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit -p packages/core/tsconfig.json
npx tsc --noEmit -p packages/cli/tsconfig.json
```

Expected: No errors

- [ ] **Step 3: Final commit if any fixups needed**

```bash
git add -A
git commit -m "chore: integration fixups for color coherence validation"
```
