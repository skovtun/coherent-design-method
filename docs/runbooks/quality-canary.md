# Quality Canary

The automated dogfood. Its absence is why the v0.22.2 Sonnet 5 migration silently broke `coherent chat` for a month (PJ-016): the product's entire value is generation quality, yet nothing checked its own output on a schedule.

There are **two tiers**, and they catch different failures.

## Tier 1 — deterministic canary (every CI run, no API cost)

`packages/cli/src/utils/generation-canary.test.ts`

Feeds every real Sonnet 5 response shape (flattened request, fenced TSX, prose-wrapped fence, bare object, trailing content, `max_tokens` truncation, …) through the **real** `parseModification` and asserts a usable page with non-empty `pageCode` comes out — or, for truncation, that it throws loudly instead of returning empty.

This locks the parse/normalize/extract chain. If a refactor breaks any branch (the exact P0 mechanism), CI goes red. It runs inside `pnpm test`; no API key, no cost.

**It cannot see model drift** — it uses fixed inputs. That's Tier 2's job.

## Tier 2 — live canary (nightly / pre-release, one API call)

`scripts/quality-canary.mjs` · `pnpm canary`

Runs ONE real end-to-end generation against the live model and gates on:

1. The anchor page (Phase 3) produced code — the linchpin; if it fails, every downstream page degrades.
2. ≥ 70% of generated pages have full code (not template fallback).
3. At least one substantial (>1.5 KB) `page.tsx` was actually written to disk.
4. `coherent check` score ≥ `--min-score` (default 60).

Exit codes: `0` healthy · `1` quality gate failed · `2` harness/setup error.

```bash
npm run build
ANTHROPIC_API_KEY=sk-... pnpm canary
# tune:
ANTHROPIC_API_KEY=sk-... node scripts/quality-canary.mjs --min-score 70 --prompt "build a project management dashboard"
```

### Automation

`.github/workflows/quality-canary.yml` runs Tier 2 **nightly (06:00 UTC)** and on manual dispatch.

- **To enable:** add an `ANTHROPIC_API_KEY` repository secret. Without it the job no-ops cleanly (forks are never blocked).
- **To disable the nightly run** without deleting the file: comment out the `schedule:` block. It still runs on manual dispatch.
- **Cost:** one generation (~8 min, a few cents to low dollars of tokens) per night. That is the price of never again shipping an empty-page flagship unnoticed.

## Relationship to `quality-smoke.sh`

`pnpm test:quality` (`packages/cli/tests/quality-smoke.sh`) is the older manual smoke test: init + chat + quality validation + `next build`. It verifies the generated project *compiles*. The live canary verifies the generation is *good* (scored, non-empty, anchor-healthy) and is built to run unattended in CI. Use smoke for "does it build", canary for "is it any good".

## When the canary fails

1. Read the failing gate in the log — it names exactly what regressed (empty anchor / low ratio / low score).
2. Reproduce locally: `ANTHROPIC_API_KEY=... pnpm canary`.
3. If the anchor produced no code, instrument the swallowed Phase-3 `catch` in `split-generator.ts` and dump the raw model response — do not theorize about model output, look at it (this is how PJ-016 was cracked).
4. Add the newly-observed bad shape to Tier 1 (`generation-canary.test.ts`) so it can never silently return.
