# CLI Fixes Batch — Footer, Colors, Auth Templates, App Name

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 5 issues found during TaskFlow demo: footer layout, raw color leaks, missing auth template fallbacks, app name not extracted from prompt, tutorial not mentioning empty pages.

**Architecture:** Each fix is isolated — modify one file per task, test, commit. No cross-dependencies between fixes.

**Tech Stack:** TypeScript, Vitest

---

## Task 1: Footer layout — grid instead of flex

**Files:**
- Modify: `packages/core/src/generators/PageGenerator.ts` (~line 933-971, `generateSharedFooterCode`)
- Test: `packages/core/src/generators/PageGenerator.test.ts`

**Step 1:** Change the footer inner container from `flex md:justify-between` to `grid grid-cols-2 md:grid-cols-4` with brand in `col-span-2 md:col-span-1`, Product links in one column, Company links in another.

**Step 2:** Update test to verify `grid` layout class is present.

**Step 3:** Run `pnpm test -- packages/core/src/generators/PageGenerator.test.ts`

**Step 4:** Commit.

---

## Task 2: Raw colors — extend replaceRawColors for hover/focus/ring/gradient

**Files:**
- Modify: `packages/cli/src/utils/quality-validator.ts` (~line 499-549, `replaceRawColors`; ~line 779 className regex; ~line 9 `RAW_COLOR_RE`)
- Test: `packages/cli/src/utils/quality-validator.test.ts`

**Step 1:** Extend `accentColorRe` in `replaceRawColors` to also match `hover:`, `focus:`, `active:`, `group-hover:` prefixes.

**Step 2:** Extend className regex (~line 779) to also process `ring-*-NNN`, `outline-*-NNN`, `from-*-NNN`, `to-*-NNN`, `via-*-NNN` patterns.

**Step 3:** Add test for `hover:bg-orange-400` → `hover:bg-primary/20`.

**Step 4:** Run `pnpm test -- packages/cli/src/utils/quality-validator.test.ts`

**Step 5:** Commit.

---

## Task 3: Auth templates — login + register fallback

**Files:**
- Create: `packages/core/src/generators/templates/pages/login.ts`
- Create: `packages/core/src/generators/templates/pages/register.ts`
- Modify: `packages/core/src/generators/templates/pages/types.ts`
- Modify: `packages/core/src/generators/templates/pages/index.ts`

**Step 1:** Add `LoginContent` and `RegisterContent` interfaces to `types.ts`.

**Step 2:** Create `login.ts` — centered card form with email + password + "Sign in" button + "Forgot password?" link + "Don't have an account?" link. Use `D.centeredForm`, `D.formContainer` from `_shared.ts`.

**Step 3:** Create `register.ts` — same layout + name field + "Already have an account?" link.

**Step 4:** Register both in `TEMPLATE_REGISTRY` in `index.ts`.

**Step 5:** Run `pnpm test && pnpm typecheck`

**Step 6:** Commit.

---

## Task 4: App name extraction from prompt

**Files:**
- Modify: `packages/cli/src/agents/modifier.ts` (~line 125-153, `buildPlanOnlyPrompt`)
- Modify: `packages/cli/src/commands/chat/split-generator.ts` (~line 112-125, plan response handling)

**Step 1:** Add `"appName": "Extracted App Name"` to the plan-only JSON schema in `buildPlanOnlyPrompt`, with instruction: "Extract the app name from the user's request if mentioned (e.g. 'app called TaskFlow' → 'TaskFlow'). If no name mentioned, omit this field."

**Step 2:** In `split-generator.ts`, after parsing plan result, extract `appName` and update `modCtx.config.name` if present and config still has default "My App".

**Step 3:** Run `pnpm test && pnpm typecheck`

**Step 4:** Commit.

---

## Task 5: Tutorial — add note about empty pages

**Files:**
- Modify: `docs/case-studies/taskflow-tutorial.md`

**Step 1:** Add a tip/note after Step 3 explaining that some pages may come back empty and how to regenerate them.

**Step 2:** Commit.
