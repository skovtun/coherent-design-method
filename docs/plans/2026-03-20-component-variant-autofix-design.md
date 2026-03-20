# Component Variant Autofix — Design

## Problem

AI generates `<Button>` without `variant=` prop and overrides styles via `className` (e.g., `text-muted-foreground`, `hover:bg-accent`). The default Button variant applies `bg-primary`, which conflicts with custom classes, rendering buttons with invisible text or wrong backgrounds.

This is a recurring pattern found in 2 files (4 instances) across the TaskFlow demo project, specifically for navigation and tab elements.

## Approach: Preventive + Reactive (Approach C)

1. **Design constraints** — anti-pattern examples so AI generates correctly more often
2. **Autofix in `autoFixCode()`** — catches what AI still gets wrong
3. **Detection in `validatePageQuality()`** — reports issues for visibility

## Detection Heuristic

**Signal:** `<Button` without `variant=` where className contains `text-muted-foreground`.

This is 100% reliable because muted text on a default Button (bg-primary background) is never intentional — the text would be invisible.

**Verified against all 16 generated pages:** 4 true positives, 0 false positives.

## Architecture

### New file: `packages/cli/src/utils/component-rules.ts`

```typescript
interface ComponentRule {
  id: string
  component: string
  detect: (code: string) => QualityIssue[]
  fix: (code: string) => { code: string; applied: boolean; description: string }
}

export function detectComponentIssues(code: string): QualityIssue[]
export function applyComponentRules(code: string): { code: string; fixes: string[] }
```

Extensible: new rules are added to the `rules[]` array.

### JSX Element Parser

Simple character-scanning `extractJsxElementProps(code, startIndex)` that tracks nesting of `{}`, template literals, and strings to find the true closing `>` of a JSX element. This handles multi-line template literals that contain `>` characters.

### First Rule: `buttonMissingGhostVariant`

- **Detect:** find `<Button` → extract props → no `variant=` AND contains `text-muted-foreground` → report
- **Fix:** replace `<Button` with `<Button variant="ghost"` for matching elements

### Integration Points

1. `autoFixCode()` — call `applyComponentRules()` before double-space cleanup (line ~1025)
2. `validatePageQuality()` — call `detectComponentIssues()` at end of checks
3. `design-constraints.ts` — add COMPONENT ANTI-PATTERNS section

### Tests

`component-rules.test.ts` covering:
- Detection of Button without variant + text-muted-foreground
- No false positive on Button without className
- No false positive on Button with explicit variant
- Fix adds variant="ghost"
- Fix doesn't modify correct Buttons
- Multi-line template literal handling
- Edge case: cn() usage
