# Coherent Error Codes

Every user-facing error Coherent throws carries a stable `COHERENT_E<NNN>` code. The code never changes across releases once allocated. Each entry below shows **when you see it**, **why it fires**, **how to fix**, and a link back to the relevant skill or command.

The CLI renders errors with the full layout inline — code, one-line problem, why, fix, docs URL. This file is the landing target for the `Docs:` URL each error prints.

<!-- Not retrieval-indexed: this is a user reference, not context for generation. Keep it out of `docs/wiki/` and `prompt-builders/wiki-context.ts`. -->

---

## COHERENT_E001 — No AI key available

**When you see it:** running `coherent chat "..."` without `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) set in the environment or stored in `.env`.

**Why:** `coherent chat` makes API calls to Anthropic (or OpenAI) directly. Without a key, it cannot proceed.

**Fix options:**

1. **Use Claude Code skill mode instead (no API key required).** If you already pay for Claude Pro/Max/Free via the subscription, open this project in Claude Code and type:

   ```
   /coherent-chat "describe your app"
   ```

   Your Claude Code session does the generation. Coherent contributes constraints + validation. Nothing is billed on Coherent's side.

2. **Add an API key.** Run:

   ```bash
   coherent auth set-key sk-ant-...
   ```

   The key is stored in the project's `.env` (already in `.gitignore`). Re-run `coherent chat`.

**Related:** [COHERENT_E002](#coherent_e002--another-coherent-session-is-active) (session locked), `/coherent-chat` skill at `.claude/skills/coherent-chat/SKILL.md`.

---

## COHERENT_E002 — Another coherent session is active

**When you see it:** running `coherent session start` (or `coherent chat`) while a skill-mode session is still open on the same project.

**Why:** Coherent holds a project-wide lock (`.coherent.lock`) between `session start` and `session end` so two runs can't corrupt each other's state (`design-system.config.ts`, `coherent.components.json`, generated TSX). The lock is shared by both the chat rail and the skill rail.

**Fix options:**

1. **Finish the active session.** Look at the lockfile to find the active session UUID, then:

   ```bash
   coherent session end <uuid>
   ```

2. **The session is abandoned (Claude Code crashed, user Ctrl-C'd).** Delete the lockfile manually:

   ```bash
   rm .coherent.lock
   ```

   The session dir under `.coherent/session/<uuid>/` stays intact so you can inspect or reuse partial artifacts. Subsequent `coherent session start` works immediately.

The lock is automatically released when `session end` completes — even on applier error, as of v0.9.0. If you see this error after a clean `session end`, re-run the command; if it persists, report the session UUID.

**Related:** `coherent session start --help`, `PERSISTENT_LOCK_STALE_MS` (60-minute auto-reclaim).

---

## COHERENT_E003 — `coherent _phase ingest` received empty stdin

**When you see it:** running `coherent _phase ingest <name> --session <uuid>` with an empty, whitespace-only, or unpiped stdin.

**Why:** The ingest step parses the AI response from stdin. When the pipe is empty, there is nothing to parse and the phase can't advance.

**Fix options:**

1. **Write the AI response to a file first, then pipe it:**

   ```bash
   # Produce the response
   echo "<model output>" > /tmp/plan-response.md
   # Pipe it in
   coherent _phase ingest plan --session "$UUID" < /tmp/plan-response.md
   ```

2. **Inside Claude Code**, the `/coherent-chat` skill handles this automatically. If you hit E003 there, the skill wrote an empty response file — regenerate the phase's prep output and try again.

**Related:** [COHERENT_E004](#coherent_e004--phase-engine-protocol-mismatch) (protocol mismatch — a common cause of a phase producing no output), skill markdown at `.claude/skills/coherent-chat/SKILL.md`.

---

## COHERENT_E004 — Phase-engine protocol mismatch

**When you see it:** running `coherent _phase` with a `--protocol N` value that differs from the CLI's current `PHASE_ENGINE_PROTOCOL`.

**Why:** The skill markdown (`.claude/skills/coherent-chat/SKILL.md`) embeds the protocol version it was written against. The CLI's phase-engine advances its protocol when the contract changes. Mismatch means the skill and the CLI disagree on artifact shapes, command output, or ingest parsers — running anyway would silently corrupt the session.

**Fix options:**

1. **Refresh the skill markdown to match the installed CLI.** Run:

   ```bash
   coherent update
   ```

   Writes the latest `.claude/skills/coherent-chat/SKILL.md` and `.claude/commands/coherent-chat.md` into the project. Start a new session.

2. **Upgrade the CLI globally if the markdown is newer than your install:**

   ```bash
   npm install -g @getcoherent/cli@latest
   ```

   Then re-run the phase call.

The mismatch is always caught at the first `_phase` invocation — before any state-mutating work. Nothing needs cleanup; just resolve the version skew and retry.

**Related:** [ADR-0005](./wiki/ADR/0005-chat-ts-as-facade-over-runpipeline.md) (chat.ts as facade), R5 protocol guard (commit `ccab240`).

---

## COHERENT_E005 — Session schema version mismatch

**When you see it:** a session directory exists (e.g. from an older CLI version) whose `session.json.schemaVersion` is incompatible with the installed CLI.

**Why:** Sessions are ephemeral by design — they hold in-progress phase artifacts, not long-term state. Across CLI upgrades we may change the session schema. Rather than auto-migrating (complex + risky), we reject the mismatched session and ask the user to start a new one.

**Fix options:**

1. **Discard the old session and start fresh:**

   ```bash
   rm -rf .coherent/session/<uuid>/
   coherent session start --intent "..."
   ```

   Nothing is lost that wasn't already lost — sessions only hold the in-progress state of a not-yet-completed run.

**Related:** `coherent session start --help`, [COHERENT_E002](#coherent_e002--another-coherent-session-is-active).

---

## COHERENT_E006 — Session artifact missing on resume

**When you see it:** skill-mode auto-resume (future path) detects a session in `awaiting-ingest` status but the expected input artifact (e.g. `anchor-input.json`, `pages-input.json`) is absent.

**Why:** A previous run wrote the session marker but failed to persist the artifact a downstream phase needs. Likely causes: a crash between `_phase ingest plan` completing and `anchor-input.json` being written, a manual edit that deleted the file, or a filesystem sync hiccup.

**Fix options:**

1. **Restart the session from the last complete phase.** Delete the session and start fresh:

   ```bash
   rm -rf .coherent/session/<uuid>/
   coherent session start --intent "..."
   ```

2. **Preserve the session for debugging** (if you need to understand what happened):

   ```bash
   coherent session end <uuid> --keep
   ```

   The session dir survives. Restart a new session in parallel and inspect the old one at leisure.

**Related:** ADR-0005 (session lifecycle), canonical design doc R2 (artifact-deferred config mutation), [COHERENT_E005](#coherent_e005--session-schema-version-mismatch).

---

## COHERENT_E007 — applyMode 'no-new-ai' received an AI-dependent request without pre-populated output

**When you see it:** the skill rail (which runs without an AI provider) received a `ModificationRequest` whose type is AI-dependent (`add-page`, `update-page`, `modify-layout-block`, `link-shared`, `promote-and-link`) but the request did NOT carry pre-populated deterministic output (`changes.pageCode` for add/update-page, `changes.layoutBlock` for modify-layout-block).

**Why:** The skill rail and the API rail share the same `apply-requests` entry point but run with different `applyMode` settings. API rail (`coherent chat`) has an AI provider available and runs in `'with-ai'` mode — non-pre-populated requests are fine, the provider fills in the output mid-dispatch. Skill rail (`/coherent-chat` via Claude Code) has NO provider and runs in `'no-new-ai'` mode — every AI-dependent request must arrive with its output already filled in by the upstream skill phase. Pre-v0.12.0 the skill rail silently dropped these requests on the floor; since v0.12.0 it throws E007 loudly so the producer-side bug surfaces immediately.

**Fix options:**

1. **You hit this from a skill-rail invocation.** This is a producer bug — the upstream phase failed to populate the deterministic output. File an issue with the skill name + request type. As a workaround: re-run via `coherent chat` (API rail) which has the provider available.

2. **You hit this from custom code calling `applyRequests` directly.** Switch to `applyMode: 'with-ai'` if you have a provider set up, or pre-populate the request's `changes.pageCode` / `changes.layoutBlock` field before calling `applyRequests`.

3. **The request type is `link-shared` or `promote-and-link`.** These cannot be pre-populated — they always require AI to pick the insertion site / extract the JSX. Use the API rail.

**Related:** ADR-0005 (rail parity), v0.12.0 release notes (apply-requests extraction), `packages/cli/src/apply-requests/dispatch-ai.ts`.

---

## Appending a new code

Every code is append-only. Never re-assign an existing number, even when the error is removed — leave a tombstone comment (`<!-- E007 retired in v0.10.0, no replacement -->`) so old references in issues / PR reviews / Slack threads still resolve to the right slot.

Adding a new user-facing error:

1. Pick the next free `E0NN` in numeric order.
2. Add it to `COHERENT_ERROR_CODES` in `packages/cli/src/errors/codes.ts`.
3. Write its docs section here, matching the shape above (When you see it / Why / Fix options / Related).
4. Throw it via `new CoherentError({ code, message, cause?, fix })` — `docsUrl` auto-populates from `code` via `docsUrlFor()`.
5. Cover the throw with a test that asserts `instanceof CoherentError` and the code value.

See [CoherentError source](../packages/cli/src/errors/CoherentError.ts) for the base class.
