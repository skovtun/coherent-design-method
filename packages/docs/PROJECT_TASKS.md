# Project Tasks

## Overview

This document is the single source of tasks for the Coherent CLI project (Phase 1 MVP and beyond). Tasks are ordered by dependencies.

**Goal:** Working MVP that can initialize a Next.js project with a design system and support basic modifications.

**Timeline:** 2-3 weeks

**Status:** 🚧 In Progress

**Architectural context (see PROJECT.md §7.1):** Recommended model after init is **one-time scaffolder**: primary workflow is `coherent init` → work in Cursor (edit code and config) → hot reload → `coherent export`. The `coherent chat` command may be removed or repurposed as `coherent ask` (advice only, no file changes). Custom components are created in Cursor and added to `design-system.config.ts`; optional CLI helpers (e.g. `add-component`) only create new files and do not overwrite existing ones.

---

## Phase 1.1: Foundation Setup

### Task 1.1: Setup Monorepo ✅ COMPLETED

**Status:** ✅ Done

**What was done:**
- Created monorepo structure with `packages/cli` and `packages/core`
- Setup pnpm workspace
- Created TypeScript configs
- Created package.json files for both packages
- Created placeholder files for all modules

**Verification:**
```bash
pnpm install  # Should work
pnpm typecheck  # Should compile
```

---

### Task 1.2: CLI Boilerplate ✅ COMPLETED

**Status:** ✅ Done

**What was done:**
- Created CLI with Commander.js
- Added 4 commands: init, chat, preview, export
- Added Chalk for colored output
- Added Ora for loading spinners
- All acceptance criteria met

---

### Task 1.3: Core Package Types ✅ COMPLETED

**Status:** ✅ Done

**What was done:**
- Copied types from `docs/design-system-types.ts`
- Exported all types from `@getcoherent/core`
- Zod schemas work for validation

---

## Phase 1.2: Discovery & Initialization

### Task 1.4: Discovery Agent ✅ COMPLETED

**Status:** ✅ Done

**What was done:**
- Interactive questions with Inquirer (9 questions)
- Returns `DiscoveryResult` object
- Input validation (hex colors, etc.)

---

### Task 1.5: Claude API Integration ✅ COMPLETED

**Status:** ✅ Done

**What was done:**
- `ClaudeClient` class for API calls
- Reads `ANTHROPIC_API_KEY` from environment
- Error handling and validation
- Config generation from discovery

---

### Task 1.6: Config Generator ✅ COMPLETED

**Status:** ✅ Done

**What was done:**
- Generates `design-system.config.ts` from discovery
- Validates config with Zod
- Saves to file with proper TypeScript format
- Full init flow working

---

## Phase 1.3: Core Managers

### Task 1.7: DesignSystemManager ✅ COMPLETED

**Status:** ✅ Done

**What was done:**
- Load/save config from TypeScript files
- Update tokens with cascade tracking
- Add components with duplicate prevention
- Add pages with navigation sync
- Component registry tracking

---

### Task 1.8: ComponentManager

**Status:** ✅ COMPLETED

**Goal:** Component CRUD operations with registry

**Acceptance Criteria:**
- [x] Can register components
- [x] Can find components by criteria (name, type, tags)
- [x] Tracks component usage across pages
- [x] Prevents duplicate components
- [x] Can update component definitions
- [x] Can delete components (with safety checks)

**What was done:**
- Full ComponentManager implementation (520+ lines)
- Component registry with Map-based storage
- CRUD operations (create, read, update, delete)
- Advanced search by multiple criteria
- Usage tracking (trackUsage/untrackUsage)
- Duplicate prevention with similarity detection
- Reuse logic (shouldReuseComponent, findBestMatch)
- Safety checks for updates and deletions

**Implementation Steps:**

1. **Implement `packages/core/src/managers/ComponentManager.ts`:**
```typescript
import type { ComponentDefinition, ComponentSearchCriteria } from '../types/design-system.js'

export class ComponentManager {
  private registry: Map<string, ComponentDefinition>
  private usageMap: Map<string, Set<string>> // componentId -> pageIds

  constructor() {
    this.registry = new Map()
    this.usageMap = new Map()
  }

  // Register component
  register(component: ComponentDefinition): void {
    if (this.registry.has(component.id)) {
      throw new Error(`Component ${component.id} already exists`)
    }
    this.registry.set(component.id, component)
  }

  // Find components by criteria
  find(criteria: ComponentSearchCriteria): ComponentDefinition[] {
    // Search by name, type, tags, etc.
  }

  // Track usage
  trackUsage(componentId: string, pageId: string): void {
    if (!this.usageMap.has(componentId)) {
      this.usageMap.set(componentId, new Set())
    }
    this.usageMap.get(componentId)!.add(pageId)
  }

  // Get usage
  getUsage(componentId: string): string[] {
    return Array.from(this.usageMap.get(componentId) || [])
  }

  // Update component
  update(id: string, updates: Partial<ComponentDefinition>): void {
    const component = this.registry.get(id)
    if (!component) {
      throw new Error(`Component ${id} not found`)
    }
    this.registry.set(id, { ...component, ...updates })
  }

  // Delete component (with safety checks)
  delete(id: string, force: boolean = false): void {
    const usage = this.getUsage(id)
    if (usage.length > 0 && !force) {
      throw new Error(
        `Cannot delete ${id}. Used in: ${usage.join(', ')}\n` +
        `Use force=true to delete anyway, or remove from pages first.`
      )
    }
    this.registry.delete(id)
    this.usageMap.delete(id)
  }
}
```

**Files to create/modify:**
- `packages/core/src/managers/ComponentManager.ts`
- `packages/core/src/types/design-system.ts` (add ComponentSearchCriteria if needed)

---

### Task 1.9: PageManager

**Status:** ✅ COMPLETED

**Goal:** Page composition and generation

**Acceptance Criteria:**
- [x] Can create pages
- [x] Can add sections to pages
- [x] Syncs with navigation
- [x] Generates page code (Next.js or React SPA)

**What was done:**
- Full PageManager implementation (600+ lines)
- CRUD operations (create, read, update, delete)
- Section management (addSection, removeSection, reorderSections)
- Navigation synchronization (syncWithNavigation)
- Code generation for Next.js App Router and React SPA
- Layout generation (Next.js and SPA)
- Component usage tracking integration
- Route validation and duplicate prevention

**Files to create/modify:**
- `packages/core/src/managers/PageManager.ts`

---

## Phase 1.4: Code Generation

### Task 1.10: ComponentGenerator

**Status:** ✅ COMPLETED

**Goal:** Generate React component code from definitions

**Acceptance Criteria:**
- [x] Generates valid React/TypeScript code
- [x] Uses design tokens
- [x] Supports variants and sizes
- [x] Follows shadcn/ui patterns

**What was done:**
- Full ComponentGenerator implementation (400+ lines)
- shadcn/ui pattern with cva (class-variance-authority)
- Variant and size support with defaultVariants
- Design token integration
- Custom component generation (simpler, without cva)
- forwardRef support for form elements
- Accessibility props (aria-label, aria-describedby)
- TypeScript interfaces with VariantProps
- cn utility integration for className merging

**Files to create/modify:**
- `packages/core/src/generators/ComponentGenerator.ts`

---

### Task 1.11: PageGenerator

**Status:** ✅ COMPLETED

**Goal:** Generate Next.js or React SPA pages

**Acceptance Criteria:**
- [x] Generates Next.js pages (App Router)
- [x] Generates React SPA pages (React Router)
- [x] Reuses components from registry
- [x] Includes proper imports

**What was done:**
- Full PageGenerator implementation (400+ lines)
- Next.js App Router page generation with Metadata API
- React SPA page generation with useEffect for SEO
- Component imports from registry (kebab-case file names)
- Section rendering with proper props
- Layout generation (Next.js and SPA)
- Navigation component generation
- SEO support (meta tags, Open Graph, robots)
- Proper string escaping for template literals

**Files to create/modify:**
- `packages/core/src/generators/PageGenerator.ts`

---

### Task 1.12: Project Scaffolding

**Status:** ✅ COMPLETED

**Goal:** Create complete Next.js project structure

**Acceptance Criteria:**
- [x] Creates Next.js 15 project
- [x] Installs dependencies (package.json)
- [x] Creates component files
- [x] Creates page files
- [x] Sets up Tailwind config from tokens

**What was done:**
- Full ProjectScaffolder implementation (500+ lines)
- TailwindConfigGenerator for design token → Tailwind config
- Complete Next.js 15 project structure
- package.json with all dependencies
- TypeScript configuration
- Tailwind CSS setup with design tokens
- Component generation from registry
- Page generation with proper routing
- Root layout generation
- Utility files (cn function)
- Global CSS with CSS variables
- .gitignore and README generation

**Files to create/modify:**
- `packages/cli/src/commands/init.ts` (complete implementation)
- `packages/templates/next-multipage/` (templates)

---

## Phase 1.5: Chat Command

### Task 1.13: Modifier Agent

**Status:** ✅ COMPLETED

**Goal:** Parse natural language into modification requests

**Acceptance Criteria:**
- [x] Understands token updates: "make buttons blue"
- [x] Understands component additions: "add a pricing page"
- [x] Checks component registry for reuse
- [x] Returns structured `ModificationRequest`

**What was done:**
- Full Modifier Agent implementation (300+ lines)
- Natural language parsing via Claude API
- Component registry checking for reuse
- Automatic component matching (findBestMatch)
- Structured ModificationRequest generation
- Support for all modification types (update-token, add-component, add-page, etc.)
- Component reuse suggestions when similar components exist
- Page modification with component validation

**Files to create/modify:**
- `packages/cli/src/agents/modifier.ts`

---

### Task 1.14: Chat Command Implementation

**Status:** ✅ COMPLETED

**Goal:** Full chat command that modifies design system

**Acceptance Criteria:**
- [x] Parses user message
- [x] Applies modifications
- [x] Regenerates affected files
- [x] Shows preview of changes

**What was done:**
- Full chat command implementation (400+ lines)
- Integration with Modifier Agent for parsing
- Application of ModificationRequest through managers
- Automatic file regeneration (components and pages)
- Preview of changes with summary
- Error handling and user feedback
- Support for all modification types
- Component and page file regeneration
- Config saving after modifications

**Files to create/modify:**
- `packages/cli/src/commands/chat.ts`

---

## Phase 1.6: Preview & Export

### Task 1.15: Preview Command

**Status:** ✅ COMPLETED

**Goal:** Launch dev server for preview

**Acceptance Criteria:**
- [x] Starts Next.js dev server
- [x] Opens browser
- [x] Hot reload works (automatic in Next.js)
- [x] Shows errors

**What was done:**
- Full preview command implementation (200+ lines)
- Next.js dev server startup with spawn
- Automatic browser opening
- Error and warning display
- Project initialization check
- Dependencies check
- Graceful shutdown handling (SIGINT/SIGTERM)
- Support for npm, pnpm, and npx
- Real-time output parsing and display

**Files to create/modify:**
- `packages/cli/src/commands/preview.ts`

---

### Task 1.16: Export Command

**Status:** ✅ COMPLETED

**Goal:** Export deployable code

**Acceptance Criteria:**
- [x] Builds production bundle
- [x] Removes dev files
- [x] Optimizes for deployment
- [x] Ready for Vercel/Netlify

**What was done:**
- Full export command implementation (300+ lines)
- Production build with Next.js (next build)
- Dev files cleanup (.next/cache, node_modules/.cache)
- Deployment configs generation (vercel.json, netlify.toml, .vercelignore)
- Package.json optimization for production
- Deployment README generation
- Support for npm, pnpm, npx
- Error handling and user feedback

**Files to create/modify:**
- `packages/cli/src/commands/export.ts`

---

## Phase 1.7: Future-Proofing for A2UI

### Task 1.17: Export A2UI Vocabulary 🆕

**Status:** ⏳ Pending

**Goal:** Make Coherent compatible with Google's A2UI (Agent-Driven UI) protocol

**Background:** 
Google's A2UI protocol enables AI agents to dynamically compose user interfaces from a component vocabulary. This makes Coherent-generated design systems usable by agent ecosystems, opening new business models (agent marketplaces, component-as-a-service, etc.)

**Acceptance Criteria:**
- [ ] Exports component vocabulary as A2UI-compatible JSON
- [ ] Includes component props, variants, and constraints
- [ ] Documents which design tokens map to which components
- [ ] Provides agent-readable metadata (semantic descriptions)
- [ ] Command: `coherent export --format=a2ui`

**Implementation Steps:**

1. **Define A2UI vocabulary schema:**
```typescript
// packages/core/src/types/a2ui.ts
export interface A2UIComponent {
  id: string
  name: string
  description: string // For AI agents to understand purpose
  category: 'interactive' | 'form' | 'layout' | 'display' | 'navigation'
  props: {
    name: string
    type: 'string' | 'number' | 'boolean' | 'enum'
    required: boolean
    default?: any
    enum?: string[] // For variant props
    description: string
  }[]
  tokens: {
    // Which design tokens this component uses
    colors?: string[]
    spacing?: string[]
    typography?: string[]
  }
  examples: {
    description: string
    props: Record<string, any>
  }[]
}

export interface A2UIVocabulary {
  version: string
  name: string
  components: A2UIComponent[]
  tokens: {
    colors: Record<string, string>
    spacing: Record<string, string>
    typography: Record<string, any>
  }
  metadata: {
    framework: 'react' | 'vue' | 'svelte'
    styling: 'tailwind' | 'css-modules' | 'styled-components'
    generatedBy: 'coherent'
    generatedAt: string
  }
}
```

2. **Implement A2UI exporter:**
```typescript
// packages/core/src/exporters/A2UIExporter.ts
import type { DesignSystemConfig } from '../types/design-system.js'
import type { A2UIVocabulary } from '../types/a2ui.js'

export class A2UIExporter {
  constructor(private config: DesignSystemConfig) {}

  export(): A2UIVocabulary {
    return {
      version: '0.8.0', // A2UI protocol version
      name: this.config.name,
      components: this.convertComponents(),
      tokens: this.convertTokens(),
      metadata: {
        framework: 'react',
        styling: 'tailwind',
        generatedBy: 'coherent',
        generatedAt: new Date().toISOString()
      }
    }
  }

  private convertComponents(): A2UIComponent[] {
    return Object.values(this.config.components).map(comp => ({
      id: comp.id,
      name: comp.name,
      description: this.generateDescription(comp),
      category: this.inferCategory(comp),
      props: this.convertProps(comp),
      tokens: this.extractTokens(comp),
      examples: this.generateExamples(comp)
    }))
  }

  private generateDescription(comp: ComponentDefinition): string {
    // Use Claude to generate semantic descriptions
    // e.g., "A clickable button component for primary user actions"
  }

  private inferCategory(comp: ComponentDefinition): string {
    // Infer category from component type/name
    if (comp.name.includes('Button')) return 'interactive'
    if (comp.name.includes('Input')) return 'form'
    if (comp.name.includes('Card')) return 'layout'
    // etc.
  }

  private extractTokens(comp: ComponentDefinition): any {
    // Parse component code to find which tokens it uses
    // e.g., if component has "bg-primary" → colors: ['primary']
  }
}
```

3. **Add export command:**
```typescript
// packages/cli/src/commands/export.ts
import { A2UIExporter } from '@getcoherent/core'

export async function exportCommand(options: { format?: string }) {
  if (options.format === 'a2ui') {
    const manager = new DesignSystemManager('./design-system.config.ts')
    await manager.load()
    
    const exporter = new A2UIExporter(manager.getConfig())
    const vocabulary = exporter.export()
    
    await writeFile(
      'agent-vocabulary.json',
      JSON.stringify(vocabulary, null, 2)
    )
    
    console.log(chalk.green('✓ A2UI vocabulary exported to agent-vocabulary.json'))
    console.log(chalk.gray('  Your components are now agent-ready!'))
  }
}
```

4. **Update CLI command:**
```typescript
program
  .command('export')
  .description('Export deployable code or agent vocabulary')
  .option('--format <format>', 'Export format: production | a2ui')
  .action(exportCommand)
```

**Example Output (`agent-vocabulary.json`):**
```json
{
  "version": "0.8.0",
  "name": "My SaaS App",
  "components": [
    {
      "id": "button",
      "name": "Button",
      "description": "A clickable button for primary user actions",
      "category": "interactive",
      "props": [
        {
          "name": "variant",
          "type": "enum",
          "enum": ["primary", "secondary", "ghost"],
          "required": false,
          "default": "primary",
          "description": "Visual style of the button"
        },
        {
          "name": "size",
          "type": "enum",
          "enum": ["small", "medium", "large"],
          "required": false,
          "default": "medium",
          "description": "Size of the button"
        }
      ],
      "tokens": {
        "colors": ["primary", "secondary"],
        "spacing": ["md", "lg"],
        "typography": ["base"]
      },
      "examples": [
        {
          "description": "Primary call-to-action button",
          "props": { "variant": "primary", "size": "large" }
        },
        {
          "description": "Secondary action button",
          "props": { "variant": "secondary", "size": "medium" }
        }
      ]
    }
  ],
  "tokens": {
    "colors": {
      "primary": "#3B82F6",
      "secondary": "#8B5CF6"
    },
    "spacing": {
      "md": "1rem",
      "lg": "1.5rem"
    }
  },
  "metadata": {
    "framework": "react",
    "styling": "tailwind",
    "generatedBy": "coherent",
    "generatedAt": "2025-01-26T12:00:00Z"
  }
}
```

**Business Impact:**
- **Agent Marketplaces:** Sell Coherent-generated vocabularies to agent developers
- **Component-as-a-Service:** Host vocabularies as API endpoints, charge per agent interaction
- **Design System Licensing:** License vocabularies to enterprises for their agent ecosystems
- **Future-proof:** Ready for the agent-driven UI future predicted by Eric Schmidt

**Priority:** Low for MVP, High for long-term strategy

**Files to create/modify:**
- `packages/core/src/types/a2ui.ts` — A2UI type definitions
- `packages/core/src/exporters/A2UIExporter.ts` — Export logic
- `packages/cli/src/commands/export.ts` — Add --format flag
- `packages/docs/A2UI_INTEGRATION.md` — Documentation

---

## Testing Strategy

### Unit Tests
- Test all managers independently
- Test generators with mock data
- Test validators with edge cases
- Test A2UI exporter with sample configs

### Integration Tests
- Test full `coherent init` flow
- Test `coherent chat` modifications
- Test component reuse logic
- Test A2UI export and validation

### E2E Tests
- Create project, modify, preview, export
- Verify generated code works
- Test A2UI vocabulary with sample agent

---

## Definition of Done

Phase 1 is complete when:

- ✅ `coherent init` creates working Next.js project
- ✅ Post-init workflow works: changes in Cursor (or via `coherent chat` if retained) are reflected after reload; CLI does not overwrite user edits unintentionally
- ✅ `coherent preview` launches dev server
- ✅ `coherent export` creates deployable build
- ✅ (Optional) `coherent export --format=a2ui` creates agent vocabulary (Task 1.17)
- ✅ Component registry prevents duplicates
- ✅ Design tokens cascade on updates
- ✅ Documentation updated (PROJECT.md, CONTEXT.md)

---

## Next Steps After Phase 1

- **Reliability:** Confirm model (one-time vs helper commands), fate of `coherent chat`; test init → Cursor → preview → export.
- **Custom components:** Document workflow in CONTEXT.md (Cursor creates component + adds to config); optional `coherent add-component` that only creates files.
- **Docs autogen:** Generate `/docs` content from config (components, tokens) at init or on config change.
- **Phase 2:** SPA support (React Router)
- **Phase 3:** Advanced features (themes, plugins)
- **Phase 4:** Team collaboration
- **Phase 5:** Agent marketplace integration

---

## Roadmap: Agent-Driven Future

With Task 1.17, Coherent is positioned for:

1. **Q1 2025:** Basic A2UI export (Task 1.17)
2. **Q2 2025:** Agent marketplace beta
3. **Q3 2025:** Component-as-a-Service platform
4. **Q4 2025:** Full agent ecosystem integration

**Vision:** Coherent becomes the standard way to create design systems for both traditional apps and agent-driven interfaces.

---

**Last Updated:** 2025-02-02  
**Status:** Single task list (Project Tasks). Phase 1.1–1.16 ✅; Task 1.17 A2UI pending. Architectural decisions (model after init, chat vs ask, custom components) — see PROJECT.md §7.1.
