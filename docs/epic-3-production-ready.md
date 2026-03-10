# Epic 3: Production Ready (PH Launch)

## Vision

Three parallel tracks to make Coherent Design Method launch-ready:

- **Track A: Export** — user can take the result and deploy it
- **Track B: Quality** — generated UI looks professional in every demo
- **Track C: Figma Import** — headline feature, the PH differentiator

All three are needed. No hard deadline — launch when the product genuinely impresses.

---

## Track Dependencies

```
Track A (Export):     3.1 → 3.2
Track B (Quality):   3.3 → 3.4 → 3.5 → 3.6 → 3.7
Track C (Figma):     3.8 → 3.9 → 3.10 → 3.11 → 3.12
                                    ↘
All three          →→→→→→→→→→→→→    3.13 (E2E)
```

Tracks A, B, C are independent — can run in parallel. Story 3.13 waits for all three.

---

## Track A: Export / Deploy

**Stories:** 3.1 (coherent export), 3.2 (Deploy guides)

The missing last mile: user generates a prototype → needs to ship it.

---

## Track B: Generation Quality

**Stories:** 3.3 (Form & Settings), 3.4 (Button & Interactive), 3.5 (Dark Mode), 3.6 (New Templates), 3.7 (Quality Smoke Test)

Target: every generated page looks like it could ship today.

---

## Track C: Figma Import

**Stories:** 3.8 (Figma API), 3.9 (Design Token Extraction), 3.10 (Component Normalization), 3.11 (Page Generation from Frames), 3.12 (Import CLI Flow)

Headline feature: "Import your Figma → get a working prototype with a design system."

---

## PH Launch Checklist (when all tracks are done)

**Product:**

- [ ] `coherent init` → `coherent chat` → `coherent preview` → `coherent export` — full cycle works
- [ ] Figma import → working prototype in <60 seconds
- [ ] 12 page templates, all scoring ≥8/10
- [ ] Dark mode works
- [ ] Design System viewer complete (components, shared, tokens, docs)
- [ ] `coherent validate` passes on all generated projects
- [ ] `coherent audit` shows full consistency

**Marketing:**

- [ ] Demo video (60 seconds: Figma → import → preview → modify → export)
- [ ] Landing page / website
- [ ] README with clear "Getting Started"
- [ ] 3-4 example projects (SaaS dashboard, portfolio, e-commerce, blog)
- [ ] PH post: tagline, description, screenshots, maker comment

**Infrastructure:**

- [ ] npm package published (`npm install -g @coherent/cli`)
- [ ] GitHub repo public
- [ ] License chosen (MIT?)
- [ ] CHANGELOG.md
- [ ] Contributing guide (if accepting contributions)

---

---

## Stories Index

| ID   | Title                    | Track | File |
|------|--------------------------|-------|------|
| 3.1  | coherent export          | A     | [3.1.export.md](stories/3.1.export.md) |
| 3.2  | Deploy Guides            | A     | [3.2.deploy-guides.md](stories/3.2.deploy-guides.md) |
| 3.3  | Form & Settings Quality  | B     | [3.3.form-settings-quality.md](stories/3.3.form-settings-quality.md) |
| 3.4  | Button & Interactive Quality | B  | [3.4.button-interactive-quality.md](stories/3.4.button-interactive-quality.md) |
| 3.5  | Dark Mode                | B     | [3.5.dark-mode.md](stories/3.5.dark-mode.md) |
| 3.6  | New Templates             | B     | [3.6.new-templates.md](stories/3.6.new-templates.md) |
| 3.7  | Quality Smoke Test Update | B     | [3.7.quality-smoke-test.md](stories/3.7.quality-smoke-test.md) |
| 3.8  | Figma API Integration    | C     | [3.8.figma-api.md](stories/3.8.figma-api.md) |
| 3.9  | Design Token Extraction  | C     | [3.9.design-token-extraction.md](stories/3.9.design-token-extraction.md) |
| 3.10 | Component Normalization  | C     | [3.10.component-normalization.md](stories/3.10.component-normalization.md) |
| 3.11 | Page Generation from Frames | C  | [3.11.page-generation-frames.md](stories/3.11.page-generation-frames.md) |
| 3.12 | Import CLI Flow          | C     | [3.12.import-cli-flow.md](stories/3.12.import-cli-flow.md) |
| 3.13 | E2E Smoke Test           | A+B+C | [3.13.e2e-smoke-test.md](stories/3.13.e2e-smoke-test.md) |
