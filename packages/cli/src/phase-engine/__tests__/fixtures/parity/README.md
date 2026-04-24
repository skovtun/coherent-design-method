# Parity Harness Fixtures

Recorded AI responses + golden file trees for the parity test suite.

## Layout

```
parity/
  <intent-slug>/
    intent.txt                  Plain-text intent passed to both rails.
    recorded-responses.json     Ordered list of AI responses, one per AI phase.
    expected-output/            Golden file tree produced by both rails.
      app/...
      components/shared/...
      coherent.manifest.json
      coherent.log.jsonl
```

## Canonical intents (v0.9.0)

- `marketing-saas-landing` — SaaS landing with hero/features/pricing/testimonials.
- `app-crm-dashboard` — CRM with tasks, customers, pipeline charts.
- `auth-login-register-forgot` — login / register / forgot-password flow.

## Recording protocol

Fixtures are recorded ONCE against the live Anthropic API, then replayed via
`MockProvider` in CI. To (re-)record:

```
pnpm vitest run parity --record=<intent-slug>
```

The record mode:

1. Forwards `provider.generate()` calls to a real `AnthropicProvider`.
2. Writes each response, in order, to `recorded-responses.json`.
3. Snapshots the resulting tmpfs project dir into `expected-output/`.

Replay is the default — CI must never hit the live API.

## Replay contract

`runRailB` (see `../../parity-harness.ts`) plays `recorded-responses.json`
through `MockProvider.enqueue(...)` in FIFO order. Deterministic phases
(`log-run`) do not consume queue entries.

## Why this structure

Per the R3 test plan: both rails must produce byte-identical file trees
given the same intent + AI responses. Divergence = regression. Keeping
fixtures in-repo (not on tmpfs) makes the golden tree auditable — a
failed parity check produces a human-readable diff the reviewer can read.

## Timestamp normalization

`coherent.log.jsonl` and `run-record.json` embed ISO-8601 timestamps.
The parity assertion normalizes `/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/`
to `<TS>` before diffing. Anything else that varies run-to-run (UUIDs,
session IDs) gets normalized in the harness, not silently ignored.
