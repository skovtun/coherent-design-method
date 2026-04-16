# Changelog

All notable changes to this project are documented in this file.

## [0.6.91] — 2026-04-16

### Added
- **Mood → concrete CSS table in `DESIGN_THINKING`.** Six common mood phrases ("premium / Notion meets Linear", "bold / playful", "minimal / editorial", "dark and focused", "warm / approachable", "technical / developer") now map to specific background, hero treatment, spacing, and accent decisions. Replaces vague "consider the mood" guidance with enforceable directives. Includes priority rules: brand hints ("X meets Y") outweigh generic SaaS defaults; conflicting moods default to the second-mentioned.

### Rationale
End-to-end Projector test confirmed a long-standing concern: rules ARE injected (verified `modifier.ts:281-301` ships all six tiers), but the AI applies functional rules (typography, semantic tokens, dates) far better than visual/atmospheric ones. "Premium and focused — think Notion meets Linear" produced a generic SaaS landing identical to a 2024-era output. Cause: mood phrases were treated as vibes-to-consider, not directives-to-enforce. The new table makes mood translation deterministic — if you say "premium", you get the dark+monochrome+tight treatment, not centered+gradient+3-card.

This is one of several improvements needed for visual quality. Future work: adversarial verification phase ("does this look like generic AI SaaS?"), brand atmosphere templates, and font-pair selection per mood.

## [0.6.90] — 2026-04-16

### Fixed
- **Sidebar nav links rendered empty.** When the plan declared a `sidebar` group, `split-generator.ts` generated `components/shared/sidebar.tsx` immediately — but `config.navigation.items` was still empty (pages hadn't been saved yet) and `config.navigation.type` was still `'header'` (init scaffold default). Result: every app page showed only the "Projector" logo, no nav links. Fix: in the same Phase-2 sidebar block, sync `navigation.type → 'sidebar'` and pre-populate `navigation.items` from `plan.groups[sidebar].pages`. The post-Phase-5 `regenerateLayout` pass then sees real items and re-emits a sidebar with menu entries.
- **Mis-tagged widgets injected into root layout (DataTable crash).** `integrateSharedLayoutIntoRootLayout` injected ANY component with `type === 'layout'` into `<body>`. AI plans sometimes mis-tag DataTable / ProgressBar as `layout`; injecting them blew up at runtime ("Cannot read properties of undefined (reading 'filter')"). Fix: name-based whitelist — only inject components whose name matches `/header|footer|topbar|nav|navbar/`. New test covers DataTable rejection.
- **Plan generator type rules.** Added explicit guidance in the planner system prompt: `"layout"` is RESERVED for site chrome (Header/Footer/Topbar/Navbar). DataTable → `data-display`, FilterBar → `form`, StatCard → `widget`, etc. Reduces mis-tags at the source.

### Added
- **Anti-pattern: raw ISO in JSX.** Strengthened the date rule in `CORE_CONSTRAINTS`: explicit BAD/GOOD examples for `<span>{item.createdAt}</span>` (shows "2026-04-16T07:45:05.094Z" — broken-looking) vs `toLocaleDateString()` / `formatDistanceToNow`. Includes a copy-paste `formatRelative` helper for projects without date-fns.

### Rationale
End-to-end test of the Projector tutorial revealed three runtime/UX bugs the article promises against. Empty sidebar made dashboard screenshots look broken. DataTable injection caused 500 errors on `/`. Raw ISO timestamps appeared in the dashboard activity feed despite the existing date rule. All three were silent in single-component tests.

## [0.6.89] — 2026-04-16

### Fixed
- **`coherent check` reuse warnings — 92% noise reduction** (37 → 3 on Projector test). Two bugs in `reuse-validator.ts` + `check.ts`:
  1. Layout-mounted components (e.g. `AppSidebar` in `app/(app)/layout.tsx`) were warned as "available but not imported" on every page in the group. They live in layout — pages don't need to re-import them. Fixed by skipping components whose `usedIn` array contains a `layout.tsx` path.
  2. `check.ts` did not pass `plannedComponentNames` to `validateReuse`, so every relevant component type was checked against every page regardless of whether the architecture plan said the page should use it. Fixed by loading `.coherent/plan.json` and building a per-route planned-component set.
- **`check.ts` no longer scans `layout.tsx` files for reuse warnings.** Previously, `findTsxFiles()` returned both `page.tsx` and `layout.tsx` files; only pages should be checked for missed component reuse.

### Rationale
The Projector tutorial article promises a clean `coherent check` output, but the real run produced 37 reuse warnings — most of them false positives flagging layout-mounted nav. Two new tests cover the fix (`reuse-validator.test.ts`).

## [0.6.88] — 2026-04-15

### Fixed
- **App name from prompt always takes precedence.** Previously, `extractAppNameFromPrompt` only ran when `config.name === 'My App'`. When `coherent init test-projector-v2` set the folder-based name, "called Projector" in the chat prompt was ignored and every page footer/header said "Test Projector V2". Now the prompt-extracted name overrides any existing name if `"called X"` is present.
- **`lucide-react` pinned to ^1.8.0** in `ProjectScaffolder` (was ^0.460.0). Old version missing Slack/Github/Figma icons caused post-generation fix to silently substitute them with MessageSquare/ExternalLink/Pen — visibly wrong.

### Added
- **Date realism rule** in `CORE_CONSTRAINTS`: no hardcoded 2023/2024/2025 years. Prefer relative phrases ("2 hours ago", "yesterday", "last week"). Prevents "817 days ago" stale-date artifacts when current date drifts past the AI's training cutoff.

### Rationale
Three small fixes driven by artifacts seen in the v0.6.86 E2E screenshots: wrong app name, broken brand icons, dates from 2023 in a 2026 project. All are visible in the first screenshot any user sees, so they undermine the "premium" framing of the tutorial.

## [0.6.87] — 2026-04-15

### Stability pass — "chat actually works end-to-end"

Motivated by an E2E test that exposed several silent failures. Root cause: no
E2E coverage meant version drift, silent catches, and plan/filesystem drift
went unnoticed across many releases.

### Fixed
- **Auto-wire (app)/layout.tsx when plan requires sidebar navigation.** Previously, `coherent chat` generated `components/shared/sidebar.tsx` but left the app layout as a plain wrapper, so pages rendered without a sidebar despite the prompt requesting one. Now `split-generator` rewrites the layout to use `SidebarProvider` + `AppSidebar` when navType is 'sidebar'.
- **Unsilenced critical try/catches in generation pipeline.** `split-generator.ts` sidebar generation and Phase 2 plan generation now log error messages instead of silently swallowing failures.

### Added
- **`layout-integrity.ts`** — `validateLayoutIntegrity(projectRoot, plan)` cross-references the architecture plan against the filesystem. Detects `SIDEBAR_COMPONENT_MISSING`, `APP_LAYOUT_NOT_WIRED`, `HEADER_FOOTER_MISSING`. Runs at end of generation (shows warning) and during `coherent check` (shows as layout integrity section). 10 new tests.
- **`credits-error.ts`** — `classifyAIError()` detects credit exhaustion, rate limits, and other provider issues. `surfaceAIError()` prints prominent red warnings instead of silent "skipped" messages. Wired into `modification-handler.ts` TypeScript auto-fix path. 7 new tests.
- **Hard-error on CLI/project version mismatch** in `coherent chat`. When CLI is *older* than the project, refuses to run with a clear message: "Running an older CLI on a newer project produces stale output". This single check prevents the #1 silent-failure mode where users run a stale global CLI against a fresh project.
- **`prepublishOnly` guard** in both `package.json` files. Blocks `npm publish` (which leaves `workspace:*` unresolved) with a clear message to use `pnpm publish` instead.
- **`scripts/prepublish-check.sh`** — no-API gate run before every publish. Checks version sync across packages, pnpm availability, build, TypeScript, tests, prettier, and CHANGELOG entry for the current version.
- **Enhanced `scripts/e2e-test.sh`** — asserts auth auto-generation (4/4 pages), sidebar wiring, pipeline phase output, layout integrity. Fails fast with a clear reason.
- **Shared component abstraction guidance** in `CORE_CONSTRAINTS` — explicit three-level rule (minimal primitives vs. complete blocks vs. avoid mid-level) to prevent the "avatar + name" extraction that causes duplicate rendering when a page needs richer info.

### Tests
- 788 passing (771 → 788, +17 new).

### Rationale
Shipped after discovering that the previous 4 releases' improvements (Karpathy principles, design memory wiki, Osmani validator rules) were never actually exercised end-to-end because the tested environment kept hitting a stale global CLI. This release makes that mode impossible and adds real assertions to the release gate.

## [0.6.86] — 2026-04-15

### Fixed
- **Critical: `npm install -g @getcoherent/cli` broken** — published with `workspace:*` dependency on `@getcoherent/core` instead of resolved version. Fixed by switching from `npm publish` to `pnpm publish` which auto-resolves workspace protocol. Versions 0.6.82–0.6.85 are affected; 0.6.86 works.

### Changed
- **Tutorial rewrite** (`docs/case-studies/projector-tutorial.md`) — honest framing ("interactive UI prototype" not "deployed SaaS"), corrected Node.js 20+ requirement, real terminal output examples, captions on all screenshots, expanded FAQ.

### Publishing
- **Must use `pnpm publish`** in both package directories. `npm publish` does not resolve `workspace:*` protocol. Added to workflow notes.

## [0.6.85] — 2026-04-15

### Added
- **`COMPONENT_TOO_LONG` validator rule** — flags pages over 300 lines with info-severity suggestion to extract subcomponents. 2 new tests (769 → 771).
- **Component size anti-pattern** in `CORE_CONSTRAINTS` — "Component over 200 lines → extract logical sections into named subcomponents."
- **Mobile-first responsive rule** in `CORE_CONSTRAINTS` LAYOUT PATTERNS — explicit mobile-first wording: default styles for mobile, md: for 768px+, lg: for 1024px+. Test at 320px, 768px, 1024px, 1440px breakpoints.

### Rationale
Final gap-fill from diff of Addy Osmani's `frontend-ui-engineering` SKILL.md against our constraints. Most rules (skip-to-content, color-alone, heading order, next/image) were already present. Two genuine gaps remained: explicit mobile-first guidance and component size ceiling. Both now enforced in constraints (pre-generation) and validator (post-generation).

## [0.6.84] — 2026-04-15

### Added
- **4 new quality validator rules** from Addy Osmani's agent-skills (Chrome DevRel) a11y + web-quality checklists:
  - `CLICKABLE_DIV` — flags `<div onClick>` / `<span onClick>` without `role` and `tabIndex` (keyboard-inaccessible). Severity: warning.
  - `RAW_IMG_TAG` — flags raw `<img>` in Next.js projects, suggests `<Image>` from `next/image` for lazy-loading, format negotiation, and CLS prevention. Severity: info.
  - `IMAGE_MISSING_DIMENSIONS` — flags `<Image>` without `width`/`height` (and no `fill` prop). Causes CLS. Severity: warning.
  - `MISSING_METADATA` — flags marketing pages without `export const metadata` (SEO). Skips `"use client"` pages and non-marketing page types. Severity: warning.
- **11 new tests** (758 → 769): quality-validator.test.ts covers all 4 rules with positive + negative cases.

### Rationale
Cross-referenced Addy Osmani's accessibility-checklist.md and web-quality-skills against existing `coherent check` validator. These 4 rules close the biggest static-analysis gaps: keyboard a11y (CLICKABLE_DIV), image optimization (RAW_IMG_TAG + IMAGE_MISSING_DIMENSIONS), and SEO (MISSING_METADATA).

## [0.6.83] — 2026-04-15

### Added
- **Design Memory** (persistent wiki layer) — `.coherent/wiki/decisions.md` inside generated projects. Append-only markdown log of design decisions extracted from generated code. Inspired by Karpathy's LLM Wiki gist: pages generated in separate `coherent chat` invocations now compound context instead of re-deriving style from scratch each time.
- **`design-memory.ts` utility** — `readDesignMemory`, `appendDecisions`, `extractDecisionsFromCode`, `truncateMemory`, `formatMemoryForPrompt`. Zero extra AI calls — deterministic regex extraction of containers, spacing, typography, palette (semantic tokens only), grids, gaps, and shared-component imports.
- **24 new tests** (734 → 758): `design-memory.test.ts` covers read/append/extract/trim/format paths, idempotency per `(date, pageName)`, creation of missing parent dirs, and handling of empty/raw-color inputs.

### Changed
- **`split-generator.ts` Phase 3** — after anchor page generates, extract decisions and persist to `decisions.md` so Phase 5 can read them.
- **`split-generator.ts` Phase 5** — page-generation prompts now include a `DESIGN MEMORY` block (container width, spacing, palette, grid, shared imports) pulled from the wiki. Each generated page appends its own decisions after generation. File truncated to last 10 date sections at end of pipeline to cap token cost.

### Rationale
Closes the "page 8 forgets what page 1 decided" gap: extracted style context was in-memory-only before, so consistency broke across sessions. Now decisions accumulate across invocations and inform every future `coherent chat` on the same project. Best-effort — wrapped in try/catch so memory failures never break generation.

## [0.6.82] — 2026-04-15

### Added
- **Simplicity discipline** in `DESIGN_THINKING` — anti-overengineering rules. No speculative fields, no hypothetical abstractions, no dead affordances, no unrequested settings panels. "Solve today's problem, not tomorrow's" (Karpathy principle).
- **Self-check verification list** in `DESIGN_THINKING` — six-item pre-return checklist (hierarchy, tokens, real content, page-type fit, slop absence, scope discipline). AI validates output before returning.
- **Surgical edit rules** in `editPageCode` prompt (Claude + OpenAI providers) — minimal-diff enforcement for `coherent chat` modifications. Blocks "while we're here" rewrites, quote-style reformats, and unrequested feature creep.

### Rationale
Applied Andrej Karpathy's four LLM coding principles (Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution) to the generation pipeline. Zero new exports, no architecture change — inline additions to existing prompts and the Tier 0 design-thinking block.

## [0.6.76] — 2026-04-09

### Added
- **`--dry-run` flag** for `coherent chat` — shows planned modifications without applying
- **E2E test script** (`scripts/e2e-test.sh`) — automated init → chat → check → fix → export
- **20 new tests** (711 → 731): modification-handler (19), split-generator fix (1)
- **Banned names/copy validator** — warns on "John Doe", "Acme Corp", "Seamless", "Elevate"
- **`inferPageType` expanded** — forgot-password, features, projects, project-detail

### Changed
- **Async I/O in preview.ts** — parallel file reads via Promise.all (was sequential readFileSync)

## [0.6.74] — 2026-04-09

### Added
- **25 new tests** (686 → 711): export.test.ts (10), check.test.ts (7), quality-validator (8)
- **Banned names validator** — catches "John Doe", "Jane Smith", "Acme Corp", "TechCorp"
- **Banned copy validator** — catches "Seamless", "Elevate", "Unleash", "Next-Gen", "Game-changer"
- **Dynamic component discovery** — `listNames()` scans `components/ui/` on disk, future-proof for new shadcn components

## [0.6.73] — 2026-04-09

### Fixed
- **Export ShowWhenNotAuthRoute** — regex corruption when stripping /design-system from array
- **Export next.config.mjs** — regex now matches `export default {}` (not just `const nextConfig`)
- **ComponentManager null guards** — variants/sizes arrays guarded for old config compatibility
- **Lockfile sync** — pnpm-lock.yaml updated after dependency changes (CI --frozen-lockfile fix)

### Added
- **Dynamic component discovery** — `listNames()` scans `components/ui/` directory, discovers components installed via `npx shadcn add` without CLI update
- **CLAUDE.md** — comprehensive 300-line project guide for Claude Code sessions

### Changed
- **check.ts performance** — file contents cached on first read, eliminating duplicate I/O for quality + link scanning
- **CLAUDE.md version** — updated to reflect 0.6.73, 686 tests

## [0.6.70] — 2026-04-09

### Fixed
- **Export security** — `.env.development`, `.env.production`, `.env.test` now excluded from export (prevents secret leakage)
- **Export cleanup** — `coherent.figma-import.json` and `coherent.figma-component-map.json` excluded from export
- **ESM compliance** — replaced `require('fs')` with static import in update.ts
- **baseUrl deprecation** — removed `baseUrl` from both tsconfig.json files (deprecated in TS 7, unnecessary with moduleResolution: "bundler")

### Added
- **Validator: transition-all** — detects `transition-all` (should use specific transition-colors/transform)
- **Validator: excessive padding** — detects `p-8` through `p-20` (max is p-6 per constraints)
- **QUICK_REFERENCE** — added `update`, `rules`, `migrate` commands

### Changed
- **Removed unused handlebars** from core dependencies
- **Removed dead code** — `logger.ts` (never imported), `setDefaultLightTheme` (never called)

## [0.6.69] — 2026-04-09

### Added
- **Quality score** — `coherent check` shows 0-100 score (Excellent/Good/Needs work/Critical). Available in JSON output for CI.
- **Tailwind v4 auto-detection** — reads package.json for @tailwindcss/postcss, injects v4-specific constraints (CSS-first config, @theme, @utility)
- **Project context** — reads components.json and installed UI components before generation. AI knows what's available.

## [0.6.67] — 2026-04-09

### Added
- **WCAG AA contrast** — minimum 4.5:1 text, 3:1 UI elements, verify muted-on-muted passes
- **Skip link** — sr-only + focus:not-sr-only pattern in root layout
- **Focus trap + tab order** — modal focus trap requirement, no tabIndex > 0
- **Scroll anchoring** — scroll-margin-top: 4rem on [id] for sticky header
- **View Transitions API** — progressive enhancement for page navigation
- **@property animated CSS vars** — enable smooth animation of custom properties
- **Tooltip group pattern** — instant after first open (Radix delayDuration)
- **Drag performance** — direct style.transform, never CSS variable updates

### Changed
- **Removed 84 stale docs** — plans, stories, QA reports, archive, superpowers, old templates (33,571 lines)
- **Updated CHANGELOG** — full log from v0.6.52 through v0.6.67
- **Updated QUICK_REFERENCE** — added --page, --component flags, components list, status

## [0.6.66] — 2026-04-09

### Added
- **Anti-slop design rules** — banned AI aesthetic fingerprints: identical 3-column grids, centered everything, gradient text on metrics, cyan-on-dark, neon accents, generic names/copy
- **Motion system** — exponential easing curves (quart/expo/circ/iOS), hover instant-on/ease-off, blur masking, grid-template-rows height animation, animation-fill-mode:backwards, motion decision framework
- **ARIA accessibility rules** — sr-only for icon buttons, aria-expanded, aria-live, aria-describedby, semantic HTML elements
- **Next.js App Router rules** — "use client" vs Server Component, next/image performance, SEO metadata, loading/error/not-found patterns
- **Context engineering** — per-page component filtering from architecture plan, page-type contextual rule injection, max 3→4 contextual blocks
- **Auto-inject shared component imports** — when plan says use a component but AI doesn't import it, auto-add the import statement
- **Sidebar generated in chat** — AppSidebar + shadcn sidebar UI component created in Phase 2, no separate `coherent fix` needed
- **Layout variety** — 5 alternative dashboard layouts (Overview, Feed, Detail, Kanban, Split) to avoid identical pages
- **Design System FAB on sidebar pages** — floating "Design System" button added to AppSidebar, not just Header
- **Modern CSS** — container queries, CSS has(), text-wrap: balance/pretty, letter-spacing by size
- **Comprehensive design constraints** — atmosphere language, AI slop test, progressive disclosure, optimistic UI, mock data separation, context-dependent animation intensity

### Fixed
- **Container centering** — Tailwind v4 removed default container centering; added `@utility container` with margin-inline, padding-inline, max-width
- **--page flag scoping** — skip multiPageHint when --page or --component explicitly set
- **--component crash** — guard against undefined baseClassName in isSimilarClassName
- **Sidebar install** — `coherent fix` now installs shadcn sidebar UI component before generating AppSidebar
- **Orange accent** — default accent was #F59E0B (amber), changed to muted values matching shadcn defaults
- **Escaped quotes** — handle AI-generated `\'Text'` (escaped opening quotes from JSON serialization)
- **Provider scope** — `provider` variable referenced outside scope in fix command sidebar block
- **Type-specific quality rules** — modifier.ts was always injecting marketing design quality; now uses page-type inference

### Changed
- **Token optimization** — compressed system messages in claude.ts and openai-provider.ts (~240 tokens saved per request)
- **Removed legacy exports** — DESIGN_QUALITY and DESIGN_CONSTRAINTS composites (dead code)
- **Removed unused skills/** — 5 unconnected md files (554 lines of dead content)
- **Removed duplicate docs** — FAQ_AI_PROVIDERS.md, PROVIDER_SELECTION.md merged into AI_PROVIDERS.md
- **Updated case study** — projector-tutorial.md rewritten for beginners, fresh v0.6.66 screenshots

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
