# Visual Bugs — Post Story 1.3 Analysis

**Date:** 2026-01-26  
**Status:** Input for Story 1.6 (Validator) and ongoing prompt refinement  
**Source:** PO review of generated dashboard, login, settings pages

---

## Root Cause Found

**`globals.css` and `tailwind.config.ts` were NOT overwritten during `coherent init` with `create-next-app`.** This means all semantic tokens (`bg-primary`, `text-muted-foreground`, `bg-card`, etc.) resolved to nothing. Fixed in this session.

---

## Bug Categories

### 1. Components render without styles (FIXED — infra issue)
- Buttons appeared as raw `<button>` because `bg-primary` had no CSS variable
- Cards had no background because `bg-card` wasn't mapped
- Muted text looked same as regular text because `--muted-foreground` was set to same value as `--foreground`

**Fix:** Updated `ProjectScaffolder.generateGlobalsCss()` to include full shadcn CSS variable set (card, input, ring, popover, destructive, accent). Updated `TailwindConfigGenerator` to map all tokens. Added `generateGlobalsCss()` and `generateTailwindConfig()` calls to `init.ts` `usedCreateNextApp` branch.

### 2. Prompt needs "no raw HTML" rule (FIXED — prompt update)
- AI sometimes generates `<button>` instead of `<Button>`
- AI generates `<input>` instead of `<Input>` with `<Label>`

**Fix:** Added explicit "SHADCN COMPONENTS ONLY" section to prompt with form field patterns, button variants, list divider patterns.

### 3. Spacing between Label and Input (FIXED — prompt update)
- Labels stuck to inputs with zero gap

**Fix:** Added form field pattern to prompt: `<div className="space-y-2"><Label /><Input /></div>` + between groups `<div className="space-y-4">`.

### 4. Recent Activity missing dividers (noted for validator)
- No `border-b last:border-0` on list items

**Fix:** Added list item pattern to prompt. Validator (Story 1.6) should check for `border-b` or `divide-y` in list-like structures.

### 5. Auth pages showing navbar (noted for Story 1.5)
- Login page should not show main navigation

**Fix:** Deferred to Story 1.5 (AppNav restyle). Will add route-based hiding for `/login`, `/signup`, `/forgot-password`.

---

## Validator Rules (Input for Story 1.6)

From this analysis, the validator should check:

1. **NO_RAW_BUTTON**: `<button` without being inside a `Button` component import → error
2. **NO_RAW_INPUT**: `<input` without being inside an `Input` component import → error  
3. **LABEL_INPUT_SPACING**: `Label` followed by `Input` without `space-y-2` wrapper → warning
4. **FORM_GROUP_SPACING**: Multiple form groups without `space-y-4` container → warning
5. **LIST_DIVIDERS**: 3+ sibling elements in a list without `border-b` or `divide-y` → warning
6. **CARD_STRUCTURE**: Card without CardHeader or CardContent → warning
