# url-extract fixtures

Hand-crafted HTML fixtures that mimic the visual atmosphere of well-known sites.
Used by `extract-fixtures.test.ts` to assert that the deterministic extraction
layer (sample → extractDesignTokens) produces brand-recognizable DESIGN tokens.

## Why hand-crafted, not raw captures

These are NOT exact snapshots of stripe.com / linear.app / apple.com. They are
SEMANTIC representations: each fixture inlines styles + cascade CSS that match
the brand's known characteristics (Stripe purple `#635BFF`, Linear's neutral
grayscale + tight typography, Apple's black-on-white minimalism).

Hand-crafted wins for regression tests because:

- **Stable across target redesigns.** If Stripe rebrands, real captures break;
  representative fixtures keep testing what we said we'd test.
- **Deterministic.** No anti-bot edge cases, no JS-deferred content, no UA
  variance.
- **Small.** ~5KB each instead of ~500KB raw HTML.
- **happy-dom-compatible.** Inline + cascade styles work without a layout engine.

For real-site integration testing, run `coherent extract <url>` against the
target site directly — that's a different concern (browser-capture + Playwright)
and lives outside this fixture suite.

## Refresh policy

Fixtures should ONLY change when:

1. A brand's published design system changes substantially (Linear shifts to a
   color palette).
2. The extractor adds support for a new category that needs a fixture example.
3. A bug surfaces that the fixture should have caught.

Do NOT refresh fixtures to fit a new extractor output — that defeats their
purpose as regression tests.

## Adding a fixture

1. Identify a brand atmosphere worth locking in (distinct color, typography, or
   spacing pattern).
2. Write minimal HTML: `<body>` with `<style>` block + semantic structure
   (h1, p, button, a, section).
3. Inline brand-defining hex values via `style="color: #..."` or in the
   `<style>` block.
4. Add an entry to `extract-fixtures.test.ts` asserting the brand-recognizable
   output.
