# Dogfood the v0.9.0 skill-mode rail

Walk the full skill-mode phase rail end-to-end with the `coherent` CLI, feeding
prompts to your model by hand. Use this before the Tier 1 parity harness lands
(Lane D) to confirm the rail actually works on a real project.

This is the human-driven equivalent of what the `coherent-chat` Claude
Code skill does automatically.

## Prerequisites

- You're in a fresh Coherent project (`coherent init my-project && cd my-project`).
- `coherent` CLI is on your PATH and reports v0.9.0+ (`coherent --version`).
- You have access to a model you can copy prompts into (Claude.ai, ChatGPT,
  Claude Code, anything). No API key needed on the CLI side.

## Steps

**1. Start a session.**

```bash
UUID=$(coherent session start --intent "build a small CRM dashboard with pricing page")
echo "$UUID"
# → e.g. 7c9b4a10-1f22-4e1b-8f8f-abc123def456
```

Verify the session dir exists and contains the start-time snapshots:

```bash
ls -la .coherent/session/"$UUID"/
# Expected: session.json intent.txt options.json config-snapshot.json hashes-before.json
```

`.coherent.lock` is now held. A second `coherent session start` in the same
project will bail with "Another coherent process is running".

**2. Plan phase (AI).**

```bash
coherent _phase prep plan --session "$UUID" > /tmp/plan-prompt.md
```

`/tmp/plan-prompt.md` is the full plan-phase prompt (Tier 0–2 constraints +
plan-only instructions). Paste the contents into your model. Capture the JSON
response verbatim:

```bash
# Write the response into /tmp/plan-response.md
coherent _phase ingest plan --session "$UUID" < /tmp/plan-response.md
```

Verify: `.coherent/session/$UUID/plan.json` exists with `pageNames`,
`navigationType`, `appName`. A `config-delta.json` sibling holds the pending
config patch.

**3. Anchor phase (AI).**

Picks the entry-point page. Same prep → respond → ingest cycle:

```bash
coherent _phase prep anchor --session "$UUID" > /tmp/anchor-prompt.md
# ... model produces response ...
coherent _phase ingest anchor --session "$UUID" < /tmp/anchor-response.md
```

Verify: `anchor.json` under the session dir.

**4. Extract-style phase (deterministic).**

No model call — pure transform over the anchor artifact:

```bash
coherent _phase run extract-style --session "$UUID"
```

Verify: `style.json` (or similarly-named style artifact) under the session dir.

**5. Components phase (AI).**

```bash
coherent _phase prep components --session "$UUID" > /tmp/components-prompt.md
# ... model produces batch component response ...
coherent _phase ingest components --session "$UUID" < /tmp/components-response.md
```

Verify: `components-generated.json` lists the shared components the model
produced (Header, Footer, etc.). Actual file writes happen at `session end`.

**6. Page phase (AI, repeat per page).**

Read `plan.json` to get the page IDs. For each:

```bash
for PAGE_ID in $(jq -r '.pageNames[].id' .coherent/session/"$UUID"/plan.json); do
  coherent _phase prep "page:$PAGE_ID" --session "$UUID" > "/tmp/page-$PAGE_ID-prompt.md"
  # paste the prompt into your model, capture response
  coherent _phase ingest "page:$PAGE_ID" --session "$UUID" < "/tmp/page-$PAGE_ID-response.md"
done
```

Verify: `page-<id>.json` per page in the session dir.

**7. Log-run phase (deterministic).**

```bash
coherent _phase run log-run --session "$UUID"
```

Verify: `run-record.json` under the session dir.

**8. End the session.**

```bash
coherent session end "$UUID"
```

This is where the disk mutations happen: config-delta applies to
`design-system.config.ts`, components materialize under `components/shared/`,
pages materialize under `app/*/page.tsx`, `.coherent/runs/<ts>.yaml` gets a
run record, the project lock releases, the session dir is deleted.

## Verifying it worked

- `coherent check` passes (no banned colors, no anti-patterns).
- `.coherent/runs/<ts>.yaml` exists, matching your intent.
- `next dev` boots and the generated pages render.
- Compare the artifact set against `coherent chat "build a small CRM ..."`
  against a fresh project. Differences flag Lane D parity gaps.

## Common failures

- **`Another coherent process is running` on session start.** A prior session
  died without `session end`. Check the `.coherent.lock` PID with
  `cat .coherent.lock` — if that PID is dead, `rm .coherent.lock` and retry.
  The lock staleness check (`LOCK_STALE_MS` = 5 min) also clears it
  automatically on the next start attempt.
- **`Session <uuid> not found` on `_phase` or `session end`.** You typo'd the
  UUID or ran `session end` already. Inspect `ls .coherent/session/`.
- **`ingest: empty stdin`.** Your response file is empty or whitespace-only.
  Regenerate and re-pipe.
- **`Protocol mismatch`.** The skill-markdown or shell script was written
  against a different `PHASE_ENGINE_PROTOCOL` version than the CLI. Upgrade
  one side.
- **Page phase `page:<id>` returns "Unknown phase".** You passed a name
  without the `:<id>` suffix, or the ID has whitespace. Quote the argument.
- **`session end` fails mid-apply.** The session dir stays intact (no
  `--keep` needed on failure). Inspect artifacts, fix the broken one, rerun
  `session end "$UUID"`.

## Tearing down after a failed run

If a session is wedged and you want to start clean:

```bash
rm -f .coherent.lock
rm -rf .coherent/session/<uuid>
```

The run record under `.coherent/runs/` is NOT cleaned up — those persist as
the journaling trail.

## See also

- `.claude/skills/coherent-chat/SKILL.md` — the Claude Code skill that
  automates this runbook end-to-end.
- `docs/wiki/ADR/` — architectural decisions behind the phase rail.
- `docs/runbooks/cut-release.md` — how to ship a CLI version bump.
