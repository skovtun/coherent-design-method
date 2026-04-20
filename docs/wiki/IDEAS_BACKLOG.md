# Ideas Backlog

Append-only log of proposals, ideas, and potential future work for the Coherent platform. Each entry has enough context to pick up later without re-thinking from scratch.

Format: ID, one-line summary, rationale, rough effort, status, discussed-in (session/PR/date).

Statuses: `open` · `in-progress` · `shipped` · `rejected` (with reason) · `deferred`

---

## Recently discussed (session 2026-04-19/20)

### Shipped

- **F2** commander strict args (allowExcessArguments(false)) — shipped v0.7.0
- **F4** post-chat change summary (line delta + import diff) — shipped v0.7.0
- **F5** --page verify target modified — shipped v0.7.0
- **F8** table column schema rule — shipped v0.7.0
- **M1** golden patterns library (4 flagship + keyword-scoped injection) — shipped v0.7.0
- **Bug 2** skip archplan on --page X + RESPONSE_TRUNCATED guard — shipped v0.7.0
- **5 new golden patterns** (dialog, dropdown, alert-dialog, sheet, pagination) — shipped v0.7.1
- **3 overlay validators** (DIALOG_FULL_WIDTH, DIALOG_CUSTOM_OVERLAY, ALERT_DIALOG_NON_DESTRUCTIVE) — shipped v0.7.1

### Open (from session backlog)

- **M7** Surgical edits — in --page X path, use `ai.editPageCode()` instead of full `parseModification`. Feeds only the relevant section + instruction, returns patched section, merges back. **Effort:** 3-4h. **Why:** safer, faster, doesn't touch untouched code. **Target:** v0.7.2.

- **F9** Deterministic StatsChart template — when plan.sharedComponents asks for StatsChart, generate from `templates/patterns/chart-card.tsx` content deterministically BEFORE falling back to LLM. No AI variance on a known-good component. **Effort:** 1-2h. **Target:** v0.7.2.

- **M3** Auto-retry on validator fires — after Phase 6, if validator flags critical issues (CHART_PLACEHOLDER, FILTER_DUPLICATE), re-prompt AI with "rule X was violated, fix only that part". Limited to 2 retries. **Effort:** 2h. **Target:** v0.7.2.

- **M2** Pattern-based validator — compare generated filter-bar / stat-card against golden template by AST structure (not regex). Catches what regex misses. **Effort:** 2-3h (requires AST parsing). **Target:** v0.7.2 or 0.7.3.

- **N1** `coherent preview --page X` — pass page route to preview, open browser to that URL directly. **Effort:** 15min. **Target:** v0.7.2.

- **N2** `coherent diff` — show last-chat backup vs current. Reuses existing `.coherent/backups/*` dirs. **Effort:** 30min. **Target:** v0.7.2.

- **INCONSISTENT_CARD** cross-page validator — scans all pages, clusters stat-card-like structures, warns when clusters diverge. Fixes PJ-007 (Reports vs Investments inconsistency). **Effort:** 2h. **Target:** v0.7.2.

- **Plan retrofit for sharedComponents.usedBy** — at end of Phase 2, cross-reference `pageNotes[].sections` and auto-extend `usedBy` of shared components with matching page types. Prevents AI from leaving out relevant pages. **Effort:** 1h. **Target:** v0.7.2.

### Deferred (longer-horizon)

- **M5** Dev-overlay with validator issues — in `coherent preview`, overlay colored badges on the page showing live validator findings. Instant visual feedback. **Effort:** 3-4h. **Blocker:** requires Playwright / iframe instrumentation. **Target:** v0.8.x.

- **M6** Prompt caching via Anthropic cache-control headers — mark design-constraints block as cacheable, save $$ and latency. **Effort:** 1-2h. **Blocker:** AIProvider interface change (breaking). Needs design pass. **Target:** v0.8.0 (minor bump).

- **M9** Performance audit (`coherent check --perf`) — runs `next build` and parses `.next/analyze/`, flags routes over 200KB. **Effort:** 2-3h. **Blocker:** next build takes 30s+; UX concern. **Target:** v0.8.x.

- **M10** Axe-core keyboard nav audit — `coherent check --a11y` runs Playwright + axe-core. Catches real tab-order and focus-trap issues. **Effort:** 3-4h. **Blocker:** Playwright dependency (100MB). **Target:** v0.9.x.

- **M11** Dark mode consistency — run validators in mocked dark-token mode, check that raw colors don't have missing dark variants. **Effort:** 1-2h. **Target:** v0.8.x.

- **M12** Cross-page consistency check — extends INCONSISTENT_CARD to all repeatable structures (section spacing, hero pattern, navigation shape). **Effort:** 2-3h. **Target:** v0.8.x.

- **N3** `coherent revert --to v0.6.95` — restore project files to the state at a specific version tag. **Effort:** 1h. **Target:** v0.8.x.

- **N4** Template starters — `coherent init --template saas | ecommerce | dashboard | blog`. **Effort:** 3-4h per template. **Target:** v0.9.x (needs template authoring discipline).

- **Slack/Discord notifications on bug reports** — when `coherent report-issue` is invoked, POST webhook. **Effort:** 1h. **Blocker:** webhooks are per-project config. **Target:** v0.8.x.

### Research / speculative

- **Rule effectiveness tracker** — automatic pass: generate N test projects via real API calls, measure % of pages that pass each validator. Track trend across releases. Signals which rules work. **Effort:** 4-6h. **Blocker:** API cost for each measurement run. **Target:** exploratory.

- **Fine-tune a small model on Coherent-style output** — cheaper, faster inference for common patterns. **Effort:** 1-2 weeks + cost. **Target:** far future; not urgent.

- **Design token OKLCH migration** — move away from hex to OKLCH for perceptual uniformity. Currently in globals.css only; could extend to design-system.config.ts primary source. **Effort:** large refactor. **Target:** v1.0 design.

- **`.coherent/wiki/decisions.md` in generated projects** — already exists, but currently under-used for styling consistency. Could inject into every chat call's prompt. **Effort:** 30min. **Target:** v0.7.3.

- **Auto-generate PATTERNS_JOURNAL entries** — when a validator fires in production and the fix goes through, write an entry. **Effort:** 2h. **Target:** v0.8.x.

---

## Meta-ideas (about the process)

- **Session memory bridging** — my Claude Code memory at `~/.claude/projects/.../memory/` persists across sessions ON MY MACHINE. For other contributors / other Claude instances, they must read `docs/wiki/`. Keep these two in sync: memory = my notes, wiki = shared notes. (2026-04-19)

- **Auto-populate wiki from sessions** — next step: at end of a significant work session, grep git log for "PJ-" references and auto-append skeletons to PATTERNS_JOURNAL.md. Human fills in the "why". (2026-04-20)

- **ADR per breaking change** — make it a rule: every breaking change requires an ADR. CI lint step could check for new ADR when package.json major/minor bumps. (2026-04-20)

---

## How to add a new idea

1. Invent an ID (sequential letter-number, matching cluster: `F` features, `M` meta-architecture, `N` nice-to-haves, `R` research).
2. One-line summary.
3. Why (the rationale — often the bug or friction that prompted it).
4. Rough effort in hours.
5. Status (usually `open` initially).
6. Target version if known.
7. Blocker if applicable (saves re-discovery later).

When shipped, move to the "Shipped" section with the version tag. Don't delete — keeps history.
