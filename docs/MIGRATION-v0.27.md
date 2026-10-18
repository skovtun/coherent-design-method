# Migrating to Coherent v0.27.0

## TL;DR — what to do

- **You have an existing project made by the old `coherent init`.** Nothing breaks. `coherent chat`, `coherent preview`, `coherent check`, `coherent fix` and the `/coherent-*` skills work as before. They are deprecated and no longer developed.
- **You run `coherent init` in scripts or CI to create projects.** It now sets up agent mode instead of the generator project. Add `--classic` to keep the old behaviour, and plan to move off it.
- **You pass `--skill-mode`, `--api-mode` or `--both` to `init`.** These only apply together with `--classic` now.
- **You start a new app.** Run `npx @getcoherent/cli init my-app` and open it in Claude Code. See the README quick start.

## What changed

v0.27.0 changes what Coherent is for ([ADR-0011](wiki/ADR/0011-governance-not-authorship.md)). On the same spec and the same model, plain Claude Code produced a better app than Coherent's generation pipeline on every matched screen, and every defect in the pipeline's output traced back to a Coherent step (template chrome, keyword-based component reuse, per-page generation). So Coherent stops authoring design. The coding agent designs; Coherent governs each edit: scope, write set, verification in a real browser, honest verdict, rollback.

## BREAKING — `coherent init` sets up agent mode

v0.26.x created a generator project (design system config, `/design-system` viewer, page templates). v0.27.0:

| Folder | What init does |
|---|---|
| Empty | Official `create-next-app --empty` + `shadcn init` + a welcome page + the Coherent agent |
| Existing Next.js app | Adds the agent only; app code untouched |
| Already set up | Updates the agent files in place |
| Anything else (non-empty, not Next.js) | Refuses with an error |

The old behaviour is `coherent init --classic`. It prints a deprecation warning.

### Files init writes into your project

- `.claude/agents/coherent.md` — the agent.
- `.mcp.json` — adds a `coherent` server (`coherent mcp --profile agent`). Other servers are kept.
- `.claude/settings.json` — merged: sets `"agent": "coherent"` unless you already have a default agent (then it keeps yours and says so), and adds a `PreToolUse` hook (`coherent hook pre-write`).
- `AGENTS.md` — a section between `<!-- coherent:start -->` and `<!-- coherent:end -->`. The rest of the file is yours.
- `.gitignore` — `.coherent/tx/`, `.coherent/shots/`, `.coherent/edits/`.
- `package.json` — `@getcoherent/cli` (pinned to the init version) and `playwright` as dev dependencies, installed with your project's package manager (from `packageManager`, then the lockfile, else npm). Chromium is downloaded for verification.

Re-running init replaces its own entries; it does not duplicate them.

### The write guard applies to every Claude Code session in the project

The hook lives in the project's `.claude/settings.json`, so it governs all Claude Code sessions there, not only the Coherent agent: a source write outside an open edit is denied with a message saying which tool to call. To opt a project out, remove the `coherent hook pre-write` entry from `.claude/settings.json`. The hook is feedback, not the enforcement boundary; verification diffs the whole tree regardless.

### Not supported in v0.27.0

- **Yarn Plug'n'Play.** The hook runs the CLI from `node_modules`. Set `nodeLinker: node-modules` in `.yarnrc.yml`; init refuses a project with `.pnp.cjs`.
- **Windows** is untested.

## New commands

```bash
coherent init [dir]              # agent mode setup (see above)
coherent edit "<request>"        # governed edit from the CLI, with Coherent's own model
coherent edit --undo [id]        # byte-exact rollback of that edit's own files
coherent mcp --profile agent     # governance-only MCP tools: inventory, begin/verify/rollback edit
coherent hook pre-write          # the Claude Code PreToolUse hook
```

`coherent mcp` without `--profile` still serves the v0.24 design-contract tools.

## Packaging

`typescript` moved from `devDependencies` to `dependencies` of `@getcoherent/cli`: the governance graph parses your code with the compiler at runtime. `coherent edit` and the hook load it lazily, so other commands don't pay the startup cost.
