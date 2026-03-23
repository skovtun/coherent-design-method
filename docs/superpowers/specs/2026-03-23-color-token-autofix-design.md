# Color Token Auto-Fix Design

> Make `update-token` modifications work reliably for color changes.

## Problem

When a user says `coherent chat "Change color scheme to indigo"`, the AI generates `update-token` modifications with values like `"indigo"`, `"indigo-500"`, or `hsl(239, 84%, 67%)`. The `ColorTokenSchema` requires strict `#RRGGBB` hex format. All non-hex values fail Zod validation silently, producing raw JSON error output.

Root causes:
1. The AI prompt doesn't specify the required `#RRGGBB` format
2. The AI prompt doesn't show current token values (AI changes colors blind)
3. No auto-conversion layer between AI output and Zod validation
4. Error messages show raw `ZodError.message` JSON instead of human-readable text
5. `normalizeRequest` has no `update-token` branch for pre-validation

## Design

### 1. Prompt Enhancement (`modifier.ts`)

Add current color token values and format requirements to `buildModificationPrompt`:

```
Current color tokens (#RRGGBB):
  Light theme:
    Brand:   primary=${light.primary}, secondary=${light.secondary}, accent=${light.accent || 'none'}
    Status:  success=${light.success}, warning=${light.warning}, error=${light.error}, info=${light.info}
    Surface: background=${light.background}, foreground=${light.foreground}, muted=${light.muted}, border=${light.border}
  Dark theme:
    Brand:   primary=${dark.primary}, secondary=${dark.secondary}, accent=${dark.accent || 'none'}
    Status:  success=${dark.success}, warning=${dark.warning}, error=${dark.error}, info=${dark.info}
    Surface: background=${dark.background}, foreground=${dark.foreground}, muted=${dark.muted}, border=${dark.border}
```

Update the `update-token` type description from:
```
- "update-token": Change design token (e.g., colors.light.primary)
```
to:
```
- "update-token": Change design token. target: dot-path (e.g. "colors.light.primary"). changes: { "value": "#RRGGBB" }. Color values MUST be 6-digit hex with # prefix. When changing a color, ALWAYS update BOTH light and dark themes for consistency.
```

**Files:** `packages/cli/src/agents/modifier.ts` (lines ~234–238 and ~271)

### 2. Color Auto-Conversion (`packages/core/src/utils/color-utils.ts`)

New utility module `colorToHex(value: string): string | null` that converts common color formats to `#RRGGBB`:

**Supported formats (priority order):**
1. Already valid hex `#RRGGBB` → pass through
2. 8-digit hex `#RRGGBBAA` → truncate to `#RRGGBB` (alpha discarded)
3. 3-digit hex `#RGB` → expand to `#RRGGBB`
4. Bare hex `RRGGBB` (no `#` prefix) → prepend `#`
5. CSS named colors (`red`, `indigo`, `coral`, etc.) → lookup table (148 standard names)
6. Tailwind color names (`indigo-500`, `blue-600`, etc.) → lookup table (common palette)
7. `rgb(r, g, b)` / `rgba(r, g, b, a)` → compute hex (alpha discarded)
8. `hsl(h, s%, l%)` / `hsla(h, s%, l%, a)` → compute hex (alpha discarded)

All matching is case-insensitive. Returns `null` if format is unrecognized (lets Zod produce the validation error).

**Implementation:** Pure function, no dependencies. The CSS color name table and Tailwind palette are static maps. RGB/HSL conversion is straightforward math.

**Files:** New file `packages/core/src/utils/color-utils.ts` + test `color-utils.test.ts`

### 3. Token Normalization in `normalizeRequest` (`request-parser.ts`)

Add `case 'update-token'` to `normalizeRequest`:

```typescript
case 'update-token': {
  if (changes?.value && typeof changes.value === 'string') {
    const isColorPath = request.target.includes('colors.')
    if (isColorPath) {
      const hex = colorToHex(changes.value)
      if (hex && hex !== changes.value) {
        return { ...request, changes: { ...changes, value: hex } }
      }
    }
  }
  break
}
```

This runs BEFORE `modification-handler.ts` calls `dsm.updateToken()`, so invalid values get auto-converted before reaching Zod.

**Files:** `packages/cli/src/commands/chat/request-parser.ts` (line ~236)

### 4. Token Path Validation (`DesignSystemManager.ts`)

Add a whitelist of valid token paths in `updateToken`:

```typescript
const VALID_COLOR_FIELDS = ['primary','secondary','accent','success','warning','error','info','background','foreground','muted','border']
const VALID_SPACING_FIELDS = ['xs','sm','md','lg','xl','2xl','3xl']
const VALID_RADIUS_FIELDS = ['none','sm','md','lg','xl','full']
const VALID_TOKEN_PATHS = [
  ...VALID_COLOR_FIELDS.map(f => `colors.light.${f}`),
  ...VALID_COLOR_FIELDS.map(f => `colors.dark.${f}`),
  ...VALID_SPACING_FIELDS.map(f => `spacing.${f}`),
  ...VALID_RADIUS_FIELDS.map(f => `radius.${f}`),
]
```

Reject paths not in the whitelist before mutating the config, preventing garbage fields from being created. These lists mirror the actual Zod schemas (`ColorTokenSchema`, `SpacingTokenSchema`, `RadiusTokenSchema`).

**Files:** `packages/core/src/managers/DesignSystemManager.ts` (line ~106)

### 5. Human-Readable Error Messages (`DesignSystemManager.ts`)

Replace raw `ZodError.message` with formatted output:

```typescript
if (error instanceof ZodError) {
  const issues = error.issues.map(i =>
    `"${i.path.join('.')}" — ${i.message}`
  ).join('; ')
  return {
    success: false,
    modified: [],
    config: this.config,
    message: `Failed to update token "${path}": ${issues}`,
  }
}
```

Before: `Failed to update token: [\n  {\n    "validation": "regex", ...}]`
After: `Failed to update token "colors.light.primary": "tokens.colors.light.primary" — Must be valid hex color`

**Files:** `packages/core/src/managers/DesignSystemManager.ts` (line ~162)

## Files Changed

| File | Change |
|------|--------|
| `packages/core/src/utils/color-utils.ts` | **New.** `colorToHex()` with CSS names, Tailwind names, rgb/hsl parsing |
| `packages/core/src/utils/color-utils.test.ts` | **New.** Tests for all conversion paths + edge cases |
| `packages/cli/src/agents/modifier.ts` | Add current tokens to prompt, update `update-token` docs |
| `packages/cli/src/commands/chat/request-parser.ts` | Add `update-token` normalization branch |
| `packages/cli/src/commands/chat/request-parser.test.ts` | Tests for token normalization |
| `packages/core/src/managers/DesignSystemManager.ts` | Path whitelist + human-readable ZodError formatting |
| `packages/core/src/managers/DesignSystemManager.test.ts` | Tests for path validation + error formatting |
| `packages/core/src/index.ts` | Export `colorToHex` from core |

## What We're NOT Doing (YAGNI)

- **Batch all-or-nothing for token groups** — auto-conversion eliminates most failures; partial updates are acceptable for remaining edge cases
- **ColorTokenSchema `.transform()`** — normalization in `normalizeRequest` is better because it's closer to the AI output and doesn't affect non-AI code paths (Figma import, manual config edits)
- **`update-color-scheme` modification type** — can be added later as an enhancement for palette-aware changes
- **Contrast ratio validation** — `buildCssVariables` already has `contrastFg()` for foreground; no need to validate at schema level

### Included cleanup (while touching these files)

- Add `'Must be valid hex color'` message to all `ColorTokenSchema` fields (currently only `primary` has it; `secondary`, `success`, etc. produce generic "Invalid" messages)
