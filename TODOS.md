# TODOs

Deferred work captured during planning. Each item has enough context to be picked up months later without re-doing the reasoning.

---

## T1 — Session TTL sweeper automation (v0.10+ candidate)

**What:** `coherent session prune` command or cron-hook for proactive cleanup of `.coherent/session/<uuid>/` directories older than TTL.

**Why:** v0.9.0 enforces 7-day TTL lazily via `coherent check` probe. On projects where `check` is rarely run, stale session dirs accumulate and consume disk.

**Current state:** v0.9.0 ships with `check`-probe TTL enforcement. Sufficient for solo devs who run `check` regularly.

**Trigger condition:** revisit after v0.9.0 dogfood. If user reports accumulation of stale sessions (> 20 on any project after a month), implement.

**Design sketch:** `coherent session prune [--older-than 7d] [--dry-run]`. Iterates `.coherent/session/*/session.json`, deletes dirs with `mtime + ttl < now`. Dry-run shows what would be deleted. Opt-in integration with `coherent check` via `--prune-stale-sessions` flag.

**Not doing now because:** premature optimization. TTL-via-check is a lake-boiled sufficient solution unless proven otherwise.

**Source:** /plan-eng-review of v0.9.0 skill-mode parity plan, 2026-04-23.

---

## T2 — Multi-editor adapters (Cursor, Continue, Windsurf)

**What:** Per-editor adapter files emitted by `coherent init` based on detected editor directories.
- Cursor → `.cursorrules` + `.cursor/mcp.json` custom commands
- Continue → `.continue/config.json` customCommands section
- Windsurf → `.windsurf/workflows/coherent-generate.md` cascade workflow

**Why:** v0.8.0 validated in Claude Code only. v0.9.0 detects other editors but doesn't generate their adapter files (logs v2-marker instead). Multi-editor support expands addressable cohort beyond Claude Code subscription holders.

**Current state:** v0.9.0 `init` detects presence of `.claude/`, `.cursor/`, `.continue/`, `.windsurf/`. Installs Claude adapter only. Others marked "v2 target" in init output.

**Trigger condition:** after v0.9.0 ships and feedback validates skill-mode bet (founder assignment: one external user confirms parity value). Then do adapters per editor.

**Design sketch:** each editor adapter = thin wrapper over `_phase` subcommand protocol. The subcommand contract is already portable (stateless JSON-in / JSON-out + CLI args). Each adapter should be ≤ 1 day of work — write the editor-specific orchestration file, test against the editor's agentic loop, ship.

**Estimated per editor:** Cursor 1 day, Continue 1 day, Windsurf 1.5 days (cascade is newer, less documentation). Total 3.5 days for three adapters.

**Not doing now because:** codex explicitly recommended against it — v1 should prove the shape in one rail before generalizing. Adapters are cheap to add later since the CLI protocol is already portable.

**Source:** /plan-eng-review of v0.9.0 skill-mode parity plan, 2026-04-23. Codex cold read Phase 2 recommendation.

---

## T4 — TTHW instrumentation + DX telemetry (v0.10+ candidate)

**What:** Measure Time-to-Hello-World in real dogfood. Instrument `coherent init` → first successful `/coherent-generate` + `coherent preview` localhost:3000 → record wall-clock to anonymous telemetry endpoint.

**Why:** v0.9.0 sets target < 8 min TTHW for skill-mode. Can't validate without measurement. Plan-devex-review Pass 8 (DX Measurement) was skipped in TRIAGE — this is the follow-up when we're ready to invest.

**Current state:** v0.9.0 ships target-blind. We think < 8 min is achievable but no ground truth.

**Trigger condition:** after v0.9.0 GA, when external adoption begins (issue reports, npm download growth > noise floor). At that point, TTHW data changes behavior.

**Design sketch:**
- Opt-in flag during `coherent init` ("help improve Coherent by sharing anonymous usage times?")
- Hook events: init-start, init-complete, first-skill-invoke, first-preview-success
- POST to endpoint with session UUID + wall-clock deltas only (no intents, no code)
- Dashboard (maybe) showing median TTHW over time

**Not doing now because:** /plan-devex-review TRIAGE mode correctly flagged this as low-priority vs. adoption-blocking gaps. Fix the adoption blockers (Pass 1, Pass 3) first.

**Source:** /plan-devex-review TRIAGE, 2026-04-23. Pass 8 deferred.

---

## T5 — DX regression prevention via /devex-review (post-v0.9.0)

**What:** After v0.9.0 ships, run `/devex-review` (the boomerang) on the live product. Validates that plan's TTHW estimate matches reality.

**Why:** plan-devex-review measures the PLAN. devex-review measures REALITY. Gap between them is the learning.

**Current state:** n/a — runs post-v0.9.0 deploy.

**Trigger condition:** 1-2 weeks after v0.9.0 npm publish, with at least one external user dogfood report.

**Design sketch:** invoke `/devex-review` with scope = v0.9.0 skill-mode path. Measures actual TTHW in real Claude Code session. Compares against plan's estimated < 8 min target.

**Not doing now because:** product isn't shipped yet. Can't boomerang a plan that hasn't landed.

**Source:** /plan-devex-review TRIAGE, 2026-04-23. Skill next-steps chain.

---

## T9 — URL import for style seeding (post-v0.18 candidate)

**What:** `coherent atmosphere from-url <url>` — scrape any website, extract computed colors / typography / base spacing rhythm, normalize to OKLCH + map to CDM atmosphere primitives, save as new atmosphere seed.

**Why:** Bypass to Refero's curated-brand-references moat. They curate manually; CDM automates the first pass. Unlocks "scaffold a Linear-style app" onboarding wedge — user paste URL, get atmosphere.

**Current state:** No infra. Greenfield. Deferred at v0.18 cherry-pick ceremony 2026-05-03 because cost (4-6h CC + production-quality 2 days) is materially higher than the 3 accepted v0.18 gaps, leverage from existing infra is zero, and there is non-zero legal/ToS risk on style scraping.

**Trigger condition:** revisit after v0.18 ships AND atmosphere visual gallery ships on landing AND we have at least one external user signal that "more atmospheres" is the bottleneck (vs. quality of existing 5).

**Design sketch:**
1. Headless browser (Puppeteer or Playwright) — anti-bot stealth basics
2. Computed-style extraction on key elements (h1/body/cta button/card)
3. OKLCH normalization + role assignment (primary/accent/muted by usage frequency + contrast)
4. Font-family detection → Google Fonts mapping
5. Spacing rhythm inference from layout grid (CSS gap / margin patterns)
6. Output: `coherent.config.ts` patch + new atmosphere file under user's project

**Risks:**
- Poor extraction → user disappointed when result diverges from source brand
- Scraping legality (style facts vs. trade dress)
- Anti-bot blocks on key sites (Linear/Stripe/Vercel)
- Aura doesn't ship this — may be a reason

**Not doing now because:** v0.18 cherry-pick said other 3 features have better effort/value. Validate hypothesis with cheaper wins first.

**Source:** /plan-ceo-review competitive positioning, 2026-05-03. Cherry-pick 4 deferred.

---

## T3 — MCP server (`@getcoherent/mcp`) (v0.11+ candidate)

**What:** MCP (Model Context Protocol) server package exposing phase-engine operations as MCP tools. Editor-agnostic layer that works with any MCP-compliant host (Claude Code, Cursor, Cline, Continue).

**Tools exposed:**
- `session_start(projectRoot, intent)` → `{sessionId, lockAcquired}`
- `phase_prep(sessionId, phaseName)` → `{prompt, schema}`
- `phase_ingest(sessionId, phaseName, response)` → `{artifacts, nextPhase}`
- `session_end(sessionId)` → `{configApplied, manifestFinalized}`

**Why:** T2 adapters are per-editor wrappers. MCP is a cross-editor substrate. One MCP server works for all MCP-compliant editors. If MCP adoption continues accelerating (current trajectory: Claude Code, Cursor, Cline, Continue all support it in 2026), MCP server becomes the better abstraction than per-editor adapters.

**Current state:** v0.9.0 dizayns stateless JSON-in/JSON-out phase functions. MCP wrap is a side effect of that design — no v1 investment explicitly made for MCP (revised Premise 6).

**Trigger condition:** after T2 adapters built (3+ editors), if maintenance burden becomes non-trivial. MCP consolidates maintenance to one package.

**Design sketch:** `@getcoherent/mcp` package. Uses `@modelcontextprotocol/sdk` for TypeScript MCP server. Wraps phase-engine's exported functions with MCP tool schemas. Published alongside `@getcoherent/cli` and `@getcoherent/core`.

**Not doing now because:** premature. Building MCP first would be "designing v1 around future MCP elegance" — exactly the pattern Codex flagged in premise 6 challenge. MCP wrap is free because of v0.9.0's design; building the actual server is only worth it if demand is material.

**Source:** /plan-eng-review of v0.9.0 skill-mode parity plan, 2026-04-23. Codex premise 6 challenge + revised premise locking.

---
