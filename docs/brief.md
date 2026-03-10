# Project Brief: Coherent Design Method

**Version:** 1.1  
**Date:** 2026-01-26  
**Author:** John (PM) — BMAD methodology  
**Status:** Approved

---

## 1. Executive Summary

**Coherent Design Method** is an open-source CLI platform that enables designers to build production-ready, consistent multi-page application prototypes through natural language prompts, IDE chat, or Figma imports. Unlike code generators that produce inconsistent one-off pages, Coherent enforces systematic design consistency across all screens — components, tokens, states, and documentation are automatically synchronized. The result: a working interactive prototype with a built-in component library (Storybook) and auto-generated documentation, ready for developer handoff.

**Primary problem:** When building complex multi-page applications (20-100+ screens), designers face a fundamental consistency gap. Existing tools generate individual pages that look and behave differently; global changes (color scheme, component style, layout structure) require manual screen-by-screen updates. There is no tool that combines systematic consistency with code generation, working prototypes, and documentation in a single workflow.

**Target market:** "New generation designers" — design professionals who want to move beyond static Figma mockups into interactive, code-backed prototypes while maintaining design system discipline.

**Key value proposition:** One change → consistent update everywhere. Design, prototype, document — in one platform.

---

## 2. Problem Statement

### Current State

Designers working on complex applications (dashboards, SaaS products, e-commerce, admin panels) face a fragmented workflow:

1. **Design in Figma** → static mockups, no interactivity, no real states
2. **Generate code** (v0.dev, Lovable, Base44) → individual pages that don't share components or follow a system
3. **Build component library** (shadcn/ui, Storybook) → manual effort, disconnected from generated pages
4. **Write documentation** → separate process, often outdated

### Pain Points

- **Inconsistency at scale:** Page 1 uses 8px padding, page 15 uses 12px. Button on page 3 has different border-radius than page 7. Nobody notices until production.
- **Global changes are manual:** "Change the primary color" means finding and updating every screen, component, and token reference. In a 50-page prototype, this is hours of work.
- **No single source of truth:** Design tokens live in Figma, components in code, documentation in Notion. They drift apart immediately.
- **Prototypes don't prototype:** Figma mockups show screens but not flows, states, or interactions. Code generators produce code but not systems.

### Why Existing Solutions Fall Short

| Tool | What it does | What it misses |
|------|-------------|----------------|
| **Figma** | Design without code | No working prototype, no consistency enforcement, no auto-documentation |
| **v0.dev / Lovable / Base44** | Code generation | No design system, inconsistent across pages, no global changes |
| **shadcn/ui** | Component system | No page generation, no prototype, no documentation |
| **Builder.io / Anima** | Figma → Code | No normalization, no design system extraction, no consistency |
| **Storybook** | Component documentation | Manual setup, disconnected from pages, no generation |

No tool solves the full problem: **systematic consistency + generation + working prototype + documentation**.

### Urgency

The rise of AI-powered code generation (Cursor, Claude, GPT) makes it trivially easy to generate individual UI components. But this exacerbates the consistency problem — each AI call produces slightly different styling, spacing, and patterns. The need for a consistency layer on top of AI generation is growing, not shrinking.

---

## 3. Proposed Solution

### Core Concept

Coherent Design Method is a **design-first platform** built on a simple principle: a single configuration file (`design-system.config.ts`) is the source of truth for everything — components, tokens, pages, navigation, documentation. All generation, modification, and documentation flows through this config. Change the config → everything updates.

### Three Input Modes (Equal Entry Points)

1. **CLI prompts:** `coherent chat "add pricing page with 3 tiers"`
2. **IDE chat:** Natural conversation in Cursor, VS Code, or any editor with AI
3. **Figma import + chat:** Upload Figma file → Coherent extracts components, tokens, layouts → user refines via chat

### What Makes It Different

- **Systematic consistency by design:** Components are registered once and reused everywhere. Tokens cascade. One change propagates globally.
- **Three levels of global changes:**
  - Token-level: "change primary color" → all pages update
  - Component-level: "make all buttons rounded" → all button instances update
  - Layout/structure-level: "add breadcrumbs to all inner pages" → structural changes applied everywhere
- **Working prototype, not mockups:** The output is a real Next.js application with routes, navigation, states, and interactions.
- **Built-in Storybook:** Design System viewer at `/design-system` shows all components, variants, sizes, tokens — generated automatically.
- **Auto-documentation:** `/design-system/docs` provides component reference, token documentation, and UX recommendations — always in sync with the actual code.

### Quality Bar

Generated UI must match the quality of [shadcn/ui blocks](https://ui.shadcn.com/blocks): proper proportions, consistent spacing, professional typography, meaningful content (zero placeholders).

---

## 4. Target Users

### Primary: "New Generation Designer"

- **Profile:** UI/UX designer (3-10 years experience) who is comfortable with basic developer tools (terminal, Git) and wants to go beyond Figma mockups. **Does not necessarily write code** — works with the platform primarily through natural language prompts (CLI or IDE chat). Understands HTML/CSS/component concepts at a conceptual level but is not a developer.
- **Current workflow:** Design in Figma → hand off specs → developers interpret (poorly) → endless review cycles → design debt accumulates.
- **Pain points:** Can't test real interactions in Figma. Can't make global changes in generated code. Documentation is always out of date. Developers misinterpret spacing/colors/states.
- **Goal:** Build a real, interactive prototype that perfectly represents the design vision, then hand it off with documentation that eliminates ambiguity.
- **Success looks like:** "I described my app, tweaked the styles through prompts, and now I have a working 30-page prototype with a Storybook and docs — all consistent — that I can show stakeholders and give to developers."

### Secondary: Frontend / Fullstack Developer

- **Profile:** Developer who wants to accelerate UI implementation with design-system-first approach.
- **Current workflow:** Builds components from scratch or uses shadcn/ui; manually creates pages; maintains design system separately.
- **Goal:** Start with a consistent, production-ready codebase instead of building design systems from scratch.

---

## 5. Goals & Success Metrics

### Business Objectives

- **Dogfooding:** The author can build a satisfactory UI for their own projects using Coherent (blocking criterion for release)
- **Public release:** npm package published, GitHub repository with documentation
- **Community adoption:** First 10 external users within 3 months of release

### User Success Metrics

- **Time to first prototype:** < 30 minutes from `coherent init` to a working 5-page prototype (target after quality overhaul is complete)
- **Global change propagation:** Token change applies to all pages in < 5 seconds (generation time)
- **Consistency score:** Zero visual inconsistencies between pages sharing the same components/tokens (manual audit)
- **Quality perception:** Generated pages are indistinguishable from hand-crafted shadcn/ui block compositions (blind test)

### KPIs

- **Generation quality:** % of generated pages that pass the "no placeholder" audit (target: 100%)
- **Component reuse rate:** Average times each registered component is used across pages (target: > 3)
- **Figma-to-prototype time:** Minutes from Figma upload to working prototype (target: < 15 min for 10-page app)

---

## 6. MVP Scope

### Core Features (Must Have)

- **`coherent init`:** Non-interactive project creation (Next.js 15, Tailwind v3, shadcn/ui components). Already built, needs quality improvements.
- **`coherent chat`:** Natural language modifications — add pages, change tokens, modify components, restructure layouts. Already built, needs prompt quality overhaul.
- **Generation quality at shadcn/ui blocks level:** Templates/constraints that ensure every generated page looks professional. Partially built — **main blocker, highest priority.**
- **Token-level global changes:** "Change primary color" → all pages update. Already built.
- **Component-level global changes:** "Make all buttons rounded" → all instances update. Partially built.
- **Design System viewer (`/design-system`):** Built-in Storybook with components, variants, tokens. Already built.
- **Auto-documentation (`/design-system/docs`):** Component reference, token docs, UX recommendations. Already built.
- **Figma import:** Parse Figma files, extract components/tokens/layouts, generate Coherent project. **Not built — must-have for release, implemented after quality overhaul (Phase 2 of implementation).**
- **`coherent export`:** Production build for deployment. Already built.
- **`coherent repair`:** Fix common issues in generated code (missing deps, use client, metadata conflicts). Already built.

### Out of Scope for MVP

- SaaS / web interface (no hosted service)
- SPA support (React Router) — Next.js only
- Vue, Svelte, or other frameworks
- Real-time collaboration / team features
- CI/CD integration
- A2UI export format
- Local AI models (Ollama)
- Plugin system

### MVP Success Criteria

The author can:
1. Run `coherent init` in an empty folder and get a working Next.js project
2. Add 10+ pages via `coherent chat` with consistent, professional-looking UI (shadcn/ui blocks quality)
3. Make a global token change and see it reflected on all pages
4. Make a global component change and see it reflected on all instances
5. View all components, variants, and tokens in the built-in Storybook
6. Read auto-generated documentation that accurately reflects the current state
7. Export a production-ready build
8. Import a Figma file and get a working prototype that matches the design *(Phase 2 of implementation — after quality overhaul)*

---

## 7. Post-MVP Vision

### Phase 2 Features

- **Figma import** (must-have for public release; implemented after quality overhaul)
- Layout/structure-level global changes ("add breadcrumbs to all inner pages")
- Theme support (light/dark/custom, switchable)
- Advanced Figma integration (design token sync, component mapping refinement)
- Template library (pre-built page templates: dashboard, pricing, settings, etc.)
- `coherent ask` — AI advisory mode (suggestions without code changes)

### Long-term Vision (6-12 months)

- Web-based interface (SaaS) built on top of the Design System viewer
- Team collaboration (shared design systems, versioning)
- Design-to-code pipeline with Figma plugin (bidirectional sync)
- Component marketplace (share/import design systems between projects)
- Multi-framework support (Vue, Svelte)

### Expansion Opportunities

- Enterprise offering (private registries, SSO, audit trails)
- Integration with design tools beyond Figma (Sketch, Adobe XD)
- AI model fine-tuning on high-quality design systems for better generation

---

## 8. Technical Considerations

### Platform Requirements

- **Target platforms:** macOS, Linux, Windows (Node.js 20+)
- **Browser support:** Modern browsers (for generated Next.js projects and Design System viewer)
- **Performance:** Generation of a 50-page prototype should complete in < 2 minutes

### Technology Stack (Established)

- **CLI:** TypeScript, Commander.js, Chalk, Ora
- **Core engine:** TypeScript, Zod (validation)
- **Generated output:** Next.js 15, React 18, Tailwind CSS v3, shadcn/ui patterns
- **AI providers:** Anthropic Claude (default), OpenAI (optional)
- **Build:** tsup, pnpm monorepo
- **Component system:** shadcn/ui compatible (50+ registered components)

### Architecture Considerations

- **Repository:** pnpm monorepo (`@getcoherent/core`, `@getcoherent/cli`)
- **Config-driven:** Single `design-system.config.ts` as source of truth
- **Generator pipeline:** AI parse → validate (Zod) → apply (managers) → generate (generators) → write files
- **Figma integration (new):** Figma REST API → node tree parsing → component extraction → token extraction → layout interpretation → config generation
- **Editor-agnostic:** No dependency on Cursor; works with any editor

---

## 9. Constraints & Assumptions

### Constraints

- **Budget:** $0 (open-source, solo developer, AI API costs borne by user)
- **Timeline:** No hard deadline; release when dogfooding quality bar is met
- **Resources:** Solo developer with AI assistance (Claude Opus in Cursor + BMAD methodology)
- **Technical:** Pinned to Next.js 15 + Tailwind v3 (Tailwind v4 incompatible with current architecture)

### Key Assumptions

- Designers are willing to use a CLI / IDE chat interface (not purely visual)
- AI-generated code quality will improve with better prompts and constraints (not requiring model fine-tuning)
- shadcn/ui blocks quality is achievable through template-based generation with AI filling in content
- Figma REST API provides sufficient information to extract meaningful components and tokens
- A solo developer can build and maintain this with AI assistance at acceptable velocity

---

## 10. Risks & Open Questions

### Key Risks

- **Quality ceiling:** AI generation may not consistently achieve shadcn/ui blocks quality even with excellent prompts. Mitigation: template-based approach with AI only filling structured slots.
- **Figma parsing complexity:** Figma designs are messy — auto-layout vs absolute positioning, inconsistent naming, nested groups. Mitigation: start with well-structured Figma files; provide clear guidelines for "Coherent-friendly" Figma.
- **Scope creep (solo developer):** Figma import + quality overhaul + 3 levels of global changes is ambitious. Mitigation: strict phasing; quality first, Figma second.
- **Designer adoption of CLI:** Target users may resist terminal-based workflows. Mitigation: excellent documentation, IDE-first messaging, potential web interface in Phase 2.
- **Tailwind v3 lock-in:** Ecosystem is moving to v4. Mitigation: plan migration path; monitor v4 stabilization.

### Open Questions

- What is the minimum viable Figma import? (Full layout reconstruction? Or just component/token extraction?)
- Should generated projects be ejectable (remove Coherent dependency completely)?
- How to handle design drift when user manually edits generated code and then runs `coherent chat`?
- What is the licensing model? (MIT? Dual license?)

### Quality Gap Hypothesis

The primary approach to closing the quality gap: **template-based generation with strict design constraints** rather than free-form AI generation. Specifically:
1. Extract concrete spacing rules, typography hierarchy, and component composition patterns from shadcn/ui blocks
2. Encode these as hard constraints in the generation pipeline (not just prompt suggestions)
3. AI fills structured content slots within proven layout templates, rather than inventing layouts from scratch
4. Post-generation validation ensures zero placeholders, correct token usage, and proper component composition

### Areas Needing Further Research

- Figma REST API capabilities and limitations for component extraction
- Existing Figma-to-code libraries that could be leveraged (figma-api, figma-js)
- shadcn/ui blocks patterns — systematic analysis of what makes them look good (spacing, typography, proportions)
- Competitive analysis of v0.dev's prompt engineering approach

---

## 11. References

| Document | Location | Purpose |
|----------|----------|---------|
| CONTEXT.md | `/CONTEXT.md` | Project context, file structure, workflows |
| PROJECT.md | `/packages/docs/PROJECT.md` | Vision, product state, architectural decisions |
| PROJECT_TASKS.md | `/packages/docs/PROJECT_TASKS.md` | Task list and roadmap |
| UI-SYSTEM-PROMPT.md | `/UI-SYSTEM-PROMPT.md` | UI generation quality rules |
| DESIGN_QUALITY_METHODOLOGY.md | `/docs/DESIGN_QUALITY_METHODOLOGY.md` | Quality gap analysis and improvement plan |
| EXAMPLES.md | `/EXAMPLES.md` | Reference examples for UI quality |
| shadcn/ui blocks | https://ui.shadcn.com/blocks | Quality target reference |
| Project Brief | `/docs/brief.md` | This document |

---

## 12. Next Steps

1. **Review this brief** — validate vision, scope, and priorities
2. **Create PRD** — detailed requirements, user stories, acceptance criteria, phased roadmap
3. **Prioritize Phase 1 work** — likely: quality overhaul → component-level global changes → Figma import
4. **Define architecture for Figma integration** — Architect agent to design the pipeline
5. **Begin implementation** — Dev agent to execute against PRD stories

---

## PM Handoff

This Project Brief provides the full context for Coherent Design Method. The next step is to create a detailed PRD with user stories, acceptance criteria, and a phased implementation plan. The PRD should address the quality gap as the highest priority, followed by component-level global changes, then Figma import — ensuring each phase delivers usable value independently.
