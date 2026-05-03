---
id: ADR-0008
type: adr
status: accepted
date: 2026-05-03
confidence: established
shipped_in: [0.18.0]
---

# ADR 0008 — DESIGN.md as output artifact + @-syntax for component reference

**Status:** Accepted
**Date:** 2026-05-03
**Shipped in:** v0.18.0

## Context

CDM's competitive landscape sharpened in early May 2026. Two adjacent products forced a positioning review:

**Aura.build** (166k users) — multi-page AI website builder with visual editor, multi-model support (Claude/GPT/Gemini), 1400+ components, 1000+ templates, "@" component reference syntax. Outputs HTML+Tailwind / Figma. Different artifact from CDM's real Next.js code, but adjacent enough to compete on the "AI-generated UI" job.

**Refero Styles** — curated brand-extracted style library. They scrape known-good brands (Linear, Stripe) and emit a `DESIGN.md` markdown file as a portable design seed for AI tools. Tagline: "Design taste, extracted." Not a generator — they sell *input*.

CDM until v0.17.x:
- CLI-only, no visual editor
- 5 baked-in atmospheres
- Generates real Next.js code with semantic tokens (genuine moat)
- No visible artifact summarizing the generated project's design system
- No explicit syntax for users to pin specific shared components in prompts (keyword match only)

The /plan-ceo-review on 2026-05-03 ran a SELECTIVE EXPANSION review across 6 candidate gaps. Three were accepted as v0.18.0 platform scope (this ADR), one as a separate landing-repo cycle, two deferred or punted.

## Decision

Ship two competitive-parity features in v0.18.0, both of which reuse existing infrastructure and represent low-effort / high-leverage moves:

### 1. DESIGN.md output artifact

Every successful `coherent chat` writes a `DESIGN.md` markdown file in the project root. Sections: project header, atmosphere (if present), color system (light + dark side-by-side), typography scale + font families + line heights, spacing tokens, border radius tokens, voice profile (if present), shared components table (with CID-XXX), pages.

- Pure-function formatter (`packages/cli/src/utils/design-md.ts::buildDesignMarkdown`) — deterministic, IO-free, snapshot-testable
- IO wrapper at end of `chat.ts::chatCommand` — best-effort write, never blocks chat
- Sections with no data are omitted entirely (no empty stubs)

Why a NEW artifact rather than reusing existing ones:

| Existing artifact | Role | Why DESIGN.md is different |
|-------------------|------|---------------------------|
| `coherent.config.ts` | Machine-readable TypeScript config | Not human-readable in one read; cannot paste into another AI |
| `app/design-system/*` (v0.17.x viewer) | Live HTML viewer | Requires `npm run dev`; not portable to other tools |
| `coherent.components.json` | Component manifest | Components only, no tokens / atmosphere / voice context |
| `docs/wiki/*` (in CDM repo) | Meta-documentation about CDM tool | About the tool, not about the user's generated project |

DESIGN.md fills the "human-readable, portable, in-the-user's-repo" niche. GitHub renders it on first visit. AI tools eat it as a seed.

### 2. `@<component>` and `@CID-XXX` syntax in CLI prompts

`coherent chat` extracts `@<token>` mentions from the user message:

- `@<name>` — case-insensitive name lookup (e.g. `@PricingTable` → `CID-002`)
- `@CID-XXX` — direct CID lookup
- Email-address boundary check (`user@example.com` is NOT a mention)

Resolved entries get a strong "USER EXPLICITLY PINNED — MUST USE" directive prepended to the existing `sharedComponentsSummary`. Unresolved tokens emit an inline yellow warning and fall back to keyword-match (existing behavior unchanged).

Implementation reuses `SharedComponentsRegistry.findSharedComponent`, which already accepted CID + name. The new module (`at-syntax.ts`) is just extraction + bulk lookup + directive formatting.

## Alternatives considered

**A. DESIGN.md as a new top-level CLI command (`coherent design-md`)** — rejected for v0.18.0. Could be added later. Auto-write at end of `chat` covers the common case (the file is always fresh after generation).

**B. @-syntax as a strict allowlist filter that REPLACES keyword match** — rejected. Backward-incompatible for users mid-flow. Pinning + keyword-match-as-fallback is additive and lower-risk.

**C. DESIGN.md as JSON not markdown** — rejected. JSON serves machines; CDM already has `coherent.config.ts` and `coherent.components.json` for that. The whole point is human + AI-tool consumption. Markdown is the universal format.

**D. URL import for style seeding (Refero parity feature)** — deferred to TODOS T9. Cost (4-6h CC + production-quality 2 days) materially higher than the 3 accepted gaps; legal grey zone on style scraping; revisit after seeing whether DESIGN.md + @-syntax + atmosphere gallery generate dogfood signal that "more atmospheres" is the bottleneck.

**E. Multi-model SDK abstraction (Aura parity feature)** — not built. Verified the live landing already does NOT claim multi-model (only "any AI editor"). No false claim to repair. If multi-model becomes a real bet, build the abstraction at that point.

**F. Atmosphere visual gallery on landing** — accepted but lives in landing repo (`~/Web/getcoherent/export/`), separate ship cycle.

## Strategic frame (preserved here so future-me has the why)

CDM's defensible angle vs Aura: **code-as-ground-truth for designers + devs shipping real Next.js, OSS MIT, no vendor lock-in**. Aura's HTML+Tailwind/Figma export is a different artifact for a different buyer.

Three structural gaps are explicitly punted from this cycle:
1. **Visual editor** — not our game. Aura wins horizontally.
2. **Community marketplace** — premature without PMF signal.
3. **Multi-editor adapter parity** — already T2 in TODOS.

This ADR represents the *Selective Competitive Close* strategic mode, deliberately not the *Niche Down* (designer-only wedge) or *Aggressive Pivot* (community-first) modes. Reasoning: the gap-closing data informs whether v1.0 should pivot to one of those bigger commitments. Optionality preserved.

Per the CEO plan: if this ships and we don't get external dogfood signal that any of the three accepted features moved the needle (downloads, PR usage, Twitter mentions), the next decision is "do we double down on cheap wins or commit to a bigger bet?"

## Consequences

### Positive

- DESIGN.md is the marketing signal "CDM builds a system, not pages" backed by a real artifact, not just landing copy
- @-syntax matches the LinkedIn-validated pattern ("teach the model your components first") and packages a pattern Aura already ships
- Both features reuse existing infra, so net new code is small (~250 LOC across two modules + tests)
- Cycle ships as v0.18.0 minor (additive, no migration needed)

### Negative

- DESIGN.md becomes a new public artifact — version it (currently v1 in the trailer subline). Future schema changes need a backwards-compatibility plan
- @-syntax introduces a magic character (`@`) into the prompt grammar. Users who genuinely want a literal `@` in their copy now need an escape mechanism (currently: just don't write `@SomeName` — the email-boundary check is permissive)
- Adds two new test files (38 tests) to maintain
- Marketing message must NOT overpromise: this is *parity moves*, not *moat moves*. Labeling them as moat would mislead the user about CDM's competitive position

### Neutral

- Atmosphere lives on `plan.atmosphere` (saved via `savePlan`), not on `coherent.config.ts`. DESIGN.md reads it from the saved plan. If the plan file is missing or malformed, the Atmosphere section is omitted gracefully
- Token usage notes (`tokenUsage.colors`) and voice profile are optional — DESIGN.md renders them when present, omits silently otherwise
- The pinned-component directive is louder than the regular shared-components note. If the AI consistently ignores both, that's a constraint-system problem upstream of @-syntax — separate fix

## References

- CEO plan: `~/.gstack/projects/skovtun-coherent-design-method/ceo-plans/2026-05-03-competitive-positioning-vs-aura-refero.md`
- Aura.build (competitor): https://www.aura.build/browse/components
- Refero Styles (upstream/partner): https://styles.refero.design/
- DESIGN.md format (this project): `packages/cli/src/utils/design-md.ts`
- @-syntax extractor: `packages/cli/src/utils/at-syntax.ts`
- Shared components registry (reused infra): `packages/core/src/managers/SharedComponentsRegistry.ts:48-57`
