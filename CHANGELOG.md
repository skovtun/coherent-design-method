# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added
- **Auto-scaffold linked pages** — when `settings.autoScaffold` is enabled, creating a page (e.g. Login) auto-generates related pages (Sign Up, Forgot Password). Depth-1 only, with cost/time warning. Opt-in via `coherent init` prompt.
- **Fallback component styles** — components beyond the 9 core dedicated generators (Button, Card, Switch, Input, Textarea, Label, Badge, Checkbox, Select) now receive sensible fallback styles even when AI omits `className`. Covers 17 known component types + a universal fallback for unknown types.
- **Atomic file writes** — all file writes now use write-to-temp-then-rename pattern to prevent corruption on crash mid-write.
- **Project-level file lock** — `.coherent.lock` prevents parallel `coherent chat` commands from corrupting the config. Auto-cleans stale locks (>5 min or dead PID).
- **Batch write with rollback** — `batchWriteFiles()` utility backs up files before multi-file operations and restores on failure.
- **Shared component name deduplication** — `resolveUniqueName()` appends numeric suffix (e.g. Header → Header2) when creating shared components with duplicate names.
- **Unit tests** — 20 new tests across `ComponentGenerator.test.ts` (8 tests: dedicated generators + fallback styles) and `quality-validator.test.ts` (12 tests: validator detection + autoFixCode).
- **CI-safe init** — `coherent init` auto-scaffold prompt gracefully skips when stdin is not interactive (CI/CD), defaults to `autoScaffold: true`.

### Fixed
- **Shadowed import** — removed duplicate local `getInstalledPackages()` in `chat.ts` that shadowed the safer import from `self-heal.js` (missing null-safety for `dependencies`/`devDependencies`).
- **Custom component path missing fallbacks** — components with no variants/sizes going through `generateCustomComponent` now get `getFallbackBaseClassName()` instead of rendering with empty styles.
- **Double name deduplication** — removed redundant `resolveUniqueName()` call inside `createEntry()` (generator already deduplicates before building file path; double-call could cause name/path mismatch).
- **Validator false positives** — `<button`, `<select>`, `<table>`, `<input type="checkbox">` checks now skip matches inside single-line comments (`//`), multi-line comments (`/* */`), and string literals.
- **Multi-line comment tracking** — `checkLines()` now tracks `/* ... */` block comment state across lines.

### Changed
- **Next.js upgraded** from `15.0.3` (deprecated, security vulnerability) to `15.2.4`. Updated `create-next-app`, `FRAMEWORK_VERSIONS`, and `eslint-config-next`.
- **autoFixCode expanded** — now also fixes: `text-lg/xl/2xl` in CardTitle (removed), missing `'use client'` when hooks detected, double-space cleanup in className.
- **Auto-scaffold cost warning** — displays number of additional AI calls and how to disable before proceeding.
- **Welcome page v2** — complete redesign with navbar, hero, features grid, 3-step workflow, project examples with hover cards, FAQ accordion, CTA, and full footer. All validator-clean.
- **Self-heal hardening** — input type guard in `extractNpmPackagesFromCode`, package name sanitization to prevent command injection, `readdir` error handling in `collectImportedPackages`, added `async_hooks`/`diagnostics_channel`/`test` to NODE_BUILTINS.
- **Export pipeline robustness** — `ensureReadmeDeploySection` and `countPages` now handle file read errors gracefully.
- **Figma client retry** — 429 rate-limit responses now trigger automatic retry with `Retry-After` header. JSON parsing wrapped in `safeJson()`. `extractFileKey` supports `figma.com/design/` URLs.
- **Figma parser safety** — null guards on `file.components` and `file.styles` entries. Non-FRAME fallback nodes no longer treated as pages.
- **Figma import CLI** — `urlOrKey` validated before processing.
- **Auto-scaffold auth fix** — existence check now also looks in `app/(auth)/` directory to avoid duplicating already-created auth pages.

## [0.1.0] — Initial Release

### Core Features
- `coherent init` — scaffolds Next.js 15 + Tailwind v3 project with design system config
- `coherent chat` — AI-powered page and component generation from natural language
- `coherent validate` — quality checks for generated code (semantic tokens, accessibility, UX rules)
- `coherent preview` — dev server with live reload
- `coherent export` — strip platform overlay for production deployment

### Design System
- 9 dedicated component generators (Button, Card, Switch, Input, Textarea, Label, Badge, Checkbox, Select)
- Design tokens: colors (light/dark), spacing, typography, radius
- Component variants and sizes via `class-variance-authority`
- Design System viewer with interactive component showcase

### AI & Generation
- Modifier agent with design constraints and interaction patterns
- Page templates for common layouts (dashboard, settings, auth, etc.)
- Component reuse detection and auto-installation
- Quality validation with auto-fix for common issues

### Shared Components (Epic 2)
- CID-based manifest system (`coherent.components.json`)
- `promote-and-link`, `link-shared`, `modify-layout-block` operations
- Inline duplicate detection

### Figma Import (Epic 3)
- Figma API integration for token extraction
- Component normalization and page generation from Figma frames

### Self-Healing
- Dependency scanning and auto-installation
- Node.js built-in module exclusion (fs, path, crypto)
- Post-generation validation and auto-fix
- `'use client'` injection for hook-using components
