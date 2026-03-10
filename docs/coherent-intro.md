# Coherent Design Method - Introduction

## What is Coherent?

**Coherent** (full name: **Coherent Design Method**) is an AI-powered CLI tool for building production-ready frontend applications with stateful design systems.

> "Like BMAD structures backend development, Coherent structures frontend design systems through AI-driven stateful generation."

---

## The Problem We're Solving

### Current State: AI Code Generators Create Inconsistent UIs

Modern AI tools (V0, Bolt, Lovable) generate code from scratch each time:

```bash
User: "Create a login page"
AI: Generates Button.tsx, Input.tsx, Form.tsx

User: "Create a dashboard"  
AI: Generates NEW Button.tsx (looks different!), NEW Input.tsx
```

**Result:** Multi-page applications where:
- Forms look different on `/login` vs `/settings`
- Tables have inconsistent styling across pages
- Buttons vary in size, color, and behavior
- No architectural cohesion - just a collection of disconnected screens

**This is not a real application. It's visual chaos.**

---

## The Coherent Solution

### Stateful Design System with Architectural Memory

Coherent creates applications where **all components are registered, reused, and stay consistent**:

```bash
coherent init
# AI asks UX questions → generates initial design system

coherent chat "create login page"
# Generates: Button, Input, Form components
# Registers in design-system.config.ts

coherent chat "create dashboard"
# AI sees: "Button already exists - reusing it"
# Uses SAME Button component, doesn't create duplicate

coherent chat "make all buttons rounded"
# Updates Button.tsx
# ALL pages with buttons automatically update
```

**Result:** A true multi-page application where every screen is visually and architecturally connected.

---

## Core Principles

### 1. Component Registry
**All components live in a single source of truth** (`design-system.config.ts`)

When generating new pages, AI:
- ✅ Checks existing components first
- ✅ Reuses when appropriate
- ❌ Never creates duplicates

### 2. Design Tokens as Foundation
**Colors, spacing, typography centralized** - not hardcoded

```typescript
// BAD (hardcoded)
className="bg-blue-500"

// GOOD (uses token)
className="bg-primary"  // References design-system.config.ts
```

Change token → cascades everywhere automatically.

### 3. Cascading Updates
**Modify once, update everywhere**

```bash
coherent chat "change primary color to green"
# Updates design token
# Every component using bg-primary turns green
# All 10 pages reflect the change instantly
```

### 4. Dependency Tracking
**System knows what depends on what**

```bash
coherent chat "delete Button component"
# System: "Button is used in 5 pages: /home, /login, /dashboard, /settings, /profile"
# System: "Replace with another component first, or confirm deletion"
```

Prevents breaking changes.

### 5. Architectural Consistency
**Pages aren't isolated - they're part of a system**

- Shared navigation (all pages know about each other)
- Shared layout (Header/Footer consistent)
- Shared state management (auth, user data available globally)
- Unified routing structure

---

## What Coherent Generates

### Application Types Supported

**Multi-page Applications (MPA)**
- Framework: Next.js 15 with App Router
- Routing: Server-side, file-based
- Use case: SEO-critical apps, traditional websites, API portals

**Single-page Applications (SPA)**
- Framework: React 19 + React Router
- Routing: Client-side only
- Use case: Interactive dashboards, admin panels, web apps

### Generated Structure

```
your-app/
├── design-system.config.ts    # Source of truth (stateful)
├── components/                # Shared components
│   ├── Button.tsx             # Used across ALL pages
│   ├── Input.tsx
│   ├── Card.tsx
│   └── ...
├── app/                       # Pages (Next.js) or
│   ├── page.tsx              # pages/ (React SPA)
│   ├── dashboard/
│   │   └── page.tsx
│   └── settings/
│       └── page.tsx
├── lib/
│   └── store.ts              # State management (Zustand)
└── tailwind.config.ts        # Derived from design tokens
```

**Everything is connected. Nothing is isolated.**

---

## Key Features

### ✅ Visual Consistency
All components follow the same design language across every page.

### ✅ Architectural Cohesion  
Components imported from single source, not duplicated per page.

### ✅ Functional Integration
Shared navigation, state management, routing - pages work together.

### ✅ Incremental Updates
Change design tokens → cascades automatically. No manual refactoring.

### ✅ Production-Ready Code
Working forms, routing, state management - not just mockups.

---

## Comparison with Competitors

| Feature | V0 / Bolt / Lovable | Coherent |
|---------|-------------------|----------|
| **Memory** | None - regenerates each time | Stateful - remembers decisions |
| **Component reuse** | Creates duplicates | Registry-based reuse |
| **Design consistency** | Manual effort | Automatic via tokens |
| **Multi-page coherence** | Each page independent | All pages connected |
| **Updates** | Regenerate entire page | Incremental, cascading |
| **State management** | Not included | Built-in (Zustand) |
| **Production-ready** | Prototype quality | Deploy-ready code |

---

## Use Cases

### Perfect for:
- 🎯 **API Portals** (registration, dashboard, settings)
- 🎯 **SaaS Applications** (landing, pricing, app pages)
- 🎯 **Admin Dashboards** (tables, forms, charts)
- 🎯 **Marketing Sites** (multi-page with consistent branding)
- 🎯 **MVP Building** (fast, consistent, scalable)

### Not for:
- ❌ Static sites (use Astro/Hugo)
- ❌ Complex 3D/WebGL apps (too specialized)
- ❌ Mobile apps (we're web-only)

---

## How It Works (Simple Example)

### 1. Initialize Project
```bash
coherent init
```
AI asks:
- What are you building? → "API Portal"
- Multi-page or SPA? → "Multi-page"
- Pages needed? → "Registration, Dashboard, Settings"
- Primary color? → "#3B82F6"
- Dark mode? → "Yes"

Generates complete Next.js app with design system.

### 2. Modify via Chat
```bash
coherent chat "add a pricing page"
# AI generates /pricing using existing components
# Reuses Button, Card from component registry
# Follows established design patterns

coherent chat "make buttons more rounded"
# Updates Button.tsx border-radius
# All pages with buttons update automatically
```

### 3. Preview & Deploy
```bash
coherent preview
# Launches dev server at http://localhost:3000

coherent export
# Generates production build
# Ready for Vercel/Netlify deployment
```

---

## Technology Stack

### Core
- **Node.js 20+** - Runtime
- **TypeScript** - Type safety
- **pnpm** - Package management

### Frontend Generation
- **Next.js 15** - Multi-page apps
- **React 19** - SPA + components
- **Tailwind CSS** - Styling
- **shadcn/ui** - Base component library

### AI Integration
- **Claude Sonnet 4.5** - Code generation
- **Anthropic API** - AI orchestration

### State & Routing
- **Zustand** - State management
- **React Router** - SPA routing (when applicable)

---

## Project Status

**Current Phase:** Phase 1 - MVP Development

**Dogfooding Project:** API Portal with registration, dashboard, and settings pages

**Timeline:** 2-3 weeks for working MVP

**Open Source:** TBD (likely Open Core model)

---

## Core Team Philosophy

**Inspiration:** BMAD (Breakthrough Method for Agile AI-Driven Development)

**Approach:**
- Build for ourselves first (dogfooding)
- Quality over speed
- Solve real problems, not imaginary ones
- Open and transparent development

**Goal:** Make frontend development as structured and consistent as BMAD makes backend development.

---

## Getting Started

### Prerequisites
- Node.js 20+
- pnpm installed
- Anthropic API key

### Quick Start
```bash
# Install
npm install -g @getcoherent/cli

# Initialize project
coherent init

# Start building
coherent chat "add a login page"
coherent preview
```

### Documentation
All documentation is in `/docs`:
- `PROJECT_SETUP.md` - Technical setup
- `ARCHITECTURE.md` - System design
- `PROJECT_TASKS.md` - Implementation roadmap
- `BMAD_GUIDE.md` - How to use with bmad

---

## What Makes Coherent Different?

**Not just another code generator.**

Coherent is a **design method** - a systematic approach to building consistent, stateful UI systems with AI assistance.

Like BMAD gives you:
- Structured planning (Analyst, PM, Architect agents)
- Context-rich development (Scrum Master, Dev agents)
- Architectural memory (everything connected)

Coherent gives you:
- Structured design (Discovery, Generator agents)
- Stateful components (Component Registry, Design Tokens)
- Visual memory (changes cascade, nothing breaks)

**The result:** Applications that feel like they were designed by a team with a style guide, not cobbled together from random AI generations.

---

## Questions?

Read the full documentation in `/docs` folder.

Start with:
1. `00_INTRODUCTION.md` (this file)
2. `PROJECT_SETUP.md` (technical details)
3. `ARCHITECTURE.md` (how it works)
4. `PROJECT_TASKS.md` (implementation steps)

**Ready to build?** Run `coherent init` and let's go! 🚀

---

**Version:** 1.0  
**Created:** 2025-01-26  
**Name:** Coherent Design Method  
**Tagline:** "Stateful design systems that stay coherent"