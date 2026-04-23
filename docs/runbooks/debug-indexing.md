# Debug wiki indexing

`coherent wiki search` returns nothing, wrong results, or stale results. Walk the pipeline from raw file to ranked output.

## Prerequisites

- Inside the Coherent source repo.
- Familiar with the wiki layout (`docs/wiki/PATTERNS_JOURNAL.md`, `docs/wiki/ADR/*.md`, etc.).

## The pipeline

```
raw wiki files  →  scanWiki()  →  buildIndex() (TF-IDF)  →  .coherent/wiki-index.json  →  retrieve(query) → ranked entries
```

Failures cluster into three zones: **scan**, **index**, **retrieve**. Work through them in order.

## Step 1 — Is the entry being scanned?

Rebuild the index with verbose output:

```bash
coherent wiki index
```

Expected: per-type counts printed to stdout. If the expected type is zero:

- Is the heading pattern correct? Scanner expects:
  - `### PJ-NNN — Title` (PATTERNS_JOURNAL)
  - `### ADR-NNNN` or file name starting with `NNNN-` (ADR dir, one file = one doc)
  - `### <Observation Title>` (MODEL_PROFILE)
  - `### <ID> — Title` (IDEAS_BACKLOG, where ID is `F9`, `M13`, etc.)
- Is the file at the expected path? After v0.8.1 move, `PATTERNS_JOURNAL.md` lives at `docs/wiki/PATTERNS_JOURNAL.md`, not `docs/PATTERNS_JOURNAL.md`.
- Does the file have YAML frontmatter? Scanner tolerates missing frontmatter but `wiki audit` will complain.

Quick check — manually inspect `.coherent/wiki-index.json`:

```bash
jq '.entries[] | select(.id == "PJ-006") | {id, type, title, content_preview: (.content[0:100])}' .coherent/wiki-index.json
```

If `PJ-006` is missing or has empty content, scan failed. If it's there, problem is downstream.

## Step 2 — Is the index fresh?

Check timestamp:

```bash
jq '.builtAt' .coherent/wiki-index.json
```

Compare to your last wiki edit. If the index is older, `coherent wiki index` didn't run after your edit. Re-run it.

The `npm run build` postbuild hook regenerates `packages/cli/dist/wiki-index.json` — a shipped cache for end users — but does **not** touch `.coherent/wiki-index.json` (the local dev cache). Always `coherent wiki index` manually after wiki content changes.

## Step 3 — Is retrieval ranking it low?

TF-IDF ranks by term frequency × inverse-document frequency. Queries using rare terms beat queries using common terms. If your new entry is being outranked:

```bash
coherent wiki search "your-exact-query"
```

Look at the top-5 scores. If your target entry is in position 4-5 with a low score:

- Add distinctive language to the entry (specific class names, unique identifiers).
- Or add a `BENCH.yaml` row pinning the query → expected entry, and fix the content until the benchmark passes.
- Don't force-boost — retrieval working by accident today will break tomorrow.

## Step 4 — Is retrieval even being called at chat-time?

If indexing and `wiki search` work but `coherent chat` generates without appearing to use wiki context, verify `retrieveWikiContext()` is actually called. In `packages/cli/src/agents/modifier.ts`:

```ts
const wikiContext = retrieveWikiContext(message, options?.pageSections)
```

Temporarily log it. If empty string: check `message` content isn't stripping keywords before retrieval.

Remove the log before committing.

## Common failures (ranked by frequency)

1. **Forgot `coherent wiki index` after adding a wiki entry.** The index is a cache; edits don't trigger rebuild. Run it.
2. **Wrong heading pattern.** `## Title` instead of `### Title`, or missing ID segment. Scanner silently skips.
3. **File at wrong path.** `docs/PATTERNS_JOURNAL.md` vs `docs/wiki/PATTERNS_JOURNAL.md` (changed in v0.8.1).
4. **YAML frontmatter malformed.** `coherent wiki audit` will flag. Indentation matters in YAML.
5. **New entry added but old index in place.** Delete `.coherent/wiki-index.json` and re-run `wiki index` to force a clean build.

## See also

- [validate-retrieval.md](./validate-retrieval.md) — the inverse workflow: confirm retrieval is healthy.
- `packages/cli/src/utils/wiki-index.ts` — scanner + index code.
- `docs/wiki/BENCH.yaml` — curated query / expected-entry pairs.
