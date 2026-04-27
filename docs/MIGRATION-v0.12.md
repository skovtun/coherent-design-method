# Migrating to Coherent v0.12.0+

## TL;DR — what to do

- **You don't parse skill-rail output AND don't script around session lifecycle stdout.** No action needed. Upgrade with `npm install -g @getcoherent/cli@latest`.
- **You parse skill-rail output (custom Claude Code skill, automation that scrapes CLI text).** See "Update your regex patterns" below — 6 message format strings changed. Estimated effort: 5-10 minutes.
- **You script around session lifecycle stdout (`Session UUID started/ended at TIMESTAMP` patterns).** See "Switch to RunRecord JSON" below. Migrate to reading `.coherent/runs/<timestamp>.yaml` for stable structured fields.
- **You upgraded directly from v0.10.x or earlier.** First upgrade to v0.11.5, then follow this guide.

## Context

If you are on v0.11.x and upgrading to v0.12.0 or later, this guide covers the breaking changes you need to handle.

If you are on v0.10.x or earlier, upgrade to v0.11.5 first, then follow this guide.

## What changed

v0.12.0 finalized the apply-requests extraction (ADR-0005 PR1). Both rails (API rail = `coherent chat`, skill rail = `/coherent-chat` via Claude Code) now share a single dispatch path through `applyRequests()`. Six classes of behavior drift between the rails were collapsed structurally.

The user-visible change is that the skill rail now emits the same status messages the API rail does. Pre-v0.12.0 the skill rail had its own concise format; post-v0.12.0 it uses the canonical format that was previously API-rail-only.

## BREAKING — skill-rail status message format

If your tooling parses skill-rail output (custom Claude Code skills, automation that scrapes CLI output, dashboards), update your patterns. Six message strings changed:

| Operation | Old (v0.11.x) | New (v0.12.0+) |
|---|---|---|
| delete-page | `delete-page: Transactions ✓` | `Deleted page "Transactions" (/transactions). Nav updated. Run \`coherent undo\` to restore.` |
| delete-component | `delete-component: CID-009 ✓` | `Deleted shared component "FeatureCard" (CID-009). Pages importing it will break — regenerate them with \`coherent chat --page X "remove FeatureCard usage"\`.` |
| update-token | `update-token: colors.light.primary ✓` | `Updated token colors.light.primary from #X to #Y` |
| add-component | `add-component: CtaButton ✓` | `Registered component CtaButton (cta-button)` |
| modify-component | `modify-component: <id> ✓` | `Updated component <name> (<id>)` (or specific failure message) |
| delete-page (root refusal) | `refusing to delete root page` | `Refusing to delete the root page (/). If you really want this, edit design-system.config.ts manually.` |

## What you need to do

### If you parse skill-rail output

Update your regex patterns. Before:

```regex
/delete-page: (.+) ✓/
/delete-component: (CID-\d+) ✓/
/update-token: ([\w.]+) ✓/
```

After:

```regex
/Deleted page "(.+?)" \(/
/Deleted shared component "(.+?)" \((CID-\d+)\)/
/Updated token ([\w.]+) from/
```

The new format is canonical and stable going forward — both rails produce it. Future BREAKING changes to message format will be documented in a versioned `MIGRATION-vX.Y.md` file at the repository root.

### If you script around session lifecycle output

Pre-v0.12.0 you may have parsed `Session UUID started` / `Session UUID ended at TIMESTAMP` patterns. These are still emitted by `coherent session start/end` but are designated **internal** as of v0.12.0. The supported public surface is the `RunRecord` JSON written to `.coherent/runs/<timestamp>.yaml`.

If you depend on stdout patterns, switch to reading the RunRecord file. It contains structured fields (`outcome`, `durationMs`, `modified`, etc.) that are stable across releases.

### If you reach into private internals

The following symbols changed status or were dropped in v0.12.0. None of them were ever part of the documented public API; this section exists to head off monkey-patching workflows that may have reached into them.

- `applyModification` from `commands/chat/modification-handler.ts` is no longer imported by `chat.ts` directly. It still exists internally to delegate AI-dependent request types from `apply-requests/dispatch-ai.ts`, but reaching into it from external code is unsupported and may break in a future minor release.
- `applyDeletePage` and `applyDeleteComponent` were skill-rail-private helpers in `phase-engine/appliers.ts` (not exported). Both are deleted in v0.12.0 — behavior is now provided by the shared `apply-requests/dispatch.ts` module. If you somehow imported these your build now fails.
- `applyManagerResult` was extracted from `commands/chat/modification-handler.ts` to `apply-requests/managers.ts` and is re-exported from `apply-requests/index.ts`. The export is intentional but the API is **unstable** — this helper may change shape or move again in v0.14.x as the apply-requests layer matures. Do not depend on its signature for stable code paths.

If your project monkey-patches Coherent internals via require-cache shenanigans (rare but legitimate for test harnesses), expect breakage and migrate to the public API. There is no supported workaround.

## What did NOT change

- `coherent init`, `coherent chat`, `coherent fix`, `coherent preview`, `coherent export` — same flags, same behavior, same exit codes.
- `design-system.config.ts` schema is unchanged.
- `coherent.components.json` (manifest) schema is unchanged.
- Generated project structure (`app/`, `components/shared/`, `components/ui/`) is unchanged.

## New features in v0.12.0

- **`COHERENT_E007_NO_AI_REQUIRES_PREPOPULATION`** — skill rail now throws this typed error when an AI-dependent request reaches `applyRequests` in `'no-new-ai'` mode without pre-populated output. Pre-v0.12.0 such requests were silently dropped; this is a strict structural improvement. See `docs/error-codes.md` for the full registry.
- **Drift-gate fixtures** at `packages/cli/src/apply-requests/__tests__/fixtures/deterministic/*.json` pin the contract for the 6 deterministic request types. Regression-resistant.
- **Adversarial-review fixes** shipped late in v0.12.0: `add-layout-block` added to `AI_TYPES` (closing a silent-drop gap), `modify-component` parity-gate fixture tightened.

## Known limitations carried forward to v0.13.0

These were documented in the v0.12.0 CHANGELOG and are scheduled for v0.13.0:

1. Zombie deterministic case bodies in `commands/chat/modification-handler.ts` (1344 lines). Will be deleted in v0.13.0+ structural collapse.
2. No real-AI smoke test (queued for v0.13.0 with fake provider + real-AI corpus).
3. `CoherentError.fix` and `.docsUrl` were not surfaced in caller catches pre-v0.13.0 — fixed in v0.13.0 via `renderCliError` boundary helper.

If you hit any of these in production, file an issue at https://github.com/skovtun/coherent-design-method/issues — they are tracked and being closed.
