# Color Coherence Validation System

## Problem

AI-generated UI can contain color inconsistencies — raw color values, mismatched accents across pages, colors that bypass the design token system. The current validator catches raw Tailwind colors but misses inline styles, SVG attributes, arbitrary values, and has no cross-page coherence checks.

Example: a sidebar with `bg-orange-500` active state in an otherwise blue-primary UI (see `docs/case-studies/projector-screenshots/07-team.png`).

## Design Principles

1. **Structural impossibility over enforcement** — make errors impossible by format, not by policing
2. **Single source of truth** — token definitions generate whitelists, constraints, and validation patterns
3. **Prompt = guidance, validator = enforcement** — minimize token spend in prompts, maximize local validation
4. **Validate locally, never waste LLM calls** — every check that can run without AI should run without AI

## Architecture: Two-Layer Validation

### Layer 1: Per-Page Validator (extends `quality-validator.ts`)

Runs on every generated page/component. Catches raw colors in any format.

### Layer 2: Cross-Page Auditor (new `ColorCoherenceAuditor` in `core/src/audit/`)

Runs after generation. Checks coherence across all pages and components.

---

## P0: Core Changes

### 1. Single Source of Truth — `getAllowedColorClasses()`

**Location:** `packages/core/src/utils/allowedColorClasses.ts` (new file)

Reads `DesignTokens` type definition and `buildCssVariables()` output to produce:
- A whitelist of allowed Tailwind color classes (e.g., `bg-primary`, `text-foreground`, `border-border`)
- A validation regex that matches anything NOT in the whitelist
- A compact string for injection into AI constraints (~50 tokens vs current ~200)

```typescript
interface AllowedColorClasses {
  /** Set of all allowed color class names */
  classes: Set<string>;
  /** Compact string for constraint injection: "bg-primary, bg-secondary, ..." */
  constraintSnippet: string;
  /** Regex matching any Tailwind color class NOT in the whitelist */
  disallowedPattern: RegExp;
}

function getAllowedColorClasses(tokens: DesignTokens): AllowedColorClasses;
```

**Generated from:**
- CSS variable names from `buildCssVariables()` → `bg-primary`, `text-primary-foreground`, etc.
- All Tailwind prefixes: `bg-`, `text-`, `border-`, `ring-`, `outline-`, `shadow-`, `from-`, `to-`, `via-`, `divide-`, `placeholder-`, `decoration-`, `caret-`, `fill-`, `stroke-`, `accent-`
- All state modifiers: `hover:`, `focus:`, `active:`, `dark:`, `sm:`, `md:`, `lg:`, etc.

**Opacity modifiers:** The whitelist must allow `/{number}` suffixes on any allowed class. E.g., `bg-primary/50`, `text-muted-foreground/80` are valid. The `disallowedPattern` should accept `bg-primary` and `bg-primary/\d+` alike.

**Consumers:**
- `quality-validator.ts` — uses `disallowedPattern` for detection
- `design-constraints.ts` — uses `constraintSnippet` for AI prompt
- `ColorCoherenceAuditor` — uses `classes` for cross-page analysis
- Tests — use `classes` for assertion

### 2. Extended Per-Page Validation

**Location:** `packages/cli/src/utils/quality-validator.ts`

New detection patterns added to `validatePageQuality()`:

#### 2a. Missing Tailwind prefixes

Extend `RAW_COLOR_RE` to include:
```
divide-, placeholder-, decoration-, caret-, fill-, stroke-, accent-
```

#### 2b. Missing modifiers

Extend modifier prefix group to include:
```
dark:, sm:, md:, lg:, xl:, 2xl:, data-\[.*?\]:, aria-\[.*?\]:
```
Plus stacked modifiers: `dark:hover:`, `lg:focus:`, etc.

#### 2c. Colors without shade suffix

Add detection for:
```
bg-white, bg-black, text-white, text-black
```
These are currently in `colorMap` for auto-fix but not in detection regex.

#### 2d. Inline style colors

```typescript
const INLINE_STYLE_HEX_RE = /style=\{[^}]*(color|background|backgroundColor|borderColor)\s*:\s*['"]?#[0-9a-fA-F]{3,8}/gi;
const INLINE_STYLE_NAMED_RE = /style=\{[^}]*(color|background|backgroundColor|borderColor)\s*:\s*['"]?(red|blue|orange|green|purple|yellow|pink|white|black|gray|grey)\b/gi;
const INLINE_STYLE_FUNC_RE = /style=\{[^}]*(color|background|backgroundColor|borderColor)\s*:\s*['"]?(rgb|hsl)a?\s*\(/gi;
```
Severity: error. No auto-fix — reject and regenerate.

#### 2e. Tailwind arbitrary color values

```typescript
const ARBITRARY_COLOR_RE = /\b(?:bg|text|border|ring|shadow|fill|stroke|from|to|via)-\[(?:#[0-9a-fA-F]{3,8}|rgb|hsl|color-mix)/gi;
```
Severity: error. No auto-fix.

#### 2f. Hex in all className formats

Extend `HEX_IN_CLASS_RE` to cover single quotes and template literals:
```typescript
const HEX_IN_CLASS_ALL_RE = /className=(?:"[^"]*"|'[^']*'|\{`[^`]*`\})(?=[^>]*#[0-9a-fA-F]{3,8})/g;
```

#### 2g. SVG color attributes

```typescript
const SVG_COLOR_RE = /\b(?:fill|stroke)=["'](?!none|currentColor|url)([^"']+)["']/g;
```
Allows: `none`, `currentColor`, `url(...)`. Everything else is error.

#### 2h. Color props

```typescript
const COLOR_PROP_RE = /\b(?:color|accentColor|iconColor|fillColor)=["']#[0-9a-fA-F]{3,8}["']/g;
```
Severity: error.

### 3. Whitelist-Based Constraints

**Location:** `packages/cli/src/agents/design-constraints.ts`

Replace the current ~200-token color section in `CORE_CONSTRAINTS` with:

```
COLORS: ONLY semantic tokens. Full allowed list: ${getAllowedColorClasses(tokens).constraintSnippet}
Validator rejects everything else.
```

~50 tokens. Savings: ~150 tokens per generation.

Also fix contradictions:
- Replace `text-emerald-400 for positive` → `text-success`
- Replace `text-red-400 for negative` → `text-destructive`

### 4. Shared Component Validation

**Location:** `packages/cli/src/utils/quality-validator.ts`

New function:
```typescript
function validateSharedComponents(projectRoot: string): QualityIssue[];
```

Reads all files in `components/shared/*.tsx` and runs same `validatePageQuality()` checks on each. Called during generation pipeline after page validation.

### 5. Re-Validate After Auto-Fix

**Location:** `packages/cli/src/utils/quality-validator.ts`

After `replaceRawColors()` runs, call `validatePageQuality()` once more on the fixed code. If new errors found — log warning, do NOT loop further (max 1 re-validation to prevent infinite loops).

```typescript
function validateAndFix(code: string): { code: string; issues: QualityIssue[]; autoFixApplied: boolean; postFixIssues: QualityIssue[] };
```

### 6. Component Registration Gate

**Location:** `packages/cli/src/commands/chat/modification-handler.ts` (where components are added)

Before writing a new component file, validate its code using the same validator:
```typescript
// In the component creation flow (modification-handler or similar)
const issues = validatePageQuality(componentCode);
const errors = issues.filter(i => i.severity === 'error');
if (errors.length > 0) {
  // Auto-fix first, then re-validate
  const fixed = replaceRawColors(componentCode);
  const postFixIssues = validatePageQuality(fixed).filter(i => i.severity === 'error');
  if (postFixIssues.length > 0) {
    throw new ComponentValidationError(postFixIssues);
  }
}
```

Note: validation logic lives in cli package (where `quality-validator.ts` is), so the gate is in cli, not core. Core's `ComponentManager` stays dependency-free.

### 7. Test Suite

**Location:** `packages/cli/src/utils/__tests__/quality-validator.test.ts` (new file)

Two categories:

**Unit tests** — synthetic examples:
```typescript
// Should PASS (semantic tokens only)
'<Button className="bg-primary text-primary-foreground">OK</Button>'

// Should FAIL (raw Tailwind color)
'<div className="bg-orange-500">sidebar</div>'

// Should FAIL (inline style)
'<div style={{ backgroundColor: "#f59e0b" }}>sidebar</div>'

// Should FAIL (arbitrary value)
'<div className="bg-[#f59e0b]">sidebar</div>'

// Should FAIL (SVG fill)
'<circle fill="#f59e0b" />'

// Should PASS (SVG currentColor)
'<circle fill="currentColor" />'

// Should FAIL (color prop)
'<Icon color="#f59e0b" />'

// Should PASS (no colors at all)
'<div className="flex items-center gap-4">content</div>'
```

**Integration tests** — real generated code samples stored in `__tests__/fixtures/`:
- Clean page (should pass)
- Page with raw colors (should catch all)
- Page with mixed semantic + raw (should catch only raw)
- Auto-fix input/output pairs

---

## P1: Improvements

### 8. Fix Constraint Contradictions

Replace all raw color references in `design-constraints.ts`:
- `text-emerald-400` → `text-success`
- `text-red-400` → `text-destructive`
- `bg-emerald-400` → `bg-success`

Audit entire constraints file for any raw color mention.

### 9. Auto-Fix Logging

Add warning-level log for each auto-fix replacement:
```typescript
interface AutoFixLog {
  line: number;
  original: string;  // "bg-emerald-500"
  replaced: string;  // "bg-primary"
  semanticRisk: boolean;  // true if original might have been intentional (success/warning/error color)
}
```

Flag `semanticRisk: true` when replacing colors in the red/green/yellow/amber families — these often carry meaning (success, error, warning) and auto-fix to `bg-primary` may be wrong.

### 10. Cross-Page Color Coherence Audit

**Location:** `packages/core/src/audit/ColorCoherenceAuditor.ts` (new file)

Core function of the auditor — scan all generated pages and shared components, extract color class usage, and detect anomalies:

```typescript
interface ColorUsage {
  className: string;    // e.g., "bg-primary", "text-success"
  file: string;         // which page/component
  line: number;
  count: number;        // times used in this file
}

interface CoherenceIssue {
  type: 'orphan-color' | 'inconsistent-accent' | 'overuse';
  description: string;
  files: string[];
  severity: 'warning' | 'error';
}

function auditColorCoherence(pages: PageFile[], sharedComponents: ComponentFile[]): CoherenceIssue[];
```

**Checks:**
- **Orphan color**: a semantic color token used on exactly 1 page and nowhere else (e.g., `bg-accent` only on sidebar). Warns that this may indicate an inconsistency.
- **Inconsistent accent**: different pages use different accent strategies (one uses `bg-primary` for highlights, another uses `bg-secondary`). This is the check that would catch the orange sidebar — if sidebar uses a different active-state pattern than other navigation.
- **Overuse**: `bg-primary` appears >5 times on a single page, suggesting lack of visual hierarchy.

Note: this auditor works with semantic tokens (post-validation). It doesn't look for raw colors (that's Layer 1's job). It detects coherence problems that are invisible to per-page validation because each page is individually "correct" but collectively inconsistent.

### 11. Contrast Check (Both Themes)

**Location:** `packages/core/src/audit/ColorCoherenceAuditor.ts` (same file as above)

After CSS variables are generated, check WCAG AA contrast ratios:
```typescript
interface ContrastIssue {
  pair: [string, string];  // e.g., ["--primary", "--primary-foreground"]
  theme: 'light' | 'dark';
  ratio: number;
  required: number;  // 4.5 for normal text, 3.0 for large text
}

function checkContrastRatios(cssVars: Record<string, string>): ContrastIssue[];
```

Pairs to check:
- `--primary` / `--primary-foreground`
- `--secondary` / `--secondary-foreground`
- `--destructive` / `--destructive-foreground`
- `--background` / `--foreground`
- `--muted` / `--muted-foreground`
- `--card` / `--card-foreground`
- `--sidebar-background` / `--sidebar-foreground`
- `--sidebar-primary` / `--sidebar-primary-foreground`

Run for both `:root` (light) and `.dark` variable sets.

### 12. Validation Metrics

**Location:** `packages/cli/src/utils/quality-validator.ts`

Simple counter, persisted to `coherent.metrics.json`:
```typescript
interface ValidationMetrics {
  totalValidations: number;
  passedClean: number;
  autoFixed: number;
  rejected: number;
  topViolations: Record<string, number>;  // e.g., { "raw-tailwind-color": 42, "inline-style": 3 }
}
```

Updated after each validation run. No LLM cost.

### 13. Restructure Constraints by Priority

Move color rules to a dedicated `COLOR_CONSTRAINTS` block:
```typescript
const COLOR_CONSTRAINTS = `
CRITICAL — COLORS:
Allowed: ${whitelist}
Everything else is rejected by the validator.
`;
```

Place at the START of combined constraints (not buried in the middle).

---

## P2: Future

### 14. Retry with Validation Errors

When auto-fix can't resolve issues and code is rejected, pass specific errors back to LLM for targeted retry. Expensive (extra LLM call) — only trigger when rejection rate >threshold.

---

## Files Changed

| File | Change | Priority |
|------|--------|----------|
| `core/src/utils/allowedColorClasses.ts` | **New** — single source of truth | P0 |
| `cli/src/utils/quality-validator.ts` | Extend regex, add re-validate, shared component validation | P0 |
| `cli/src/agents/design-constraints.ts` | Use whitelist, fix contradictions, restructure | P0+P1 |
| `core/src/managers/ComponentManager.ts` | Add registration gate | P0 |
| `core/src/audit/ColorCoherenceAuditor.ts` | **New** — cross-page coherence audit, contrast check, overuse detection | P1 |
| `cli/src/utils/__tests__/quality-validator.test.ts` | **New** — test suite | P0 |
| `coherent.metrics.json` | **New** — validation metrics storage | P1 |

## Non-Goals

- AST parsing (regex sufficient for generated code patterns)
- Visual/screenshot-based validation (requires headless browser)
- File watcher for manual edits (out of scope)
- Automatic constraint evolution from metrics (future iteration)
