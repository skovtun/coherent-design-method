# Post-Generation Quality v2 — Design Document

> Fixes and improvements identified from analyzing `coherent chat` output on v0.5.4 with a 13-page SaaS app (ProjectFlow).

## Context

After shipping v0.5.4 (output quality improvements round 1), a full end-to-end test with a SaaS-style prompt revealed 10 remaining issues across three categories: quality validator bugs, layout/architecture gaps, and AI prompt gaps.

## Problems and Solutions

### 1. Quality check shows stale issues after AI fix (Bug — UX)

**Problem:** In `modification-handler.ts`, `validatePageQuality(codeToWrite)` runs before the AI auto-fix. After AI fix succeeds, the original `issues` array is still used for `formatIssues()`. The user sees "Quality fix: 2 → 0 errors" immediately followed by "2 error(s):" — a contradiction.

**Root cause:** Line 620 computes `issues`, lines 623–646 run AI fix and update `codeToWrite`, but line 648 prints `formatIssues(issues)` using the stale pre-fix variable.

**Solution:** After successful AI fix (line 639), reassign `issues` to the recheck result: `issues = recheck`. This way `formatIssues` displays the post-fix state.

### 2. autoFixCode misses RAW_COLOR in cn()/clsx()/template literals (Bug)

**Problem:** `autoFixCode` replaces raw Tailwind colors only inside `className="..."` (double-quoted static strings). AI frequently generates `className={cn("bg-emerald-500", ...)}` or `` className={`bg-emerald-500 ${...}`} `` — these are not caught. Project Detail had 13 RAW_COLOR errors that slipped through autoFixCode.

**Root cause:** The regex at line 661 is `className="([^"]*)"/g` — only matches static double-quoted classNames.

**Solution:** Add a second pass that extracts string literals inside `cn(...)`, `clsx(...)`, and `cva(...)` calls, and applies the same color replacement logic. Also handle single-quoted className strings.

### 3. No second autoFixCode pass after AI fix (Gap)

**Problem:** When AI auto-fix runs, it writes new code that may contain patterns autoFixCode can fix (native `<button>`, raw colors, etc.). But autoFixCode doesn't run again after the AI fix.

**Solution:** After AI fix writes `fixedCode` (line 638), run `autoFixCode(fixedCode)` again. Merge any new fixes into `postFixes`. Update `codeToWrite` with the double-fixed result.

### 4. SKIPPED_HEADING too strict for Card contexts (False warnings)

**Problem:** Pages with h1 followed by h3 inside `<Card>` components trigger SKIPPED_HEADING warning on 5 of 13 pages. In card-based dashboards, this pattern is standard — CardTitle renders as h3, no h2 is needed between page title and card titles.

**Solution:** In `validatePageQuality`, when checking heading hierarchy: if h3 appears and the code contains `CardTitle` or `Card` components, downgrade SKIPPED_HEADING from `warning` to `info`.

### 5. No DOM nesting validation (Gap)

**Problem:** AI generates invalid HTML nesting (e.g., `<Button>` inside `<Link>` without `asChild`, `<div>` inside `<p>`). This causes React `validateDOMNesting` runtime errors. No check exists in `quality-validator.ts`.

**Solution:**
- Add validation rules in `validatePageQuality`:
  - `<Link` containing `<Button` or `<button` without nearby `asChild` → error
  - `<button` nested inside `<button` → error
  - `<a` nested inside `<a` → error
- Add autofix in `autoFixCode`: if `<Button` found inside `<Link`, add `asChild` prop to the Button.
- Add prompt rule in `modifier.ts`: "NEVER nest interactive elements. Use asChild when combining Button + Link."

### 6. Auth layout does not center content (Bug)

**Problem:** The `AUTH_LAYOUT` in `auth-route-group.ts` wraps children in `<div className="min-h-svh bg-muted">` — provides background color but no centering. Auth pages (login, register) render left-aligned with empty right space.

**Root cause:** Missing flex centering in the auth layout template.

**Solution:** Update `AUTH_LAYOUT` to:
```tsx
<div className="min-h-svh bg-muted flex items-center justify-center p-4">
  {children}
</div>
```

### 7 + 12. Phase 1 planner does not detect navType from prompt (Gap + Feature)

**Problem:** `config.navigation.type` defaults to `'header'`. The Phase 1 planner returns only page names and routes — it does not determine navigation type. When user writes "Dashboard with sidebar navigation", the system ignores "sidebar" and uses header nav. AI then generates an inline sidebar inside the page code, which is broken (empty, no nav items).

**Root cause:** Phase 1 JSON schema (`buildPlanOnlyPrompt` in `modifier.ts`) has no `navigation` field.

**Solution:** Extend Phase 1 planner response schema to include a `navigation` field:
```json
{
  "pages": [...],
  "navigation": {
    "type": "sidebar"
  }
}
```

Add detection rules to the Phase 1 prompt:
- "sidebar", "side menu", "left panel", "admin panel" → `sidebar`
- "tabs", "top navigation", default → `header`
- Complex multi-level app → `both`

After Phase 1 returns, apply the detected navType to `config.navigation.type` before page generation.

### 8 + 11. Home = redirect instead of landing page for SaaS apps (Gap)

**Problem:** When user describes a SaaS app with both a landing concept and a dashboard, the home page (/) always becomes `redirect('/dashboard')`. This means:
1. No landing page is generated
2. Phase 3 ("extract style patterns from Home") gets no code → all pages generate without style reference
3. Header shows Login/Register alongside Dashboard/Projects (mixed navigation)

**Root cause:** The modifier prompt says "home page should be a simple redirect to /dashboard — OR a standalone landing page" but AI always chooses redirect.

**Solution:** Deterministic detection after Phase 1: if the planner returns both `/` and `/dashboard` as separate pages, keep Home as a landing page (do not convert to redirect). The existing `routeToFsPath` already routes `/` to `app/page.tsx` (outside `(app)` group), so the landing page naturally gets its own layout context.

Add prompt clarification: "When both a home page (/) and a dashboard (/dashboard) exist, the home page MUST be a full landing page with hero section, features, and CTA — NOT a redirect."

### 9. Dropdown items with raw colors (Prompt)

**Problem:** AI generates colored text in dropdown menu items (e.g., orange "Edit Project", red "Delete Project"). Only destructive actions should have color.

**Solution:** Add prompt rule in `design-constraints.ts`: "DropdownMenuItem text must use default foreground color. Only destructive actions use `className='text-destructive'`. Never use colored text for non-destructive menu items."

### 10. Inline sidebar/nav generated inside page code (Prompt)

**Problem:** Despite existing prompt rule "NEVER include `<header>`, `<nav>`, or `<footer>` in pageCode", AI still generates inline sidebar panels inside page JSX when the user mentions "sidebar" in their prompt.

**Solution:** Strengthen the prompt in `modifier.ts`: "NEVER generate sidebar, navigation panel, or left-side navigation column inside pageCode. Navigation is ALWAYS handled by the layout system (shared Header, Sidebar, or Footer components). If the user mentions 'sidebar', it is handled at the layout level — do not recreate it in page code."

## Files to Modify

| File | Changes |
|------|---------|
| `packages/cli/src/commands/chat/modification-handler.ts` | #1: reassign issues after AI fix; #3: second autoFixCode pass |
| `packages/cli/src/utils/quality-validator.ts` | #2: RAW_COLOR in cn()/clsx(); #4: SKIPPED_HEADING smartness; #5: DOM nesting validation + autofix |
| `packages/cli/src/utils/auth-route-group.ts` | #6: center auth layout |
| `packages/cli/src/agents/modifier.ts` | #7/#12: Phase 1 navType field; #8: landing page prompt; #10: inline nav prohibition |
| `packages/cli/src/agents/design-constraints.ts` | #9: dropdown color rule |
| `packages/cli/src/commands/chat/split-generator.ts` | #7: apply detected navType to config |
| `packages/cli/src/commands/chat.ts` | #8: landing page detection logic |

## Testing Strategy

- **Deterministic fixes (1-6):** Unit tests with vitest. Each fix gets a failing test first (TDD).
- **Prompt improvements (7-10):** Not unit-testable. Verify by running `coherent chat` with the ProjectFlow prompt and inspecting output.
- **Integration:** Full `pnpm build && pnpm test && pnpm typecheck && pnpm lint` after each task.

## Out of Scope

- Chart generation quality (AI didn't generate a line chart when requested — prompt/model quality issue, not infrastructure)
- Mobile-specific layout patterns (bottom tab bar)
- Sidebar collapse/expand animation
- Multi-level sidebar with nested sections
