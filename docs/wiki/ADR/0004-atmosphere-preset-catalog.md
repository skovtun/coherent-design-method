---
id: ADR-0004
type: adr
status: accepted
date: 2026-04-23
confidence: established
shipped_in: [0.7.29, 0.7.30]
---

# ADR 0004 — Atmosphere preset catalog

**Status:** Accepted
**Date:** 2026-04-23
**Shipped in:** v0.7.29 (catalog) + v0.7.30 (CLI wiring)

## Context

Since v0.6.91, `plan.atmosphere` has been filled by two routes running in series:

1. The AI plan-generator extracts an atmosphere from the user's message (7 enum fields plus a mood phrase).
2. `extractAtmosphereFromMessage` runs deterministically after, filling gaps the AI skipped or papered over with defaults. When the AI output "looks default" (`minimal-paper` + `monochrome`), the deterministic result wins field-by-field.

This is an inference-only pipeline. Two failure modes showed up in practice:

- **Ceiling is low.** When the user says "dark premium", they get *some* darkness, but typography, spacing, and accent choices regress toward the AI's center of mass. 20 runs of the same prompt produce 20 subtly different "dark premium" interpretations — none of them deliberately designed.
- **No reusable aesthetic context.** A user who builds five apps wanting the same aesthetic describes it in prose five times and gets five different atmospheres. There is no way to say "give me the Swiss one" and get the Swiss one.

The F9/Atmosphere Engine design doc argues for a ceiling-over-floor pivot: atmospheres as named, structured primitives the user can select from, not just mood phrases the model improvises on. Adjacent tooling (TasteUI ships 20 markdown "design skills") confirms the market wants this shape.

Before the full F9 pivot can land (typed tuple with `typography_pair` / `color_system.palette[5-7]` / `motion_signature` / `layout_archetype`), the catalog primitive has to exist.

## Decision

Ship a **named preset catalog** that maps stable string names to full `Atmosphere` tuples, addressable from the CLI as `coherent chat --atmosphere <name>`. When set, the preset hard-overrides both the AI plan-generator's atmosphere and the deterministic message-extraction fallback.

- **v0.7.29:** `ATMOSPHERE_PRESETS` map in `packages/cli/src/commands/chat/atmosphere-presets.ts` — 10 presets (`swiss-grid`, `paper-editorial`, `neo-brutalist`, `dark-terminal`, `obsidian-neon`, `premium-focused`, `warm-industrial`, `solar-saas`, `wabi-sabi`, `luxury-editorial`). Each passes `AtmosphereSchema.parse`.
- **v0.7.30:** `--atmosphere <name>` and `--list-atmospheres` flags on `coherent chat`. Validation + discovery on the CLI side; `SplitGenerateParseOpts.atmosphereOverride` carries the tuple through to the generator, which branches on `if (parseOpts.atmosphereOverride) { use it } else { run merge path }`.

The catalog uses the **existing** flat 7-enum `Atmosphere` shape. The full tuple upgrade is deferred to the F9 pivot proper.

## Consequences

**What changes downstream**

- Generation pipeline gains a deterministic fast-path for atmosphere. No LLM calls needed to set plan.atmosphere when a preset is supplied.
- `renderAtmosphereDirective` and per-page prompts receive a known-good tuple, so the AI's remaining job is narrower — compose pages *within* a defined aesthetic rather than inventing one.
- We now have a shipping surface that F9 can extend in place: the preset list grows, and later the tuple shape itself widens.

**Cost we accept**

- Preset naming is a taste call and inevitably wrong for some users. Mitigated by cheap iteration: adding or renaming a preset is a one-line change plus a test.
- The flat enum shape caps expressive range. A preset can't encode the full design intent of e.g. luxury-editorial (serif scale ratio, specific spring physics, drop-cap rules). Accepted as the v1 cost of shipping pre-F9.
- The override is a hard override — mood phrases in the user message that aren't part of the preset get ignored for atmosphere selection (though they still feed per-page generation). Deliberate: if the user chose a preset, fighting their explicit choice with soft inference causes worse bugs than silently dropping a mood adjective.

**What breaks**

- Nothing. The merge path is preserved verbatim for the no-override case. Existing callers that don't set `atmosphereOverride` get the v0.6.91 behavior unchanged.

## Why not alternatives

- **Pure markdown skills (like TasteUI).** Ship each atmosphere as a `SKILL.md` the agent reads as reference. Rejected: re-imports the exact slop problem Coherent's validators solve. Markdown-as-constraint is what we explicitly moved away from in ADR-0001. Structured tuple + schema-enforced parsing is the whole point.
- **Author presets in the full F9 tuple now, upgrade the generator around them.** Rejected: gates the catalog on the pivot. The flat 7-enum shape is already wired through the pipeline; presets authored against it are usable the day they land. Upgrading the shape later is straightforward.
- **Soft merge (preset as seed, user message as override).** Rejected: the entire point of the preset is to give the user a predictable ceiling. If "dark-terminal" sometimes produces not-dark output because a mood phrase leaked through, the feature fails its contract.
- **Import SKILL.md files from TasteUI or similar as downstream sources.** Rejected: license unclear, format mismatch requires brittle parsing, community-contributed content has quality variance that dilutes "ship-quality by default". Use as reference corpus for naming and breadth, not as a dependency. (See `IDEAS_BACKLOG.md` → R5.)

## References

- `IDEAS_BACKLOG.md` → **R5** (TasteUI reference corpus, strategic rationale).
- `IDEAS_BACKLOG.md` → **F9** (deterministic-statschart / Atmosphere pivot design doc).
- ADR-0001 (why structured > markdown for design constraints).
- `packages/cli/src/commands/chat/plan-generator.ts` — `AtmosphereSchema` definition (shipped v0.6.91).
- `packages/cli/src/commands/chat/atmosphere-presets.ts` — preset catalog (v0.7.29).
- `packages/cli/src/commands/chat/split-generator.ts` — override branching (v0.7.30).
- PR #33 (v0.7.29), PR #34 (v0.7.30).
