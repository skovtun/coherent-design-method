# Changelog

All notable changes to this project are documented in this file.

## Migration guides

If you are upgrading across breaking releases, follow the matching migration doc:

- **v0.11.x → v0.12.0+**: see [`docs/MIGRATION-v0.12.md`](./MIGRATION-v0.12.md). Skill-rail status messages changed format (6 strings).
- v0.13.0: no breaking changes for end users. Internal infrastructure improvements only.

---

## [0.14.0] — 2026-04-28

### Added — Visual Sanity Layer v1

After 2026-04-27/28 dogfood revealed that AI-generated pages can compile cleanly, pass tests, pass lint — and still be visually unusable, this release adds the missing layer between code-correctness validation and user-perceived quality. Two reproducible bugs drove the design:

- **Notifications page** had every list item rendered with `bg-primary` parent. Text contrast collapsed to unreadable. Avatars rendered outside the blue blocks.
- **Calendar page** rendered half the days (5-25) solid-blue selected, with events overflowing day cells and "+2 more" labels misplaced.

Both passed every existing CI gate. v0.14.0 closes the gap with **rules + deterministic validators**.

### Constraint additions (CORE_CONSTRAINTS)

Five new layout-sanity rules in the always-injected constraint block (`packages/cli/src/agents/design-constraints.ts`):

- **Selection state scope** — highlight EXACTLY ONE item at a time. Never apply selection background to a parent that wraps a list of items.
- **Calendar today/selected cardinality** — at most ONE day cell carries today/selected styling. Conditional via `cn(isToday(day) && "bg-primary")` on the cell only.
- **Grid overflow containment** — calendar/kanban/dashboard cells must use `overflow-hidden` + `truncate` (or line-clamp) on text children.
- **Background/text contrast pairing** — `bg-primary` requires `text-primary-foreground` on children; never inherit default text colors on a colored bg.
- **List item active state** — in mapped lists, the selection indicator goes on ONE child at most; default state is "not selected"; conditional `isActive && "bg-accent"` for selection.

The rules are PROBABILISTIC prevention — AI may still violate. Three deterministic validators below catch what escapes.

### Validators added to `coherent check`

Three static validators in `packages/cli/src/utils/quality-validator.ts`. All three emit `severity: 'warning'` (additive — does not promote `coherent check` to non-zero exit, does not break user CI):

- **STUCK_ON_SELECTION** — flags unconditional `bg-primary` / `bg-accent` / `bg-secondary` / `bg-destructive` inside `.map()` callbacks where className is not threaded through `cn()` or a template literal. Catches the Notifications-style pattern where every list item ends up looking selected.
- **CALENDAR_OVER_SELECTED** — flags calendar/day-grid files (heuristic: contains `calendar` / `generateDays` / `isToday` / `days.map(`) with ≥4 unconditional `bg-primary`/`bg-accent` className occurrences inside any 60-line window. Catches the Calendar-style pattern where today-highlighting misfired.
- **CELL_OVERFLOW_NO_CONTAIN** — flags calendar/grid files that map an `events` / `appointments` / `sessions` array into cell children but never use `truncate` / `overflow-hidden` / `line-clamp-N` anywhere. Catches event-title overflow.

Heuristics are intentionally conservative (false positives acceptable as warnings, false negatives expensive). Exact patterns documented inline in `quality-validator.ts`.

### Why rules + validators, not one or the other

Codex pre-impl gate (2026-04-28) challenged the "rules first, validators later" framing: failure mode already escaped compile/lint, so probabilistic prevention alone is insufficient. v0.14.0 ships both in the same release — rules at AI-prompt time, validators at file-write time. Belt + suspenders.

### Internal

- Tests: 1664 passing (+12 new — 11 in `quality-validator.test.ts` covering STUCK_ON_SELECTION, CALENDAR_OVER_SELECTED, CELL_OVERFLOW_NO_CONTAIN positive + negative cases, plus 1 parity test verifying CORE_CONSTRAINTS contains the LAYOUT SANITY block).
- Affected files: `packages/cli/src/agents/design-constraints.ts` (5 new rules), `packages/cli/src/utils/quality-validator.ts` (3 new validators).
- Both rails (API + Skill) inherit the constraint additions automatically — `CORE_CONSTRAINTS` is shared.

### Not breaking

All three validators emit warnings, not errors — `coherent check` exit code is unchanged unless it was already failing on errors. New validator type strings are additive (downstream consumers parsing output may see new types but old types are unchanged). Constraint additions extend the AI-prompt token budget by ~600 chars / ~150 tokens (within the soft warn threshold per `scripts/check-constraint-budget.mjs`).

### Out of scope (deferred)

- framer-motion integration (Codex confirmed motion ≠ visual fix; defer until structure sanity verified)
- Atmosphere UX polish (no proven user gap; needs P5 signal)
- Auto-linking implementation (duplicates v0.13.7 hint)
- Community remix gallery (v1.0+ scope, not next-cycle)

### Parallel track

User running 5-user dogfood survey to validate P1 ("visual quality is the #1 gap"). Survey asks: last `/coherent-chat` prompt + screenshot + forced-choice "what made this unusable: visual/layout / missing functionality / wrong routing / setup friction / unclear value". Results inform v0.15.0 priority.

---

## [0.13.10] — 2026-04-27

### Fixed — two pre-existing dogfood bugs

**Bug B (HIGH severity — code corruption):** `coherent fix` step 7 (SMALL_TOUCH_TARGET auto-fix for `size="icon"` Buttons) corrupted JSX when the button had an arrow-function `onClick`. Reproduced 2026-04-27 dogfood:

```
Before: <Button size="icon" onClick={() => stepMonth(-1)}>
After:  <Button size="icon" onClick={() = className="..." > stepMonth(-1)}>
```

The regex `<...size="icon"[^>]*>` stops at the first `>`, including the `>` inside `() =>`. The className insertion landed inside the arrow body. **Wrote invalid TSX to user files** — caught by user manual edit.

Mitigation: added a brace/paren balance check on the captured `attrs` slice. If `{`/`}` or `(`/`)` are unbalanced — meaning the regex truncated mid-expression — the fix bails (returns the element untouched). The validator still flags the issue; user can fix manually. Better than corrupted output.

Tests: 2 new in `quality-validator.test.ts` pinning the corruption pattern + bail behavior.

**Bug A (medium severity — mid-flow crash):** Skill body told AI to call `coherent _phase prep page:<id>` for every plan'd page. For 1-page plans (anchor IS the only page), `pages-input.json` is absent — the prep call fails with `missing required artifact "pages-input.json"`. Reproduced in dogfood adding a single calendar page.

Mitigation: skill body markdown now explicitly states the skip rule:

> Page phase — only if `shape.hasAddPage` AND `pages-input.json` exists with non-empty `pages[]`.
> Skip rule (v0.13.10): When the plan contained ONLY the anchor page (1 add-page total), `pages-input.json` is either absent OR has empty `pages[]`. The anchor was generated in step 3 — there is nothing left to generate per-page. Do NOT run `coherent _phase prep page:<id>` in this case; it will fail with `missing required artifact "pages-input.json"`. Move directly to step 7.

Both skill body locations (slash command + `SKILL_COHERENT_CHAT` constant) updated. Test pinning the new wording.

### Internal

- Tests: 1652 passing (+3 new — 2 quality-validator, 1 claude-code).
- Affected files: `packages/cli/src/utils/quality-validator.ts` (balance check in tap-target fix), `packages/cli/src/utils/claude-code.ts` (skill body skip rule), respective tests.
- Bug B is a code-corruption fix — high priority, no debate.
- Bug A is markdown-only skill body change — soft fix, AI follows instruction.

### Not breaking

Both fixes are bug fixes — strictly safer behavior. Existing flows unchanged.

---

## [0.13.9] — 2026-04-27

### Fixed — dev server detection actually works now (v0.13.8 was a false-negative)

v0.13.8 added dev-server detection to `coherent fix` so the cache clear is skipped when `coherent preview` is running. The detection used `net.createServer().listen(port, '127.0.0.1')` and checked for `EADDRINUSE`. Reproducible miss in real dogfood: Next.js dev server binds to `::` (IPv6 wildcard) or `0.0.0.0` (IPv4 wildcard). On macOS those are different address families from the probe's `127.0.0.1`, so the bind succeeded, no EADDRINUSE, false negative — `coherent fix` cleared the cache anyway and broke the running preview.

v0.13.9 switches to a `net.connect()` probe: try to OPEN a TCP connection to `localhost:<port>`. If connect succeeds, something is listening (regardless of address family — `localhost` resolves to both 127.0.0.1 and ::1, Node tries them in order). If connect refuses (`ECONNREFUSED`), nothing is there.

- **Connect-based probe** at `packages/cli/src/utils/dev-server-running.ts`. 300ms per-port timeout. Bias to false positives still applies — timeout or non-ECONNREFUSED error treated as "in use."
- **Manual verification:** spun up `net.createServer().listen(3000, '0.0.0.0')` and confirmed connect-probe sees it. v0.13.8's listen-probe missed exactly this case.

### Internal

- Tests: 1649 passing (existing test updated to use a real listening socket — connect needs something to actually accept the SYN, not just a bound port).
- Files affected: `packages/cli/src/utils/dev-server-running.ts` rewrite.

### Not breaking

Same external surface as v0.13.8 (`--force-cache-clear` flag, warning text). Just makes the detection actually work.

---

## [0.13.8] — 2026-04-27

### Fixed — `coherent fix` no longer corrupts running dev server

Recurring bug reproduced twice in v0.13.5 + v0.13.7 dogfood: after `/coherent-chat <intent>` runs `coherent fix` as its post-apply step, the next page load on `coherent preview` (`http://localhost:3000`) returned **500 Internal Server Error**. Manual `Ctrl+C` + restart of the preview was the only recovery.

Root cause: `coherent fix` step 1 (`Cleared build cache`) does `rmSync('.next/', { recursive: true, force: true })` unconditionally. When a Next.js dev server is running, turbopack's in-memory bundler state still references files on disk; wiping `.next/` mid-run triggers ENOENT spam in the dev log AND breaks the next page load until manual restart.

- **NEW: dev-server detection** at `packages/cli/src/utils/dev-server-running.ts`. Tries to bind to ports 3000-3010 via `net.createServer().listen()`. If any is bound (EADDRINUSE), assumes a dev server is running and `coherent fix` skips the cache clear with a yellow warning.
- **`--force-cache-clear` opt-out flag** for users who really want the clear (e.g., "my cache is genuinely corrupted, restart preview after"). Documented inline in the warning message.
- **Output examples:**
  ```
  # Without dev server running (default behavior, unchanged):
    ✔ Cleared build cache

  # With dev server running on :3000:
    ⚠ Skipped cache clear — dev server detected on :3000
       turbopack rebuilds incrementally on next request. To force clear, stop the server (Ctrl+C) or pass --force-cache-clear.
  ```

### Internal

- Tests: 1649 passing (+2 new in `dev-server-running.test.ts`).
- New file: `packages/cli/src/utils/dev-server-running.ts` (38 lines).
- New flag: `--force-cache-clear` on `coherent fix`.
- Bias: false positives (skip clear unnecessarily when no server is up but port is bound by something else) over false negatives (clear while server is up). Cost of skipping when no server is running is zero — turbopack rebuilds on next request anyway.

### Not breaking

`coherent fix` default behavior is now safer when a dev server is running. Direct CLI users without a dev server see no change. The `--no-cache` flag (skip clear entirely) is unchanged. The new `--force-cache-clear` flag is opt-in.

---

## [0.13.7] — 2026-04-27

### Added — discoverability hint in skill-rail completion card

User feedback from v0.13.6 dogfood: after `/coherent-chat add a profile page`, the page existed at `/profile` but **nothing in the UI linked to it** — user had to know the URL or peek at the sitemap. Coherent's nav-items aren't append-on-add, so newly-added pages are stranded by default.

This release adds a 📍 line to the completion card that classifies the new page and emits ONE concrete next-step command. Three categories with their own template:

- **TOP-LEVEL** (single-segment route, common page name): suggests `coherent chat "add <Name> to the main nav"`
- **INTERNAL** (sub-page of an existing parent route): suggests `coherent chat "add a <Name> link to the <parent> page"`
- **DETAIL** (Next.js dynamic `[id]` / `[slug]` route): suggests `coherent chat "in <parent-list>, make each item's name link to <route>"`

The 📍 line is **skipped** when:
- No `add-page` in applied (delete, update-token, modify-component)
- User intent already specifies linking ("add a Profile page linked from /home")

For multi-page generation, the hint covers the anchor page only; the other pages get nav regen automatically.

Example for top-level:

```
Coherent · add a profile page

  ✅ Applied: 1 page (Profile) at /profile

  📍 Profile looks like a top-level page. To add it to the main nav:
     coherent chat "add Profile to the main nav"

  Preview · coherent preview (or open localhost:3000 if already running)
  Undo    · coherent undo
  Debug   · session 4f2adb (full uuid: 4f2adb4a-bec4-4760-a5b5-e67e1bc447b7)
```

### Internal

- Tests: 1647 passing (+1 new claude-code test pinning the 3 templates).
- Affected file: `packages/cli/src/utils/claude-code.ts` (skill body constants only — slash command + installed SKILL.md).
- Implementation is markdown-only (skill body instruction). AI does the classification at completion-signal time. Soft suggestion — if AI miscategorizes, user can ignore the hint and run any other command.

### Not breaking

Cosmetic skill body change. Existing flows unchanged. Stale skill bodies (no `coherent update` after upgrade) keep showing the v0.13.6 card without 📍.

### Out of scope (deferred)

Auto-linking implementation — i.e. `add-page` automatically modifies parent page or nav config to insert the link. Requires extending `ModificationRequest` schema with `linkFrom: 'nav' | 'page:home' | 'none'` field + dispatch logic. Not v0.13.7 scope. Today's hint shifts the work to the user as a one-command follow-up; future v0.14+ may auto-execute.

---

## [0.13.6] — 2026-04-27

### Changed — clarify Preview line in skill-rail completion card

The Variant E completion card (v0.13.3) shows three action rows: Preview / Undo / Debug. The "Preview · coherent preview" line was ambiguous when `coherent preview` was already running in the background — users wondered if they needed to restart it. (They don't — Next.js dev server picks up new files via HMR.)

- **Before:** `Preview · coherent preview`
- **After:** `Preview · coherent preview (or open localhost:3000 if already running)`

Both packages of skill body markdown updated (slash command + installed SKILL.md). Six total occurrences replaced via replace_all. Existing test pattern (`Preview · coherent preview` substring match) still satisfied.

### Internal

- Tests: 1646 passing.
- Affected file: `packages/cli/src/utils/claude-code.ts` (skill body constants only).

### Not breaking

Cosmetic skill body change. Existing skill rail flow unchanged. Stale skill bodies (no `coherent update` after upgrade) keep showing the old shorter line.

---

## [0.13.5] — 2026-04-27

### Changed — internal cleanup (PR2 step 1: zombie deterministic case bodies removed)

`packages/cli/src/commands/chat/modification-handler.ts` lost 6 deterministic case bodies that became unreachable after v0.12.0's apply-requests extraction. Per v0.12.0 CHANGELOG's "deferred to PR2" note, these are zombie code: the canonical path goes through `apply-requests/dispatch.ts:dispatchDeterministic`, and `applyModification` is now only reached for AI types via `dispatchAi:152`.

- **Deleted bodies:** `update-token`, `add-component`, `modify-component`, `update-navigation`, `delete-page`, `delete-component` (~180 lines).
- **Replaced with explicit throws:** each deterministic case now throws `Error("Deterministic type X reached applyModification — should route through dispatchDeterministic. Bug in dispatch routing.")`. If a future caller bypasses `applyRequests` and reaches `applyModification` with a deterministic type, the error fires loudly instead of silently running stale code.
- **Default arm preserved unchanged.** `add-layout-block` (AI type with no case body in this file) still hits the default and returns the structured "Unknown modification type" result — codex pre-impl gate caught the original blanket-default plan would have changed `add-layout-block` behavior.

File: 1344 → 1165 lines. Risk: zero by construction — the deleted bodies were unreachable per the v0.12.0 dispatch routing audit; no test referenced them.

### Internal

- Tests: 1646 passing (zero added, zero removed — confirms zombie status).
- tsc + prettier + build clean.
- This is step 1 of the PR2 structural collapse plan (`docs/plans/2026-04-27-v0.14.0-pr2-collapse-spike.md`). Steps 2-12 (helper relocation, AI-case body moves, chat.ts facade collapse, modification-handler.ts deletion) remain pending.

### Not breaking

`@getcoherent/cli` exports map (added v0.13.2) blocks deep imports into `dist/`, so internal moves are non-breaking for downstream consumers. The `applyModification` function remains exported with its same signature; only its dead code paths are gone.

---

## [0.13.4] — 2026-04-27

### Added — AI-dispatch boundary parity gate (Item 3)

Closes the parity coverage gap from v0.12.0 adversarial review. The existing `parity-gate.test.ts` covered the 6 deterministic ModificationRequest types end-to-end (on-disk + config). The 5 AI-dependent types (add-page, update-page, modify-layout-block, link-shared, promote-and-link) had no equivalent gate — meaning a future regression in `dispatchAi`'s pre-population enforcement could quietly reintroduce the v0.11.x silent-drop bug class.

- **NEW: `parity-gate-ai.test.ts` + 3 boundary fixtures.** Pin the contract for the v0.12.0 structural fix: when `applyMode === 'no-new-ai'` (skill rail), AI-dependent requests MUST throw `CoherentError E007` if the request lacks pre-populated output. Fixtures cover:
  - `add-page` without `pageCode` → E007
  - `link-shared` (NEVER pre-populatable per `dispatch-ai.ts:81-82`) → E007 always
  - `promote-and-link` (NEVER pre-populatable per `dispatch-ai.ts:84-85`) → E007 always
- **Why boundary tests, not happy-path on-disk tests.** Happy-path AI parity (e.g. `add-page` WITH pageCode → file written + manifest updated) goes through legacy `applyModification` which has heavy downstream side effects (component install, plan loading, route mapping, auto-fix, layout stripping, globals.css sync). Testing on-disk byte equivalence requires fake-AI-provider scaffolding + manifest setup. That's bigger scope and the deterministic types in `parity-gate.test.ts` already cover on-disk parity for the 6 types that don't need AI. The 3 boundary tests close the **regression-risk** part of the gap (silent drop) without that scaffolding.

### Internal

- Tests: 1646 passing (+4 in `parity-gate-ai.test.ts`).
- 3 new fixture files under `packages/cli/src/apply-requests/__tests__/fixtures/ai/`.

### Out of scope (deferred to v0.14+)

- Happy-path AI on-disk parity (add-page WITH pageCode, update-page WITH pageCode, modify-layout-block) — needs fake-AI-provider scaffolding. Will land naturally when PR2 commit #10 moves the 5 AI-case bodies into `dispatch-ai.ts` and they become self-contained.
- Real-AI corpus capture / VCR live-provider — defer until parser-drift becomes an observed problem.

---

## [0.13.3] — 2026-04-27

### Changed — skill rail log cleanup

User-visible noise reduction for `/coherent-chat` runs in Claude Code. ~30 lines of mixed UUID echoes / "Plan-only shape confirmed" / `▸ [N/M]` progress chatter / verbose `Applied:` block → clean preamble + final summary card.

- **`coherent session start --quiet`** (new flag). Stdout still emits the bare UUID; informational stderr block ("Session UUID started at TIMESTAMP", session dir, started-at) is suppressed. Errors remain on stderr. Default behavior unchanged for direct CLI users.
- **`coherent session end --quiet`** (new flag). Stdout becomes a single line `✔ Session <short> ended (<N> applied)` instead of the multi-line `Applied:` block. Run record still written under `.coherent/runs/`. Default behavior unchanged for direct CLI users.
- **Skill body (`SKILL_COHERENT_CHAT`) rewritten.** Drops the `▸ [N/M] Planning…` / `▸ [N/M] Applying delete-page to disk…` instructions — the Bash boxes themselves show what's running, the chatter was redundant. Final completion signal is now a structured card:
  ```
  Coherent · delete the Activity page

    ✅ Applied: delete-page Profile

    Preview · coherent preview
    Undo    · coherent undo
    Debug   · session 4f2adb (full uuid: 4f2adb4a-bec4-4760-a5b5-e67e1bc447b7)
  ```
  Failure path uses `❌ Failed:` and skips Preview/Undo.

### Behavior matrix

| Surface | Before | After |
|---|---|---|
| Direct `coherent session start` | UUID + verbose stderr | unchanged |
| Direct `coherent session end` | verbose `Applied:` list | unchanged |
| Skill rail (`/coherent-chat`) | ~30 lines noise + `✅ Done. Applied: ...` one-liner | tight `Bash(...)` boxes + structured card at end |

### Internal

- Tests: 1642 passing (+4 new in `session.test.ts` for `--quiet` flag, +existing `claude-code.test.ts` updated for new card format).
- New file: `packages/cli/src/commands/session.test.ts`.
- Test hook: added `_projectRoot` to `SessionStartCliOptions` and `SessionEndCliOptions` for sandboxed unit tests.

### Out of scope

The full Variant D′ design (per-phase `_phase ingest` ✓-lines, `<phase>-result.json` artifacts, `coherent session card` read-only renderer, `sessionEndMutate` vs `sessionEndRender` split, `coherentReleaseFlags.breaking` for v0.14, MIGRATION-v0.14.md) was descoped after 4 rounds of codex+adversarial pre-impl gates surfaced 14+ infrastructure issues unrelated to the actual user need (cleaner logs). The minimal v0.13.3 covers the user-facing intent; the deferred infrastructure work waits until it has its own demand.

### Not breaking

`session start` and `session end` flags are additive. Stale skill bodies (no `--quiet`) keep working with verbose output. Direct CLI users see no change. Downstream parsers of skill-rail output may need to update — see CHANGELOG entry for v0.12.0 for the same migration shape (the `▸ [N/M]` and `✅ Done. Applied:` strings are gone from the new skill body).

---

## [0.13.2] — 2026-04-27

### Fixed — three latent v0.14.0 prerequisites caught by adversarial review

After picking Variant D for skill-rail UX (Item 4), an adversarial pre-impl gate (per ADR-0007) caught three issues that would have surfaced as user-visible regressions during v0.14.0. Shipped as a patch to clear the runway before v0.14 starts.

- **`coherent update` no longer destroys customized skill bodies.** Pre-v0.13.2, `writeClaudeSkills()` unconditionally overwrote `.claude/skills/coherent-chat/SKILL.md` and `.claude/skills/frontend-ux/SKILL.md`. Anyone who customized either file lost their changes silently on every `coherent update`. v0.13.2 introduces a hash-chain lock at `.coherent/skills.lock.json` — when the file on disk matches the last canonical hash we wrote, we safely overwrite. When it doesn't match, the existing file is preserved as `.coherent/backups/skills/<skill>-SKILL-<timestamp>.md` and the new canonical is written with a warning. First `coherent update` after upgrading from v0.13.0/v0.13.1 emits one cosmetic backup notice (no lock yet exists), then is silent thereafter.
- **`package.json` exports map for `@getcoherent/cli`.** Pre-v0.13.2 there was no `exports` field, so any deep import path into `dist/` resolved by file lookup. Removing or renaming any internal module would silently break downstream consumers — even though the CLI exposes no library API. v0.13.2 adds `exports: { ".": "./dist/index.js", "./package.json": "./package.json" }` matching `@getcoherent/core`. PR2's planned commands/chat/ flatten in v0.14.0 is now technically non-breaking. **Note for downstream consumers:** if you were doing `import 'unstable/path' from '@getcoherent/cli/dist/utils/...'`, that path is now blocked. There is no public library API; use `@getcoherent/core` instead.
- **`coherentReleaseFlags` end-to-end publish path verified + documented.** Pre-v0.13.2 the v0.13.0 update-notifier expected `coherentReleaseFlags.breaking` to ship in the published package.json, but the maintainer step to add it was undocumented and unenforced — the field was missing from both v0.13.0 and v0.13.1 published tarballs (verified by inspecting the npm tarball). v0.13.2 (a) confirms `pnpm pack` preserves arbitrary top-level fields when present, (b) documents the manual injection step in `docs/runbooks/cut-release.md` Step 3a, and (c) adds a CI guard test (`packages/cli/src/utils/release-flags-schema.test.ts`) that validates schema if the field is present and enforces cli/core consistency.

### Internal

- Tests: 1638 passing (claude-code +4 lock/backup tests, release-flags-schema +6). tsc clean. Build clean.
- New file: `packages/cli/src/utils/release-flags-schema.test.ts`.
- Documentation: `docs/runbooks/cut-release.md` Step 3a (BREAKING releases only).

### Out of scope (deferred to v0.14.0)

- Skill rail Variant D streaming format. The adversarial gate also caught two non-trivial concerns about Variant D itself: (1) the runtime opt-out env var as originally written is incoherent (skill body is markdown, not code), (2) the streaming format depends on Claude Code's Bash-box rendering which has not been validated against the mockup. v0.13.2 is the prerequisites; Variant D ships in v0.14.0 alongside PR2 only after the rendering check (`/tmp/coherent-rendering-check-plan.md`) confirms feasibility.

---

## [0.13.1] — 2026-04-27

### Fixed — version-mismatch UX (E008)

Pre-v0.13.1 the CLI printed a soft warning when running `coherent chat` on a project whose `coherentVersion` was older than the CLI, then continued anyway. If the schemas differed, downstream code crashed with a cryptic generic `TypeError: Cannot read properties of undefined (reading 'sections')` mid-generation. Reproduced 2026-04-27 during real-AI manual test.

v0.13.1 makes this a hard stop at config-load time:

- **New code:** `COHERENT_E008_PROJECT_OLDER_THAN_CLI`. Throws via `CoherentError` so the v0.13.0 boundary helper renders the actionable Fix line: `Run \`coherent update\` in the project to apply the new CLI's rules and templates, then re-run \`coherent chat\``.
- **Hard stop at boundary:** error fires BEFORE any state mutation, instead of crashing partway through generation when files have already been written.
- **Docs:** entry in `docs/error-codes.md` + the `coherentReleaseFlags`-aware `update-notifier` from v0.13.0 already links typed errors to their docs page (E008 docs synced to getcoherent.design/errors/E008).

### Internal

- Tests: 1628 passing (E008 added to error registry test). tsc clean. Build clean.
- The known-issue note in v0.13.0 CHANGELOG is now closed by this patch.

---

## [0.13.0] — 2026-04-27

First published as `0.13.0-rc.1` to the `next` dist-tag for canary validation. End-to-end manual test (`coherent chat "fitness studio app..."`) on a real project under live Anthropic API succeeded: 4 pages generated, 6 shadcn primitives auto-installed, AI quality auto-fix worked (Classes: 4 errors → 0 + 9 TS errors fixed), backup saved, preview server rendered OK. Promoted to `0.13.0` stable.

### Pre-manual-testing cleanup release

Closes infrastructure gaps from v0.12.0's "known limitations" CHANGELOG section before users start manual testing. No breaking changes for end users; downstream consumers parsing skill-rail output already migrated in v0.12.0.

### Added

- **Centralized `renderCliError(err, {debug, isTty})` helper** at `packages/cli/src/utils/render-cli-error.ts`. Single rendering boundary for typed `CoherentError` errors (E001-E007) and generic Errors. Handles 4 branches: CoherentError fast-path (instanceof), CoherentError structural (cross-package boundary), generic Error (with optional stack via `COHERENT_DEBUG=1`), unknown shape (string/null/object thrown as error).
- **Wired CoherentError surfacing at 4 boundary sites**: top-level CLI catch (`index.ts` global `uncaughtException` + `unhandledRejection` traps with recursive-failure fallback), `chat.ts` chat command catch, `_phase.ts` outer catch, `phase-engine/session-lifecycle.ts:206` applier wrapper (no longer destroys typed-error context).
- **`isCoherentError()` is now actually structural** — not just instanceof. Pre-v0.13.0 the docblock claimed "structural marker" but the implementation was `instanceof CoherentError`. v0.13.0 implements an actual structural check (`name === 'CoherentError'` + code matches `/^COHERENT_E\d{3}$/` + fix is string + docsUrl is string) that survives cross-package boundaries (dependency hoisting, dual install, IPC serialization). The `instanceof` check is preserved as a fast-path for the common single-package case.
- **`docs/MIGRATION-v0.12.md`** — explicit migration doc for users upgrading from v0.11.x to v0.12.0+. Documents 6 BREAKING skill-rail message format changes with old → new regex examples. Cross-referenced from CHANGELOG top.
- **`coherentReleaseFlags` registry-metadata field** (consumed by update-notifier). Allows future releases to flag themselves as breaking + provide a domain-allowlisted migration URL. The auto-update banner uses this to differentiate non-breaking updates from breaking ones — louder formatting + migration link for breaking releases. URL allowlist pinned to `https://github.com/skovtun/coherent-design-method/` and `https://getcoherent.design/` to defeat supply-chain phishing via compromised registry record.
- **Update-notifier banner routes to STDERR on non-TTY** (CI logs, redirected output, automation pipes). Pre-v0.13.0 it always went to stdout, polluting structured-stdout contracts. TTY mode unchanged — banner stays inline above command output where users see it.

### Changed

- **`publish.yml` workflow** — added dist-tag detection. Pre-release tags (`vX.Y.Z-rc.N`, `-beta.N`, `-alpha.N`) publish to `next` dist-tag instead of `latest`. Without this, RC validation strategy was structurally impossible — every published version overwrote `latest` and broke users on the previous stable.
- **Update-notifier cache write is now atomic** — `writeFileSync(tmp) + renameSync(tmp, final)` instead of direct `writeFileSync`. Pre-v0.13.0, parallel `coherent` invocations could corrupt the cache JSON (interleaved writes), causing the banner to silently stop appearing for ~24h until next refresh.

### Internal

- **Adversarial-review pattern proven AGAIN.** The plan went through codex consult (caught Item 5 scope-creep, renamed "real-AI smoke", split items), then a fresh-context adversarial subagent caught 7 critical issues codex missed: existing `update-notifier.ts` (Item 1 was reinventing existing code), `publish.yml` workflow gap (RC strategy was impossible), 3 CoherentError destruction sites, cache write race, supply-chain attack surface in registry-sourced URLs, npm unpublish 72h policy is wrong (`download_count > 1` cannot be unpublished after 24h). All 7 either fixed or deferred to user-supervised work with explicit rationale.
- **Tests:** 1627 passing + 9 todo (up from 1612 in v0.12.0). New: 13 render-cli-error tests + 4 update-notifier tests for breaking-flag handling.
- **Carried forward to v0.14.0:** PR2 structural collapse (delete zombie deterministic case bodies in `modification-handler.ts`, move 5 AI-case bodies to `dispatch-ai.ts`, chat.ts facade collapse). Codex flagged Item 5 as 8-12h scope on its own — split out of v0.13.0 cleanly.
- **Deferred to user-supervised next session:** chat pipeline smoke with real-AI corpus (needs `ANTHROPIC_API_KEY_CANARY`), skill-rail UX polish (BREAKING for downstream — needs visual review of prototypes).

### Known issues — flagged for v0.13.x patch

- **Project version mismatch shows warning, not hard stop.** When `coherent chat` runs on a project created with an older CLI version, the CLI prints `⚠ Project is older than CLI` and continues. If the project's config schema diverged, downstream code crashes with a cryptic generic `TypeError: Cannot read properties of undefined (reading 'sections')`. Should be a `CoherentError` (e.g., `E008_PROJECT_OLDER_THAN_CLI`) with `fix: 'coherent update'` and immediate exit so v0.13.0's surfacing helper renders the actionable Fix line. Reproduced 2026-04-27 during manual end-to-end test. Workaround: run `coherent update` whenever you see the warning.

---

## [0.12.0] — 2026-04-26

### apply-requests extraction — both rails now share one dispatch path

The v0.11 line shipped 6 hotfixes (0.11.0 → 0.11.5) over 24 hours, every one patching a different symptom of the same architectural drift: the skill rail (`/coherent-chat`) and the API rail (`coherent chat`) had diverged implementations of how to apply `ModificationRequest` types. Every dogfood session uncovered another place where the skill rail handled a subset of cases differently — silent drops, missing destructive guards, divergent error messages, format inconsistencies. Codex audit (2026-04-25) confirmed it was a parity-drift CLASS, not a bug list.

v0.12.0 fixes the class structurally. `packages/cli/src/apply-requests/` is a new top-level peer service that owns the `ModificationRequest` dispatch contract for BOTH rails. The 6 deterministic request types route through one shared `dispatchDeterministic`. The 5 AI-dependent types route through `dispatchAi` with an enforced `applyMode: 'with-ai' | 'no-new-ai'` contract — the skill rail's no-AI mode now throws `COHERENT_E007` on un-pre-populated AI requests instead of silently dropping them (the v0.11.3 bug class).

This is the long-deferred ADR-0005 delivery. Originally accepted in v0.9.0, never finished. The 6 v0.11.x hotfixes were what motivated finishing it.

### Added

- **`packages/cli/src/apply-requests/`** (~2700 LoC, 7 source files + 5 test files + 6 fixture JSONs):
  - `types.ts` — `ApplyMode`, `ApplyRequestsContext`, `ApplyResult` interfaces
  - `managers.ts` — ported `applyManagerResult` (was duplicated across both rails)
  - `pre.ts` — pre-apply helpers: `runGlobalsCssPreflight`, `loadProjectHashes`, `createPreApplyBackup`, `resolveKnownRoutes` (codex F-pattern fix for known-routes drift)
  - `parse.ts` — `parseRequests` pipeline: `applyDefaults` + PJ-009 destructive-intent guard + per-request normalize-and-coerce-refusal in one structured-result helper
  - `dispatch.ts` — `dispatchDeterministic` for 6 types: `update-token`, `add-component`, `modify-component`, `update-navigation`, `delete-page`, `delete-component`
  - `dispatch-ai.ts` — `dispatchAi` for 5 types with `applyMode` gate: throws `COHERENT_E007` in `'no-new-ai'` mode when an AI-dependent request lacks pre-populated `pageCode` / `layoutBlock`
  - `post.ts` — post-apply helpers: `updateFileHashes`, `syncManifestMetadata`, `createPostApplyBackup`
  - `index.ts` — `applyRequests(requests, ctx, mode)` entry point; per-request routing through `dispatchDeterministic` / `dispatchAi`
- **`COHERENT_E007_NO_AI_REQUIRES_PREPOPULATION`** in `errors/codes.ts` — fires when skill rail (`'no-new-ai'`) gets an AI-dependent request without pre-populated output. Structurally kills the v0.11.3 silent-drop bug class. Documented in `docs/error-codes.md`.
- **6 deterministic fixtures** under `apply-requests/__tests__/fixtures/deterministic/*.json` — JSON I/O contracts the parity-gate test asserts against. Add a fixture when you add a request type.
- **Integration + parity-gate tests** — `integration.test.ts` (4 tests) covers multi-request orchestration; `parity-gate.test.ts` (7 tests) loads each fixture and runs through `applyRequests`. Pinned contract that future changes can't drift from.
- **84 new tests** across the apply-requests test suite. Total: 1611 passing + 9 todo (1620). Up 84 from v0.11.5.

### Changed

- **API rail (`commands/chat.ts:980-983`)** now calls `applyRequests(normalizedRequests, ctx, 'with-ai')` instead of inline `for (req of ...) await applyModification(...)`. Result shape unchanged so all surrounding result handling needs zero changes. Same for the linked-page auto-scaffold loop at `chat.ts:1156` — `applyModification` import dropped from `chat.ts` entirely; only `apply-requests/index.ts` calls it now (transitively through `dispatchAi`).
- **Skill rail (`phase-engine/appliers.ts:createModificationApplier`)** now calls `applyRequests(handled, ctx, 'no-new-ai')` instead of running its own inline 5-case switch (lines 215-262 — gone). Removed 110 lines of skill-private duplicates: `applyManagerResult`, `applyDeletePage`, `applyDeleteComponent`. The applier function body collapses from ~140 lines to ~25 lines.
- **5 message-format assertions** in `phase-engine/__tests__/appliers.test.ts` updated to match the shared `dispatchDeterministic` format. Skill rail's old `delete-page: Transactions ✓` → API rail's `Deleted page "Transactions" (/transactions). ...`. Behavioral equivalence preserved, just the message strings reformatted to one canonical shape.

### ⚠ BREAKING — skill-rail message format

The skill rail's `createModificationApplier` (used by `/coherent-chat` via Claude Code) previously emitted concise `<verb>-<type>: <name> ✓` strings. Post-v0.12.0 it emits the full canonical `dispatchDeterministic` strings, which match the API rail format. If any downstream skill consumer (custom Claude Code skill, automation that parses CLI output) regex-matches the old shape, it will silently stop matching:

| Operation | Old skill format | New shared format |
|---|---|---|
| delete-page | `delete-page: Transactions ✓` | `Deleted page "Transactions" (/transactions). Nav updated. Run \`coherent undo\` to restore.` |
| delete-component | `delete-component: CID-009 ✓` | `Deleted shared component "FeatureCard" (CID-009). Pages importing it will break — regenerate them with \`coherent chat --page X "remove FeatureCard usage"\`.` |
| update-token | `update-token: colors.light.primary ✓` | `Updated token colors.light.primary from #X to #Y` |
| add-component | `add-component: CtaButton ✓` | `Registered component CtaButton (cta-button)` |
| modify-component | `modify-component: <id> ✓` | `Updated component <name> (<id>)` (or specific failure message) |
| delete-page (root refusal) | `refusing to delete root page` | `Refusing to delete the root page (/). If you really want this, edit design-system.config.ts manually.` |

If you parse these strings, update your patterns. The new format is canonical and stable going forward — both rails produce it.

### Drift class killed

Six codex audit drifts collapsed:
1. **Destructive pre-parser drift** — both rails now share `parse.ts:parseRequests` (PJ-009 guard runs identically)
2. **Normalization drift** — same `normalizeRequest` for both rails through `parse.ts`
3. **Validation/autofix divergence** — moved to dispatch layer; rails behave identically
4. **Known-routes drift** — `resolveKnownRoutes(dsm)` reads full config; skill rail no longer misses routes from prior chats
5. **Manual-edit hash protection drift** — both rails will share `pre.ts:loadProjectHashes` (call-site migration is PR2)
6. **Backup parity** — both rails have access to `pre.ts:createPreApplyBackup` + `post.ts:createPostApplyBackup`

The structural fix for the silent-drop bug class:
- Pre-v0.12.0 skill rail: AI-dependent request with no pre-populated output → silently dropped (no signal)
- v0.12.0 skill rail: same input → throws `COHERENT_E007` immediately. Producer-side bug surfaces loudly at the first phase that fails to fill in deterministic output.

### For Maintainers

- `commands/chat/modification-handler.ts` (1344 lines) stays intact this release as the AI-case delegation target. PR2 (`chat.ts` facade extraction) physically moves the 5 AI-case bodies (~880 lines) into `dispatch-ai.ts` and reduces modification-handler to a re-export. Held back from v0.12.0 to keep the surface area reviewable.
- Bisect-friendly: 11 commits, each with vitest green at HEAD. Each commit independently revertable.

### Adversarial review — known limitations carried into v0.12.0

A pre-merge adversarial subagent review (2026-04-26) caught 3 INFORMATIONAL gaps and 5 CRITICAL findings beyond what `/plan-eng-review` and `/codex consult` had identified at planning stage. The cheap fixes shipped in this release; the structural ones are queued for PR2:

**Shipped in v0.12.0 (post-review fixes):**
- `add-layout-block` was in the type union but in NEITHER `DETERMINISTIC_TYPES` nor `AI_TYPES` — would silently produce `{success:false}` instead of throwing E007 in `'no-new-ai'` mode. Added to `AI_TYPES` as never-pre-populatable so the gate fires loudly even on this unimplemented type. Test added.
- `modify-component` parity-gate fixture had a too-loose regex (`"not found|Component"`) that would match hypothetical regression messages containing the literal English word "Component". Tightened to the canonical `"Component <id> not found"` shape.
- This BREAKING CHANGE callout for the skill-rail message format change.

**Deferred to PR2 (with rationale):**
1. **Zombie deterministic case bodies in `modification-handler.ts`.** The 6 deterministic cases still live there as a second copy alongside `dispatch.ts`. Current call sites only hit `applyModification` for AI types, but no compile-time check enforces "only AI types reach me." Risk: future contributor adding a new caller of `applyModification` gets the legacy bodies, not the shared ones. PR2 will physically delete the 6 deterministic case bodies + replace with `default: throw new Error('only AI types post-v0.12.0')`.
2. **Test coverage gaps.** No integration test exercises (a) the API rail loop with `parseModification`-produced requests, (b) skill-rail E007 boundary (currently caught by partition guard before applyRequests sees AI-type), (c) the second `applyModification` call site at `chat.ts:1156`, (d) `CoherentError` propagation (no `instanceof CoherentError` branches in any caller — `.fix` and `.docsUrl` are silently lost).
3. **No end-to-end smoke test with a real AI provider.** Only unit/integration tests pin behavior; the `coherent chat "build me X"` E2E path is unverified post-extraction. Smoke test for the API rail's full delegation chain requires a fake AI provider in tests — queued for PR2.
4. **`anySuccess` heuristic for `dsm.save()` in skill rail applier.** Works today; latent footgun if a future deterministic case returns `success:true` but shouldn't trigger persistence. Documenting now; revisiting in PR2.

These limitations do NOT block v0.12.0 — they trace to the deliberate "wrap-now / move-later" split the GSTACK eng-review accepted. The structural extraction lands now; the layer-hygiene completion is PR2.
- Drift-gate fixtures (`apply-requests/__tests__/fixtures/deterministic/*.json`) are the canonical contract for the 6 deterministic types. When you change `dispatchDeterministic`, expect to update fixtures. When you add a request type, add a fixture in the same commit.
- ADR-0005 (chat.ts as facade over runPipeline) — `shipped_in` field in the ADR header now lists `[0.9.0, 0.12.0]`. PR1 of the ADR landed; PR2 (chat.ts collapse to ~150 lines) is in flight.

## [0.11.5] — 2026-04-26

### Two skill-rail UX paper-cuts: invisible "Done" + opaque stale-lock recovery

v0.11.4 dogfood (`/coherent-chat delete the Activity page`) shipped the right-shape orchestration but exposed two visible UX issues:

1. **Completion signal unreadable.** The skill body emitted `✅ Done. Applied: delete-page Activity. Run \`coherent preview\` to see it.` Claude Code renders inline-code (text wrapped in backticks) as gray-on-light. On the highlighted ✅ Done plate that styling collapses to invisible — user could not see the recovery command in the very moment they needed it.
2. **Stale-lock recovery opaque.** When a session crashed mid-flow (permission gate, network hiccup, agent abandon) the lock persisted and the next `coherent session start` failed with `❌ Another coherent session is active (lock age: 145s)` and a fix message saying `coherent session end <uuid>` — literal `<uuid>` placeholder. The dogfood agent recovered by manually `ls .coherent/session/` to find the right UUID. v0.11.5 puts the actual UUID in the error.

### Fixed

- **Both skill bodies (`packages/cli/src/utils/claude-code.ts`)** — completion signal section rewritten to mandate plain text (no backticks) on the ✅ Done line. Claude Code's inline-code styling on a highlighted plate is unreadable; the signal carries the recovery command at the exact moment the user needs it. Plain text wins. Examples updated to use `Preview: coherent preview` instead of `Run \`coherent preview\` to see it.`
- **`acquirePersistentLock` (`packages/cli/src/utils/files.ts`)** — when the persistent lock is held, the error's `fix` field now embeds the active session UUID looked up from `.coherent/session/<uuid>/`. Pre-v0.11.5 the message said `coherent session end <uuid>` literally; v0.11.5 says `coherent session end 4f2adb4a-bec4-4760-a5b5-e67e1bc447b7 --keep` — copy-pasteable. Most-recent dir wins on ties (the one most likely blocking right now). Falls back to `<uuid>` placeholder + `ls .coherent/session` hint when no session dirs exist (orphan lock).

### For Maintainers

- 3 new tests in `files.test.ts`: UUID embedded when one session dir exists; most-recent-mtime wins on multiple; placeholder fallback on orphan lock. Total: 1530 passing + 9 todo (1539). Up 3 from v0.11.4.
- Both UX paper-cuts caught in the same dogfood session that proved v0.11.4 worked. Pattern: each iteration finds smaller and smaller drifts. The v0.11 line is now 5 hotfixes deep — we're in the long tail of polish.
- The deeper architectural question (`/plan-eng-review` of Option A/B/C: continue parity-engine pattern vs collapse skill rail to thin wrapper) is in flight independently. v0.11.5 fixes don't presume which option wins — both work regardless.

## [0.11.4] — 2026-04-25

### Skill-rail orchestration drift — `[1/6]` lies + spurious "Error" lines

v0.11.3 dogfood (`/coherent-chat delete the Profile page`) showed three UX problems even though the underlying applier worked correctly:

1. The skill body printed `▸ [1/6] Planning…` — but plan-only ops only need 2 phases (plan + apply). The hardcoded counter was lying about the workflow shape.
2. Anchor prep ran unconditionally and exited code 1 with `❌ anchor prep failed: anchor: missing required artifact "anchor-input.json"`. The skill agent then guessed at runtime to skip anchor / extract-style / components — correct guess but it shouldn't be a guess.
3. No structured "done" signal. Long log, user uncertain if it's safe to run `coherent preview`.

Codex `/codex consult` audit (572k tokens, 2026-04-25) confirmed the same parity-drift class as v0.11.3 — applied to phase-execution coverage instead of request-type coverage. The skill body was hardcoded for the v0.9 full-add-page workflow; nothing communicated session shape from plan ingest down to the orchestrator.

### Added

- **`SessionShape` interface + `computeSessionShape` pure helper (`packages/cli/src/phase-engine/phases/plan.ts`)** — explicit orchestration shape with fields:
  - `requestTypes: string[]` — sorted unique list (diagnostics + tests)
  - `hasAddPage: boolean` — gates anchor / extract-style / components / page phases
  - `hasOnlyNoAiRequests: boolean` — true when every request is in `{delete-page, delete-component, update-token, add-component, modify-component}`; the modification applier handles them deterministically without AI
  - `phases: SessionPhaseName[]` — explicit ordered list, drives the dynamic `[N/M]` counter
  - `needsFix: boolean` — gates the post-apply `coherent fix` invocation; for plan-only ops fix is noisy and risks mutating unrelated state
- **`session-shape.json` artifact** — plan ingest writes it after the requests artifact. Single source of truth for the skill body's branching decisions. Codex audit explicitly recommended a separate artifact (rather than overloading `modification-requests.json`) so applier input and orchestrator input stay cleanly separated.

### Changed

- **Both skill bodies (`packages/cli/src/utils/claude-code.ts`)** updated — slash command body (`COMMANDS['coherent-chat.md']`) and installed body (`COHERENT_CHAT_SKILL_BODY`) now share identical conditional flow:
  - Read `session-shape.json` after plan ingest (new "Step 2.5" section).
  - Steps 3–6 (anchor / extract-style / components / page) marked "only if `shape.hasAddPage`".
  - Step 8 (`coherent fix`) marked "only if `shape.needsFix`".
  - Progress reporting uses `shape.phases.length` for the `[N/M]` counter, not hardcoded `/6`.
  - New "Completion signal" section: `✅ Done. Applied: <summary>. Run \`coherent preview\` to see it.` Sourced from session end's `Applied:` block. Failure branch (`❌ Session end failed`) explicitly documented.
- **Anchor phase (`packages/cli/src/phase-engine/phases/anchor.ts`)** — `prep()` now emits `PHASE_SKIP_SENTINEL` when `anchor-input.json` is missing instead of throwing. CLI exits 0; user no longer sees `❌ anchor prep failed` for what is a benign plan-only flow. Mirrors the components phase pattern from M14.
- **Extract-style phase (`packages/cli/src/phase-engine/phases/extract-style.ts`)** — `run()` gracefully no-ops when `anchor.json` is missing instead of throwing. Defense-in-depth alongside the new skill body gate.
- **Components phase (`packages/cli/src/phase-engine/phases/components.ts`)** — `prep()` and `ingest()` tolerate missing `components-input.json` (returns sentinel / no-ops). Same plan-only-flow defense as above.

### For Maintainers

- 19 new tests across `plan.phase.test.ts` (15) and `claude-code.test.ts` (7): SessionShape semantics for empty / plan-only / add-page / hybrid / multi-no-AI / update-navigation / unknown types; plan ingest writes the artifact under custom names + suppression; both skill bodies contain session-shape gating language. Updated 3 existing tests that asserted "throws on missing input" → now "returns sentinel / no-ops". Total: 1527 passing + 9 todo (1536). Up 19 from v0.11.3.
- The codex audit explicitly flagged that this fix does NOT close the deeper architectural question (continue parity-engine pattern vs collapse skill rail to a thin wrapper over `applyModification`). That question is captured in `docs/plans/2026-04-25-skill-rail-architecture-review.md` for `/plan-eng-review` to evaluate independently.

### Codex audit — what this DOESN'T fix

Per codex's CHANGELOG_HONESTY recommendation:

- AI-dependent request types (`update-page`, `modify-layout-block`, `link-shared`, `promote-and-link`) still hard-fail in skill rail. Need new skill phases to bridge.
- Shared-component generation in skill mode is still mostly theatrical — `extract-style` seeds `sharedComponents: []` unconditionally so `components` phase rarely produces real output. Full chat-rail parity is M16+ scope.
- `update-navigation` item-level reorder is still ambiguous (only `nav.type` mutates via `config-delta`).
- Full add-page post-processing (component install, TS fix-loop, pageAnalysis, duplicate audit) still depends on `coherent fix` running afterward.
- `coherent fix` itself can mutate unrelated project state (layout files, globals.css). The `needsFix` gate reduces invocation count but doesn't prevent the mutation surface when fix DOES run.
- 6 architectural drifts from the v0.11.3 codex audit remain open: destructive pre-parser, normalization, validation/autofix coverage, known-routes, manual-edit hash protection, full backup parity.

## [0.11.3] — 2026-04-25

### Skill-rail parity audit + modification applier (kills silent partial-apply class)

v0.11.2 dogfood (`/coherent-chat rename Transactions to Activity`) caught the second instance of a wider class of bug: the planner correctly emitted `[delete-page transactions, add-page activity]` but the skill rail silently dropped delete-page and only the add executed. This is the same shape as v0.11.0's nav.items wipe — skill rail handling a SUBSET of what API rail handles.

A codex `/codex consult` audit (1.4M tokens, 2026-04-25) mapped EVERY ModificationRequest type the API rail handles against the skill rail, producing a 12-row matrix. Result: only `add-page` had real coverage. Nine other types were silently dropped at `phases/plan.ts:152` where `derivePageNames` filtered to add-page and the rest evaporated. v0.11.3 ships a single `createModificationApplier` mirroring API rail's `applyModification` switch + a hard-fail guard on AI-dependent / unknown types.

### Added

- **`createModificationApplier` (`packages/cli/src/phase-engine/appliers.ts`)** — single switch over `request.type`, intentionally mirroring API rail's `applyModification`. Handles five no-AI types end-to-end:
  - `delete-page` — removes from `config.pages`, drops matching `navigation.items` entry, deletes `.tsx` file (mirrors `modification-handler.ts:1111`). Refuses to delete the root `/` page.
  - `delete-component` — removes manifest entry, deletes shared component file (mirrors `modification-handler.ts:1213`).
  - `update-token` — calls `dsm.updateToken(path, value)`, mirrors `modification-handler.ts:468`.
  - `add-component` — calls `cm.register(componentDef)`, mirrors `modification-handler.ts:479`.
  - `modify-component` — calls `cm.update(id, changes)`, mirrors `modification-handler.ts:518`.
- **Hard-fail guard** — when the planner emits a request type the skill rail can't handle (`update-page`, `modify-layout-block`, `link-shared`, `promote-and-link`, `add-layout-block`, or anything unknown), the applier throws BEFORE any other applier writes to disk. The error message lists every unsupported type and points the user at the API rail. This kills the v0.11.2 silent-partial-apply bug class: `[delete X, link-shared Y]` no longer ends with X deleted and Y dropped — it ends with the whole session aborted, the user surfaced a clear "use coherent chat for these" message, and the project untouched.
- **Pre-apply backup for destructive ops** — when any `delete-page` or `delete-component` is in the queue, the applier calls `createBackup(projectRoot)` once at the start. Mirrors API rail's pre-apply backup at `chat.ts:915`. Restored via `coherent undo`.
- **`modification-requests.json` artifact (`packages/cli/src/phase-engine/phases/plan.ts`)** — plan ingest now persists the FULL list of normalized requests, not just the derived `pageNames`. This is the single source of truth `createModificationApplier` reads from, plus future appliers can extend without touching the plan parser.

### Changed

- **`defaultAppliers()` order** — `config-delta → modification → components → pages → replace-welcome → layout → fix-globals-css`. The new modification applier sits at position 2, BEFORE pages. Rationale: deletes happen first so the rename pattern `[delete X, add Y]` ends with only Y, never both. The guard fires before AI-generated pages land on disk so a half-applied session is impossible. `update-token` lands before pages so downstream CSS regen sees the new token values.

### Codex consult — full audit attached

The audit identified **6 OTHER architectural drifts** between rails beyond the request-type-coverage class. Filed for M16:

1. Destructive safety drift — API rail has `messageHasDestructiveIntent` pre-parser + safety guard; skill rail bypasses both.
2. Normalization drift — API runs `applyDefaults`/`normalizeRequest` on every request; skill rail does not.
3. Validation/autofix drift — skill rail's pages applier runs `autoFixCode` only; API also does component install, TS fix-loop, wrapper normalization, layout stripping, pageAnalysis, duplicate audit, quality loops.
4. Known-routes drift — skill autofix sees only the current session's routes; API includes the full config.
5. Manual-edit protection drift — skill `regenerateLayout` runs without stored hashes, can overwrite manually-edited shared files.
6. Backup drift — API creates backups before AND after apply (`chat.ts:915` + `:1430`); skill's session-end has none. v0.11.3 adds the pre-apply hook for destructive ops only — full parity is M16.

### For Maintainers

- 11 new tests in `appliers.test.ts` covering: artifact-absent no-op, add-page-only deferred, delete-page (success / root-guard / target-not-found), delete-component file+manifest removal, rename pattern (the v0.11.2 bug repro), guard rejecting unsupported types BEFORE applying anything, guard surfacing all unsupported types in the error, malformed JSON tolerated, update-token mutates DSM correctly. Total: 1508 passing + 9 todo (1517). Up 11 from v0.11.2.
- Manual cleanup of `~/test-skill` (Transactions page artifact left over from the v0.11.2 dogfood) — removed from `config.pages`, `navigation.items`, and `app/(app)/transactions/`. Project is now in a coherent state ready for chat #4 (delete-page) dogfood test.
- Audit memory — codex pre-implementation gate has now caught real bugs in M14, M15, v0.11.1, and v0.11.3. The pattern is load-bearing for cross-rail refactors. See `~/.claude/projects/-Users-sergeipro-coherent-design-method/memory/feedback_codex_pre_implementation.md`.

## [0.11.2] — 2026-04-25

### Update-notifier ordering fix + opt-outs

The pre-v0.11.2 update-check fired AFTER `program.parse()`, which meant the "newer version available" banner printed mid-command — interleaved with a chat spinner, generation status, or AI streaming output. Functional but visually disruptive. v0.11.2 splits the check into two phases: synchronous cache read BEFORE `program.parse()` (banner lands above command output) + fire-and-forget background refresh that writes the cache for next time. The current command never blocks on a network call.

This is also the first release where users on v0.11.0 (with the multi-turn nav.items P1 fixed in v0.11.1) get an actionable in-CLI signal that an upgrade exists.

### Added

- **`maybePrintUpdateBanner` (`packages/cli/src/utils/update-notifier.ts`)** — synchronous cache read + banner print. No network. Called BEFORE `program.parse()`. Returns `false` (no banner) when the cache is missing, the cached version isn't newer, or the user opted out.
- **`refreshUpdateCacheAsync`** — fire-and-forget npm registry fetch when the 24h cache is stale. Writes to `~/.coherent/update-check.json` for next invocation. Never awaits, never blocks the current command.
- **`shouldSkipUpdateCheck`** — central skip logic. Skips on `_phase` (skill-rail stdout contract), `--version` / `-V`, `--help` / `-h`, `COHERENT_NO_UPDATE_CHECK=1` env, and `--no-update-check` flag.
- **`--no-update-check` global flag** — registered at the program level so it's accepted on every subcommand. Per-invocation opt-out; for permanent suppression use the env var.
- **`isNewer` (exported)** — semver-ish comparison restricted to plain numeric `MAJOR.MINOR.PATCH`. Prerelease tags / suffixes return `false` to avoid bogus downgrade prompts on RC builds.

### Changed

- **`checkForUpdates` (legacy entry point)** — now a thin wrapper that calls `maybePrintUpdateBanner` + `refreshUpdateCacheAsync`. Backward-compatible for any external import that referenced it.
- **`packages/cli/src/index.ts`** — banner check moved BEFORE `program.parse()` so the notice prints first. Refresh fires in parallel.

### For Maintainers

- 20 new tests in `update-notifier.test.ts` covering: `isNewer` positive/negative/prerelease cases, `shouldSkipUpdateCheck` argv + env detection, banner cache-read scenarios (no cache, current, newer, dismissed, malformed JSON), and the env opt-out path. Total: 1497 passing + 9 todo (1506). Up 20 from v0.11.1.
- Disk cache shape: `{ latest: string, checkedAt: number, dismissedFor?: string }`. The `dismissedFor` field is reserved for a future "stop telling me about this version" UX (currently always undefined).
- Smoke verified: synthetic cache claiming v99.0.0 → banner printed correctly on `coherent status`; `--no-update-check` and `COHERENT_NO_UPDATE_CHECK=1` both suppressed it; `--help` skipped it without manual flag.

## [0.11.1] — 2026-04-25

### Multi-turn skill-rail nav.items hotfix

v0.11.0 dogfood multi-turn caught a P1 regression in less than an hour. When a user ran a second `/coherent-chat` request on a sidebar-nav project, the skill rail's pages applier read sidebar routes from the current session's page artifacts only — not from the registered `config.pages`. Result: chat #1's sidebar entries (Dashboard, Transactions, Settings, Profile) vanished after chat #2, leaving only the new route plus the init-seeded Home. Pages on disk were intact; only `navigation.items` lost the prior chats' entries. Codex `/codex consult` pinpointed the line: `appliers.ts:250` was filtering `pagesQueue` instead of `finalConfig.pages`.

### Fixed

- **`createPagesApplier` sources sidebar routes from `finalConfig.pages` (`packages/cli/src/phase-engine/appliers.ts:250`).** Filter is now `requiresAuth` (the existing on-disk proxy for "app page": app pages get `requiresAuth: true`, marketing/auth/init-Home get `false`). `buildSidebarNavItems` is append-only + idempotent, so multi-turn chats now correctly accumulate sidebar entries across sessions, and re-running on a fully populated project is a no-op.

### Added

- **`coherent update` Step 9 — sidebar nav.items backfill (`packages/cli/src/commands/update.ts`).** Existing v0.11.0 projects whose nav.items were dropped now self-heal on `coherent update`. Walks every `config.pages` entry tagged `requiresAuth`, runs through `buildSidebarNavItems`, append-only and idempotent. Report line: `✔ Recovered N dropped sidebar nav entries (v0.11.1 backfill)`. Gated on `navigation.type ∈ {sidebar, both}`.

### For Maintainers

- Three new regression tests in `appliers.test.ts`: (1) multi-turn — chat #2 preserves chat #1 sidebar items, (2) idempotency on a fully-populated project, (3) self-heals dropped chat-#1 items on next chat. All would have caught v0.11.0's bug pre-ship. Tests: 1477 passing + 9 todo (1486). Up 3 from v0.11.0.
- Codex `/codex consult` pre-fix diagnosis attached: 443k tokens, ran git diff `v0.10.0..v0.11.0` to confirm `PageGenerator.ts` was unchanged across the bump (the bug was always at the applier level, not the generator). Same pattern as M14 + M15 cycles — codex caught a P1 fast.
- Verified end-to-end against the user's actual broken project (`~/test-skill`): `coherent update` reported `Recovered 4 dropped sidebar nav entries (v0.11.1 backfill)` and rebuilt the sidebar with all 6 expected routes.

## [0.11.0] — 2026-04-25

### Welcome-scaffold replacement + skill-rail layout parity (M15)

v0.10.0 dogfood surfaced a real-world break: when the user's first chat plan does not include a `/` route, the init-scaffolded `app/page.tsx` (the marketing-toggle "Describe an app" landing page) survives. The user asked for a dashboard app — but `/` still served the welcome page, and in skill rail the Header/Footer of that scaffold rendered on top of the generated dashboard / settings / transactions pages too. M15 ships a shared replacement helper plus two new appliers so both rails retire the scaffold and redraw layouts the same way.

Also addresses a long-standing skill-rail gap: `navigation.items` was never populated from generated routes, so `<SidebarContent />` rendered empty for sidebar-nav projects. And cleans up `coherent.components.json` so Coherent's own platform widgets (DSButton, AppSidebar) no longer show up in the user's design-system viewer alongside their actual components.

### Added

- **`WELCOME_MARKER` first-line marker (`packages/cli/src/utils/welcome-content.ts`).** Init-scaffolded `app/page.tsx` now starts with `/* @coherent-welcome: v1 */` so detection is exact. Backward-compat substring signatures (`Describe an app.`, `useState<Mode>`, etc.) remain for v0.9–v0.10 backfill.
- **`replaceWelcomeWithPrimary` helper (`packages/cli/src/utils/welcome-replacement.ts`).** Pure utility shared by both rails. `pickPrimaryRoute` is fed the *generated* pages — never `dsm.config.pages` — so it cannot be short-circuited by the init-seeded `/` Home (codex `/codex consult` P1 #1). `isWelcomeScaffold` is fail-closed: marker OR signature match required, so user-edited home pages are never trampled.
- **`createReplaceWelcomeApplier` (`packages/cli/src/phase-engine/appliers.ts`).** Reads generated `page-<id>.json` artifacts from the session, picks the primary route, replaces the on-disk scaffold with a `redirect()`, flips `settings.homePagePlaceholder` to `false`. Runs AFTER pages applier, BEFORE layout applier — so when sidebar-nav's route-group movement copies `app/page.tsx` → `app/(public)/page.tsx`, it carries the redirect, not the scaffold (codex P1 #2).
- **`createLayoutApplier` (`packages/cli/src/phase-engine/appliers.ts`).** Skill rail now redraws Header / Footer / Sidebar / route-group layouts to match the post-applier `navigation` shape. Pre-M15 skill rail skipped this entirely; the welcome scaffold's Header/Footer survived first chat. `navChanged` is computed from `config-snapshot.json` plus the homePagePlaceholder-was-true override so first chats always regenerate.
- **`buildSidebarNavItems` helper (`packages/cli/src/utils/nav-items.ts`).** Extracted from API rail's `commands/chat/split-generator.ts:580` so the skill rail's pages applier shares the same labelize + append logic. Append-only — preserves user-renamed labels and manual entries. Dynamic routes (`[id]`, `[...slug]`) and auth/marketing pages are filtered (sidebar lives behind app-shell layouts only).
- **`isPlatformInternalEntry` helper (`packages/cli/src/utils/component-integrity.ts`).** Flags Coherent's platform widgets (DSButton, AppSidebar) in the shared-components manifest. Used by the manifest scanner and `coherent update` backfill.
- **`coherent update` Steps 7 + 8: lazy backfill for v0.9–v0.10 projects.** Step 7 detects + replaces a leftover welcome scaffold in projects whose first chat predates M15 — only fires when `homePagePlaceholder === true` AND on-disk file passes `isWelcomeScaffold` AND `pickPrimaryRoute(config.pages.filter(p => p.route !== '/'))` returns a route. Step 8 scrubs auto-registered platform widgets from the manifest (only entries with `source: 'extracted'` — user-curated DSButton entries are left alone).

### Changed

- **`defaultAppliers()` order: config-delta → components → pages → replace-welcome → layout → fix-globals-css.** `replace-welcome` runs AFTER pages so it can read generated routes from session artifacts; BEFORE layout so the redirect (not the scaffold) is what sidebar-nav's route-group movement carries.
- **`createPagesApplier` populates sidebar `navigation.items` after page registration.** Gated on `navigation.type ∈ {sidebar, both}`. App pages only — auth and marketing pages have their own layout chrome.
- **API rail `chat.ts` welcome-replacement block (was the inline `homePagePlaceholder` flip at chat.ts:984).** Replaced with a call into the shared helper, mirroring the skill-rail applier exactly. Two paths now retire the placeholder: (A) user generated `/` with pageCode (pre-M15 behavior); (B) generated only non-`/` pages, scaffold replaced with redirect.
- **`findUnregisteredComponents` (`packages/cli/src/utils/component-integrity.ts`).** Filters `PLATFORM_INTERNAL_FILES` and `PLATFORM_INTERNAL_NAMES` (currently `ds-button.tsx` + `DSButton`) so step-6c of `coherent fix` never auto-registers platform widgets in the user's manifest. Keeps the `/design-system` viewer focused on the user's actual components.

### For Maintainers

- New tests: `welcome-replacement.test.ts` (18), `nav-items.test.ts` (12), `component-integrity.test.ts` extensions (5), `appliers.test.ts` extensions (8). Total: 1474 passing + 9 todo (1483). Up 19 from v0.10.0. TypeScript clean. Prettier clean. Build green.
- Codex `/codex consult` was run on the M15 plan BEFORE implementation (same gate that caught a P1 in the M14 cycle). Two P1 findings landed in the code as written: (1) `pickPrimaryRoute` filters the init-seed `/` Home; (2) explicit regression test for sidebar `app/page.tsx` ↔ `app/(public)/page.tsx` movement. Two P2 findings deferred per codex recommendation: layer-leak between phase-engine and command layer (existing — not new), welcome scaffold strings frozen for v0.11 rollout window.

## [0.10.0] — 2026-04-25

### Skill-mode rail — token cost + UX optimization (M14)

v0.9.0 dogfood baseline: 4-page generation took 7m42s with 17+ visible Bash calls and a 106-line `page-settings-response.md` rewrite when the AI double-escaped `\\n` inside a JSON-string `pageCode`. M14 ships four targeted fixes validated against `/codex` consult and `/ultraplan`.

**Bumps `PHASE_ENGINE_PROTOCOL` 1 → 2.** Existing projects need `coherent update` to refresh `.claude/skills/coherent-chat/SKILL.md` so the skill markdown matches the CLI's protocol. Mismatch surfaces as `[COHERENT_E004]` on first `_phase ingest`. Legacy JSON-with-pageCode still ingests via fallback for one release; will be removed in v0.11.

### Added

- **Fenced ```tsx response schema for anchor + page phases (`packages/cli/src/phase-engine/phases/anchor.ts`, `packages/cli/src/phase-engine/phases/page.ts`).** Anchor and page responses are now JSON header + ```tsx fenced block. The TSX is read verbatim — no JSON escaping. This kills the failure class observed in v0.9.0 dogfood where Claude wrote `\\\\n` (double-backslash) instead of `\\n` (single-backslash) inside a 106-line `pageCode` string and broke `JSON.parse` on the entire response. The fenced parser anchors on a closing ` ``` ` line at end of input, so embedded backticks inside template literals or JSX are fine.
- **`PHASE_SKIP_SENTINEL` (`packages/cli/src/phase-engine/phase.ts`).** When an `AiPhase`'s `prep()` has no AI work to do, it can write its output artifact deterministically and return `__COHERENT_PHASE_SKIPPED__` on stdout. The skill orchestrator detects the sentinel and skips the Write+ingest pair entirely. Currently fires on the components phase when `sharedComponents.length === 0` (the typical "no shared components needed" case). Saves 3 visible tool calls per skill run.
- **Parallel page batching in skill body (`packages/cli/src/utils/claude-code.ts`).** `SKILL_COHERENT_CHAT` and `coherent-chat.md` now tell Claude to fire N parallel Bash tool calls per phase batch instead of strictly sequential. 12 turns (4 pages × 3 steps) → 3 batches. CLI is already idempotent per-id, so this is a doc-only change with no logic impact.
- **Progress lines in skill body.** Mini-section telling Claude to print `▸ [N/6] …` before each phase, replacing the v0.9.0 "Plan ingested. Anchor prep." machine-speak with concrete user-readable progress.
- **`docs/wiki/IDEAS_BACKLOG.md` M14 entry retained as historical record.** Source of truth for what shipped in 0.10.0.

### Changed

- **Components phase `prep()` writes artifacts in the empty-shared-components fast path (`packages/cli/src/phase-engine/phases/components.ts`).** When the plan declared zero shared components, `prep()` now writes empty `components-generated.json` AND seeds `pages-input.json` directly, then returns `PHASE_SKIP_SENTINEL`. `ingest()` tolerates the sentinel as input for back-compat with v0.9.0 skill markdown that doesn't yet detect it.
- **Anchor phase `prep()` appends fenced ```tsx output-format override (`packages/cli/src/phase-engine/phases/anchor.ts`).** Same trick page builder uses — JSON header + ```tsx body. Ingest uses `parseAnchorOrPageResponse` (also exported and reused by `phases/page.ts`) which tries fenced first, falls back to legacy JSON-with-pageCode.
- **Page builder appends fenced ```tsx output-format override (`packages/cli/src/phase-engine/prompt-builders/page.ts`).** Same pattern as anchor. Override appears AFTER the `buildModificationPrompt` wrapper so it supersedes the wrapper's pageCode-as-JSON-string instructions.
- **Skill markdown response-format section unified (`packages/cli/src/utils/claude-code.ts`).** v0.9.0's "JSON escape rules" section is replaced by "Response format per phase" with explicit rules: plan and components stay JSON-only; anchor and page use JSON header + fenced ```tsx body.

### Fixed

- **`parseAnchorOrPageResponse` swallows `parsePlanResponse` syntax errors (`packages/cli/src/phase-engine/phases/anchor.ts`).** Garbage input no longer bubbles `SyntaxError` up to the runner — falls through to `null` so the runner can re-prompt.

### For Maintainers

- New tests: `page.phase.test.ts` "M14 fenced ```tsx response schema" describe block — 5 tests covering header + fence stitching, embedded backticks, legacy fallback, malformed-fence fallback, and null on garbage. `components.phase.test.ts` "M14 PHASE_SKIP_SENTINEL fast path" describe block — 3 tests covering sentinel emission, ingest tolerance, and full-prep no-sentinel.
- Tests: 1431 passing + 9 todo (1440 total). Up 8 from v0.9.0. TypeScript clean. Prettier clean.
- Codex review on the v0.9.0 baseline (recorded in M14 IDEAS_BACKLOG entry) flagged "drop the `> *-prompt.md` redirect" as token-saving but risky — Bash stdout truncates large outputs and anchor prompts run 1245+ lines after the buildModificationPrompt wrap. NOT in this milestone; file-based artifacts stay.

## [0.9.0] — 2026-04-24

### Skill-mode parity — phase engine, shared lifecycle, error codes

Coherent now ships two rails that enter and exit through the same code: the classic `coherent chat` CLI path and the new Claude Code skill (`/coherent-chat`). Both acquire the same persistent lock, drive the same phase sequence, write the same session artifacts, and emit the same run record. This is the foundation the canonical v0.9.0 design doc calls "parity by code-share, not by duplication."

**Why this matters:** before v0.9.0, skill users paying a Claude Code subscription ran a parallel implementation of Coherent's generation pipeline — any drift between the two rails would show up as silent behavioral divergence ("chat produced X but skill produced Y"). v0.9.0 collapses both rails onto one shared phase engine so a new phase, prompt fix, or applier lands for both paths simultaneously.

**What's not in this release:** the Tier 1 parity harness exists (`packages/cli/src/phase-engine/__tests__/parity.test.ts`) with infrastructure ready but fixtures unrecorded — 9 `test.todo` placeholders remain. Full byte-identical verification against canonical intents ships in a follow-up once the fixtures are recorded against live Anthropic responses. Until then, parity is a shared-lifecycle claim, not a byte-for-byte proof.

### Added

- **Phase engine (`packages/cli/src/phase-engine/`)** — the shared generation pipeline. Contract in `phase.ts` (AiPhase / DeterministicPhase), registry in `phase-registry.ts`, orchestrator in `run-pipeline.ts` with hook contract for spinner / heartbeat / retry UX. Six phases ship: `plan` (architecture), `extract-style` (consistency contract), `components` (shared-component generation), `page` (per-page generation with manifest filter), `anchor` (shared-component anchor consolidation), `log-run` (run record composition). Each phase reads its inputs from the session dir and writes its outputs back — strictly disk-backed so skill-rail multi-process invocations can pick up where the previous `_phase` left off.
- **Session lifecycle (`phase-engine/session-lifecycle.ts`)** — `sessionStart` acquires the persistent project lock, creates a session dir under `.coherent/session/<uuid>/`, snapshots `design-system.config.ts` + file hashes + intent + options + plan-input. `sessionEnd` runs pluggable appliers, writes the run record (or skips on dry-run via `skipRunRecord`), releases the lock, and deletes the session dir. Outer `try/finally` guarantees lock release on every exit path including applier throws (closes codex R3 P1 #8).
- **Pluggable appliers (`phase-engine/appliers.ts`)** — `createConfigDeltaApplier` / `createComponentsApplier` / `createPagesApplier` / `createFixGlobalsCssApplier`. Each reads its own session artifact, mutates project state, returns a human-readable change list. `defaultAppliers()` composes the skill-rail default set; the chat rail passes explicit appliers so both rails run equivalent post-AI stacks. Pages and components both run `autoFixCode` (codex R2 P2 + R3 P2 #9).
- **Skill rail entry point (`/coherent-chat`)** — Claude Code slash command that drives `coherent session start` → `coherent _phase <name> prep/ingest` per phase → `coherent session end`. Markdown orchestrator lives in `skills/coherent-chat.md`; hidden `_phase` subcommand in `packages/cli/src/commands/_phase.ts`.
- **Protocol guard (`_phase --protocol <major>`)** — every `_phase` invocation carries a protocol version that must match `PHASE_ENGINE_PROTOCOL`. Mismatch throws `[COHERENT_E004]` with a refresh instruction so a stale skill markdown can't silently speak to a new CLI (or vice versa).
- **`coherent auth set-key` / `unset-key`** — top-level auth command. Writes `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` to the project's `.env`. Lane A output so skill users without shell env vars can authenticate through a first-class CLI path.
- **Editor + mode auto-detection in `coherent init`** — detects Claude Code, Cursor, VS Code, and others; picks skill mode vs subscription mode before the API-key prompt. Codex R2 P1 #4 + #5.
- **CoherentError base class + registry (E001-E006)** — stable error codes for user-facing failures. Every error carries `code` / `message` / `fix` / `cause` / `docsUrl`. Registry in `packages/cli/src/errors/codes.ts`, reference page in `docs/error-codes.md`. Allocated slots:
  - `E001_NO_API_KEY` — `coherent chat` has no API credentials.
  - `E002_SESSION_LOCKED` — `coherent session start` hit an active lock.
  - `E003_PHASE_INGEST_MALFORMED` — `_phase <name> ingest` got empty / unparseable stdin.
  - `E004_PROTOCOL_MISMATCH` — `_phase --protocol` version mismatch.
  - `E005_SESSION_SCHEMA_MISMATCH` — `session.json.schemaVersion` incompatible with the current CLI build.
  - `E006_SESSION_ARTIFACT_MISSING` — skill auto-resume expected an artifact that isn't there.
- **ADR 0005 — chat.ts as facade over runPipeline** (`docs/wiki/ADR/0005-chat-ts-as-facade-over-runpipeline.md`) — the migration blueprint. Locks the final shape (`sessionStart` → `runPipeline` → `sessionEnd`) as the integration point both rails converge on.
- **Skill-mode dogfood runbook** (`docs/runbooks/skill-mode-dogfood.md`) — step-by-step walkthrough for re-running the skill path end-to-end on a clean project.

### Changed

- **`coherent init` output redesigned for modern CLI aesthetic** — Vite/Bun/Astro-style compact layout. One hero banner (`🎨 Coherent v0.9.0`) at the top instead of a narrative opener. A `✓`-checklist of what landed (`Next.js scaffolded`, `Design system configured`, `Shared components`, `Design System viewer`, `AI context`) replaces the previous 40-line "What was created / What is Coherent / How it works / Questions or issues" block. A `Ready in 32s` timing line and a single bold `Next:` command replaces the multi-step "Get Started" list. The marketing content moves to README where users who want it can find it.
- **Removed the interactive "Auto-create linked pages?" prompt from `coherent init`** — the prompt set `settings.autoScaffold`, a chat-rail-only feature that lets `coherent chat "add login"` auto-expand to "add login + sign-up + forgot-password" via a hardcoded `AUTH_FLOW_PATTERNS` map. Asking a first-run user about a chat-only setting they may never use (skill-mode users never see it), while also triggering hidden follow-up AI calls ($) if they pick Yes, was confusing UX. Setting default remains `autoScaffold: false`. Users who want the behavior flip it in `design-system.config.ts`; the feature code in `chat.ts` is unchanged.
- **`coherent chat` enters via the shared lifecycle frame** — `sessionStart` replaces the inline `acquirePersistentLock` call at the top of the `chatCommand` try; `sessionEnd` replaces the finally's `writeRunRecordRel` + `releasePersistentLock` pair. The rich chat run record is seeded into the session dir as `run-record.json` before `sessionEnd`, so `sessionEnd` writes it to `.coherent/runs/<timestamp>.yaml` via the same path the skill rail uses. No observable behavior change on success; on error the session dir is preserved for post-mortem (matching skill-rail semantics). `--dry-run` skips the run-record write via the new `skipRunRecord` flag.
- **Chat-rail persistent lock parity** — `acquireProjectLock` (closure-release, chat-only) → `acquirePersistentLock` / `releasePersistentLock` (shared with skill rail). Same `.coherent.lock` file, same API. Closes a latent SIGINT TDZ edge case that could fire early on Ctrl+C.
- **Post-generation globals.css resync runs as an applier** — previously inline in `chat.ts`, now `createFixGlobalsCssApplier()` passed to `sessionEnd`. Idempotent; re-derives CSS tokens from current config state.
- **README reframed around skill mode as the default path** — mode selection is auto-detected; subscription path is surfaced equally but not gated.
- **Skill renamed: `/coherent-generate` → `/coherent-chat`** — mirrors the CLI (`coherent chat`) 1:1. The legacy `/coherent-project` conventions skill is retired; its rules were redundant with the constraint bundle already injected into every phase prompt by the phase engine. Run `coherent update` to refresh `.claude/` — it deletes stale `skills/coherent-project/`, `skills/coherent-generate/`, and `commands/coherent-generate.md`, then writes `skills/coherent-chat/SKILL.md` + `commands/coherent-chat.md`.

### Fixed

- **Scaffolded projects no longer 500 on first `coherent preview`** — `toSharedFileName` kebab-casing was broken for acronym-led component names. `DSButton` kebab-cased to `dsbutton` instead of `ds-button`, so the scaffolder wrote `components/shared/dsbutton.tsx` while the layout integrator imported `@/components/shared/ds-button`. Every fresh project threw `Module not found` on first render. Pre-existing bug since v0.7.12 (when DSButton was introduced) — caught during v0.9.0 dogfood. Fix: standard camel-case-to-kebab algorithm that splits consecutive-uppercase runs (`DS` + `Button` → `DS-Button` → `ds-button`). 6 regression tests added.
- **Next.js pinned to 15.5.15, not 15.2.4** — the scaffolder command was using `create-next-app@15.2.4`, which pulled `next@15.2.4` containing CVE-2025-66478 (critical severity). Every fresh `coherent init` printed `npm warn deprecated next@15.2.4: This version has a security vulnerability` and `1 critical severity vulnerability`. Bumped to 15.5.15 (patched release in the same minor line).
- **`coherent init` output is no longer buried in npm noise** — `runCreateNextApp` now runs create-next-app with `npm_config_fund=false`, `npm_config_audit=false`, `npm_config_update_notifier=false`, `npm_config_loglevel=error` so the user no longer sees "137 packages are looking for funding" / "1 critical severity vulnerability, run `npm audit fix --force`" / the update-notifier banner on every init. create-next-app's own output is preserved; only the npm-layer advertisement noise is silenced.
- **Persistent lock no longer self-destructs on ESRCH** (codex P1 #3). The stale-lock sweep used to delete `.coherent.lock` whenever the owning PID no longer existed, which meant any second process checking during an interrupted session could sweep away the first process's lock mid-run. Now we only sweep when the lock is both PID-stale AND older than the 60-minute wall-clock threshold.
- **Session-end always releases the lock** (codex R3 P1 #8). Applier throws used to leave `.coherent.lock` on disk indefinitely, wedging the project for every subsequent `coherent session start`. Outer `try/finally` guarantees release.
- **Skill-rail appliers run autoFixCode on pages + components** (codex R2 P2 + R3 P2 #9). Without this pass, skill-generated pages could ship with missing `"use client"`, invalid lucide-react icon renders, HTML entities in JSX, or raw Tailwind colors. Same `autoFixCode` function the chat rail uses via `modification-handler`.
- **Session-end composes the run record when a phase didn't seed one** (codex R2 P1 #6). Skill rail previously produced an empty `.coherent/runs/` entry; now `composeRunRecord` assembles the record from session artifacts.
- **Phase chaining writes the right input artifact for each consumer** (codex P1 #1, parts 1-4) — `plan` seeds `anchor-input.json`, `anchor` writes `components-input.json` via `extract-style`, `components` writes `pages-input.json`. Prevents `"missing required artifact"` errors mid-pipeline.
- **`coherent init` detects editors before writing harness files** (codex P2). Previously the editor detector ran after the harness write, which meant an IDE-specific layout was never applied on fresh init.
- **Slash command drives the phase-engine rail** (codex R3 P1 #7). `/coherent-chat` no longer routes to the old inline path.
- **`warnIfVolatile` writes to stderr, not stdout** (`packages/cli/src/utils/find-config.ts`). The tmp-directory warning used `console.log`, which poisoned `coherent session start`'s stdout with multi-line text. `UUID=$(coherent session start ...)` in the skill orchestrator captured the warning banner as the UUID on any /tmp-hosted project, and every subsequent `_phase --session "$UUID"` died with "Session not found." Caught during hands-on smoke testing before release.
- **`coherent chat` outer catch no longer leaks the persistent lock** (`packages/cli/src/commands/chat.ts`). The catch ended with `process.exit(1)`, which terminated the Node event loop synchronously and abandoned the finally's `await store.writeArtifact` + `await sessionEnd`. Every chat error left `.coherent.lock` on disk for the full 60-minute stale-sweep window. Fix: `process.exitCode = 1` + let finally drain. The four narrower `process.exit(1)` sites inside the chat try block (lines 246 / 595 / 618 / 673) share the same root cause and are tracked for v0.9.1 — the outer-catch fix covers the hot path where every uncaught error lands.
- **Skill orchestrator stores prep / response files in the session dir** (`packages/cli/src/utils/claude-code.ts`). Earlier the `/coherent-chat` skill markdown piped prompts/responses through fixed paths like `/tmp/plan-prompt.md` (later `/tmp/coherent-$UUID-<phase>-<direction>.md`). Two concurrent runs would cross-contaminate, AND `/tmp` files were never cleaned up because `Bash(coherent *)` permission can't `rm`. Fix: `.coherent/session/<UUID>/<phase>-<direction>.md`. The session dir is owned by the session lifecycle — `coherent session end` deletes it, so prep/response artifacts vanish with the session instead of accumulating across runs.
- **`defaultAppliers()` now includes `createFixGlobalsCssApplier`** (`packages/cli/src/phase-engine/appliers.ts`). Skill-rail sessions previously never resynced `app/globals.css` against the applied config-delta. Latent today (delta only carries `name` and `navigationType`), but a landmine the moment a future delta carries token changes. Fix: append the globals-css applier to the default list so both rails produce equivalent CSS on disk.
- **`exitNotCoherent()` writes to stderr, not stdout** (`packages/cli/src/utils/find-config.ts`). Same bug class as `warnIfVolatile`: three `console.log` calls in the "not a Coherent project" exit path wrote human-readable help text to stdout, poisoning machine-contract subcommands (`session start`, `_phase prep`) when invoked outside a Coherent project. Fix: flip all three to `console.error`.

### For Maintainers

- **Parity harness infrastructure shipped; fixtures pending.** `packages/cli/src/phase-engine/__tests__/parity-harness.ts` has `snapshotTree` / `normalizeTree` / `diffTrees` / `mkScratchRoot` wired. `runRailA` and `runRailB` drivers are stubs awaiting fixture recording against live Anthropic. Recording protocol in `packages/cli/src/phase-engine/__tests__/fixtures/parity/README.md`.
- **chat.ts facade refactor is partial.** ADR 0005 locks the full migration blueprint; v0.9.0 ships the session-lifecycle bootstrap and one applier (`fix-globals-css` post-gen). Remaining migrations (`createBackup` pre/post, `autoScaffold`, `manifest-auto-sync`) land incrementally across v0.9.x. chat.ts is ~1560 lines today; target per ADR 0005 is ~100-150. Not a release blocker — each migration stands alone, each lands commit-by-commit with the full test suite green.
- **Tests: 1415 passing + 9 `test.todo` (1424 total).** All `.todo` are parity-fixture placeholders. TypeScript clean. Prettier clean.

## [0.8.3] — 2026-04-23

### Codex health audit — five findings closed + v0.8.2 follow-ups shipped

Fresh-context codex review of the repo surfaced five concrete issues (1 false positive, 4 real). This release lands fixes plus the v0.8.2 follow-up work that was still in flight: validator-outcome telemetry in run records, user accept/reject signals, and integration-test coverage for the v0.8.x surfaces.

**Why this matters:** v0.8.2 made memory inspectable; v0.8.3 makes the *telemetry* inside that memory actually useful, and closes drift between what the docs promise and what the code does. Skill-mode users (subscription path) now see the same context-engineering layers that `coherent chat` uses.

### Added

- **`--mark-kept` / `--mark-rejected` flags on `coherent chat`** — retroactively transitions the latest `.coherent/runs/<timestamp>.yaml` from `outcome: success` (pending verdict) to `outcome: kept` / `rejected`. Enables "did memory help?" analysis over time. Skips generation when passed. Idempotent.
- **Validator outcomes in run records** — every `coherent chat` now runs `validatePageQuality` on each written page post-generation and records per-page findings (type + severity + count) under `validators:` in the YAML, plus an aggregate `validatorSummary:` block. Inline in run record, no separate file. Answers "which rules actually fired on this run?" for every invocation.
- **Project-context injection in `coherent prompt`** (codex #4 — prompt parity with `coherent chat`). When run inside a Coherent project, the emitted bundle now also includes: design memory from `.coherent/wiki/decisions.md`, shared-components registry summary from `coherent.components.json`, existing-routes note, and the context-free alignment rule. Stateless behavior preserved outside a project (skill mode, portable use).
- **`mergeAtmosphere` exported pure function** — extracted from `splitGeneratePages` so the `--atmosphere <preset>` override branch and the deterministic/AI merge branch are directly unit-testable. 4 new tests. Behavior identical.
- **New test files:** `packages/cli/src/commands/memory.test.ts` (10 tests — decisions.md, shared components from `coherent.components.json`, runs/, diff), project-context injection suite in `prompt.test.ts` (+6 tests). Total suite: 1111 → 1146 passing.

### Changed

- **`coherent memory show` reads `coherent.components.json` (not `design-system.config.ts`)** — codex #2. Previously `memory.ts:50` loaded `config.components` via `loadConfig()` and cast to a `usedBy` field that doesn't exist in the schema, producing unreliable usage counts. Now reads `coherent.components.json` via `loadManifest()` (the authoritative manifest per docs) and displays the real `usedIn` array length. Column labels updated: `category` → `type`, matching `SharedComponentEntry`.
- **Phase 6 partial-success visibility** — codex #3. Per-page generation failures are now logged inline (`⚠ "<name>" (<route>) generation failed: <reason>`) instead of silently returning an empty add-page stub. Retry failures are also surfaced. When some-but-not-all pages have full code, the Phase 6 spinner uses `.warn` with explicit empty count (`… 7 with full code, 3 empty / template fallback`) instead of `.succeed`. No more silent degradation to success.
- **Design constraint on hardcoded dates** — codex #5. `design-constraints.ts:51` previously banned literal years `2023/2024/2025`, which went stale on the rolling calendar. Rewritten as a principle-based rule: "never hardcode a year more than one year in the past" plus a nudge to compute via `new Date()` or relative formatting. Self-updating, no rot.

### Fixed

- **False positive on codex #1** (stale manifest in Phase 6) — investigated and closed without code changes. Traced: `generateSharedComponentsFromPlan` awaits `saveManifest` sequentially; Phase 5 block awaits that completion; `currentManifest = await loadManifest()` at `split-generator.ts:964` reads post-Phase-5 disk state; Phase 6 only mutates `usedIn` per-entry via `updateManifestSafe` (never `shared` array). Added a clarifying comment at the load site so the invariant is explicit for future readers.

### Dogfooded

- **`/coherent-generate` end-to-end verified on real Claude Code subscription session.** Generated a 361-line CRM dashboard in 3:24, with `coherent check` going 2 errors/4 warnings → 0 errors/0 warnings via the auto-fix loop. Validator caught an inline `Intl.NumberFormat({style:'currency'})` used to format percentages and refactored into a dedicated `percent()` helper — floor-raising moat confirmed in the wild.
- **Known gap (tracked as R6 in IDEAS_BACKLOG):** skill-mode path (`coherent prompt` + Claude Code writes files) bypasses `.coherent/runs/*.yaml` — subscription users get zero run-record telemetry. Options: append in `coherent prompt`, add `coherent log-run` subcommand for skills, or leave stateless by design.

### Infrastructure

- **PR #31 (F9 deterministic StatsChart) closed as superseded** — PJ-002 mitigations across v0.7.17–v0.8.2 (rules + cosmetic autofix + skeleton fallback) cover the placeholder bug in practice. Deterministic-before-LLM pattern (ADR-0004 + `deterministic-templates.ts`) preserved on `feat/f9-deterministic-statschart` for future revival if a new class of vetted shapes emerges.

## [0.8.2] — 2026-04-23

### Generation outcome records + auditable memory (codex recommendations)

v0.8.1 docs reorg surfaced two unmet product needs from the codex review. This release lands both.

**Why this matters:** memory that influences generation output must be inspectable, and "did memory help?" must be answerable with data. Until now both were black-box. After this release: every `coherent chat` invocation leaves a YAML trace, and `coherent memory show` prints the full per-project state in one command.

### Added

- **`.coherent/runs/<timestamp>.yaml`** — per-invocation run record, written automatically after every `coherent chat` (skipped on `--dry-run`). Captures:
  - timestamp, Coherent version
  - intent (user's message), options (atmosphere, atmosphereOverride, page/component/newComponent, dryRun)
  - final atmosphere tuple (after merge / preset override)
  - pages written + shared components written (TSX paths)
  - durationMs, outcome (`success` / `error`), error message on failure
  - Consistent convention with `.coherent/fix-sessions/*.yaml` from v0.7.18.
- **`coherent memory show`** — one-command view of per-project memory:
  - `.coherent/wiki/decisions.md` (design decisions log)
  - `coherent.components.json` (shared components registry with id/name/category/usage count)
  - Last 5 run records (outcome badge, intent, atmosphere background, duration)
- **`coherent memory diff [ref]`** — `git diff` of `decisions.md` vs ref (default `HEAD`). Shows exactly how memory changed between the last commit and working tree. Requires git repo; errors helpfully otherwise.
- **`packages/cli/src/utils/run-record.ts`** — new module: `RunRecord` interface, `renderRunRecordYaml`, `writeRunRecord`, `writeRunRecordRel`. 13 unit tests covering YAML escaping, atmosphere block, empty/populated lists, error outcome formatting, timestamp-to-filename mapping.
- **`packages/cli/src/commands/memory.ts`** — new module: `memoryShowCommand`, `memoryDiffCommand`. Wired into CLI under `coherent memory show|diff`.

### Changed

- **`packages/cli/src/commands/chat.ts`** — instrumented to populate `runRecord` at key points:
  - Run start (timestamp, CLI_VERSION, intent, options) before entering `try`.
  - Plan-resolved atmosphere captured from `splitResult.plan.atmosphere` after `splitGeneratePages`.
  - Files written captured after `regenerateFiles` (heuristic: paths matching `app/*/page.tsx` → `pagesWritten`, paths under `components/shared/` → `sharedComponentsWritten`).
  - Outcome set to `error` in catch block; `durationMs` set in finally.
  - Record written in finally via `writeRunRecordRel`, with a `📝 Run journaled → <path>` hint on success.
- **`packages/cli/src/index.ts`** — new `memory` command group.
- **QUICK_REFERENCE.md** — two new rows (`coherent memory show`, `coherent memory diff`).

### Not changed (yet)

The run record captures input/output/outcome but not the rich signal codex flagged as the eventual target:
- **Which validators fired during generation** — would require inline `coherent check` after generation, a bigger instrumentation. Still on the roadmap.
- **User accept/reject signal** — no post-hoc mark-kept / mark-rejected API yet. Future addition; for now, treat every non-error run as pending.
- **Distilled accepted patterns corpus** — premature until we have outcome signal.

### Notes

- Run records are `.gitignore`d by default in existing projects (they live under `.coherent/`, which is fully ignored via `.coherent/.gitignore` shipped by `coherent init`).
- Failure to write a run record is never fatal — `coherent chat` exits with its normal code regardless.

---

## [0.8.1] — 2026-04-23

### Docs memory layering reorg (no code behavior change)

Codex review of our memory architecture flagged two issues: `PATTERNS_JOURNAL.md` living at `docs/` while the rest of the wiki lives at `docs/wiki/` (pointless path split), and missing a bucket for operational runbooks distinct from retrieval-indexed wiki content. Also addressed a user-facing issue: user Q&A had nowhere to go — the wiki is retrieval-indexed, so support prose would have polluted code-generation prompts.

### Added

- **`docs/FAQ.md`** — user-facing answers, explicitly out of wiki retrieval. First entries cover: why the CLI needs an API key (ToS constraint), how Coherent differs from v0/bolt/lovable/tasteui, how design decisions are stored per-project, Next.js-only limitation, contributing.
- **`docs/runbooks/`** — operational how-tos for developing Coherent. Not retrieval-indexed. Initial runbooks: `cut-release.md`, `validate-retrieval.md`, `debug-indexing.md`, plus a `README.md` explaining the memory-layering rule.
- **README** — "FAQ" section pointing at `docs/FAQ.md`.
- **CLAUDE.md** — added "Not in the wiki, on purpose" subsection pointing at FAQ + runbooks and the layering rule.

### Changed

- **`docs/PATTERNS_JOURNAL.md` → `docs/wiki/PATTERNS_JOURNAL.md`** — conceptually it's wiki content; the path split was pointless. Updated all references: `CLAUDE.md` start-of-session reading list, `packages/cli/src/commands/wiki.ts` (ctx.journalPath + user-facing strings), `packages/cli/src/utils/wiki-index.ts` doc comments, `packages/cli/src/utils/wiki-index.test.ts` fixture paths, `packages/cli/src/index.ts` comments + subcommand description, `docs/wiki/README.md` link, `docs/wiki/ADR/0001-*.md` + `0003-*.md` reference path.
- **`docs/wiki/README.md`** — fixed `PATTERNS_JOURNAL.md` link (was `../PATTERNS_JOURNAL.md`, now `./PATTERNS_JOURNAL.md`).

### Not changed

- Code behavior: `coherent chat`, `coherent check`, `coherent fix`, `coherent prompt`, `coherent wiki *` — all unchanged. This is a docs + paths reorg.
- `.coherent/wiki-index.json` retrieval cache: regenerated on `coherent wiki index` with the new path. Old cached paths in built artifacts refresh on next build.

### Memory-architecture decisions recorded

Codex consult surfaced two unmet needs that didn't land in this release but are on the roadmap:
- **Product-side:** generation outcome records (per-run provenance — what was generated, what memory was injected, which validators fired, user kept/regenerated/rejected). Enables "did memory help?" measurement.
- **Product-side:** `coherent memory show` / `diff` — make per-project memory auditable instead of black-box.

Both are tracked in the backlog for a future release.

---

## [0.8.0] — 2026-04-23

### Skill-mode distribution — use Coherent with a Claude Code subscription, no API key

Users with Claude Code Free / Pro / Max subscriptions reported they couldn't run Coherent: our CLI called the Anthropic API directly and required `ANTHROPIC_API_KEY`, which subscription-only users don't have. Piggybacking on the subscription's OAuth token would violate Anthropic's Terms of Service (see [code.claude.com/docs/en/authentication](https://code.claude.com/docs/en/authentication)).

**The fix:** a second, legally sanctioned path. Run `/coherent-generate "..."` inside your Claude Code session — your session does the generation on your subscription, Coherent contributes constraints and validation. No API key, no ToS issue.

Minor version bump (0.7.31 → 0.8.0) because this adds a new distribution mode, not just a feature.

### Added

- **`coherent prompt <intent>`** — emits the structured constraint bundle (TIER 0 design thinking, TIER 1 core, TIER 2 contextual rules, golden patterns, atmosphere directive, interaction patterns) for an intent — **no API call**. Three output formats: `--format markdown` (default, human + LLM readable), `--format json` (structured), `--format plain` (flat text). Supports `--atmosphere <preset>`, `--page-type`, and `--list-atmospheres`.
- **`inferPageTypeFromIntent(intent)`** — new helper that maps natural-language intents to `marketing | app | auth`. Complementary to `inferPageTypeFromRoute` which parses URL slugs.
- **`/coherent-generate` slash command** — new `.claude/commands/coherent-generate.md`. Orchestrates the skill-mode loop: `coherent prompt` → Claude generates TSX with Write tool → `coherent check` → `coherent fix` → iterate until clean. Works with your Claude Code subscription; no API key on Coherent's side.
- **13 unit tests** for `coherent prompt` + `inferPageTypeFromIntent` across all three output formats, atmosphere handling, and page-type inference.

### Changed

- **README** — "AI Provider Setup" section reorganized around a dual-mode table (standalone CLI vs Claude Code skill). New FAQ row explaining the ToS constraint + link to Anthropic's docs.
- **QUICK_REFERENCE.md** — `coherent prompt` documented alongside `coherent chat`.
- **`.claude/commands/add-page.md`** — clarified it requires an API key; suggests `/coherent-generate` as the subscription-compatible alternative.

### Migration for existing users

Existing projects on 0.7.31 or earlier: run `coherent update` in the project root to refresh `.claude/commands/` with the new `/coherent-generate` skill. Version pins bump to 0.8.0 on next `npm install -g @getcoherent/cli@latest`.

---

## [0.7.31] — 2026-04-23

### `coherent wiki adr create` — scaffold next ADR with skeleton (W3)

Every ADR until now was hand-written. That friction meant occasional ADR-worthy decisions never got recorded. `coherent wiki adr create <slug>` scans `docs/wiki/ADR/` for the highest existing number, writes `NNNN-<slug>.md` with today's date and the canonical skeleton (Context / Decision / Consequences / Why not alternatives / References).

Used it to dogfood itself: **ADR-0004 — Atmosphere preset catalog** recording the v0.7.29 + v0.7.30 decisions.

### Added

- **`coherent wiki adr create <slug> [--title <title>]`** — new subcommand. Auto-creates `docs/wiki/ADR/` if missing. Rejects non-kebab slugs and slug collisions with existing ADRs.
- **`docs/wiki/ADR/0004-atmosphere-preset-catalog.md`** — full ADR covering the atmosphere-preset decision, alternatives considered, and consequences.
- **10 unit tests** across `nextAdrNumber` (empty/missing dir, gaps, non-ADR file skip, zero-padding past 99) and `renderAdrTemplate` (frontmatter shape, canonical sections, title rendering, trailing newline).

### Changed

- **`IDEAS_BACKLOG.md` → W3** — marked `shipped_in: 0.7.31`.
- **QUICK_REFERENCE.md** — new command documented.

---

## [0.7.30] — 2026-04-23

### `--atmosphere <name>` flag for `coherent chat`

Wires the v0.7.29 preset catalog into the generation pipeline. A user who runs `coherent chat "build a CRM" --atmosphere premium-focused` now gets a hard-override on `plan.atmosphere` — the preset wins over both the AI plan-generator's inference and the deterministic `extractAtmosphereFromMessage` fallback. No more fighting the model to get dark + tight + monochrome when that's exactly what was asked for.

### Added

- **`coherent chat --atmosphere <name>`** — override atmosphere with a named preset. Unknown names error with the full list.
- **`coherent chat --list-atmospheres`** — print the preset catalog with mood phrases and exit.
- **`SplitGenerateParseOpts.atmosphereOverride`** — new field; when set, `splitGeneratePages` skips the AI/deterministic merge and uses the override directly.
- **QUICK_REFERENCE.md** — flag documented.

### Changed

- **`packages/cli/src/commands/chat/split-generator.ts`** — atmosphere assembly wrapped in an `if (parseOpts.atmosphereOverride) { … } else { merge path }` branch. Merge logic preserved verbatim for the default path.
- **`packages/cli/src/commands/chat.ts`** — early-exit for `--list-atmospheres`, preset lookup + validation before entering the pipeline.
- **`packages/cli/src/index.ts`** — new `--atmosphere` / `--list-atmospheres` options on the `chat` command.

### Not changed (yet)

Atmosphere is still a flat 7-enum tuple. The full F9/Atmosphere pivot (typed `typography_pair` / `color_system.palette[5-7]` / `motion_signature` / `layout_archetype`) remains a separate workstream — this PR only makes the existing shape addressable by name.

---

## [0.7.29] — 2026-04-23

### Atmosphere preset catalog — seed for F9/Atmosphere pivot (R5 pre-MVP)

Ships **10 named atmosphere presets** (structured `Atmosphere` values) as a ceiling-setting alternative to ad-hoc mood inference. Pre-work for the F9/Atmosphere pivot: before the pipeline can consume named atmospheres, the catalog has to exist.

Each preset passes `AtmosphereSchema.parse` and covers a point on the aesthetic spectrum — `swiss-grid`, `paper-editorial`, `neo-brutalist`, `dark-terminal`, `obsidian-neon`, `premium-focused`, `warm-industrial`, `solar-saas`, `wabi-sabi`, `luxury-editorial`.

Inspired by public design movements (Swiss, brutalism, wabi-sabi, editorial, industrial, paper) — not derived from any proprietary source. See IDEAS_BACKLOG **R5** for the strategic rationale and the survey of adjacent tools that motivated this.

### Added

- **`packages/cli/src/commands/chat/atmosphere-presets.ts`** — exports `ATMOSPHERE_PRESETS` (10 named tuples), `getAtmospherePreset(name)`, `listAtmospherePresets()`, and type `AtmospherePresetName`.
- **`packages/cli/src/commands/chat/atmosphere-presets.test.ts`** — 7 tests: schema-parse coverage on every preset, mood/primary-hint non-empty, kebab-case names, lookup round-trip.

### Not changed (yet)

Generation pipeline still uses `extractAtmosphereFromMessage` for implicit mood inference. Wiring a `coherent chat --atmosphere <name>` override onto the preset catalog is the next step and will ship in a follow-up.

---

## [0.7.28] — 2026-04-23

### `coherent` CLI binary — rename to `.js` so Node ESM can resolve it

Fresh `npm install -g @getcoherent/cli` on Node 19+ died with `ERR_UNKNOWN_FILE_EXTENSION` when running `coherent init` — Node's strict ESM resolver refuses to load an extensionless file from a `"type": "module"` package. Reported from the wild by a user on Node 19.8 / macOS (see **PJ-011**). The bin file worked through local `pnpm link` in development because symlinked exec paths bypass the same resolution path, so CI + my workflow never caught it.

### Changed

- **`packages/cli/bin/coherent`** — renamed to `packages/cli/bin/coherent.js`. Exec bit and shebang preserved. Body unchanged (`#!/usr/bin/env node` + dynamic `import('../dist/index.js')`).
- **`packages/cli/package.json`** — `"bin": { "coherent": "./bin/coherent.js" }` matches the renamed file. Added `"engines": { "node": ">=18" }` so npm warns future users on older Node instead of half-installing.

### Not added

- No rule / constraint changes. Bin-resolution fix only.
- No ADR — packaging fix, not architectural.

### Release note for consumers

Anyone who hit `ERR_UNKNOWN_FILE_EXTENSION` should `npm install -g @getcoherent/cli@latest` (or `@0.7.28`) and retry.

## [0.7.27] — 2026-04-22

### Scaffolder favicon — transparent background, optimal fit

`public/favicon.svg` no longer ships on a dark plate. Drops the `#0a0a0a` backdrop that rendered as a small dark-green square in browser tabs (accent stroke + dark bg blended together at 16–24px). Mark now sits on transparent, scaled from 22×22 to 28.5×28.5 within the 32×32 viewBox — reads as a clean rounded frame + 2×2 token grid on any tab theme. `public/coherent-logo.svg` scaled to match (21.5×21.5 in 24×24).

### Changed

- **`ProjectScaffolder.generateFavicon()`** — `favicon.svg` removes fill backdrop (`fill="none"` on root), enlarges frame (x=1.75, 28.5 side, rx=4, stroke-width=2.5), enlarges inner quadrants (8×8 at 7.25/16.75 positions). `coherent-logo.svg` rescaled to 21.5×21.5 frame with 6×6 quadrants for visual parity.

### Not added

- No rule or constraint changes. Asset-only refresh.
- No ADR — follow-up to 0.7.26.

## [0.7.26] — 2026-04-22

### Scaffolder favicon refresh — MarkG 2×2 token grid

`coherent init` now emits the current Coherent brand mark for `public/favicon.svg` and `public/coherent-logo.svg`. Previously the scaffolder hardcoded an old bracket-triangle path on a `#3B82F6` blue background — visually unrelated to Coherent's current identity and out of step with the landing site. New SVGs mirror the `CoherentMark` component: outer rounded square frame, 2×2 inner token grid (top-left + bottom-right full opacity, top-right + bottom-left at 0.45α), accent `#3ecf8e` on `#0a0a0a`.

### Changed

- **`ProjectScaffolder.generateFavicon()`** — both emitted SVGs replaced. `public/coherent-logo.svg` ships transparent-background MarkG (accent on any surface). `public/favicon.svg` ships dark-background variant for tab display contrast. No API change; regenerates on every `coherent init`.

### Not added

- No rule or constraint changes. Template-level asset refresh only.
- No ADR — brand asset update, not architectural.

## [0.7.25] — 2026-04-22

### Console-skin Design System — portable through shadcn tokens

`coherent init` now generates a Design System page set that reads natively inside any downstream atmosphere. Identity comes from rhythm (mono uppercase section labels, rounded-square accent markers, border-first treatment, `tabular-nums` on every numeric), not from fixed colors. `--primary`, `--card`, `--muted-foreground`, `--border` drive surfaces and accents — the same layout reads as Console (emerald on near-black), Warm (terracotta on cream), or Editorial (ink on parchment) without template forks.

### Changed

- **`DesignSystemGenerator`** — every inline template rewritten to use shadcn tokens directly: `bg-card`, `text-muted-foreground/70`, `text-primary`, `font-mono`. Removed hardcoded `--surface` / `--elevated` references so generated DS pages theme-adapt through host atmosphere.
- **`PageGenerator` floating DS button** — contextual affordance. On app routes: "Design System →". On `/design-system/*` routes: "← Back to App". Same element, location, glass + border-first styling; `pathname.startsWith('/design-system')` decides. Test updated to assert both branches.
- **Design System layout + pages** (`design-system-layout.ts`, `design-system-home.ts`, `component-dynamic.ts`, `shared-components-pages.ts`) — uniform Console skin: simplified headers (no logo + wordmark + pill combo, just `• design system` mono anchor), activity heatmap uses `hsl(var(--border))` (visible on both light and dark), SectionLabel marker switched from circle to rounded square (`rounded-[2px]`) to echo CoherentMark.

### Rules asserted (the skin, 7 invariants)

1. Surface hierarchy from host tokens (`--bg / --card / --muted / --border`)
2. Mono uppercase section labels + rounded-square accent marker
3. Sans body / mono meta (numbers, IDs, paths)
4. `tabular-nums` on every numeric value
5. Border-first, shadow-last (1px `--border`, no soft drop shadows)
6. Accent = host `--primary` token
7. Zero decorative icons — lucide line icons only, 2pt stroke

### Not added

- No new rules in `design-constraints.ts`. This release changes the generator's DS page templates, not the prompts. Per Rule 2 of the constraint architecture (no new exports), these are template edits inside existing files.
- No ADR — architecture unchanged; this is template polish delivering a portable DS skin via existing shadcn-token mapping.

## [0.7.24] — 2026-04-22

### F11 interface-details + F12 Nielsen heuristic subset

Nine new rules added to always-on blocks — floor-raising polish and safety. Origin: jakub.kr/writing/details-that-make-interfaces-feel-better + Nielsen 10 usability heuristics. No new subsystem, no breaking changes, no new exports — all inlined into existing `DESIGN_QUALITY_COMMON` / `INTERACTION_PATTERNS` / `RULES_COMPONENTS_MISC` blocks per Rule 2 of the constraint architecture.

### Added — F11 (interface details)

- **R012 Two sizes max per component.** Contrast between primary and secondary text comes from weight (font-medium vs font-normal) or color (text-foreground vs text-muted-foreground), NOT from a third size step. Three sizes in one card reads as noise.
- **R013 Concentric border radius formula.** Nested radii satisfy `outer = inner + padding`. A Card rounded-xl with p-4 gets children rounded-md/rounded-lg — not the same rounded-xl as the parent. Matching radii on nested elements read as mismatched corners.
- **R014 Exit motion subtler than entrance.** If an entering element translates from 24px, the exiting version translates only ~8px before fading. Blur + opacity still carry the directional cue. Full-magnitude exit movement competes with the content replacing it.
- **R015 Grayscale antialiasing.** html/body gets `-webkit-font-smoothing: antialiased` + `-moz-osx-font-smoothing: grayscale`. Tailwind: `antialiased` class. Without it, light text on dark renders heavy on macOS.
- **R016 Tabular numerals.** Any UI element with changing digits (stats, timers, counters, table cells with prices / durations / percentages) uses `font-variant-numeric: tabular-nums`. Prevents width-jitter on rerender — a common AI-slop tell.
- **R024 Image outline overlay.** Every content image gets `outline outline-1 -outline-offset-1 outline-black/10` (dark: `outline-white/10`). Handles the edge case where the image's own background matches the page background and the image edge would otherwise disappear.

### Added — F12 (Nielsen heuristic subset)

- **R017 Focus return to trigger element.** When a Dialog/Sheet/Popover closes, focus MUST return to the element that opened it. shadcn Radix primitives handle this by default; custom overlays often don't. Critical for keyboard and screen-reader users (Nielsen #3 user control).
- **R018 Back-button compatibility with modals.** Use `onOpenChange` to keep modal state in sync with URL. Router back closes the modal instead of navigating away from a trapped page (Nielsen #3).
- **R019 Tiered destructive confirmation.** HIGH-RISK destructive (delete account, drop project, charge > threshold) requires typing the resource name or "DELETE" to unlock the confirm button. Reversible destructive (archive, mark-read, hide) prefers optimistic + Gmail-style undo toast over a blocking dialog. Friction is the feature for irreversible; cheap interaction preserves safety for reversible (Nielsen #5 error prevention).

### Updated

- `docs/wiki/RULES_MAP.md` — 9 new rows (R012-R019 always-on, R024 contextual). Auto-generated block refreshed via `scripts/generate-rules-map.mjs`.
- `docs/wiki/IDEAS_BACKLOG.md` — F11 + F12 entries marked `status: resolved, shipped_in: [0.7.24]`, plus v0.7.24 entry under Shipped section.
- `CLAUDE.md` — stale version marker bumped to reflect current state.

### Not added

- No new validators for these rules yet. They are prompt-level only. If an F11 rule turns out to be frequently violated despite CORE injection (measurable via `coherent journal aggregate` over several releases), promote to a validator in a follow-up PR.
- No ADR — no new subsystem, no breaking change, existing tier architecture unchanged.

## [0.7.22] — 2026-04-20

### `coherent wiki audit` — extended checks (PR 2 from v0.7.x wiki refactor)

Three new audit passes, one bug fix. All platform-wiki housekeeping — no user-facing behavior change.

### Added

- **ADR schema audit.** Every `docs/wiki/ADR/*.md` must have frontmatter with `id`, `status`, `date`, `confidence`. `id` must match `ADR-NNNN` (four-digit zero-padded). `confidence` must be one of hypothesis/observed/verified/established. Catches ADRs added without frontmatter (would break wiki retrieval).
- **Version consistency audit.** `@getcoherent/core.version` must equal `@getcoherent/cli.version` (published together). CHANGELOG top entry must match. Mismatch is `error` for pkg/pkg, `warning` for pkg/CHANGELOG. Catches the "forgot to bump one package" drift that bit PR #28.

### Fixed

- **Evidence false-positive (PJ-001, PJ-009).** Audit now reads `evidence:` from frontmatter before falling back to body prose scan. Entries with evidence only in frontmatter (the canonical place per v0.7.3 schema) no longer get flagged. Previously `wiki audit` always printed 2 info lines against clean journal.

### Tests

- `packages/cli/src/commands/wiki.test.ts` — 9 new tests covering `extractFrontmatterAtTop`, `auditVersionConsistency` (match / cli-core mismatch / CHANGELOG drift / missing CHANGELOG / unbracketed heading).
- Full suite: 1068 passing (was 1059).

### Migration

No migration required. Existing wikis will get new warnings only if their ADRs are actually missing frontmatter fields, or if their versions are drifted.

## [0.7.21] — 2026-04-20

### `coherent check` — first cross-page validator (INCONSISTENT_CARD)

`coherent check` used to evaluate every page in isolation. A page could pass every rule individually while the **set of pages** still looked inconsistent — Reports had plain stat cards, Investments had tinted-square + Badge stat cards, everything passed, and the inconsistency only surfaced at smoke-test time. PJ-007 captured this exact failure.

v0.7.21 adds a cross-page consistency pass.

### Added

- **New validator: `INCONSISTENT_CARD`** (severity: warning). Scans all `app/**/page.tsx` files, extracts a structural signature for every stat card found (`<Card>` with icon + numeric-emphasized value), clusters by signature, and warns on any minority cluster. Signature dimensions:
  - `icon_wrapper` — `plain` (icon direct in CardHeader) vs `tinted-square` (icon inside `rounded + bg-tint/N + padding` wrapper).
  - `trend` — `none` / `inline-text` / `badge` / `arrow-icon`.
  - `value_size` — `text-2xl` / `text-3xl` / `other`.
- **New section in `coherent check` output: "Cross-Page Consistency".** Shows one issue per minority cluster with file names and both signatures. Only runs on multi-page scans (skipped when `--page X` is used).

### Rationale

- Minority-reports model: if 3 pages use signature A and 1 page uses signature B, B is the outlier. Tied clusters don't emit issues — the validator only picks a side when the majority is clear.
- Regex-based, not AST-based. Keeps zero new deps, runs in ms. AST would catch more edge cases but is overkill for the 95% of AI-generated cards that follow predictable shadcn patterns.
- Sample-size guard: needs ≥3 stat cards total across all pages before it flags anything. Two cards is noise.

### New module
`packages/cli/src/utils/cross-page-validator.ts` + 10 tests. Exports `validateCrossPage(pages)` and `extractStatCardSignature(cardBlock)` for reuse by future cross-page checks (INCONSISTENT_FILTER_BAR, INCONSISTENT_EMPTY_STATE — v0.8.x candidates).

### Tests
1047 passing (+10).

## [0.7.20] — 2026-04-20

### `coherent chat --page X` — surgical edits (M7)

Previously `--page X` took a long path: `resolveTargetFlags` wrapped the user message with the full embedded page code and a "return the full updated component code" directive, then `parseModification` made one big LLM call that regenerated the whole page. Two side effects: a cold extra LLM round-trip for intent parsing, and — per MODEL_PROFILE — Claude often "improves" parts of the page the user didn't ask to change.

### Changed

- **`--page X` bypasses `parseModification`.** When the flag is set and the target resolves, chat.ts builds an `update-page` request locally from the original (unmutated) user message: `{ type: 'update-page', target: page.id, changes: { instruction: message } }`. `applyModification.update-page` reads the file from disk and calls `ai.editPageCode(currentCode, instruction, pageName, rules)` — a single focused LLM call with the minimal-diff enforcement already shipped in v0.6.77.
- **New helper: `resolveExplicitPageTarget(options, pages)`** in `commands/chat/utils.ts`. Returns the resolved page without mutating the message (contrast with `resolveTargetFlags`, which embeds the code). Unit-tested against the same fuzzy-match pages fixture.
- **Escape hatch.** `COHERENT_DISABLE_SURGICAL_EDITS=1` forces the legacy full-regen path for the rare case surgical editing misbehaves.

### Added

- **`coherent journal prune` (J2).** Deletes fix-session YAMLs older than `--keep-days N` (default 30). Supports `--dry-run`. Closes the retention loose end from v0.7.18 (`.coherent/fix-sessions/` was previously unbounded). Uses the filename timestamp — `stat mtime` wouldn't survive git clones or archive restores. Files whose names don't parse as timestamps are conservatively kept.

### Not covered by surgical path
`--component` and `--token` targets still go through `resolveTargetFlags` + `parseModification`. They have different cascading side effects (component changes → multiple page updates; token changes → globals.css + theme regeneration) that benefit from the full intent parse.

### Tests
1037 passing (+13):
- 7 new tests for `pruneJournalSessions` (cutoff boundary, unparseable names, dry-run, non-yaml files, missing dir, hyphenated timestamp format).
- 6 new tests for `resolveExplicitPageTarget` (component/token exclusion, fuzzy-match passthrough, missing-page null).

### Rationale
From PATTERNS_JOURNAL curator notes and MODEL_PROFILE: full-page regen is the class of behaviour where Claude tweaks badge variants, adds empty states the user didn't ask for, or reformats unrelated sections. Surgical edit caps the blast radius. Planned since v0.7.2 (backlog M7) — now shipped.

## [0.7.19] — 2026-04-20

### `coherent journal` — read side of the memory feedback loop

0.7.18 captured fix sessions to `.coherent/fix-sessions/*.yaml`. 0.7.19 makes that data actionable.

### Added

- **`coherent journal list`** — lists all captured sessions chronologically with a one-line summary per session (error/warning/info totals + filename).
- **`coherent journal aggregate`** — reads every session, ranks validators by total recurrence, shows top-10 per severity with:
  - total occurrence count across all sessions
  - number of sessions the validator appeared in
  - deduplicated sample file paths
- Flags validators that recurred in 3+ sessions as PATTERNS_JOURNAL.md candidates — the curator has prioritized raw material instead of a blank page.

### Parser
The YAML shape is emitted by `fix --journal` in a narrow, stable format owned by this repo. A handwritten state-machine parser (no YAML library dep) covers it — if the format ever evolves beyond what the parser handles, we change both sides in the same commit.

### Full feedback loop now
```
coherent fix --journal           →  .coherent/fix-sessions/TIMESTAMP.yaml
coherent journal aggregate       →  ranked validators across all sessions
[human curator drafts PJ-NNN]    →  docs/PATTERNS_JOURNAL.md
coherent wiki index              →  updated retrieval index (future)
coherent chat "build X"          →  benefits from indexed lessons
```

## [0.7.18] — 2026-04-20

### `coherent fix --journal` — feedback loop between fix runs and memory

Fix output carries a lot of signal: which validators fired, on which files, at which rate across sessions. Previously that signal evaporated after each run — every smoke test forced a fresh "what's left" analysis. Now it's captured for later wiki curation.

### Added

- **`coherent fix --journal`** (opt-in flag). After running the normal fix pipeline, writes a YAML summary to `.coherent/fix-sessions/YYYY-MM-DDTHHMMSSZ.yaml` with:
  - Timestamp + coherent version in project.
  - What auto-fixers fired this run.
  - Totals: error/warning/info counts.
  - Per-severity grouping of remaining issues: validator type, count, up to 5 sample `{ path, line }` pairs.
  - File format is wiki-friendly YAML — future `coherent wiki` tooling can aggregate across many sessions to surface recurring patterns worth a `PATTERNS_JOURNAL.md` entry.
- **Discovery hint.** Default `coherent fix` runs now print `ℹ Run with --journal to capture this session for later review.` when there are remaining issues, so the feature is discoverable.

### Rationale
The single biggest gap in the memory system (rated 6.5/10 as of 0.7.8) was that smoke-test feedback didn't feed back. Every session started by re-deriving the remaining-issue analysis. This flag closes that loop at its narrowest point: persist the raw data, defer the human-judgment synthesis to separate wiki tooling.

### Next
`coherent journal aggregate` (0.7.19+) — read `.coherent/fix-sessions/*`, rank validators by recurrence, produce `hypothesis`-tagged draft entries for `PATTERNS_JOURNAL.md`. Right now captured data sits until a human reviewer or future tooling digests it.

## [0.7.17] — 2026-04-20

### CHART_PLACEHOLDER autofix — animated bar skeleton

The last remaining error class in `coherent fix` that we hadn't auto-fixed was `CHART_PLACEHOLDER` — the pattern where AI writes `<div>Chart visualization would go here</div>` instead of a real chart. A real recharts/shadcn Chart needs design intent (shape, data, axes) that a regex can't infer. But the placeholder text is objectively worse than showing something. Ship a visual skeleton.

### Added

- **`CHART_PLACEHOLDER` autofix.** Replaces the placeholder div with 7 animated bars using semantic tokens:
  ```tsx
  <div className="h-[200px] flex items-end gap-2 px-4 pb-4">
    <div style={{ height: "40%" }} className="flex-1 bg-primary/30 rounded-t-sm transition-colors hover:bg-primary/60" aria-hidden />
    ... 6 more bars with varying heights ...
  </div>
  ```
  - Explicit bars (no `.map`) — avoids false-firing `NO_EMPTY_STATE` which looks for any `.map(`.
  - `transition-colors` not `transition-all` — keeps `TRANSITION_ALL` quiet.
  - `aria-hidden` — decorative, not semantic data.
  - `bg-primary/30` + hover state — theme-adaptive, looks like a chart loading rather than dead text.

### Impact on the smoke-test project
- Errors: 3 → 1 (both `CHART_PLACEHOLDER` entries auto-fixed).
- Only remaining error is a genuine `DOUBLE_SIGN` code bug in `transactions/tx-004`.
- Realistic floor reached: every auto-fixable validator now has an autofix.

### Tests
1024 passing (+3).

## [0.7.16] — 2026-04-20

### Hotfix: CI flakiness in plan-generator tests

`generateSharedComponentsFromPlan` tests passed `'/tmp'` as projectRoot. Each test writes `coherent.components.json` + component files to that shared location. Cross-run pollution on the GitHub Actions runner caused two tests to fail intermittently — one timed out (5s limit hit), another parsed a leftover manifest with stale content ("Unexpected non-whitespace character after JSON at position 322"). Locally 55/55 passed; on CI the same code failed 2/55.

### Fixed

- Per-test `mkdtempSync(tmpdir() + '/coherent-plan-gen-')` + `afterEach` cleanup. Tests are now hermetic — no shared state between cases or runs.
- Suite-level `timeout: 15000`. The filesystem-heavy cases run ~4s locally; CI runners are 2-3× slower so the default 5s timeout left zero margin.

No runtime code changes — tests only.

## [0.7.15] — 2026-04-20

### Compact fix report + regex fixes for BROKEN_INTERNAL_LINK / HEAVY_SHADOW

> 📹 **Demo video:** [Watch on YouTube](https://youtu.be/A-rCpn6O3SI) · [Download MP4](https://github.com/skovtun/coherent-design-method/releases/download/v0.7.15/Coherent.Design.Method.DEMO.mp4) · [View in README](https://github.com/skovtun/coherent-design-method#demo)


Smoke-test on 0.7.14 showed two regressions and one UX problem:

1. `coherent fix` correctly rewrote `<Link href="/accounts">` to `<Link href="#" data-stale-href="/accounts">` — but then the validator re-flagged it as BROKEN_INTERNAL_LINK because the regex matched `data-stale-href="/accounts"` as if it were a real href. Fixed.
2. The regenerated `components/shared/ds-button.tsx` fires HEAVY_SHADOW on its `shadow-lg` class — but that shadow is the FAB affordance, not a mistake. Validator was context-blind.
3. Report output was 80+ lines for a project with 14 real issues. Dense, hard to scan, info-level noise dominated errors.

### Fixed

- **BROKEN_INTERNAL_LINK regex.** Both the validator and the autofix now use negative lookbehind `(?<![\w-])href` to avoid matching `data-stale-href` or any other `data-*-href` attribute. Autofix output no longer re-triggers the warning.
- **HEAVY_SHADOW exempts floating elements.** `fixed|absolute|sticky` in the same className → no warning. Matches design intent for FABs, pinned toolbars, popovers.
- **Shadow autofix: greedy regex bug.** Old implementation used `[^"]*\bshadow-(md|lg|xl|2xl)\b[^"]*` with greedy `[^"]*` — only the LAST shadow-* per className was replaced. `shadow-lg … hover:shadow-xl` became `shadow-lg … hover:shadow-sm` instead of both demoted. Now iterates every match per className and skips floating elements entirely.

### Changed

- **`coherent fix` report overhauled — compact by default.** The old per-file dump is now behind `--verbose`. Default view groups issues by type with counts and sample files:
  ```
  Errors (3):
    CHART_PLACEHOLDER     ×2  dashboard:255, dashboard:264
      Chart placeholder text detected
    DOUBLE_SIGN           ×1  transactions/tx-004:105
      Manual +/- prefix

  Warnings (9):
    NO_EMPTY_STATE        ×5  budgets, reports, transactions/[id], +2 more
    NO_LOADING_STATE      ×1  budgets
    NO_H1                 ×1  profile
    ...

  ℹ 22 info hints hidden. Use --verbose to see all.
  ```
  Typical output drops from 80+ lines to ~20. Info-level issues are now suppressed by default (most are `SM_BREAKPOINT`, `INLINE_MOCK_DATA`, `FORM_NO_FEEDBACK` — not actionable without taste). File paths also shorten: `app/(app)/dashboard/page.tsx` → `dashboard`.

### Tests
1021 passing (+6 cases: data-stale-href validator × 2, HEAVY_SHADOW context × 2, shadow autofix × 2).

## [0.7.14] — 2026-04-20

### BROKEN_INTERNAL_LINK — dynamic-route awareness + autofix

Previous versions of the `BROKEN_INTERNAL_LINK` validator did a flat `Set.has(href)` check against `config.pages[*].route`. That false-fired on every concrete link to a dynamic route: `<Link href="/transactions/tx-002">` was flagged even though `/transactions/[id]` exists and Next.js would happily render tx-002 at runtime.

### Fixed

- **Dynamic route matching.** `validatePageQuality(code, validRoutes)` now pre-compiles every route containing `[param]` into a regex and checks the href against those patterns before flagging. `/transactions/tx-002` ↔ `/transactions/[id]` no longer trips the validator.

### Added

- **`BROKEN_INTERNAL_LINK` autofix.** For hrefs that truly have no covering route (dynamic or otherwise), `autoFixCode` now rewrites:
  ```tsx
  <Link href="/accounts">View All</Link>
  ```
  to
  ```tsx
  <Link href="#" data-stale-href="/accounts">View All</Link>
  ```
  No more 404 on click; reviewers can grep `data-stale-href` to find dead links. The autofix needs `knownRoutes` in the `AutoFixContext` — fix.ts now passes it from `config.pages[*].route`.

### Tests
1015 passing (+5 cases: dynamic-route validator × 2, autofix × 3).

## [0.7.13] — 2026-04-20

### CLI help cleanup + RAW_IMG_TAG autofix + SM_BREAKPOINT noise roll-up

### Changed

- **`coherent --help` surface reduced from 22 to 15 commands.** Contributor-only and niche commands are now hidden but still invokable:
  - `wiki` — "Coherent source repo only — NOT for generated projects" (its own description said so, we finally acted on it).
  - `regenerate-docs` — narrower subset of `ds regenerate`; kept as hidden alias with deprecation note.
  - `baseline` — structural regression snapshot tool for platform contributors.
  - `import` — experimental Figma importer; hidden until feature stabilizes.

  Visible surface now: `init`, `chat`, `preview`, `check`, `fix`, `export`, `sync`, `rules`, `update`, `undo`, `migrate`, `components`, `ds`, `status`, `report-issue`.

- **`SM_BREAKPOINT` rolls up to a single summary.** Previously every `sm:` utility produced its own info-level entry, drowning real issues under `L19, L27, L37, L101…`. Now reported once per file as `sm: breakpoint — consider if md:/lg: is sufficient (N occurrences)`. On a typical landing page this collapses 9 lines of output into 1.

### Added

- **`RAW_IMG_TAG` autofix.** `<img src="..." width="..." height="..." />` → `<Image src="..." width="..." height="..." />` from `next/image`, adding the import if missing. Only fires when width AND height are explicit — without them Next throws at render time, so the validator would just fire again.

### Tests
1010 passing (+5 cases: SM roll-up × 2, RAW_IMG_TAG × 3).

## [0.7.12] — 2026-04-20

### DSButton client component: hides on /design-system + much more expressive

Smoke-test on a real project showed the floating "Design System" pill still rendered ON `/design-system/*` pages — the pages it's meant to jump to. Reason: the button lived as an inline `<Link>` in `app/layout.tsx`, which is a Server Component, so it couldn't check `usePathname()` to self-hide. It also looked weak: `border-border/20 bg-background/80 backdrop-blur-md` is nearly invisible on a light background.

### Added

- **`DSButton` client component** at `components/shared/ds-button.tsx`. Self-hides via `usePathname().startsWith('/design-system')`. Visual redesign:
  - Solid `bg-foreground text-background` — theme-adaptive maximum contrast.
  - Sparkles icon that rotates 12° on hover.
  - `shadow-lg shadow-foreground/25` + `ring-1 ring-foreground/10` — stands out without noise.
  - `hover:scale-[1.02] active:scale-[0.98]` — feels like an affordance, not a sticker.
- **`PageGenerator.generateDSButtonCode()`** — new generator method. Referenced by root layout template and emitted as a shared component during `coherent init`.

### Fixed

- **Root layout no longer emits inline FAB.** `generateNextJSLayout` now imports `DSButton` from `@/components/shared/ds-button` and renders `<DSButton />` before `</body>`.
- **Legacy scaffold FAB removed from `generateInitialHeaderCode`** (ProjectScaffolder) — the root-layout-level DSButton covers it; having two was noisy.
- **`coherent fix` Step 4e: auto-migrate existing projects.** Detects the old inline `<Link ... Design System>` in `app/layout.tsx`, writes `components/shared/ds-button.tsx`, replaces the inline link with `<DSButton />`, adds the import, and drops `next/link` if no other `<Link>` remains. Idempotent.

### Tests
1005 passing (+1: DSButton generator).

## [0.7.11] — 2026-04-20

### Hotfix: stale config reference in Step 4d + DOUBLE_SIGN Math.abs context

Smoke-testing 0.7.10 caught one critical bug and one remaining false-positive class:

### Fixed

- **Header regen used stale config after prune.** Step 4d captured `config = dsm.getConfig()` once, then pruned stale `navigation.items` via `dsm.updateConfig({...config, navigation: {...}})`. That creates a new config object, but the local `config` const still pointed at the old one. `new PageGenerator(config)` then emitted Header with the pruned items still present, putting the stale links right back. Fix: re-read `dsm.getConfig()` after the prune.

  Observable before: `✔ Pruned stale nav items from config: /account` then `⚠ Link to "/account" — route does not exist`. Nonsensical. After: stale href actually gone from generated Header.

- **`DOUBLE_SIGN` still fired on Math.abs-guarded formatters.** Pattern like:
  ```ts
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : '+'
  return `${sign}$${abs.toFixed(2)}`
  ```
  was flagged as error even though the sign is driven separately from an unsigned formatter — correct by construction. Fix: if `Math.abs(...)`, `.abs(...)`, or `signDisplay` appears within 5 lines of the ternary, demote from error to info.

### Tests
1004 passing (+2).

## [0.7.10] — 2026-04-19

### Nav cleanup hardening + DOUBLE_SIGN tiering + currency autofix

Three gaps surfaced by smoke-testing 0.7.9 on a real project:

### Fixed

- **Stale `config.navigation.items` survive old delete-page calls.** 0.7.9 introduced nav cleanup on `delete-page`, but users who deleted pages on 0.7.8 or earlier ended up with `config.navigation.items` still holding the dead route. `coherent fix` Step 4d then regenerated Header from a stale config, so the "/account" link came back. Fixed: Step 4d now prunes any `navigation.items` whose route is neither in `config.pages` nor in the auth allowlist (login/signup/reset), persists via `dsm.save()`, **then** regenerates the shared Header. Self-heal, not just surface-patch.

- **"Missing default export" false-positive on regenerated Header.** `verifyIncrementalEdit` was surfacing the default-export check on `components/shared/header.tsx` after our own regen wrote it with a named export (as it should — shared components aren't pages). `coherent fix` now skips that specific check for files under `components/shared/` and `components/ui/`.

- **`DOUBLE_SIGN` was over-firing as error.** The validator regex matched `? '+' : '-'` unconditionally, but many AI-generated patterns look like `{transaction.type === 'credit' ? '+' : '-'}{formatCurrency(amount)}` — where `amount` is unsigned and the sign comes from the type field. That's a style preference (Intl.NumberFormat is still cleaner), not a runtime bug. Split into two tiers: numeric comparison on money-domain identifiers (`amount|value|total|balance|change|delta|…`) stays **error**; type-string comparison demotes to **warning**.

### Added

- **`RAW_NUMBER_FORMAT` autofix.** `$\`${amount.toFixed(2)}\`` and `$${amount.toFixed(2)}` in JSX now rewrite to `new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: N, maximumFractionDigits: N }).format(amount)`. One more error class `coherent fix` handles deterministically.

### Tests
1002 passing (+3 new: RAW_NUMBER_FORMAT autofix, DOUBLE_SIGN error tier, DOUBLE_SIGN warning tier).

## [0.7.9] — 2026-04-19

### Nav cleanup on delete-page + broader auto-fix coverage

Triggered by live testing: user deleted `/account` page via `coherent chat "delete account page"`. The page file vanished, config.pages was updated — but the "Account" link stayed in the Header menu. Clicking it 404'd.

Root cause was a three-way gap:
1. `delete-page` handler removed from `config.pages` but not from `config.navigation.items`.
2. Shared `components/shared/header.tsx` / `sidebar.tsx` were not regenerated after the delete.
3. `coherent fix` called `validatePageQuality()` WITHOUT `validRoutes`, so the existing `BROKEN_INTERNAL_LINK` validator never fired against stale hrefs.

### Fixed

- **`delete-page` handler now updates navigation + regens shared Header/Sidebar.** After dropping the page from `config.pages` and `config.navigation.items` in one pass, imports `PageGenerator` and rewrites `components/shared/header.tsx` (or `sidebar.tsx`, per nav type) using the updated config. Stale link can't survive a delete.
- **`coherent fix` Step 4d: stale nav link sweep.** Scans `components/shared/header.tsx` and `sidebar.tsx` for hrefs, cross-references against `config.pages` routes. Any stale href triggers regen of that file from the current config. Safe under `--dry-run` — reports what it would regen.
- **`coherent fix` Step 6 now passes `validRoutes` to `validatePageQuality()`.** `BROKEN_INTERNAL_LINK` warnings finally surface during `fix`. Previously they only fired in `check`.

### Added — broader quality auto-fix coverage

User reported 10+ error classes surviving `coherent fix`. Highest-frequency error patterns are now auto-fixed rather than merely reported:

- **`DIALOG_FULL_WIDTH` auto-fix.** `<DialogContent>` / `<AlertDialogContent>` without a `max-w-*` class gets `max-w-lg` injected. `<SheetContent>` gets `sm:max-w-md`. Existing `max-w-*` is preserved.
- **`SMALL_TOUCH_TARGET` auto-fix.** `<Button size="icon">` without explicit sizing gets `min-h-[44px] min-w-[44px]` appended, unless padding/height classes already satisfy 44px.
- **`MISSING_ARIA_LABEL` auto-fix.** Icon-only `<Button>/<button>` with a lucide-style icon child gets an inferred `aria-label`. Icon→label map handles the common set (`X`→Close, `Trash`→Delete, `Menu`→Open menu, `Pencil/Edit`→Edit, `Chevron*`→Expand/Collapse/Previous/Next, …). Buttons with visible text or an existing aria-label are left untouched.
- **`DOUBLE_SIGN` auto-fix (narrow, high-confidence).** The common AI pattern `{amount > 0 ? '+' : ''}{amount.toFixed(2)}` on an already-signed value gets rewritten to `new Intl.NumberFormat({ signDisplay: "always", ... }).format(amount)`. Fix only applies when sign var === value var — broader patterns stay reported-only, since the transformation is risky.

### Tests
999 passing (+13 new cases: autofix + Sheet width exemption).

### Also fixed
- **Generated `components/shared/header.tsx` tripping its own validators.** The `generateSharedHeaderCode` Design-System FAB used raw `bg-black/60 text-white border-white/20` → now `bg-foreground/80 text-background border-foreground/20`. Mobile `SheetContent` used plain `w-72` without `max-w-*` → validator now recognizes `w-*` on Sheet as a valid width cap (it's a side drawer, not a centered modal).

### Memory quality score
Unchanged at ~6.5/10. This release is product polish, not retrieval quality.

## [0.7.8] — 2026-04-20

### Compound delete + synonym expansion + prompt-injection guard

Three improvements triggered by live testing after 0.7.7:

**1. Compound delete** — `coherent chat "delete the account page and the delete-account page"` failed after 0.7.7 because the greedy regex captured both page names as a single target. Fixed: split compound targets by `and` / `&` / `,`, emit one `delete-page` per resolvable target. Unresolvable parts are reported as warnings. When NO target resolves, fall back to LLM (regex probably over-matched).

**2. Synonym query expansion** — curated domain synonym map (`modal↔dialog`, `sheet↔drawer`, `chart↔graph`, `stat↔kpi↔metric`, `delete↔remove↔drop`, etc.). Expanded tokens get 0.5x weight so real terms still dominate ranking, but "popup dialog too wide" now correctly finds PJ-008 (which describes "modal"). Bridges keyword→semantic gap without loading an embedding model.

**3. Prompt-injection sanitization** — new `src/utils/wiki-sanitizer.ts` strips known LLM-jailbreak patterns from wiki entries before injection: "ignore previous instructions", `system:` role rebinding, ChatML/Llama special tokens, env-var exfiltration prompts, role re-binding. Also truncates over-long entries (>4KB). Wraps context in explicit "DATA, not instructions" boundary. Finally closes the 0/10 prompt-injection criterion.

### Added
- `docs/wiki/BENCH.yaml` gained 3 synonym cases (popup→modal, kpi→stat, remove→delete). All at 100% precision@1.
- `src/utils/wiki-sanitizer.ts` + 9 tests covering injection patterns.

### Tests
986 passing (+8 new).

### Memory quality score
5.8/10 → **~6.5/10**. Prompt-injection: 0→6. Retrieval: 5→6. Next: opt-in semantic embeddings (0.7.9 optional, OpenAI API).

## [0.7.7] — 2026-04-20

### Destructive pre-parser + wiki improvements (PJ-009 regression fix + memory quality bump)

**Root-causes two layers of failure seen in the user's retry after 0.7.6:**
1. AI misinterpreted "delete account page" as `add-page` (despite RULE 4 in prompt). Even with rule text, Claude at t=0.3 sometimes missed it.
2. The normalizer silently coerced `add-page` → `update-page` when target route existed, hiding the AI's misinterpretation.

### Added — fix the delete-page regression
- **`src/agents/destructive-preparser.ts`** — deterministic pattern match for `delete|remove|drop|trash|get rid of X page|component`. Runs BEFORE LLM, emits delete-page/delete-component directly. Bypasses AI ambiguity entirely.
- **"create a delete-X page" disambiguation** — `add a delete account page` (feature) does NOT match the destructive pattern.
- **Normalizer destructive-intent guard** — if user's message contains destructive verbs but no delete-* request was emitted, refuse instead of silently creating/updating.
- **`chat.ts` fail-fast** — destructive user intent without delete-* request → clear error, no silent coercion.

### Added — wiki retrieval quality
- **Confidence-weighted ranking.** `verified` entries +20%, `established` +30%, `hypothesis` -30%. Old entries with no confidence default to 1.0x. Finally uses the YAML confidence tags shipped in 0.7.3.
- **Freshness decay.** Entries with `date:` frontmatter get a gentle linear decay: 0-180 days = 1.0x, 180-720 days = 1.0x → 0.7x. Foundational ADRs not buried.
- **`coherent wiki bench`** — deterministic retrieval benchmark against `docs/wiki/BENCH.yaml` (10 hand-curated query/expected pairs). Reports precision@1 and @3. Exits non-zero if p@1 < 0.8. Current: **100% @1 and @3**.
- **`docs/wiki/BENCH.yaml`** — benchmark test cases covering all 9 PJ entries + the 0001 ADR.

### Tests
978 passing (+14 for destructive pre-parser). 66 test files.

### Memory quality score
5.0/10 → **~5.8/10**. Confidence tags now affect ranking, freshness shapes retrieval, bench catches regressions, destructive intent is deterministic. Next: prompt-injection safety (0), semantic embeddings (0.7.8).

## [0.7.6] — 2026-04-20

### Hotfix for 0.7.5 — request-parser VALID_TYPES missed delete-page/delete-component

0.7.5 added `delete-page` / `delete-component` to the `ModificationRequest` union type, handler, and prompt training. But **request-parser.ts had its own runtime VALID_TYPES allowlist** that wasn't updated — so the AI's `delete-page` output was rejected with `Unknown action "delete-page"` before reaching the handler.

Runtime behavior now matches compile-time types. `coherent chat "delete account page"` emits `delete-page`, passes validation, hits handler, removes file. Caught by live smoke test immediately after publishing 0.7.5.

### Meta
- **MODEL_PROFILE note:** when introducing a new ModificationRequest type, four places need updating in lock-step:
  1. `packages/core/src/types/design-system.ts` — union member
  2. `packages/cli/src/commands/chat/modification-handler.ts` — switch case
  3. `packages/cli/src/commands/chat/request-parser.ts` — VALID_TYPES allowlist
  4. `packages/cli/src/agents/modifier.ts` — prompt training (if AI-detectable)
- Audit: these four locations could be derived from one source-of-truth enum. Logged as an idea.

## [0.7.5] — 2026-04-20

### Delete-page / delete-component (PJ-009)

User reported: `coherent chat "delete account page"` created a new Delete Account feature instead of removing the Account page. Root cause: no deletion type existed in the `ModificationRequest` schema — AI had nowhere to route the request, fell back to feature interpretation.

### Added
- **`delete-page`** — new `ModificationRequest` type in `@getcoherent/core`. Handler in `modification-handler.ts`:
  - Resolves target by id/name/route (same fuzzy match as `--page`)
  - Refuses to delete the root page (`/`) — too destructive, too easy to trigger by accident
  - Deletes the matching `app/<route>/page.tsx` (checks all route groups)
  - Cleans up the empty route directory
  - Removes the page from `design-system.config.pages[]`
  - Backup created automatically (via existing chat-command backup), `coherent undo` restores
- **`delete-component`** — same for shared components. Removes file + manifest entry. Warns about dangling imports on pages.

### Added — parser training
- **RULE 4 in modifier prompt** — explicit DELETE/REMOVE intent block teaching the AI:
  - "delete X page" / "remove X page" / "get rid of X page" → `delete-page`
  - Disambiguation: "add a delete-account page" = feature, "delete the account page" = removal
  - "the" / specific reference → deletion; "a" / "feature to" → feature page

### Tests
964 passing. Type-level coverage of delete-page / delete-component via new `ModificationRequest` union members.

## [0.7.4] — 2026-04-20

### Wiki retrieval (TF-IDF) — AI reads platform memory at chat-time

Memory quality 4.7 → 6.5. AI now receives top-3 most relevant wiki entries (PATTERNS_JOURNAL, ADR, MODEL_PROFILE) injected into every chat prompt, ranked by TF-IDF against the user's message. Past lessons compound without manual effort.

### Added
- **`src/utils/wiki-index.ts`** — TF-IDF index builder. Scans `docs/PATTERNS_JOURNAL.md` (by PJ-NNN heading), `docs/wiki/ADR/*.md` (each ADR as one doc), `docs/wiki/MODEL_PROFILE.md` + `docs/wiki/IDEAS_BACKLOG.md` (by ### section), with YAML frontmatter + code-fence awareness. Tokenizer preserves kebab-case identifiers (Tailwind classes, React components).
- **`scripts/build-wiki-index.mjs`** — standalone postbuild script that emits `dist/wiki-index.json` bundled with the published package. No external deps.
- **`coherent wiki index`** — rebuild retrieval index on demand.
- **`coherent wiki search <query>`** — query the index from CLI. Returns top-N matches with score.
- **Modifier integration** — `modifier.ts` loads the packaged index at chat-time, retrieves top-3 entries for the user's message, injects as "WIKI CONTEXT" in the LLM prompt. Graceful no-op when index absent.

### Why TF-IDF not embeddings (yet)
- Zero dependencies (no Xenova 100MB model, no OpenAI API cost).
- Works offline, testable in CI, instant first-run.
- Captures ~80% of the value — kebab-case identifiers (`bg-primary`, `CardHeader`) already carry high signal for this corpus.
- Upgrade path: `retrieve()` interface is swappable to embeddings in 0.8.x without touching callers.

### Fixed in wiki parser
- Code fences (```yaml) no longer confuse the YAML frontmatter detector.
- Markdown horizontal rules (`---` without key:value following) no longer mistaken for frontmatter delimiters.

### Journal
- **PJ-009** added — `coherent chat "delete account page"` creates a Delete Account feature instead of removing the Account page. Root cause: no `delete-page` type in ModificationRequest schema. Fix planned for 0.7.5.

### Tests
964 passing (+12 for wiki index: tokenizer, scanner, TF-IDF, persistence, frontmatter, code fences). 65 test files.

## [0.7.3] — 2026-04-20

### Wiki W6/W7 + targeted auto-heal guidance

Strengthens the wiki with structured confidence and supersession, and makes auto-heal meaningfully targeted per validator type (not just a generic "fix these" prompt).

### Added — wiki structure
- **YAML frontmatter on journal entries.** `coherent wiki reflect` now emits `--- id/type/confidence/status/date ---` frontmatter above each appended entry.
- **Confidence levels.** `hypothesis | observed | verified | established`. Template asks for it explicitly; audit flags entries missing it.
- **Supersession check in audit.** RULES_MAP rows with `superseded_by: RXXX` must reference real IDs; audit flags orphans.
- Retrofitted all existing PJ-001 … PJ-008 entries with frontmatter + confidence tags.

### Added — auto-heal guidance map
- **`src/utils/auto-heal-guidance.ts`** — per-validator fix guidance for 30+ issue types. When the auto-fix loop calls `ai.editPageCode()`, it now sends targeted remediation pattern for EACH issue type instead of a generic "fix these" prompt.
- Covers all new 0.7.x validators (DIALOG_FULL_WIDTH, SEARCH_ICON_MISPLACED, FILTER_DUPLICATE, CHART_PLACEHOLDER, TABLE_COLUMN_MISMATCH, DOUBLE_SIGN, etc.) plus long-standing ones (RAW_COLOR, TEXT_BASE, NESTED_INTERACTIVE).
- `buildFixInstruction()` groups issues by type, renders per-type sections, appends scope-limit ("fix ONLY the listed issues; do not refactor unrelated code").

### Tests
952 passing (+5 new). 64 test files.

## [0.7.2] — 2026-04-20

### Wiki infrastructure — auto-generated rules map, reflection CLI, audit command

Makes the platform-level LLM wiki semi-automatic. Rules map now derives from code (no more hand-sync drift). Reflection CLI lowers the friction for appending new bug/model/idea entries. Audit command flags wiki rot.

### Added
- **`scripts/generate-rules-map.mjs`** — parses `design-constraints.ts` (rule block names + first-line descriptions) + `quality-validator.ts` (issue types + messages) + `templates/patterns/*.tsx` → emits an auto-generated section in `docs/wiki/RULES_MAP.md`. Runs as part of `npm run build` (postbuild hook) and via `pnpm --filter @getcoherent/cli generate-rules-map`.
- **`coherent wiki reflect`** — opens a reflection template in `$EDITOR` with three sections (bug / model behavior / idea). Filled sections append as structured entries to `PATTERNS_JOURNAL.md`, `MODEL_PROFILE.md`, `IDEAS_BACKLOG.md`. Only runs inside the Coherent source repo.
- **`coherent wiki audit`** — sanity-checks the wiki: missing top-level headers, stub files, PATTERNS_JOURNAL entries without evidence (SHA/screenshot) or fix version, missing AUTO-GENERATED markers, CLAUDE.md not referencing the wiki. Exits non-zero on errors, warnings/info are advisory.

### Tests
947 passing (unchanged — tests added in 0.7.3).

## [0.7.1] — 2026-04-19

### Patterns expansion + platform wiki

Directly prompted by user bugs on Reports/Investments (inconsistent stat-cards) and Create New Budget dialog (full-width modal). Adds 5 more golden patterns and the meta-infrastructure for platform-level decision tracking.

### Added — golden patterns (5 new)
- `templates/patterns/dialog.tsx` — canonical shadcn Dialog with max-w-lg default.
- `templates/patterns/dropdown-menu.tsx` — row actions / context menu (destructive items bottom, with Separator).
- `templates/patterns/alert-dialog.tsx` — destructive confirmations only. Non-destructive prompts use regular Dialog.
- `templates/patterns/sheet.tsx` — side drawer with side="right" default, sm:max-w-md width.
- `templates/patterns/pagination.tsx` — shadcn Pagination with 5-page window + ellipsis.

`pickGoldenPatterns()` now returns 9 total patterns (keyword-scoped).

### Added — validators (3 new)
- `DIALOG_FULL_WIDTH` — flags `<DialogContent|AlertDialogContent|SheetContent>` without a `max-w-*` class.
- `DIALOG_CUSTOM_OVERLAY` — flags `<div className="fixed inset-0 bg-black/...">` when no shadcn Dialog imports are present (tells user to use shadcn primitives).
- `ALERT_DIALOG_NON_DESTRUCTIVE` — flags AlertDialogAction labels that don't match destructive verbs (delete, remove, cancel, logout, etc.).

### Added — CORE constraint
- **OVERLAYS section** — Dialog / AlertDialog / Sheet / Popover / DropdownMenu rules: shadcn primitives only, explicit max-w, AlertDialog only for destructive actions.

### Added — platform wiki
- `docs/PATTERNS_JOURNAL.md` — append-only log of AI-output failure patterns we've observed, root causes, and responses. Format: bug → cause → rule/validator/pattern → version.
- `docs/wiki/README.md` — index and usage guide.
- `docs/wiki/ADR/0001-golden-patterns-over-word-rules.md` — first architectural decision record documenting the v0.7.0 philosophical shift.
- `docs/wiki/MODEL_PROFILE.md` — empirical notes on Claude Sonnet 4's systematic behaviors (what it favours, where it breaks, how prompts respond).
- `docs/wiki/RULES_MAP.md` — living index of every rule in design-constraints.ts with origin bug, validator, golden pattern, version history.

### Tests
947 passing (+14 new for dialog/dropdown/alert-dialog/sheet/pagination + 3 overlay validators). 63 test files.

## [0.7.0] — 2026-04-19

### Foundation: golden patterns, CLI strict mode, change summary, surgical edit guard, table schema rule

Shifts Coherent from "word-based rules interpreted by AI" toward "golden pattern references copied verbatim". The three filter-bar failures in two days prompted this direction.

### Added — golden patterns library
- **`packages/cli/templates/patterns/`** — complete reference implementations for filter-bar, stat-card, empty-state, chart-card. These are documentation for humans AND the AI.
- **`pickGoldenPatterns()`** in `src/agents/golden-patterns.ts` — injects the relevant pattern source into every chat prompt based on keyword match. Only the patterns that match the request ride along, keeping token cost scoped.
- Design constraints now point AI to golden patterns as ground truth, not prose descriptions.

### Added — CLI ergonomics
- **`--allowExcessArguments(false)` on `coherent chat`.** Commander now errors on stray positional args. Fixes the silent-drop bug where \`coherent chat "msg1" --page X "msg2"\` dropped the second message without warning.
- **Post-chat change summary.** After every \`coherent chat\`, shows per-page line-count delta + added/removed imports. Concrete sanity check beyond \`✅ Success!\`.
- **Target-modified verification.** When \`--page X\` is used, compares file content before/after apply. If unchanged → warns the user their instruction may have been misunderstood.
- **Skip-architecture-plan guard.** When \`--page X\` is used and the LLM hits \`RESPONSE_TRUNCATED\`, the CLI no longer falls through to full-project \`splitGeneratePages\` (which would regenerate 15 pages). Instead it surfaces a clear error: "response too large for a single-page edit; be more specific or drop --page".

### Added — design constraint
- **Table column schema rule** in RULES_DATA_DISPLAY — mandates a single \`columns: ColumnDef[]\` array mapped over both header and body. Structurally prevents the TABLE_COLUMN_MISMATCH bug (headers defined, cells forgotten).

### Tests
933 passing (+7 new for golden patterns). 63 test files.

## [0.6.101] — 2026-04-19

### `coherent check --page <name>` — scope check to a single page

### Added
- **`--page <name>` flag on `coherent check`.** Filters the scan to one specific page file using the same `resolvePageByFuzzyMatch` resolver as `coherent chat --page` — so `coherent check --page accounts` (plural) correctly picks up `/account`. Useful for tight feedback loops when iterating on a single page without wading through whole-project output.

### Why
User ran `coherent check --page transactions` (reasonable intuition) and hit `error: unknown option '--page'`. The flag existed on `chat` but not `check`, making parity between commands inconsistent. Fixed.

## [0.6.100] — 2026-04-19

### Filter-bar discipline: rule + 3 validators

Third filter-bar failure from the same user in two days. Root cause: CORE had no explicit layout recipe for toolbars (search + selects + date range), so AI freelanced — produced duplicate filters, uneven heights, and sibling-placed search icons.

### Added — constraint
- **FILTER BAR / TOOLBAR rule in CORE_CONSTRAINTS.** Specifies one row on desktop, flex-wrap layout, ordering (search first, flex-1 widest), uniform h-10 heights, no-Card wrapper, no duplicates, and the canonical search-icon-inside-relative-wrapper pattern. Full example in RULES_FORMS.

### Added — validators (3 new)
- **FILTER_DUPLICATE** — flags when the same filter dimension is rendered as both a `<Select>` and a `<Button>` in a toolbar (e.g., "All Categories" dropdown + "Categories" button).
- **FILTER_HEIGHT_MISMATCH** — flags when filter controls in the same block use different `h-N` classes (mix of h-8/h-9/h-10).
- **SEARCH_ICON_MISPLACED** — flags when `<Search />` / `<MagnifyingGlass />` is rendered as a sibling of `<Input>` (icon ends up above/below the field) instead of absolute-positioned inside a relative wrapper with `pl-9` on the Input.

### Tests
926 passing (+9 new). 62 test files.

## [0.6.99] — 2026-04-19

### Charts, nested-containers ban, number-format discipline, plan-level chart injection, baseline regression detection, report-issue CLI

### Added — constraints & validators
- **No nested bordered containers** (CORE + RULES_CARDS_LAYOUT). Catches the "card-in-card" AI-slop where the section header already sits in a Card and children add another border/shadow. BAD/GOOD examples included in prompt.
- **Chart rules** (CORE + RULES_DATA_DISPLAY). Full pattern: shadcn Chart install, recharts imports, chart-type picking (AreaChart/BarChart/LineChart/PieChart), `var(--chart-1..5)` colors only, fixed heights (h-[200/300/400]), CartesianGrid usage, ChartTooltip/ChartLegend, empty-state pattern, complete example block.
- **Number formatting** (CORE). `Intl.NumberFormat` for money/percent/counts. Ban `toFixed` concat with currency symbols.
- **Mock data location** (CORE). Arrays with 5+ elements must live in `src/data/*.ts`, not inline.
- **Chart placeholder validator** (`CHART_PLACEHOLDER`) — flags "Chart visualization would go here" family of stubs.
- **Empty-box-as-chart validator** (`CHART_EMPTY_BOX`) — flags `<div className="h-[300px] bg-muted"/>` alone.
- **Raw number-format validator** (`RAW_NUMBER_FORMAT`) — flags `${value.toFixed(2)}` next to `$`.
- **Inline mock data validator** (`INLINE_MOCK_DATA`) — flags 5+ element object arrays in app/.
- **Double-sign validator** (`DOUBLE_SIGN`) — flags `${x < 0 ? '-' : '+'}$...` patterns that render as `--` / `++` in UI.
- **TableHead/TableCell mismatch validator** (`TABLE_COLUMN_MISMATCH`) — flags tables with empty-column bug (headers defined, cells forgotten).

### Added — pipeline
- **Plan-level chart auto-injection.** `ensureChartComponentInPlan()` adds a `StatsChart` shared component to `plan.sharedComponents` when the plan has dashboard/analytics/reports pages OR section notes mention chart/graph/trend keywords. Skipped if plan already has a chart component or sharedComponents is at the 12-item cap.
- **Fuzzy page match in `--page` flag.** `resolvePageByFuzzyMatch()` handles plural↔singular (`accounts` → `/account`), prefix (`dash` → `/dashboard`), and route-segment fallback. Fixes the bug where `--page accounts` fell through to full-project regeneration.

### Added — commands & infra
- **`coherent baseline`** — structural regression check. Fingerprints every page by (validator issues, UI imports, shared imports, LOC). Saves to `.coherent/visuals/baseline-YYYY-MM-DD-N.json`. On re-run, compares against latest and reports deltas (new issues, dropped components, significant line-count shrink).
- **`coherent report-issue`** — opens a pre-filled GitHub issue with CLI/project versions, page path, pages list, OS, node version. Options: `--page`, `--screenshot`, `--title`, `--body`, `--no-open`.
- **`check-constraint-budget` postbuild script** — tracks tokens in always-sent rule bundle (CORE_CONSTRAINTS + DESIGN_QUALITY_COMMON + VISUAL_DEPTH + INTERACTION_PATTERNS). Current baseline ~5400 tokens. Warns above 6500, flags 7500+. Informational; never fails CI.

### Tests
917 passing (+64 new for charts/nested-cards/fuzzy match/table mismatch/double sign/baseline/report-issue). 62 test files.

## [0.6.98] — 2026-04-19

### Real cancellation + experimental parallel phases

### Added
- **AbortSignal in `AIProviderInterface`.** Both Claude (Anthropic SDK) and OpenAI providers now accept `{ signal }` on `parseModification()`. When `COHERENT_REQUEST_TIMEOUT_MS` fires (or the user hits Ctrl+C) the in-flight HTTP request is actually aborted instead of running to completion in the background and burning tokens.
- **`withAbortableTimeout()`.** Factory-based helper that creates an `AbortController`, passes the signal to the caller, and aborts on timeout. Used by single-path + Phase 1/3/6 `parseModification` call sites. Phase 2/5 still race-only (follow-up: extend signal to `generateArchitecturePlan` / `generateSharedComponentsFromPlan`).
- **Experimental Phase 3 ∥ Phase 5 parallelization** behind `COHERENT_EXPERIMENTAL_PARALLEL_PHASES=1`. When enabled, shared-component generation starts concurrently with home-page generation using an atmosphere-derived style hint (`renderAtmosphereStyleHint(plan.atmosphere)`) instead of waiting for home-page `styleContext`. Saves ~20-30s on multi-page runs. Default OFF until visual regression benchmark confirms no quality drop.
- **`renderAtmosphereStyleHint()`** — compact style hint (background + accents + spacing + fonts + primary) derived from `plan.atmosphere`. Used as Phase 5 `styleContext` fallback when Phase 3 hasn't finished yet.

### Tests
853 passing (+4 new for `withAbortableTimeout`, `renderAtmosphereStyleHint`). 60 test files.

## [0.6.97] — 2026-04-19

### Progress feedback, request timeouts, clean Ctrl+C

Broad prompts like `coherent chat "create me ui for a financial app"` used to sit on `Parsing your request...` for 30–90s with no visible progress, and a hung LLM would freeze the CLI indefinitely. All fixed.

### Added
- **Broad-intent detection.** `hasBroadAppIntent()` promotes prompts like "create/build/generate … app/website/platform/saas" to the staged `splitGeneratePages` pipeline so the user sees `Phase 1/6…6/6` instead of one frozen spinner. Exposed via `isMultiPageRequest()` — single source of truth for the "is this multi-page?" decision.
- **Spinner heartbeat.** `startSpinnerHeartbeat()` rotates spinner text through time-based stages during any single blocking LLM call. Active in:
  - single-path `parseModification` (Planning → Generating → Writing → Finalizing → Still working @ 150s)
  - Phase 2/6 architecture plan (Grouping → Planning shared components → Still thinking)
  - Phase 3/6 home page (Drafting → Filling sections → Polishing)
  - Phase 5/6 shared components (Building → Writing → Finalizing)
- **Request timeouts.** `withRequestTimeout()` wraps every LLM call. Default 180s, override with `COHERENT_REQUEST_TIMEOUT_MS`. Fails with a clean `RequestTimeoutError` and a tip instead of an infinite hang.
- **SIGINT handler.** Ctrl+C now stops the spinner, releases the project lock, and exits 130 cleanly — no more orphaned spinner frames or stale `.coherent/.lock` files.
- **DEBUG phase timings.** `COHERENT_DEBUG=1` prints per-phase elapsed time (e.g. `[timing] Phase 3 Home page: 38.2s`) so bottlenecks are visible.
- **Non-TTY progress.** In CI or piped output, heartbeat stages mirror to stderr as `… Planning page structure...` lines — progress reaches logs even when the spinner frame is invisible.

### Changed
- **Multi-page keyword threshold 4 → 3.** Three mentioned page names (e.g. "dashboard, settings, pricing") is already enough output to risk JSON truncation in a single-shot call; route them through the split pipeline.

### Fixed
- **Heartbeat respects `spinner.isSpinning`** — won't overwrite text on a spinner the caller has already failed/succeeded.
- **Stale test for public layout width** — test asserted `max-w-7xl` but the layout was intentionally changed to full-width in v0.6.96.

### Tests
845 passing (+32 new for heartbeat, broad-intent, multi-page detection, timeout, debug timer). 60 test files.

## [0.6.96] — 2026-04-18

### Design recommendations engine + DS Quick Links consistency

### Added
- **`design-recommendations.ts`** — deterministic project analyzer. Runs automatically at the end of `coherent check` and writes `recommendations.md`. 10 checks: color system, empty states, layout variety, component reuse, spacing consistency, typography hierarchy, dark mode, interaction states, responsive breakpoints, accessibility.

### Fixed
- **Quick Links counters unified** — all counters in title, arrow always `→` (scannable right-aligned column).
- **Landing/root layout is now full-width** — removed `max-w-7xl` wrapper so marketing pages control their own container widths.
- **DS button placement** — consistent across root layout template and all public pages.

## [0.6.94] — 2026-04-18

### Quality Overhaul — competitive gap closure + 5 bug fixes

Driven by competitive analysis vs ui-ux-pro-max-skill (67K stars, 161 rules). Closes accessibility, interaction, and performance gaps while fixing all 5 known E2E bugs.

### Fixed
- **primaryHint reaches page generation.** `renderAtmosphereDirective()` now emits primary color directive ("Use zinc tones for --primary token").
- **Negative dates "-2341m ago" → clean format.** `formatRelative` helper guards `d < 0` for future-dated mock data.
- **--page refine ~50% failure → graceful handling.** `resolveTargetFlags` sends "generate from scratch" message instead of empty code block when page file missing.
- **FilterBar contract drift.** `filterManifestForPage` overlays plan's authoritative props interface onto stale manifest entries.
- **Plan cap raised 8→12.** Prevents sharedComponents validation failure when existing plan + AI additions exceed old limit.
- **Phase 4.5 → Phase 5.** Renumbered pipeline phases to clean 1-6 sequence (no fractional phases).

### Added
- **9 quality rules** (closes gaps vs ui-ux-pro-max-skill):
  - Pre-gen: aria-label on icon buttons, 44px touch targets, no emoji in UI, loading states for async buttons, escape routes in dialogs, prefers-reduced-motion
  - Post-gen validator: MISSING_ARIA_LABEL, SMALL_TOUCH_TARGET, EMOJI_IN_UI checks
- **Token regeneration from atmosphere.primaryHint.** "zinc" → `--primary: #18181b`. 8 color presets: zinc, emerald, indigo, rose, amber, teal, violet, slate. Buttons, links, focus rings change to match mood.
- **Industry mood presets.** Healthcare → soft-warm/blue, ecommerce → minimal-paper/amber keywords auto-detected by `extractAtmosphereFromMessage`.
- **prefers-reduced-motion** in scaffold globals.css (both v3 and v4 paths).
- **color-presets.ts** — new utility: primaryHint → hex mapping with light/dark variants.

### Tests
813 passing (+22 new). 60 test files.

## [0.6.93] — 2026-04-16

### Fixed
- **Tailwind v4 global border rule leaked onto every element.** Scaffolded `app/globals.css` had `* { border-color: var(--border); }` at the **top level** (outside any `@layer`). Tailwind v4 cascade layers put unlayered rules AFTER all layered utilities — so this rule overrode `.border-transparent` (and similar). Symptom: every shadcn `TabsTrigger` (which uses `border border-transparent` as layout-stability placeholder) showed a visible `--border` outline on inactive tabs. Fix: wrap the `*` + `body` block in `@layer base { ... }` in both `tailwind-version.ts` v4 generator and the existing Projector file.

### Added
- **Metrics-position rule in `DESIGN_QUALITY_APP`.** New section: when a page has BOTH a summary metrics strip AND a detail view (table/list/grid), metrics MUST go ABOVE the detail view. Stops the AI from placing Total/InProgress/Completed/HighPriority cards at the bottom of the Tasks page (observed in v0.6.92 generation) — an anti-pattern that forces users to scroll past all data before seeing the summary.

### Rationale
Two visible UX bugs spotted while reviewing the v0.6.92 Projector screenshots:
1. Settings tabs rendered outlined rectangles for inactive tabs (user: "I've never seen shadcn tabs look like this"). Root cause: cascade-layer leak, fixed at scaffold level.
2. Tasks page stats strip at the bottom, below the table (user: "I've never seen such cards placed at the bottom"). Root cause: no rule enforcing stats-above-detail ordering, added to app-type design quality block.

## [0.6.92] — 2026-04-16

### Added
- **First-class `atmosphere` field on the architecture plan.** New `AtmosphereSchema` captures `moodPhrase`, `background`, `heroLayout`, `spacing`, `accents`, `fontStyle`, and `primaryHint`. The plan AI extracts these from the user message; a deterministic fallback (`extractAtmosphereFromMessage`) catches mood phrases the AI missed (e.g. "premium and focused, Notion meets Linear" → `dark-zinc / split-text-image / tight / monochrome / mono-labels / zinc`). Persisted in `.coherent/plan.json` so refinements inherit it.
- **Atmosphere directive prefixes every page generation.** `renderAtmosphereDirective` produces an imperative block ("Dark sections use bg-zinc-950. NO pure white. NO gradient backgrounds.") that goes FIRST in both anchor-page and per-page Phase-5 prompts. Replaces the previous structure where mood was buried mid-prompt under 6 tiers of constraints — primacy bias was working against atmospheric directives. Block is suppressed when atmosphere is fully default (no token waste).

### Fixed
- **Mood directives ignored in generated output.** Root cause: the `MOOD → CONCRETE CSS` table added in 0.6.91 was inside `DESIGN_THINKING`, ~250 lines into the system prompt — past the AI's primacy window. Even when present, the mood was treated as one constraint among many. New atmosphere block is a single short directive at prompt position #2 (right after page name), with explicit "REJECT these defaults" enumeration of generic-SaaS patterns to avoid.

### Rationale
Three sequential E2E tests (v0.6.88, v0.6.89, v0.6.90) all produced visually identical "AI-generic SaaS" landings despite explicit "premium, Notion meets Linear" in the prompt. Functional rules (typography, semantic tokens, dates) translated cleanly; visual/atmospheric rules did not. This release moves atmosphere from "one rule among many" to "first directive, deterministic fallback, persisted in plan." Tests: +9 (atmosphere extraction + directive rendering).

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
