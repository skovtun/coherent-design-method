---
id: ADR-0010
type: adr
status: accepted
date: 2026-07-21
confidence: established
shipped_in: [0.24.0]
---

# ADR 0010 — MCP server (`coherent mcp`): the agent-contract surface, P3

**Status:** Accepted
**Date:** 2026-07-21
**Shipped in:** v0.24.0 (P3 of the agent-contract strategy; P1 = `export tokens --format dtcg` v0.23.8, P2 = `coherent manifest` v0.23.9)

## Context

Two signals pointed at the same move (see `docs/research/agent-contract-strategy.md`):

1. **Market validation.** Meta shipped `astryx` — a design system that is "agent-ready" via a 3-tier contract (machine-readable CLI manifest + CLI-as-agent-API + a bundled MCP server). Google Stitch converged on a portable `DESIGN.md`. "The AI has a contract, not guesses" is now validated by big players.
2. **The differentiation benchmark** (see `project_differentiation_benchmark`) showed that against a frontier baseline, code-level anti-slop is weak. Coherent's value reframes to **a design-identity contract the AI doesn't have to guess, enforced.** The differentiated MCP tool is *validate-against-identity*, not *give-me-a-component*.

Coherent already had ~2.5 of astryx's 3 tiers: agent-docs (`coherent rules`), a machine-readable manifest (P2's `coherent manifest`), and DTCG tokens (P1). The missing tier was the MCP server.

## Decision

Ship `coherent mcp` — a stdio MCP server that is a **thin wrapper over existing exports**, not new engine work. Six tools, SEP-986-named, ranked by differentiation:

| Tool | Wraps | Why it's here |
|---|---|---|
| `coherent_validate` ⭐ | `validatePageQuality` | Enforce the constraint system on a code blob. The one tool no other design MCP has — the generate→validate→fix loop applied to design identity. |
| `coherent_extract` | `captureExtraction` (extracted from `extract.ts`) | Derive tokens from a **live URL**. Also unique — URL-native. |
| `coherent_constraints` | `buildPromptPayload` (extracted from `prompt.ts`) | The tiered constraint bundle for an intent. |
| `coherent_manifest` | `buildManifestDoc` (extracted from `manifest.ts`) | The static design contract (P2). |
| `coherent_apply_design` | `parseDesignMd` + `adaptImport` + `buildPlan`/`applyPlan` | Map an external DESIGN.md onto project tokens. Dry-run by default; `apply=true` writes (backup + `coherent undo`). |
| `coherent_tokens` | `buildDtcgTokens` | Project tokens in W3C DTCG. |

**Key design points:**

- **No design-constraints.ts touch, no new engine.** The three command actions (`prompt`, `manifest`, `extract`) were refactored to expose pure builder functions (`buildPromptPayload`, `buildManifestDoc`, `captureExtraction`) that are now the single source of truth shared by the CLI and the MCP tool. The CLI's observable behavior is unchanged (2524 tests green, including the pre-existing `prompt`/`manifest` suites).
- **stdout is the JSON-RPC channel.** The SDK writes frames via `process.stdout.write` directly. `mcpCommand` reroutes `console.log → console.error` defensively, so any stray log from a wrapped function can't corrupt the protocol stream. (The update-notifier banner already goes to stderr on non-TTY, so it was safe.)
- **`@modelcontextprotocol/sdk` is the first runtime MCP dependency.** Node `>=18` already satisfied. tsup externalizes it (resolved from `node_modules` at runtime).
- **Project-scoped tools fail cleanly.** `coherent_tokens` and `coherent_apply_design` require a Coherent project; outside one they return a structured `isError` result, not a crash.

## Consequences

**Positive.** Coherent is now consumable by Cursor / Claude Code / Copilot / v0 as an MCP server — the distribution channel M5 was gated on. The differentiated tool (`coherent_validate`) is exposed to any agent's generate loop. The refactor left three reusable pure builders behind, tightening the CLI internals.

**Costs / limits.**
- `coherent_extract` needs the optional `playwright` peer dep and launches headless Chromium. Since v0.24.1 it IS covered in-process: the browser factory and the LLM call are the only mocked boundaries, so the SSRF gate, resolver pinning, token extraction, semantic validation and driver lifecycle all run for real in the suite. A real browser is still only exercised by out-of-band e2e (stdio server + live capture), not by CI.
- The manifest tool omits the CLI self-description (`cli: null`) — agents drive the MCP tools directly, not the CLI, so it's not needed there.
- Tool naming tracks SEP-986 (in the 2026-07-28 spec RC); the RC's Tasks/Extensions may change server construction later.

## Alternatives considered

- **Shell out to the built `coherent` binary per tool.** Rejected — fragile in dev, slow, and duplicates process spin-up. The pure-builder refactor is cleaner and keeps one code path.
- **A separate `@getcoherent/mcp` package.** Deferred — the server reuses so much of the CLI's internals that a split would mean exporting a large surface. Revisit if the server grows its own engine.
