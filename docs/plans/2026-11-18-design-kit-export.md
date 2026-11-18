# Design kit export: keep building consistent UI without Coherent

Status: plan v2, 2026-11-18. **Step 0 ran the same day: the full export did NOT pass the
gate** (results below). Next: the cheap path (managed AGENTS.md/CLAUDE.md section +
checker that also catches classes of tokens that no longer exist).

## Goal

A folder in the project that any coding agent (Claude Code, Codex, Cursor) or
developer uses to keep adding screens **in the project's own design system**, with
Coherent uninstalled. Success = new screens use the project's tokens and existing
components instead of literals and look-alike components. Scope v1: the same repo.
"Start a new app from this design system" (component code travels, shadcn-registry
style) is a separate product.

Non-goal: better-looking UI. Measured (docs/research/agent-ready-kit-probe-result.md,
v2, 2026-08-03): frontier agents make equally good UI from any kit, including none
(blind quality ρ = 0.09); a rigid kit made a weak model worse (ρ = −0.94). So the kit
carries facts about this system, not design advice (ADR-0011).

## Step 0 — does an exported kit beat the repo itself? (gate, ~half a day)

The probe's "no kit" arm had no repo to look at, so its collapse to zero does not show
that an agent working **inside** the repo needs an export: it can read `globals.css`
and `components/` on its own. Test that before building anything.

- App: Orbit or a fresh `coherent init` app with ~20 components, committed baseline.
- Three arms, clean paired worktrees from the same commit:
  A. repo only, no instructions about design;
  B. repo + one line in AGENTS.md: "inspect globals.css and components/ before writing UI";
  C. repo + hand-written kit (SKILL.md + tokens.md + components.md) linked from
     AGENTS.md and CLAUDE.md, agent not told to open it (tests discovery).
- Task prompt is neutral: it never mentions tokens, reuse or consistency (the probe's
  no-hex instruction pinned its own result).
- Work: two screens (form-heavy, data-dense), then a second turn that adds a feature
  touching both, then a third after one token was renamed with the kit left stale.
- Agents: one frontier model, haiku. ≥5 runs per arm per model.
- Measures, against the git baseline, matching rules written before the runs:
  1. literals added in the diff (colours, px sizes, radius, shadow);
  2. reuse: for a predeclared list of UI needs in the task (button, input, card, table,
     badge, dialog…), was the existing component imported? Scored blind by a judge
     that sees the diff and the component list, not the arm;
  3. duplicates: new component files whose role matches an existing component
     (same blind judge, predeclared rule);
  4. build passes; 5. did the agent read the kit (transcript).
- Reading: frontier is likely ceiling-pinned; a kit that helps haiku and does not hurt
  frontier is a pass.

**Decision rule.** If C does not beat B clearly on reuse and literals, the export is
not worth building: ship B (a managed AGENTS.md/CLAUDE.md section written by
`coherent init`) plus the checker, and stop. Only if C wins, build the export below.

## What goes in (if step 0 passes)

Committed folder `design-kit/` (neutral, not vendor-specific), with managed links from
both AGENTS.md and CLAUDE.md, which `coherent init` already writes. Same SKILL.md
shape, so Claude Code can also load it as a skill.

```
design-kit/
  SKILL.md        ~50 lines: when to use, the rules, where things are
  tokens.md       name, light/dark value, category, source file
  components.md   reusable components first: name, purpose, import, props, variants, parts, example
  check.mjs       literal colours/sizes in changed TSX (see Checker)
```

- **tokens.md**: no usedBy/routes (noise, can be huge).
- **components.md**: primitives and shared components first; one-off page blocks
  in a short list at the end. No IDs, routes, previews. Props, variants and examples
  are best-effort: props resolve only from inline/local types (graph.ts:139), examples
  only from direct importers using the exact JSX name (design-system.ts:397). Missing
  fields are omitted, never invented; step 0's hand-written kit shows which fields
  actually mattered.
- **Rules** (SKILL.md), operational and checkable:
  - colours, spacing, radius, type and shadow come from tokens, not literals;
  - before writing a component, check components.md; reuse or add a variant;
  - new reusable components go to the stated folder;
  - a new or changed token needs a reason stated in the change, not a workaround
    for one screen;
  - run the checker before finishing.

## Checker

`raw-values.ts` uses the TypeScript AST (raw-values.ts:12, :126) and hard-coded
regexes; it does not read tokens from CSS (v1 of this plan was wrong). Option chosen:
`check.mjs` imports `typescript` from the project's own node_modules (every Next.js
TypeScript app has it); if it is missing, it says so and exits 0. Classification is
generated from the same source as `raw-values.ts` so the two never disagree.
Warnings only, as in Coherent. It catches literals; it cannot catch look-alike
components or the wrong token, which is why step 0 measures those separately.

## Freshness and transactions

The kit is written **inside** the open edit / ds-sync transaction, like the
/design-system viewer: its files are declared in the write set (session.ts:522,
:647, :696), verified with the edit and rolled back with it. Never a post-commit write
(it would survive a rollback stale). After Coherent is removed the kit can drift;
the rules name the source files as the authority, and step 0's stale-kit turn
measures how much that hurts.

## Build steps (after step 0 passes)

1. `kit.ts`: DesignSystem → the three .md files (pure, unit-tested).
2. `check.mjs` generator from the raw-values classification.
3. Write the kit inside edit and ds-sync transactions; `coherent kit` for a manual run.
4. `coherent init`: managed links in AGENTS.md and CLAUDE.md.
5. CHANGELOG, QUICK_REFERENCE.

1–2 days of code after step 0.

## Not in v1

Screenshots, DESIGN.md / atmosphere prose, readiness score / badge / Figma, component
code in the kit, extra token formats (`export tokens --format dtcg` exists), the
marketplace skill (distribution work, separate from this; shared format only).

## Changes from v1 (Codex review, 2026-11-18)

- Added step 0 with an "inspect the repo" control arm, discovery, multi-turn and a
  stale-kit turn; the earlier probe never tested an agent inside a repo.
- Acceptance test: git-baseline diff, predeclared matching, blind judge, ≥5 runs,
  neutral prompt.
- Checker: not zero-dependency (uses the project's typescript); does not read CSS.
- Index is partial: props and examples best-effort, fields omitted when unknown.
- Kit written inside the transaction, not after commit.
- Dropped: usedBy/routes in tokens.md, IDs/routes/previews in components.md,
  blank `@coherent-id`, "never edit tokens".
- Location: committed `design-kit/` + AGENTS.md and CLAUDE.md links, not `.claude/skills`.

## Step 0 results (2026-11-18)

App: a copy of `~/Web/submitad-coherent` (Next 15, Tailwind 4, 18 shadcn primitives,
12 shared blocks, 47 tokens), Coherent files removed, eslint/type errors ignored in
build (10 pre-existing type errors recorded, only new ones counted). Agents: Claude
Code `-p`, sonnet and haiku, tool allowlist (read/write/edit, `npm run build`), user
plugins/MCP off. 3 arms x 2 models x 5 runs x 3 turns = 90 turns, all builds green.
Reuse scored by a blind sonnet judge (anonymised diffs, predeclared 12 needs).

| arm | model | literals added | reused existing (of 60) | of which shared blocks | look-alikes | stale token used in turn 3 | cost |
|---|---|---|---|---|---|---|---|
| A repo only | sonnet | 0 | 50 | 15 | 8 | 1/5 | $7.30 |
| B one line | sonnet | 0 | 47 | 12 | 12 | 3/5 | $7.66 |
| C kit | sonnet | 0 | 50 | 15 | 8 | 2/5 | $8.17 |
| A repo only | haiku | 0 | 45 | 10 | 15 | 3/5 | $1.02 |
| B one line | haiku | 0 | 47 | 12 | 13 | 4/5 | $0.94 |
| C kit | haiku | 0 | 50 | 17 | 10 | 4/5 | $1.12 |

- **Literals: zero in every run.** Agents inside a tokenised repo already write tokens.
  The kit's main promise is a non-problem here.
- **Discovery works:** every C run read the kit via the CLAUDE.md pointer.
- **Reuse:** no effect for sonnet (A = C). Haiku shows a small gradient A 45 → B 47 →
  C 50, shared blocks 10 → 12 → 17; n = 5, directional only. Below the "clearly beats
  B" bar.
- **Same misses in every arm:** money values re-formatted inline instead of
  `MoneyCell` (24/30 runs), a new change-indicator component instead of `KpiCard`'s
  `delta` (30/30), hand-built filter bars (14/30). Documentation does not fix
  semantic reuse.
- **Stale tokens are the real failure: 17/30 runs** used `*-success` in turn 3 after
  the token was renamed to `positive`, in all arms, including those with no kit. The
  source is the agent's own session memory, not the kit. Tailwind 4 drops unknown
  classes silently, so the build passes and the colour just disappears.

Decision (by the rule above): do not build the full export. Build instead:
1. a managed section in AGENTS.md and CLAUDE.md written by `coherent init`
   (arm B, plus a short list of shared blocks: name, import, one line, untested);
2. `check.mjs` that flags (a) literals and (b) classes that reference a token which does
   not exist; (b) is the failure that actually happened, and only a check catches it.
Caveat: one app with 30 components; a repo with hundreds of components may change the
reuse result. Harness: scratchpad `kit-exp/` (run.sh, score.py, judge/), not kept.
