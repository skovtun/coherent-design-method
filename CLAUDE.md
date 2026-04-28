# Coherent Design Method

> Coherent solves a specific problem: AI-generated UIs all look the same.
> Every tool produces Inter font, purple gradients, identical card grids.
> Coherent's job is to make that impossible — by encoding design decisions
> as a tiered constraint system that runs before the AI writes a single line of code.

**Current version:** 0.13.8
**Packages:** `@getcoherent/core` + `@getcoherent/cli` (published together, same version)
**Tests:** 1649 passing

---

## ⚡ Start-of-session reading (REQUIRED before any work)

Coherent maintains a platform-level LLM wiki with decisions, patterns, and
ideas that persist across sessions. Read these before touching code:

1. **`docs/wiki/PATTERNS_JOURNAL.md`** — append-only log of every AI-output bug we've seen, its root cause, and what we shipped in response. If you're debugging something that feels familiar, it probably IS.
2. **`docs/wiki/RULES_MAP.md`** — every rule in `design-constraints.ts` with origin bug, validator, golden pattern. Check this before adding or modifying a rule.
3. **`docs/wiki/MODEL_PROFILE.md`** — empirical notes on Claude Sonnet 4's systematic behaviors. Saves time on "why does AI keep doing X?" questions.
4. **`docs/wiki/IDEAS_BACKLOG.md`** — open proposals, deferred work, rejected ideas with reasons. Check before proposing a new feature — it might already be scoped.
5. **`docs/wiki/ADR/`** — architectural decision records for significant shifts (e.g., "why golden patterns over word-based rules").

These files capture **why things are the way they are**. CLAUDE.md and
CHANGELOG.md answer "what is" and "what changed"; the wiki answers "why".
Update them when you:
- Add a new rule (row in RULES_MAP.md + JOURNAL entry if bug-driven).
- Observe a new AI-output failure pattern (JOURNAL entry).
- Make a breaking or philosophically-significant change (new ADR).
- Propose or defer an idea (IDEAS_BACKLOG.md).

**Not in the wiki, on purpose:**
- `docs/FAQ.md` — user-facing answers. Not retrieval-indexed (would pollute generation context).
- `docs/runbooks/` — operational how-tos (cut a release, validate retrieval, debug indexing). Not retrieval-indexed. See `docs/runbooks/README.md` for the layering rule.

---

## For Claude Code: How to Work in This Project

When you receive a task in this project, route it:

```
Task touches design rules or visual output?
  └─ YES → work in design-constraints.ts (see CONSTRAINTS section)
  └─ NO, touches generation pipeline?
       └─ YES → work in modifier.ts or split-generator.ts
       └─ NO, is it a user-facing feature?
            └─ YES → read FEATURES section before touching CLI code
            └─ NO → read the test file for that module first, then proceed
```

**When in doubt**: read the test file for that module — it shows expected behavior.
Never modify design-constraints.ts without understanding the tier system.
Never modify selectContextualRules() without discussing the change first.

---

## Development Workflow

```bash
pnpm install                    # Install dependencies
npm run build                   # Build all packages (tsup)
npx vitest run                  # Run all 686 tests
npx tsc --noEmit -p packages/cli/tsconfig.json   # TypeScript check
npx prettier --check 'packages/*/src/**/*.{ts,tsx}'  # Format check
```

### Before Every Push

1. All tests pass (`npx vitest run`)
2. TypeScript clean (`npx tsc --noEmit -p packages/cli/tsconfig.json`)
3. Prettier clean (`npx prettier --check 'packages/*/src/**/*.{ts,tsx}'`)
4. Build succeeds (`npm run build`)
5. `docs/CHANGELOG.md` updated if version bump
6. `QUICK_REFERENCE.md` updated if new commands/flags added
7. **Wiki hygiene** — `coherent wiki audit` clean (no errors). Run `coherent wiki index` to refresh retrieval cache if wiki files changed. If retrieval-sensitive changes: `coherent wiki bench` (precision@1 ≥ 0.8).
8. **ADR check** — if the change is architecturally significant, new subsystem, or breaking: write an ADR in `docs/wiki/ADR/NNNN-slug.md` with YAML frontmatter. Backfill is expensive; add it as you go.

### Publishing

```bash
# Version bump in BOTH packages (must match)
# Edit packages/core/package.json and packages/cli/package.json

git add -A && git commit -m "v0.6.XX — description"
git push origin main

cd packages/core && pnpm publish --no-git-checks
cd packages/cli && pnpm publish --no-git-checks
```

### Git Workflow

Work on feature branches for significant changes. Direct-to-main for hotfixes only.

```bash
git checkout -b feat/feature-name
# ... work ...
git push -u origin feat/feature-name
gh pr create --title "..." --body "..."
# → review → merge
```

---

## The Constraint System — Most Important File

`packages/cli/src/agents/design-constraints.ts` is the heart of the product.
It is a TypeScript module with dynamic selection logic — not a flat markdown file.
This distinction matters: it means rules are injected based on context, not always-on.

### Why This Architecture Exists

**Problem:** Naively dumping all design rules into every AI prompt
wastes ~8,000 tokens per generation call and produces worse results
(more context = more noise = AI makes worse tradeoffs).

**Solution:** Tiered injection. Only relevant rules reach the AI.
TIER 0 runs first to set creative mindset. CORE always runs (~2500 tokens).
TIER 2 contextual blocks (300-600 tokens each) only load when keyword-matched.
Cap = 4 contextual blocks maximum.

### The Four Tiers

```
TIER 0  DESIGN_THINKING          ~350 tokens, always first
        Shapes AI mindset BEFORE rules load.
        Without this: AI plays it safe, produces generic output.
        Contains: 5 design thinking questions, Atmosphere Language,
                  AI Slop Test, Motion Decision Framework.

TIER 1  CORE_CONSTRAINTS         ~2500 tokens, always sent
        Foundational rules. Violating = broken UI, not just bad aesthetics.
        Contains: typography scale, semantic token system, spacing,
                  layout patterns, component imports, accessibility (WCAG AA),
                  anti-patterns (20+ bans), content quality rules.

        DESIGN_QUALITY_COMMON    always sent — motion foundations, modern CSS,
                                 interactive states, readability, typography polish
        DESIGN_QUALITY_*         per page type (marketing/app/auth)
        VISUAL_DEPTH             always sent — depth, disclosure, optimistic UI

TIER 2  RULES_* (11 blocks)      contextual, keyword-matched
        selectContextualRules() matches message keywords → injects blocks.
        Cap: 4 blocks max.

        INTERACTION_PATTERNS     always sent, UX behaviour layer
```

### Rules for Editing Constraints

**Rule 1: Never add raw Tailwind colors.**
The quality validator (`coherent check`) rejects them. Generated projects break CI.
```
BAD:  bg-gray-100 text-blue-600 bg-white
GOOD: bg-muted text-primary bg-background
```

**Rule 2: Never create new exported TypeScript constants.**
Each new export must be wired into modifier.ts and tested.
Add to existing sections. If genuinely can't fit — discuss first.

**Rule 3: Always run `npm run build` after editing.**
design-constraints.ts is TypeScript. Without building = no effect.

**Rule 4: Keep the 4-block contextual cap.**
At 5+ blocks, AI averages rules rather than applying them.

**Rule 5: Never break selectContextualRules() matching logic.**
A broken regex silently stops rules from loading — hard to debug.

### When Adding a New Rule

1. Identify which existing section it belongs to
2. Add inline, not as a new constant
3. Always-relevant → CORE_CONSTRAINTS
4. Contextual → find matching RULES_* block, extend regex if needed
5. `npm run build`
6. Test with `coherent chat` on a relevant page type

### Debugging: "Why Didn't My Rule Apply?"

```
□ Did you run npm run build after editing?
□ Is the rule in CORE (always) or TIER 2 (conditional)?
□ If TIER 2: does the request message match the block's regex?
  → Test: selectContextualRules("your message")
□ Is the cap of 4 being hit? (rule may be 5th match, gets dropped)
□ Is getDesignQualityForType() returning the right type?
  → Check inferPageTypeFromRoute() slug sets
```

---

## The Generation Pipeline

```
coherent chat "build a project management app"
    │
    ├─ Phase 1: Plan Pages
    │   AI determines pages. Auto-infers auth + detail routes.
    │
    ├─ Phase 2: Architecture Plan
    │   Groups pages by layout (public/app/auth).
    │   Identifies shared components for 2+ pages.
    │   Generates AppSidebar if sidebar layout detected.
    │
    ├─ Phase 3: Generate Home (establishes visual style)
    │
    ├─ Phase 4: Extract Style (consistency contract)
    │
    ├─ Phase 4.5: Generate Shared Components (CID-XXX registry)
    │
    └─ Phase 5: Generate All Pages
        Context Engineering: each page gets only relevant components
        (filterManifestForPage) and same-type existing pages context.
        Auto-injects missing shared component imports.
        Inline quality check + auto-fix after each page.
```

### Context Engineering (v0.6.57+)

Each page generation receives curated context, not everything:
- **Shared components**: only those the plan says are used on this page
- **Design rules**: contextual blocks matched against page sections, not full message
- **Existing pages**: max 3, same page type only (app pages see app pages)
- **Project context**: reads components.json + installed UI components (v0.6.68+)
- **Tailwind v4**: auto-detected from package.json, injects v4-specific rules

### Known Gotchas

- **14+ pages**: occasional empty pages. Fix: `coherent chat "regenerate [PageName]"`
- **Page type wrong**: custom routes default to 'app'. Check `inferPageTypeFromRoute()`
- **Shared component missing**: must exist from Phase 4.5 to be available in Phase 5

---

## Page Type System

```typescript
'marketing'  // header nav, py-20 spacing, centered content
'app'        // sidebar nav, p-4 lg:p-6, left-aligned, data-dense
'auth'       // no nav, centered card, max-w-md
```

Detection in `inferPageTypeFromRoute()`:
- auth: login, register, sign-up, forgot-password, reset-password
- marketing: pricing, features, about, blog, contact, terms, privacy, landing, home, root
- everything else: app

---

## Critical Design Decisions (With Reasons)

**`min-h-[100dvh]` not `min-h-screen`** — iOS Safari dynamic viewport.
`100vh` includes browser chrome = content hidden on mobile.

**`grid-template-rows: 0fr → 1fr` for height animations** — GPU-composited,
interruptible. `height` triggers layout thrash on every frame.

**Semantic tokens only** — (1) validator rejects raw colors, (2) changing
`--primary` cascades everywhere. Raw colors don't cascade.

**Exponential easing, not `ease`** — `ease` is a weak cubic-bezier.
`cubic-bezier(0.25, 1, 0.5, 1)` (ease-out-quart) feels responsive.
This is the single biggest "AI-generated" tell in animations.

**DESIGN_THINKING runs first (Tier 0)** — Rules alone make AI conservative.
Tier 0 sets creative direction first. AI uses rules as constraints within
that direction, not as a substitute for thinking.

---

## What Coherent Is Not Responsible For

Intentionally out of scope — don't add to constraints:
- Backend logic, real data fetching, auth implementation
- State management (Redux vs Zustand vs etc.)
- OKLCH in JSX (conflicts with semantic tokens; use in globals.css only)
- Fluid clamp() spacing (fixed system is intentional)
- CSS logical properties, RTL support

---

## The Two Usage Paths

**Path 1: Via Coherent CLI** (`coherent chat`, `coherent fix`)
User-facing product. Constraints injected programmatically.
External Claude Code skills do NOT affect this path.
Everything influencing generation must be in design-constraints.ts.

**Path 2: Via Claude Code** (this file, interactive sessions)
For developing Coherent itself. External skills work here.

A rule in an external skill → affects Path 2 only.
A rule in design-constraints.ts → affects Path 1 only.
To affect both: put it in constraints AND mirror in a skill.

---

## Key Files

```
packages/cli/src/agents/
  design-constraints.ts    — 1343 lines, all UI rules (MOST IMPORTANT)
  modifier.ts              — prompt assembly, project context reader
  page-templates.ts        — page type detection, auth/marketing routing

packages/cli/src/commands/chat/
  split-generator.ts       — 6-phase pipeline orchestrator
  modification-handler.ts  — applies changes to files, auto-inject imports
  utils.ts                 — shared component warnings, import injection
  plan-generator.ts        — architecture planning (Phase 2)
  request-parser.ts        — message → page name extraction

packages/cli/src/utils/
  quality-validator.ts     — post-generation checks + auto-fix
  tailwind-version.ts      — v3/v4 detection + v4 globals.css generator
  reuse-planner.ts         — per-page shared component matching

packages/cli/src/commands/
  check.ts                 — quality scoring (0-100)
  fix.ts                   — auto-fix (TS errors, CSS sync, sidebar, layouts)
  export.ts                — clean Next.js export for deployment

packages/core/src/
  generators/PageGenerator.ts — Header, Footer, Sidebar code generation
  managers/ComponentManager.ts — component registry (CID-XXX system)
```

---

## Constraints Quick Reference

```typescript
// Always-sent (every generation prompt)
DESIGN_THINKING          // Tier 0 — mindset, atmosphere, anti-slop
CORE_CONSTRAINTS         // Tier 1 — typography, colors, spacing, a11y, anti-patterns
DESIGN_QUALITY_COMMON    // Motion, modern CSS, interactive states
DESIGN_QUALITY_*         // Page-type specific (marketing/app/auth)
VISUAL_DEPTH             // Depth, optimistic UI, progressive disclosure
INTERACTION_PATTERNS     // Loading, feedback, errors, navigation

// Contextual (keyword-matched, max 4)
RULES_FORMS              // form|input|login|register|validation...
RULES_DATA_DISPLAY       // dashboard|table|stats|chart|pagination...
RULES_NAVIGATION         // nav|sidebar|menu|breadcrumb...
RULES_OVERLAYS           // modal|dialog|dropdown|sheet|drawer...
RULES_FEEDBACK           // toast|alert|skeleton|loading|error...
RULES_CONTENT            // landing|pricing|hero|testimonial...
RULES_CARDS_LAYOUT       // card|grid|layout|badge|avatar...
RULES_COMPONENTS_MISC    // accordion|animation|calendar|toggle...
RULES_SHADCN_APIS        // sidebar|select|dialog|command...
RULES_NEXTJS             // image|seo|metadata|performance...
RULES_TAILWIND_V4        // tailwind.?v4|@theme|@import.*tailwindcss...

// Key functions
getDesignQualityForType(type)           // page-type quality block
inferPageTypeFromRoute(route)           // 'marketing' | 'app' | 'auth'
selectContextualRules(msg, sections?)   // max 4 matched blocks
buildProjectContext(projectRoot?)       // components.json + installed UI
```
