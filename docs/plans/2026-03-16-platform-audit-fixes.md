# Platform Audit Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all critical, important, and minor issues found in the platform audit (both exploration and code-review reports).

**Architecture:** Incremental fixes grouped by dependency. Shared utilities first, then critical fixes, then important fixes, then infra/docs.

**Tech Stack:** TypeScript, Vitest, pnpm, GitHub Actions

---

### Task 1: Extract shared utilities (toKebabCase, toPascalCase)

**Files:**
- Create: `packages/cli/src/utils/strings.ts`
- Modify: `packages/cli/src/commands/init.ts`
- Modify: `packages/cli/src/commands/fix.ts`
- Modify: `packages/cli/src/commands/chat.ts`

**What:** Create `packages/cli/src/utils/strings.ts` exporting `toKebabCase` and `toPascalCase`. Replace all inline copies in init.ts, fix.ts, chat.ts with imports.

---

### Task 2: Fix empty catch blocks — add debug logging

**Files:**
- Modify: `packages/cli/src/commands/chat.ts` (lines 3328, 3474)
- Modify: `packages/cli/src/index.ts` (line 165)
- Modify: `packages/cli/src/utils/backup.ts` (lines 64, 100, 114, 131, 136, 151)
- Modify: `packages/cli/src/utils/update-notifier.ts` (lines 22, 31, 47, 86)

**What:** Replace all empty `catch {}` and `catch { /* */ }` with `catch (e) { if (DEBUG) console.error(...) }` or at minimum a descriptive comment that explains WHY it's safe to ignore. Use `const DEBUG = process.env.COHERENT_DEBUG === '1'` pattern (already exists in chat.ts).

---

### Task 3: Make DesignSystemManager.save() use atomic write

**Files:**
- Create: `packages/core/src/utils/atomicWrite.ts`
- Modify: `packages/core/src/managers/DesignSystemManager.ts`

**What:** Create an atomic write utility in core (write to temp file, then rename). Replace `fs/promises.writeFile` in `DesignSystemManager.save()` with the atomic version.

---

### Task 4: Fix OpenAI deprecated model + parseModification type

**Files:**
- Modify: `packages/cli/src/utils/openai-provider.ts` (line 26, line 96)
- Modify: `packages/cli/src/utils/claude.ts` (line 189)

**What:**
1. Change default model from `'gpt-4-turbo-preview'` to `'gpt-4o'`
2. Fix `parseModification` return type from `Promise<any[]>` to `Promise<ParseModificationOutput>` in both providers (interface already has `ParseModificationOutput` in ai-provider.ts)

---

### Task 5: Add path sanitization in init command

**Files:**
- Modify: `packages/cli/src/commands/init.ts` (lines 138-143)

**What:** Validate that `name` doesn't contain path traversal (`..`) or absolute paths before `join(cwd(), name)`. Reject with clear error message.

---

### Task 6: Fix fileExistsAsync to be truly async

**Files:**
- Modify: `packages/cli/src/utils/files.ts` (lines 58-60)

**What:** Replace `existsSync` with `fs/promises.access` with proper ENOENT handling.

---

### Task 7: Fix CI pipeline

**Files:**
- Modify: `.github/workflows/ci.yml`

**What:**
1. Add `--frozen-lockfile` to `pnpm install`
2. Add `pnpm audit --audit-level=high` step (allow failure with `continue-on-error: true`)

---

### Task 8: Fix documentation inconsistencies

**Files:**
- Modify: `README.md` (pnpm version)
- Modify: `CONTRIBUTING.md` (pnpm version)
- Delete: `docs/case-study-threads-marketplace.md` (duplicate)

**What:**
1. Update pnpm version references from "8+" to "10+" in README and CONTRIBUTING to match `engines.pnpm: ">=10.0.0"`
2. Remove duplicate case study file

---

### Task 9: Remove unused metadata variable in PageGenerator

**Files:**
- Modify: `packages/core/src/generators/PageGenerator.ts` (line 77)

**What:** The `metadata` variable is assigned but the value is generated inline in the template. Remove the unused assignment.

