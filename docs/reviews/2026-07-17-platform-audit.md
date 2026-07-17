# Coherent Audit — Prioritized Synthesis (31 confirmed findings)

## 1. Executive Summary

**Confirmed by severity:** P0 = 0 · P1 = 3 · P2 = 17 · P3 = 11 (31 total).

The through-line matches your dogfooding observation: nearly every P1/P2 is a **live-API behavior the 2450+ unit tests never exercise** — silent truncation, swallowed errors, missing model-retirement fallback, unescaped untrusted input. None are logic bugs a test would catch; all surface only against a real Anthropic call or a real third-party URL.

**Top 3 highest-ROI actions (impact × ease):**

1. **Add the `stop_reason==='max_tokens'` guard to the four code-edit methods** (`claude.ts:396`) — copy the check `generateJSON`/`parseModification` already have; stops silently writing truncated, broken TSX into the user's page files. *(P1, ~10 lines, prevents data loss.)*
2. **Set `redirect:'manual'` on the robots.txt fetch** (`robots-check.ts:66`) — one line closes a blind SSRF into cloud-metadata/internal hosts on every `extract`. *(P1, one line.)*
3. **Enable prompt caching + delete the duplicated quality block** (`claude.ts:283`, `split-generator.ts:959`) — `cache_control` on the ~7–15K-token constant constraint prefix cuts input cost ~80% and TTFT on pages 2..N; the dedup removes a second per-type block (up to ~1500 tok/page) for free. *(P2, plain 0.32.x request field.)*

---

## 2. CORRECTNESS / QUALITY (ranked)

### A. Silent failure & data loss on the live AI path (fix first — the dogfooding class)

- **[P1]** `claude.ts:396` (also 356/446/484) — `editPageCode`/`editSharedComponentCode`/`replaceInlineWithShared`/`extractBlockAsComponent` never check `stop_reason`; a large page rewrite that hits `max_tokens` writes truncated TSX straight to the user's file with no error. **Fix:** throw `RESPONSE_TRUNCATED` on `stop_reason==='max_tokens'` before returning, mirroring `generateJSON` (OpenAI twin has identical gap: `openai-provider.ts:355`).
- **[P1]** `claude.ts:563` — `extractSharedComponents` `catch { return {components:[]} }` makes a 429/5xx/timeout/truncation/retired-model indistinguishable from "no reusable patterns"; pipeline reports green "No shared components extracted" and builds every page with duplicated inline blocks. **Fix:** return a discriminated `{status:'error'}` (or rethrow API errors) and surface a warning; only return `[]` when the model actually answered empty. Use `requireText` not soft-null `textOf` at :556.
- **[P2]** `extract.ts:136` — `--semantic` failure prints a stderr line, sets `semantic=null`, and still **exits 0**; a CI/script consumer gets deterministic-only tokens with a passing exit code. **Fix:** `process.exitCode=1` when `--semantic` was explicitly requested and the pass failed.
- **[P3]** `ai-classifier.ts:37` — `JSON.parse(jsonMatch[0])` is outside the try/catch; a bracketed-but-non-JSON model reply throws instead of the documented fail-soft `[]`. **Fix:** wrap in try/catch, return `[]`.
- **[P3]** `split-generator.ts:1227` — per-component `catch { /* skip */ }` drops a failed shared component with no log; caller reports only the surviving count. **Fix:** log each skip with name+error and include a failed-count in the summary.

### B. Model-retirement resilience (the documented 2026-06-15 outage class)

- **[P2]** `claude.ts:119` — `withModelFallback` (built specifically for retirement self-heal) wraps only `generateConfig`, which is **not** on the chat path; the flagship edit path (`editPageCode`, `parseModification`, `generateJSON`, +5) is unprotected, and four of those have no 404 reformatting either.
- **[P2]** `claude.ts:241` — plan-phase `generateJSON`, the first AI call of every `coherent chat`, has no fallback and no 404 formatting (degrades to a warned empty build, not a crash — the caller catches it).
- **Group fix (both):** route every `messages.create` through one private `send()` helper that applies `withModelFallback` + the 404→`CLAUDE_MODEL` guidance uniformly.

### C. Adaptive-thinking & max_tokens handling

- **[P2]** `anthropic-semantic-call.ts:33` — `max_tokens:2048` with adaptive thinking ON and no truncation check; thinking tokens can starve the JSON envelope → empty-text throw or parse failure → `--semantic` silently reverts to deterministic-only. **Fix:** raise the budget / add thinking headroom, and surface `max_tokens` as a distinct retryable error.
- **[P2/P3]** `anthropic-provider.ts:39` (+truncation/fallback/max_tokens at :29) — `response.content[0]` indexing throws `got thinking` on every Sonnet-5 call (the exact bug already patched in `claude.ts`/`anthropic-semantic-call.ts`); also no `stop_reason` check, no fallback, undersized 4096 budget. **Latent** — no production caller today (Lane C unwired), but it fires the instant Lane C ships. **Fix:** `content.find(b=>b.type==='text')` + reuse ClaudeClient machinery.

### D. Generation-pipeline correctness (chat)

- **[P2]** `modification-handler.ts:563` — a double-failed generic-slug page (e.g. `/analytics`) gets a config+nav route but **no `page.tsx`** → runtime 404; `coherent check` builds `validRoutes` from config and judges the dead `<Link>` valid, so its own diagnostic can't see it. **Fix:** in `check.ts` assert each config route resolves to an on-disk page; write a placeholder (or drop the route) when retry yields no code.
- **[P2]** `split-generator.ts:764` — one Phase-3 home failure sets `styleContext=''`, so Phase 4.5 + every Phase-6 page generates with **no consistency contract** (the core value prop); the late home retry runs after Phase 6 and never re-derives it. **Fix:** run the lightweight home retry before Phase 4; fall back to `renderAtmosphereStyleHint(plan.atmosphere)` as the seed.
- **[P2]** `modification-handler.ts:607` — two classifiers disagree on the no-plan path: `/terms`, `/privacy`, `/home` get `qualityPageType='marketing'` but structural `pageType='app'`, so `normalizePageWrapper` strips the marketing container/padding → full-bleed legal pages. **Fix:** use `inferPageTypeFromRoute` for both; delete the `isMarketingRoute` branch.
- **[P2]** `quality-validator.ts:2290` — `NESTED_INTERACTIVE` autofix only handles the tight capital-`<Link><Button>` case; nested `<a>`, native `<button>`, and wrapped-markup variants stay flagged, so `fix` reports nothing yet ships a hydration error. **Fix:** broaden the autofix (or mark it unfixable in `remaining[]` so the user knows manual work is needed).

### E. Consistency / DRY — multiple generators diverge from one config

- **[P2]** `ProjectScaffolder.ts:313` — three globals.css generators derive **different chart palettes and accent** from identical tokens; `fix`/`export tokens`/init disagree, and layout.tsx injects a conflicting inline set. The E3 equivalence gate checks only 9 tokens, never chart-*/accent. **Fix:** collapse to one `buildCssVariables` core with v3/v4 wrappers; extend the gate.
- **[P2]** `tailwind-version.ts:42` — `contrastFg`/`blendColors` bodies copy-pasted byte-identical across three files; a one-sided threshold/hex edit silently diverges. **Fix:** export once from `packages/core/src/utils`, import in all three.
- **[P2]** `parse.ts:74` — DESIGN.md producers (core) and importers (cli) share **no constant** across the package boundary; renaming a heading/column silently makes the round-trip import zero colors and fall back to defaults, passing tsc + full suite. **Fix:** shared heading/column constants, or a serialize→reparse round-trip test.
- **[P3]** `parse.ts:54` — extract-format version marker is emitted but validated only by presence; a future v2 file is silently parsed by v1 grammar. **Fix:** capture the version, warn/reject unknown majors.
- **[P3]** `buildCssVariables.ts:103` — `|| '0.5rem'` radius default re-hardcoded in 6 places (schema default exists but is bypassed by falsy fallbacks). **Fix:** single `DEFAULT_RADIUS` constant.

### F. Security & data integrity

- **[P1]** `robots-check.ts:66` — robots.txt fetch uses default `redirect:'follow'`; attacker-controlled `robots.txt` returns `302 Location: http://169.254.169.254/...`, Node follows it, guard validated only the original public origin → blind SSRF on every extract, running before browser hardening. **Fix:** `redirect:'manual'`, treat 3xx as no-robots; ideally pin to the guard-validated IP.
- **[P2]** `browser-capture.ts:432` — IPv6 guard whitelists essentially only `::ffff:` mapped; NAT64 `64:ff9b::/96` embedding a private v4 slips through into a pinned Chromium connect (real in IPv6-only/DNS64 cloud subnets). **Fix:** expand the literal to 8 hextets and range-check numerically; block the NAT64 prefix + re-check the embedded v4.
- **[P2]** `semantic-inference.ts:88` — untrusted page copy is interpolated unescaped into the LLM prompt, and free-form `summary`/`voice.samples[].text` land verbatim in committed DESIGN.md → second-order injection when re-fed to `coherent chat`. The hero field is already sanitized (`sanitizeHeroText`) — the defense exists but wasn't applied to the semantic fields. **Fix:** delimit untrusted text as data; run the same sanitizer over summary/voice before serializing.
- **[P3]** `robots-check.ts:70` — robots body read unbounded (no size cap); bounded by the 5s abort timer but still worth a `maxBytes` cap mirroring `safe-yaml.ts`.
- **[P3]** `robots-check.ts:155` — attacker-controlled `Disallow` patterns compile to RegExp (`*`→`.*`) with no ReDoS guard; empirically exponential (`n=50 → 11s`), hangs the event loop (latent P2 if the server-side extractor ships via exported `@getcoherent/core`). **Fix:** linear two-pointer glob match, or bound pattern length/wildcards.
- **[P3]** `files.ts:309` — `batchWriteFiles` swallows restore failures (leaves half-written originals) and never unlinks newly-created files on rollback; "transactional semantics" docstring doesn't hold. **Fix:** track new paths and unlink on rollback; aggregate restore failures into the thrown error.

---

## 3. EFFICIENCY / COST (ranked)

- **[P2]** `claude.ts:283` — **zero prompt caching anywhere**; the byte-identical ~7–15K-token constraint prefix is re-billed at full input price on every page (~$0.15–0.30 redundant input per 10-page app + full prefill TTFT each page). **Fix:** move the invariant bundle into `system` with a `cache_control:{type:'ephemeral'}` breakpoint (supported in 0.32.x; ~78–90% off the constant portion + large TTFT win).
- **[P2]** `split-generator.ts:959` — `getDesignQualityForType` is injected twice into every Phase-6 prompt (measured APP block ≈1543 tok, not the ~240 estimated); marketing/auth pages also get the wrong APP block duplicated. **Fix:** drop `designConstraints` from the split-generator array and rely on `buildModificationPrompt`'s injection.
- **[P3]** `split-generator.ts:1007` — a reuse-miss fires a second full-page `editPageCode` (max_tokens 16384) that re-uploads and regenerates the whole file just to inject an import. **Fix:** strengthen the first-pass reuse directive; do deterministic import/JSX insertion (the missed components are already known at 1000-1006).
- **[P3]** `claude.ts:115` — adaptive thinking never disabled on deterministic JSON tasks (`generateConfig`, `--semantic`), paying reasoning tokens+latency. **Fix:** pass `thinking:{type:'disabled'}` for those calls (note: 400s on Fable 5, so needs per-model conditional; low-frequency call sites).
- **[P3]** `model.ts:38` — single sonnet-5 tier for tiny structured/classification calls (`generateConfig`, `--semantic`, `testConnection`). Real but low-volume; deliberate consolidation for eval reproducibility, and no Haiku eval gate exists. **Fix (optional):** route only the trivially-constrained calls to a cheap tier, keeping env-override + fallback.

---

## 4. Sequencing — before vs after scaling the gallery to 12 pages

**Fix before scaling (compounds with page count or corrupts output):**
- Prompt caching + the double-injection dedup (`claude.ts:283`, `split-generator.ts:959`) — cost/TTFT scale linearly with pages; a 12-page run is where the waste becomes visible on the bill.
- `stop_reason` truncation guard (`claude.ts:396`) — larger/data-dense pages in a bigger app are exactly where `max_tokens` truncation and silent file corruption become likely.
- Phase-3 styleContext wipe (`split-generator.ts:764`) and Phase-4.5 swallow-as-success (`claude.ts:563`) — a single transient hiccup in a 12-page run makes the whole app style-incoherent with no recovery; more pages = more chances to trip it.
- Dropped-page 404 (`modification-handler.ts:563`) — the 14+-page regime is precisely where double-failed pages appear; a route without a backing file must not ship.
- **If the gallery extracts third-party URLs at all:** the robots redirect SSRF (`robots-check.ts:66`) is a must-fix now, not later — every extracted URL is attacker-controlled by design.

**Fix after scaling (latent, cosmetic, or low-frequency):**
- Model-retirement fallback cluster (`claude.ts:119/241`) — only fires on a scheduled, forewarned retirement and is `CLAUDE_MODEL`-workaroundable; do it as the uniform `send()` refactor once, not under deadline.
- Consistency/DRY cluster (chart colors, `contrastFg`, radius, DESIGN.md coupling) — no active bug today; schedule as a single "one source of truth" pass.
- Lane C landmines (`anthropic-provider.ts`) — zero production exposure until Lane C is wired; fix as part of enabling it.
- Remaining security hardening (NAT64/IPv6, prompt-injection sanitizer, robots DoS/ReDoS) — real but environment-conditional or opt-in; batch into a dedicated security pass, prioritizing the injection sanitizer if DESIGN.md files are committed/shared.