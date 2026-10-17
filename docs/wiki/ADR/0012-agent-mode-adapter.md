---
id: ADR-0012
type: adr
status: proposed
date: 2026-10-17
confidence: verified
shipped_in: []
---

# ADR 0012 — Agent mode: governance as an adapter over a host-neutral core

**Status:** Proposed (spike on `feat/governance-graph`)
**Date:** 2026-10-17

## Context

ADR-0011 moved design authorship to the coding model. `coherent edit` still embedded its own small model (route + apply) inside the CLI; the user's question was whether Coherent can be used entirely by prompting an agent ("Set Agent" in the Claude Code desktop app) instead of commands. Codex reviewed the plan (2026-10-17) and rejected "agent mode as the primary architecture": prompts and hooks are not enforcement, and a Claude-specific core would just swap CLI coupling for host coupling.

## Decision

1. **One host-neutral core** (`governance/session.ts`): `beginEdit` (declared write set → impact, baselines, "before" renders, transaction), `verifyEdit` (`fast`: write set, new type errors, new identity leaks; `final`: + production build, renders, pixel diff → verdict, commit unless failed), `rollbackEdit`. State persists next to the transaction (`session.json`). `coherent edit` (CLI, own model) and the MCP tools (agent writes) are thin adapters over it.
2. **Four MCP tools** behind `coherent mcp --profile agent`: `coherent_inventory`, `coherent_begin_edit` (impact folded in; `amend` adds files to the open edit), `coherent_verify_edit`, `coherent_rollback_edit`, with a protocol/version/capability handshake in `inventory`. The profile serves no authoring tools (`coherent_constraints`, `coherent_apply_design`, `coherent_manifest`): ADR-0011 found that layer made output worse.
3. **Post-write verification is the enforcement boundary.** The `PreToolUse` hook (`coherent hook pre-write`) denies Edit/Write/MultiEdit/NotebookEdit outside the open edit's write set, as fast feedback only: Bash, subagents and IDE writes bypass it, and `verifyEdit` diffs the whole tree.
4. **Distribution shape** (templates in `packages/cli/templates/agent/`): an agent definition (`.claude/agents/coherent.md`, prompt + `mcpServers: [coherent]` by name), the server in the project's `.mcp.json`, the hook in the project's `.claude/settings.json`.
5. **CLI stays first-class** for bootstrap, CI, recovery and agent-less use. Agent mode is the preferred interactive UX, not the only one.

## Spike results (project A, 2026-10-17)

- **stdio e2e** (real server, real build): `begin_edit` 2s (before-renders cached by tree hash; cold ≈ 30-60s), `verify fast` 2s (target < 15s), `verify final` 17s (target < 60s); an out-of-plan write made outside the hook (as Bash would) was caught by `fast`; the server was restarted between begin and final and recovered the open edit from disk; rollback restored only the edit's file.
- **Headless agent run** (`claude -p --agent coherent`, Sonnet, no bypass): request "On Earnings only, make the KPI cards more prominent; other KPI pages must not change". The agent called inventory → begin_edit (`variant`, `kpi-card.tsx` + Earnings page) → Edit → verify fast → verify final → `verified`: Earnings changed 17.9% desktop, all 4 controls (incl. the two other KpiCard consumers) 0.00%. It reported the verdict honestly. 57s, $0.53.
- **Three host facts found by trying**, not documented: (a) an MCP server declared inline in agent frontmatter did not connect (the agent, correctly, refused to edit without Coherent); the project `.mcp.json` server did. (b) `hooks` in agent frontmatter did not fire on the main thread; the same hook in project `.claude/settings.json` denied the write with Coherent's reason. (c) The agent tried once to write through `perl -pi` in Bash; denied only because Bash was not allowed in the run. In normal use the hook cannot see that: verification is what catches it.

**Desktop run by the user (2026-10-17):** the project-default agent (`"agent": "coherent"` in project settings) loaded in the Claude Code desktop app with no menu choice; edits verified: emerald tokens (13/13 routes rendered), Billing reorder, identity-leak removal, a Billing hydration fix (server UTC vs browser PDT dates). Two findings: (1) the agent restarted one edit with `visual: false` to skip rendering; the agent tool no longer accepts that switch (opting out stays a human CLI flag) and the prompt says to wait for checks. (2) Renders compared pixels only, so a hydration error passed unseen; renders now record console and page errors, an edit fails on new ones (baseline-relative, like type errors), and the verification browser runs in a far time zone and another locale (`Pacific/Kiritimati`, `de-DE`) because a same-machine browser hides SSR/client mismatches. Live check: an injected locale-formatted number failed `final` with React #418 on both viewports and rolled back.

## Consequences

- The project-level hook governs **every** Claude Code session in that project, not only the Coherent agent: a plain session must also open an edit before writing source. Acceptable for a Coherent-managed project (the tools are in `.mcp.json`, and the deny message says what to call), but it is a product choice to confirm.
- Not yet proven: discovery in the desktop "Set Agent" menu and the interactive approval of the project MCP server (the user's run), a cold `begin_edit` on a large app, greenfield builds (a separate mode, not an oversized edit), the deterministic preview contract for real data, an installer (`coherent agent install`) and Windows.

## Alternatives rejected

- **Agent mode as the architecture** (Codex): host coupling; hooks are not a boundary.
- **Keep the authoring tools in the agent's MCP surface**: contradicts ADR-0011.
- **Six tools** (separate impact): impact belongs in `begin_edit`'s answer.
