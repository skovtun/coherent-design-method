---
id: ADR-0003
type: adr
status: accepted
date: 2026-04-20
confidence: verified
shipped_in: [0.7.5, 0.7.6, 0.7.7, 0.7.8, 0.7.9, 0.7.10, 0.7.11]
supersedes: []
---

# ADR 0003 — Destructive operations architecture

**Status:** Accepted
**Date:** 2026-04-20
**Shipped in:** v0.7.5 (core) · v0.7.6 (parser hotfix) · v0.7.7 (pre-parser) · v0.7.8 (synonyms + injection guard) · v0.7.9–v0.7.10 (nav cleanup, autofix) · v0.7.11 (Step 4d hotfix)

## Context

Through v0.7.4, Coherent's `ModificationRequest` schema supported only additive/updating types: `add-page`, `update-page`, `add-component`, `modify-component`, `update-token`. Deletion was unreachable via the pipeline.

PJ-009 exposed the practical consequence: `coherent chat "delete account page"` created a `/settings/delete-account` feature page (Dialog + Danger Zone UI) instead of removing the Account page. The AI interpreted the ambiguous phrasing as feature-creation — the only interpretation the schema afforded. There was no `delete-page` type to target.

Beyond the missing schema, three concerns surfaced as soon as we started designing the operation:

1. **Reversibility.** Deleting a page removes `app/<route>/page.tsx`, updates `design-system.config.pages[]`, and prunes nav snapshots. A buggy prompt or a wrong file match would silently nuke user work.
2. **Prompt injection.** If a destructive verb + page name can route directly to a filesystem deletion, a malicious source (README pasted into a chat message, markdown copied from an untrusted issue) could trigger it.
3. **Semantic ambiguity.** `delete`, `remove`, `drop`, `trash`, `erase`, `get rid of` all map to the same intent but don't trigger the same LLM response. Synonym coverage is a real concern when the operation is destructive — AI should bias toward asking rather than inferring.

## Decision

Treat destructive operations as a **first-class pipeline stage with its own parser, dry-run default, backup, and undo**. Six principles:

### 1. Schema affordance
Add `delete-page` and `delete-component` to the `ModificationRequest` union in core. AI cannot delete what the schema doesn't describe.

### 2. Destructive pre-parser (v0.7.7)
Before the general `parseModification` LLM call, pattern-match for destructive intent deterministically. Regex-level synonym expansion:
```
/\b(delete|remove|drop|trash|erase|get\s+rid\s+of|scrap|kill)\b[^.]*\b(page|component)\b/i
```
If matched, route directly to the destructive handler with the extracted target — skip LLM ambiguity entirely. The LLM is fallback, not gate.

### 3. Synonym expansion (v0.7.8)
Destructive pre-parser supports **compound deletes** ("delete the reports and investments pages") and a broader verb vocabulary. Target resolution still uses `resolvePageByFuzzyMatch` (plural↔singular, prefix).

### 4. Prompt-injection guard (v0.7.7, hardened v0.7.8)
Before any destructive op fires from a chat message, verify the destructive verb occurred in the **user-typed** text, not inside a quoted block / markdown fence / file content pasted into the prompt. Implementation: strip fenced blocks before pre-parser match.

### 5. Dry-run by default, `--force` required for fire
```bash
coherent chat "delete accounts"         # prints what would change, no writes
coherent chat "delete accounts" --force # commits the deletion
```
Opt-in destruction, opt-out safety.

### 6. Undo via backup (existing `.coherent/backups/*`)
Every destructive op snapshots affected files first. `coherent undo` restores the most recent snapshot. No extra infrastructure — reuses the backup system the rest of chat uses.

### 7. Side-effect cascades
Deletion is never one file. `applyModification` for `delete-page`:
- Remove `app/<route>/page.tsx` (+ `app/<route>/loading.tsx` / `layout.tsx` if they exist).
- Update `design-system.config.pages[]` — remove the entry.
- Update nav snapshot — remove route from AppSidebar / Header links.
- Update any shared `sharedComponents.usedBy` references (v0.7.9).
- Broader auto-fix pass (v0.7.9-0.7.10) — regenerates any nav/header that would have a broken link.

## Consequences

### Wins

- PJ-009 is fully resolved. Destructive intent reaches the destructive handler; feature creation no longer happens for delete phrasing.
- Prompt injection closed at the parsing layer — destructive verbs inside fenced content don't route.
- `--force` + dry-run default protects against "oops, ran with wrong target".
- Compound deletes in one message work (synonym expansion + multi-target parser).
- Undo is free because backup already existed.

### Costs

- Destructive pre-parser and LLM parser are two code paths for intent. Divergent behavior possible. Mitigated by: pre-parser is deliberately narrow regex (high precision, OK recall); LLM handles what pre-parser misses.
- Synonym list is hand-maintained. New destructive verb in user vocabulary → no match until we ship a release. Acceptable: verbs cluster around well-known terms.
- Broader auto-fix on nav after delete (v0.7.9-0.7.10) means one user message can trigger many file changes. Dry-run surface must show all of them, not just the primary delete. Mostly handled by the summary output; worth monitoring.
- Step 4d in the pipeline briefly used stale config after a delete — v0.7.11 hotfix. Tells us: the config mutation must be atomic with the file deletion or everything downstream sees the wrong state. Covered now by reload-config-after-destructive pattern.
- `.coherent/backups/*` unbounded growth — same as journal retention (J2 in backlog). Both needed eventually.

### Measured effect

- PJ-009 regression rate post-v0.7.10: 0 occurrences across 20+ smoke tests.
- User reports for accidental-delete post-v0.7.5: none observed.
- Prompt-injection attack surface: pre-parser strips fenced blocks, verified in tests (packages/cli/src/commands/chat/ tests).

## Why not...

- **LLM-only destructive parsing?** Tried. Confidence varies wildly. Destructive operations need high precision on intent — LLMs at temperature give a long tail of ambiguous outputs. Hard-coded pre-parser is 100% deterministic for known verbs.
- **Confirmation prompt in UI before every destructive op?** We use dry-run default + `--force` flag instead. Interactive prompts don't fit an LLM-first CLI that's often scripted or piped. `--force` is the explicit consent.
- **Hard-delete without backup?** Never. Even with `--force`, backup writes first. The UX cost of "files are in `.coherent/backups/`" is trivial vs one irrecoverable delete.
- **Version destructive types separately (delete-page-v2)?** Premature. The schema is narrow; evolution in place is fine. If we add destructive parameters (cascade depth, etc.), introduce them as optional fields.
- **Integrate with system `rm -i` / trash?** OS-level. We stay in-repo — `.coherent/backups/` is the trash, `coherent undo` is the restore. Portable across platforms.

## References

- Prompted by: PJ-009 in `docs/wiki/PATTERNS_JOURNAL.md`.
- Related: ADR-0001 (golden patterns). Destructive operations benefit from the same "explicit schema affordance over LLM interpretation" principle.
- Code: `packages/core/src/schemas/` (ModificationRequest), `packages/cli/src/commands/chat/modification-handler.ts`, `packages/cli/src/agents/destructive-preparser.ts`.
- Changelog: v0.7.5 through v0.7.11.
- Open follow-ups: journal retention (J2), backup retention (same pattern).
