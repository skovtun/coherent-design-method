# Runbooks

Operational how-tos for developing Coherent. Step-by-step procedures for tasks that don't happen often enough to remember but happen too often to re-derive.

**This directory is explicitly NOT indexed by `coherent wiki`.** Runbook content would pollute retrieval during code generation — operational steps are high-noise for the "how should this component look" question.

Contents:

- [cut-release.md](./cut-release.md) — version bump → test → commit → push → PR → merge → (optional) npm publish
- [validate-retrieval.md](./validate-retrieval.md) — sanity-check that wiki retrieval works end-to-end
- [debug-indexing.md](./debug-indexing.md) — when `coherent wiki search` returns nothing or wrong results

## How this fits the memory layering

| Layer | Location | Retrieval-indexed? | Audience |
|-------|----------|--------------------|----------|
| **Wiki** | `docs/wiki/` | ✅ Yes | Claude during generation |
| **Runbooks** | `docs/runbooks/` | ❌ No | Human developers |
| **FAQ** | `docs/FAQ.md` | ❌ No | Users |
| **Auto-memory** | `~/.claude/projects/<slug>/memory/` | ❌ No | Specific Claude user |
| **Conversation** | Chat context | N/A | Ephemeral |

Rule: if the content would help Claude write better pages, put it in wiki. If it helps a human operate the project, it goes here or in FAQ.

## Adding a runbook

Start from a concrete pain point: something you did, wished you'd had written down, and expect to do again within 6 months.

Format:

```markdown
# <Title>

<one-line purpose>

## Prerequisites

<what must be true before you start>

## Steps

1. ...
2. ...
3. ...

## Verifying it worked

<how to tell>

## Common failures

<failure mode: likely cause / how to recover>
```

Keep runbooks short. If it grows past 2-3 screens, it's probably two runbooks.
