# Coherent Design Method

> A systematic approach to building consistent, stateful design systems through AI-assisted development

**Created by [Sergei Kovtun](https://github.com/skovtun)**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Status: Active Development](https://img.shields.io/badge/Status-Active%20Development-green.svg)]()

---

## What is Coherent Design Method?

Coherent Design Method is a **design methodology** for creating production-ready applications where every component, every page, and every design decision is **connected, reusable, and consistent**.

Unlike traditional approaches that treat each page as an isolated artifact, Coherent ensures that:
- ✅ Components are **registered and reused** across the entire application
- ✅ Design tokens **cascade automatically** when changed
- ✅ The system **remembers architectural decisions** and maintains them
- ✅ Changes propagate **incrementally**, not through full regeneration

**Think of it as "design systems that stay coherent by design."**

---

## The Problem We're Solving

Modern development often produces **visually inconsistent** applications:

- Different button styles on different pages
- Duplicate components with slight variations
- No single source of truth for design decisions
- Manual effort to maintain consistency
- Breaking changes when refactoring

**The result:** Applications that look like they were built by different teams at different times.

---

## The Coherent Solution

### Core Principles

**1. Component Registry**
Every component lives in a single source of truth. When generating new features, the system checks existing components first and reuses them.

**2. Design Tokens as Foundation**
Colors, spacing, typography are centralized. Change a token, and the change cascades everywhere automatically.

**3. Stateful Design System**
The system remembers what components exist, how they're used, and what depends on what. No amnesia between iterations.

**4. Incremental Updates**
Modify one thing, update only what's affected. No need to regenerate entire pages or components.

**5. Architectural Consistency**
Pages aren't isolated — they share navigation, layout, state management, and routing structure.

[Read more about principles →](principles.md)

---

## Core Concepts

### 🎯 Coherence vs Consistency

**Consistency** = Things look the same  
**Coherence** = Things are connected and work together as a system

Coherent Design Method achieves both: visual consistency through systemic coherence.

### 🔗 Component Registry

A declarative manifest of all components in your design system:
- What components exist
- Where they're used
- What they depend on
- How they're composed

### 🎨 Design Tokens

Single source of truth for design decisions:
- Colors (primary, secondary, accent, semantic)
- Typography (font families, sizes, weights)
- Spacing (margins, padding, gaps)
- Borders (radius, width, style)

### 🔄 Dependency Tracking

The system knows what depends on what:
- Can't delete a component that's in use
- Updates cascade to all dependents
- Safe refactoring with full visibility

### 📦 Stateful vs Stateless

**Stateless (traditional):** AI regenerates from scratch every time  
**Stateful (Coherent):** System remembers decisions and builds incrementally

[Explore all concepts →](core-concepts.md)

---

## How It Works (Conceptually)

### Traditional Approach
```
Request: "Create a login page"
AI: Generates Button.tsx, Input.tsx, Form.tsx

Request: "Create a dashboard"
AI: Generates NEW Button.tsx (different!), NEW Input.tsx

Result: Inconsistent components, duplicate code, visual chaos
```

### Coherent Approach
```
Initialize: Define design system (colors, components, structure)

Request: "Create a login page"
System: Generates Button, Input, Form
        Registers them in component registry

Request: "Create a dashboard"
System: Checks registry → Button exists
        Reuses existing Button component
        Generates only new, unique components

Request: "Make all buttons rounded"
System: Updates Button.tsx
        All pages using Button update automatically

Result: Consistent application, single source of truth, zero duplication
```

---

## Use Cases

### Perfect For:
- 🎯 **Multi-page applications** with consistent branding
- 🎯 **Design systems** that need to scale
- 🎯 **Product teams** building MVPs quickly but sustainably
- 🎯 **API portals** with registration, dashboard, settings
- 🎯 **SaaS applications** with complex UI requirements
- 🎯 **Admin dashboards** with tables, forms, and charts

### Not For:
- ❌ Static sites (use Astro/Hugo instead)
- ❌ Highly specialized 3D/WebGL applications
- ❌ Mobile-first applications (web-focused methodology)

---

## Methodology, Not Just a Tool

Coherent Design Method is **framework-agnostic**. While we provide a reference implementation (Coherent CLI - coming soon), the principles can be applied to:

- **React** ecosystems (Next.js, Remix, Vite)
- **Vue** ecosystems (Nuxt, Vite)
- **Any component-based framework**

The method defines:
- ✅ How to structure design systems
- ✅ How to maintain coherence at scale
- ✅ How to work with AI tools effectively
- ✅ How to avoid common pitfalls

[Learn how to apply it →](getting-started.md)

---

## Documentation

### Methodology
- [Principles](principles.md) — Core principles of the method
- [Core Concepts](core-concepts.md) — Key concepts explained
- [Getting Started](getting-started.md) — How to apply the method (CLI, manual)

### Product & development (this repo)
- **Architecture (product):** [architecture-doc.md](architecture-doc.md) — High-level product architecture (MPA/SPA, overview)
- **Architecture (technical):** [architecture.md](architecture.md) — Epic 1 technical architecture (templates, prompt, validator)
- **Epics & stories:** [epic-2-shared-components.md](epic-2-shared-components.md), [epic-3-production-ready.md](epic-3-production-ready.md); stories in [stories/](stories/)
- **QA:** [qa/](qa/) — Test reports, backlog
- **Reference:** [design-rules.md](design-rules.md), [ux-rules.md](ux-rules.md), [layout-components.md](layout-components.md)
- **Positioning:** [platform-capabilities.md](platform-capabilities.md), [brief.md](brief.md), [prd.md](prd.md)

---

## Reference Implementation

**Coherent CLI** — An AI-powered tool that implements this methodology for React/Next.js projects.

🚧 **Status:** In development  
📦 **Repository:** Coming soon  
🎯 **Target:** Phase 1 MVP (Q1 2025)

The CLI will provide:
- Interactive project initialization
- Conversational component generation
- Automatic design system management
- Real-time preview and export

---

## Community & Contributions

We welcome contributions to the methodology:

- 📝 **Documentation improvements** — clarify concepts, add examples
- 💡 **Case studies** — share how you applied the method
- 🐛 **Issue reports** — found unclear areas? Let us know
- 🤔 **Discussion** — join conversations in Issues

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting PRs.

---

## Commercial Services

While the methodology is open source and free to use, professional services are available:

### 🎓 Training & Workshops
In-depth training sessions for teams adopting Coherent Design Method.

### 💼 Consulting
Expert guidance on implementing the method in your organization.

### 🏆 Certification
Official "Coherent Design Practitioner" certification program (coming 2025).

### 🛠️ Enterprise Tools
Advanced tooling and integrations for large-scale implementations.

**Interested?** Contact: [To be added]

---

## Inspiration & Related Work

Coherent Design Method is inspired by:

- **Domain-Driven Design** (Eric Evans) — Bounded contexts, ubiquitous language
- **Systems Thinking** — Interconnected systems vs isolated components
- **BMAD** (Breakthrough Method for Agile AI-Driven Development) — Stateful AI agents
- **Design Systems** (various) — Component libraries, design tokens

But it's distinct in its focus on **stateful, AI-assisted, incremental design system evolution**.

---

## Roadmap

### ✅ Phase 0: Foundation (Current)
- Core methodology documentation
- Philosophy and principles defined
- Community launch

### 🚧 Phase 1: Reference Implementation (Q1 2025)
- Coherent CLI MVP
- Next.js + React support
- Basic component generation

### 📋 Phase 2: Ecosystem (Q2 2025)
- Vue/Nuxt support
- Community templates
- Plugin system

### 📋 Phase 3: Scale (Q3 2025)
- Team collaboration features
- Enterprise tooling
- Certification program

---

## License

This methodology and documentation are released under [MIT License](LICENSE).

**Copyright (c) 2025 Sergei Kovtun**

Coherent Design Method™ is a trademark of Sergei Kovtun.

---

## Stay Connected

- 🐦 Twitter: [To be added]
- 💬 Discord: [To be added]
- 📧 Newsletter: [To be added]
- 🌐 Website: [To be added]

---

**Built with clarity. Designed for coherence.**

*Created by [Sergei Kovtun](https://github.com/skovtun) • 2025*
