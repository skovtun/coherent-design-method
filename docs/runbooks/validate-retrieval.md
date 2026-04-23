# Validate wiki retrieval

Confirm `coherent wiki search` surfaces the right entries end-to-end. Run when you've added/moved a lot of wiki content, bumped a retrieval-related feature, or suspect retrieval is stale.

## Prerequisites

- You're inside the Coherent source repo.
- `coherent` CLI is on your PATH (or use `node packages/cli/dist/index.js` directly).

## Steps

**1. Rebuild the index.**

```bash
coherent wiki index
# or: node packages/cli/dist/index.js wiki index
```

Output should print entry count per type. Expected baseline (as of v0.8.x): ~11 bugs, ~3 ADRs, ~3 model notes, ~2 rules, ~50 ideas (shipped or open). Big drops = something broke.

**2. Sanity-check a known query.**

```bash
coherent wiki search "filter bar"
```

Should return **PJ-006** (filter bar failures) in the top 3. If not:
- `coherent wiki audit` — checks structural integrity (missing frontmatter, empty entries, version consistency).
- Inspect `.coherent/wiki-index.json` — confirm `PJ-006` has an entry and non-empty `content`.

**3. Run the retrieval benchmark (authoritative).**

```bash
coherent wiki bench
```

This runs `docs/wiki/BENCH.yaml` — hand-curated query → expected-entry mappings. Target: **precision@1 ≥ 0.8, precision@3 ≥ 0.95.**

If the score drops after a change: the index didn't pick up your new content, OR your new content diluted the existing token signal. Investigate before shipping.

**4. Spot-check retrieval-at-chat-time.**

Retrieval happens inside `coherent chat` via `retrieveWikiContext(message, pageSections)` (in `packages/cli/src/agents/modifier.ts`). Temporarily add a `console.log(wikiContext)` before the prompt assembly, run a `coherent chat "..."` with a query you know should hit specific wiki entries, and confirm they appear.

Remove the `console.log` before committing.

## Verifying it worked

- `coherent wiki bench` precision@1 ≥ 0.8.
- Known-query sanity checks pass (`filter bar` → PJ-006, `chart placeholder` → PJ-002, etc.).
- Entry count per type matches your expected baseline.

## Common failures

- **`coherent wiki audit` clean but `wiki search` returns nothing.** Index not rebuilt since the last content change. Run `coherent wiki index`. The build's `postbuild` step also rebuilds `dist/wiki-index.json` — but that's a shipped cache for end-user `.coherent/wiki-index.json` isn't touched until `coherent wiki index` runs.
- **Precision@1 dropped after a new ADR.** New ADR shares vocabulary with an older ADR. Either retune the new ADR's language, or add a BENCH.yaml row pinning the tie-break.
- **File at `docs/wiki/` but not in the index.** Check the heading pattern matches the scanner — scanner expects `### PJ-NNN`, `### ADR-NNNN` patterns. Non-matching headings are silently skipped.
- **Frontmatter parse error.** `coherent wiki audit` will surface it. YAML is strict about indentation + `---` fences.

## See also

- ADR-0002 — memory feedback loop architecture
- `packages/cli/src/utils/wiki-index.ts` — scanner + TF-IDF index implementation
- IDEAS_BACKLOG → W1 (retrieval hit-rate telemetry — planned improvement)
