# Architecture Documentation

## Overview

**Coherent** (Coherent Design Method) is a stateful AI-powered design system generator that creates production-ready frontend code through conversational interface.

### Core Principle
> "Design System as Code" - The configuration file is the single source of truth. All code generation and modifications flow through config updates.

### Application Types Supported

**Multi-page Applications (MPA)**
- Framework: Next.js 15 with App Router
- Routing: Server-side + file-based
- Use case: SEO-critical apps, API portals, marketing sites

**Single-page Applications (SPA)**
- Framework: React 19 + React Router 6.x
- Routing: Client-side only
- Use case: Dashboards, admin panels, interactive web apps

**Both share:**
- Same component library
- Same design tokens
- Same state management patterns (Zustand)
- Same architectural principles

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CLI Interface                         │
│  (User interaction via commands: init, chat, preview)   │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│                   AI Agent Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Discovery   │  │   Generator   │  │   Modifier   │  │
│  │     Agent     │  │     Agent     │  │     Agent    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│              Design System Manager (Core)                │
│  • Validates config changes                              │
│  • Tracks dependencies                                   │
│  • Orchestrates cascading updates                        │
│  • Component Registry (reuse over regeneration)          │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│                  Code Generators                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Component    │  │     Page      │  │    Config    │  │
│  │  Generator    │  │   Generator   │  │  Generator   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│              Generated Project Files                     │
│  • design-system.config.ts (source of truth)            │
│  • /components/*.tsx (React components - SHARED)        │
│  • /app/*.tsx (Next.js pages) OR                        │
│  • /pages/*.tsx (React SPA pages)                       │
│  • /lib/store.ts (Zustand state management)             │
│  • tailwind.config.ts (derived from tokens)             │
└─────────────────────────────────────────────────────────┘
```

## Component Breakdown

### 1. CLI Layer (`packages/cli`)

**Responsibility:** User interface and command orchestration

**Key Modules:**

#### `commands/init.ts`
- Starts Discovery Agent
- Asks UX questions including app type (MPA vs SPA)
- Creates initial project structure
- Generates `design-system.config.ts`

**Flow:**
```
User: coherent init
  → Ask 7-8 discovery questions
    - What are you building?
    - Multi-page or Single-page app?  ← NEW
    - Pages needed?
    - Features required?
    - Visual style?
    - Primary color?
    - Dark mode?
  → Call Claude API for config generation
  → Validate config via Zod
  → Generate project files (Next.js OR React SPA)
  → Setup navigation (shared across pages)
  → Install dependencies
  → Success message + next steps
```

#### `commands/chat.ts`
- Conversational modification interface
- Interprets user intent via Claude
- Routes to appropriate manager (token/component/page/navigation update)
- Applies changes incrementally with component reuse

**Flow:**
```
User: coherent chat "make buttons blue"
  → Parse intent via Claude (structured output)
  → Identify modification type: "update-token"
  → DesignSystemManager.updateToken('colors.light.primary', '#0000FF')
  → Validate WCAG contrast
  → Get affected components (which components use this token?)
  → Regenerate ONLY affected components (not all!)
  → Update all pages that use these components
  → Show diff preview
  → Apply changes
```

**Component Reuse Example:**
```
User: coherent chat "add settings page"
  → AI checks: "What components exist?"
  → Sees: Button, Input, Card already registered
  → Generates page using EXISTING components
  → Does NOT create new Button/Input/Card
  → Adds to navigation automatically
```

#### `commands/preview.ts`
- Starts dev server (Next.js dev or Vite for SPA)
- Opens browser
- Hot reload on config changes
- Live error reporting

#### `commands/export.ts`
- Exports deployable code
- Removes dev-only files
- Optimizes for production
- Optional: Deploy to Vercel/Netlify

**Key Files:**
```
cli/src/
├── commands/
│   ├── init.ts
│   ├── chat.ts
│   ├── preview.ts
│   └── export.ts
├── agents/
│   ├── discovery.ts     # Asks UX questions (including app type)
│   ├── generator.ts     # Initial config generation
│   └── modifier.ts      # Incremental modifications with reuse logic
└── utils/
    ├── claude.ts        # Claude API wrapper
    ├── logger.ts        # Structured logging
    └── prompts.ts       # System prompts for agents
```

---

### 2. Core Layer (`packages/core`)

**Responsibility:** Business logic, state management, validation, component registry

#### `DesignSystemManager`
**The orchestrator.** All modifications flow through this class.

```typescript
class DesignSystemManager {
  private config: DesignSystemConfig
  private configPath: string
  private componentRegistry: Map<string, ComponentDefinition> // NEW
  
  // Token management
  async updateToken(path: string, value: any): Promise<ModificationResult>
  async getToken(path: string): any
  
  // Component management (with reuse logic)
  async addComponent(def: ComponentDefinition): Promise<ModificationResult>
  async updateComponent(id: string, changes: Partial<ComponentDefinition>): Promise<ModificationResult>
  async deleteComponent(id: string): Promise<ModificationResult>
  async findComponent(criteria: ComponentCriteria): ComponentDefinition | null // NEW
  
  // Page management (reuses components)
  async addPage(def: PageDefinition): Promise<ModificationResult>
  async updatePage(id: string, changes: Partial<PageDefinition>): Promise<ModificationResult>
  
  // Navigation management (functional cohesion)
  async updateNavigation(items: NavigationItem[]): Promise<ModificationResult>
  
  // Dependency tracking
  getComponentDependencies(componentId: string): ComponentDependency
  getAffectedPages(componentId: string): string[]
  findComponentUsages(componentId: string): PageReference[] // NEW
  
  // Component reuse logic (KEY FEATURE)
  shouldReuseComponent(requested: ComponentSpec, existing: ComponentDefinition): boolean
  
  // Validation
  validateConfig(): ValidationResult
  checkAccessibility(): A11yReport
  
  // Persistence
  async save(): Promise<void>
  async reload(): Promise<void>
}
```

**Key responsibilities:**
1. **Component Registry** - maintains single source of component definitions
2. **Reuse Logic** - determines when to reuse existing vs create new
3. **Validation** - Every change validated via Zod before applying
4. **Dependency tracking** - Knows which pages use which components
5. **Cascading updates** - When token changes, regenerate affected components
6. **Conflict detection** - Prevent breaking changes (e.g., deleting used component)

**Component Reuse Flow:**
```typescript
// User requests: "add login page with form"
// AI identifies: need Button, Input, Form components

// Manager checks:
const existingButton = manager.findComponent({ type: 'Button' })
if (existingButton) {
  // Reuse existing Button
  useComponent(existingButton)
} else {
  // Create new Button and register
  const newButton = await manager.addComponent(buttonDef)
}

// Result: All pages share same Button component
```

#### `ComponentManager`
```typescript
class ComponentManager {
  // CRUD operations
  async create(def: ComponentDefinition): Promise<void>
  async read(id: string): ComponentDefinition | undefined
  async update(id: string, changes: Partial<ComponentDefinition>): Promise<void>
  async delete(id: string): Promise<void>
  
  // Registry operations (NEW)
  async register(def: ComponentDefinition): Promise<void>
  async find(criteria: ComponentCriteria): ComponentDefinition[]
  async getAllComponents(): ComponentDefinition[]
  
  // Code generation
  async generateCode(def: ComponentDefinition): Promise<string>
  async regenerateAll(): Promise<void>
  async regenerateAffected(componentIds: string[]): Promise<void> // NEW
  
  // shadcn integration
  async importShadcnComponent(name: string): Promise<ComponentDefinition>
  async customizeStyles(id: string, className: string): Promise<void>
}
```

#### `PageManager`
```typescript
class PageManager {
  async create(def: PageDefinition): Promise<void>
  async addSection(pageId: string, section: PageSection): Promise<void>
  async reorderSections(pageId: string, order: number[]): Promise<void>
  
  // Code generation (MPA vs SPA aware)
  async generatePage(def: PageDefinition, config: DesignSystemConfig): Promise<string>
  async generateLayout(layout: PageLayout, appType: 'multi-page' | 'spa'): Promise<string>
  
  // Navigation integration (NEW)
  async syncWithNavigation(pages: PageDefinition[]): Promise<Navigation>
}
```

**Key Files:**
```
core/src/
├── managers/
│   ├── DesignSystemManager.ts  (+ component registry)
│   ├── ComponentManager.ts     (+ reuse logic)
│   └── PageManager.ts          (+ navigation sync)
├── generators/
│   ├── ConfigGenerator.ts      # Generates initial config
│   ├── ComponentGenerator.ts   # React component code
│   ├── PageGenerator.ts        # Next.js OR React SPA pages
│   └── NavigationGenerator.ts  # Shared navigation (NEW)
├── validators/
│   ├── schema.ts               # Zod schemas (re-export from types)
│   ├── accessibility.ts        # WCAG validation
│   └── dependencies.ts         # Circular dependency detection
└── types/
    └── design-system.ts        # (Reference docs/types/design-system-config.ts)
```

---

### 3. AI Agent Layer

**Responsibility:** Natural language → structured actions

#### Discovery Agent (`agents/discovery.ts`)

**Purpose:** Ask right questions to generate initial config

**Questions it asks:**
1. What are you building? (SaaS / Landing / Dashboard / API Portal / Other)
2. **Multi-page or Single-page app?** ← NEW
3. **What pages do you need?** (if multi-page) ← NEW
4. Who are your users? (Developers / Business users / Consumers)
5. Key features needed? (Auth / Payments / Analytics / Database / **State Management**) ← UPDATED
6. Visual style? (Minimal / Corporate / Playful / Custom)
7. Color preference? (Blue / Green / Purple / Custom hex)
8. Dark mode? (Yes / No / Both)
9. Any specific requirements? (Free text)

**Output:** DiscoveryResult with appType field

```typescript
interface DiscoveryResult {
  projectType: 'saas' | 'landing' | 'dashboard' | 'api-portal' | 'other'
  appType: 'multi-page' | 'spa'  // NEW
  pages?: string[]                // NEW (for multi-page)
  audience: string
  features: {
    authentication: boolean
    payments: boolean
    analytics: boolean
    database: boolean
    stateManagement: boolean      // NEW
  }
  visualStyle: 'minimal' | 'corporate' | 'playful' | 'custom'
  primaryColor: string
  darkMode: boolean
  additionalRequirements?: string
}
```

#### Generator Agent (`agents/generator.ts`)

**Purpose:** Create initial DesignSystemConfig from DiscoveryResult

**Claude prompt structure:**
```
You are a design system architect. Generate a complete DesignSystemConfig.

Input:
- Project type: {projectType}
- App type: {appType}  ← NEW
- Pages needed: {pages}  ← NEW
- Audience: {audience}
- Features: {features}
- Visual style: {visualStyle}
- Primary color: {primaryColor}

Requirements:
- Use 8pt grid for spacing
- Ensure WCAG AA contrast (4.5:1 for text)
- Include commonly needed components for {projectType}
- Generate pages based on {pages} list
- If SPA: include React Router setup, Zustand store
- If MPA: include Next.js layouts, server components
- Setup navigation to connect all pages  ← NEW

Output: Valid DesignSystemConfig JSON with:
- settings.appType = "{appType}"
- navigation.items for all pages
- features.stateManagement if SPA or auth needed
```

**Output:** Complete `DesignSystemConfig` object

#### Modifier Agent (`agents/modifier.ts`)

**Purpose:** Parse natural language modifications into config changes WITH component reuse

**Examples:**

```
User: "make buttons blue"
→ ModificationRequest {
    type: 'update-token',
    target: 'colors.light.primary',
    changes: { value: '#0000FF' }
  }

User: "add a pricing page"
→ Check existing components
→ ModificationRequest {
    type: 'add-page',
    target: 'new',
    changes: {
      id: 'pricing',
      route: '/pricing',
      sections: [
        { componentId: 'hero' },      // Reuses existing
        { componentId: 'pricing-table' }, // Creates new
        { componentId: 'cta' }        // Reuses existing
      ]
    },
    reuseComponents: ['hero', 'cta']  // NEW field
  }

User: "add login page"
→ Check: Button, Input already exist?
→ ModificationRequest {
    type: 'add-page',
    components: {
      reuse: ['button', 'input'],    // Use existing
      create: ['login-form']          // Create new
    }
  }
```

**Claude prompt structure:**
```
You are a design system modification expert.

Current config: {config}
User request: "{userMessage}"

Parse the intent and generate a ModificationRequest.

IMPORTANT - Component Reuse Rules:
1. ALWAYS check if requested component already exists in config.components
2. If similar component exists (e.g., Button), REUSE it, don't create duplicate
3. Only create new component if significantly different from existing
4. When adding pages, prefer reusing existing components

Rules:
- If changing colors, ensure WCAG compliance
- If adding components, check for duplicates FIRST
- If modifying used components, warn about affected pages
- If adding navigation items, sync with pages

Output: ModificationRequest JSON with reuseComponents array
```

---

### 4. Code Generation Layer

**Responsibility:** Config → actual code files (MPA or SPA)

#### ConfigGenerator

```typescript
class ConfigGenerator {
  generate(discovery: DiscoveryResult): DesignSystemConfig
  
  // Helper methods
  private generateTokens(style: string, primaryColor: string): DesignTokens
  private generateComponents(projectType: string): ComponentDefinition[]
  private generatePages(
    projectType: string, 
    appType: 'multi-page' | 'spa',  // NEW
    pages: string[], 
    features: Features
  ): PageDefinition[]
  private generateNavigation(pages: PageDefinition[]): Navigation  // NEW
}
```

#### ComponentGenerator

```typescript
class ComponentGenerator {
  // Generate React component from ComponentDefinition
  async generate(def: ComponentDefinition): Promise<string>
  
  // Template-based generation
  private getTemplate(source: 'shadcn' | 'custom'): string
  private applyTokens(template: string, tokens: DesignTokens): string
  private generateVariants(variants: ComponentVariant[]): string
  
  // Check if should reuse (NEW)
  shouldReuse(requested: ComponentSpec, existing: ComponentDefinition): boolean
}
```

**Example output (same for MPA and SPA):**
```typescript
// Generated: components/button.tsx
import { cn } from '@/lib/utils'
import { VariantProps, cva } from 'class-variance-authority'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md font-medium transition-colors',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/90',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-10 px-4',
        lg: 'h-11 px-8',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = ({ variant, size, className, ...props }: ButtonProps) => {
  return (
    <button className={cn(buttonVariants({ variant, size, className }))} {...props} />
  )
}
```

#### PageGenerator

```typescript
class PageGenerator {
  async generate(
    def: PageDefinition, 
    config: DesignSystemConfig
  ): Promise<string>
  
  // Composition
  private generateImports(sections: PageSection[]): string
  private generateLayout(
    layout: PageLayout,
    appType: 'multi-page' | 'spa'  // NEW
  ): string
  private generateSections(sections: PageSection[]): string
  private generateMetadata(def: PageDefinition): string
  
  // App type specific (NEW)
  private generateNextJSPage(def: PageDefinition): string
  private generateReactSPAPage(def: PageDefinition): string
}
```

**Example output for Multi-page (Next.js):**
```typescript
// Generated: app/page.tsx
import { Hero } from '@/components/hero'
import { Features } from '@/components/features'
import { Pricing } from '@/components/pricing'

export const metadata = {
  title: 'My SaaS Platform',
  description: 'The best SaaS you\'ve ever seen',
}

export default function HomePage() {
  return (
    <main className="flex flex-col">
      <Hero />
      <Features />
      <Pricing />
    </main>
  )
}
```

**Example output for SPA (React Router):**
```typescript
// Generated: src/pages/Home.tsx
import { Hero } from '@/components/hero'
import { Features } from '@/components/features'
import { Pricing } from '@/components/pricing'

export function HomePage() {
  return (
    <main className="flex flex-col">
      <Hero />
      <Features />
      <Pricing />
    </main>
  )
}
```

#### NavigationGenerator (NEW)

```typescript
class NavigationGenerator {
  async generate(
    navigation: Navigation,
    appType: 'multi-page' | 'spa'
  ): Promise<string>
  
  // Generates header/sidebar navigation
  private generateNextJSNav(navigation: Navigation): string
  private generateReactRouterNav(navigation: Navigation): string
}
```

---

## Data Flow

### Initialization Flow

```
coherent init
  ↓
Discovery Agent asks questions
  → App type? Multi-page or SPA
  → Pages needed? (if multi-page)
  → Features? (including state management)
  ↓
User answers → DiscoveryResult
  ↓
Generator Agent (Claude API)
  → Generates DesignSystemConfig
  → Includes appType, navigation, stateManagement
  ↓
ConfigGenerator validates
  ↓
ComponentGenerator creates base components
  → Registers in component registry
  ↓
PageGenerator creates pages
  → Reuses registered components
  ↓
NavigationGenerator creates navigation
  → Links all pages together
  ↓
Write to disk:
  - design-system.config.ts
  - components/*.tsx (SHARED across all pages)
  - app/*.tsx (Next.js) OR pages/*.tsx (React SPA)
  - lib/store.ts (if stateManagement enabled)
  - lib/navigation.tsx
  - tailwind.config.ts
  ↓
pnpm install
  ↓
Success! Run 'coherent preview'
```

### Modification Flow (with Component Reuse)

```
coherent chat "add dashboard page"
  ↓
Modifier Agent (Claude API)
  → Checks existing components in registry
  → Finds: Button, Card, Input already exist
  → Generates ModificationRequest with reuse info
  ↓
DesignSystemManager.addPage()
  ↓
For each section needed:
  → Check if component exists
  → IF EXISTS: Reference existing component
  → IF NOT: Create new & register
  ↓
PageGenerator generates page
  → Imports EXISTING components
  → Only creates new components if needed
  ↓
NavigationManager adds to nav
  ↓
Write updated files
  ↓
Save config to disk
  ↓
Hot reload (if preview running)
  ↓
Show: "Added /dashboard (reused 3 components, created 1 new)"
```

### Token Update Flow (Cascading)

```
coherent chat "make buttons blue"
  ↓
Modifier Agent → ModificationRequest (update-token)
  ↓
DesignSystemManager.updateToken()
  ↓
1. Validate color (WCAG check)
2. Update config.tokens.colors.light.primary
3. Find affected components
   → ComponentManager.findUsages('primary')
   → Returns: ['button', 'link', 'badge']
4. Regenerate affected components
   → ComponentGenerator.regenerate(['button', 'link', 'badge'])
5. Find affected pages
   → All pages using Button/Link/Badge
6. Update imports (no regeneration needed - components changed)
7. Save config
  ↓
Result: All buttons across all pages are now blue
```

---

## State Management

### Config Persistence

**Single file:** `design-system.config.ts`

```typescript
// This file is auto-generated. Do not edit manually.
import type { DesignSystemConfig } from '@coherent/core'

export const config: DesignSystemConfig = {
  version: '1.0.0',
  settings: {
    appType: 'multi-page',  // or 'spa'
    framework: 'next',       // or 'react-spa'
  },
  navigation: {
    enabled: true,
    items: [
      { label: 'Home', route: '/', order: 1 },
      { label: 'Dashboard', route: '/dashboard', order: 2 },
      { label: 'Settings', route: '/settings', order: 3 },
    ],
  },
  // ... full config
}
```

### Component Registry (In-Memory)

```typescript
// During CLI session
class DesignSystemManager {
  private componentRegistry = new Map<string, ComponentDefinition>()
  
  async loadRegistry() {
    // Load from design-system.config.ts
    this.config.components.forEach(comp => {
      this.componentRegistry.set(comp.id, comp)
    })
  }
  
  findComponent(id: string): ComponentDefinition | null {
    return this.componentRegistry.get(id) || null
  }
}
```

### Application State (Generated Apps)

**For apps with auth or complex state:**

```typescript
// Generated: lib/store.ts (Zustand)
import { create } from 'zustand'

interface AppState {
  user: User | null
  isAuthenticated: boolean
  login: (user: User) => void
  logout: () => void
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  isAuthenticated: false,
  login: (user) => set({ user, isAuthenticated: true }),
  logout: () => set({ user: null, isAuthenticated: false }),
}))
```

**Usage across pages (functional cohesion):**
```typescript
// /login page
const { login } = useAppStore()
const handleLogin = () => login(userData)

// /dashboard page  
const { user, isAuthenticated } = useAppStore()
if (!isAuthenticated) redirect('/login')
```

---

## Multi-page vs SPA Differences

| Aspect | Multi-page (Next.js) | SPA (React Router) |
|--------|---------------------|-------------------|
| **Routing** | File-based (`app/`) | Code-based (routes config) |
| **Page files** | `app/page.tsx` | `pages/Home.tsx` |
| **Navigation** | `<Link>` from next/link | `<Link>` from react-router |
| **Layouts** | `layout.tsx` nested | `<Outlet>` components |
| **State** | Optional Zustand | Usually Zustand |
| **Meta tags** | `export const metadata` | React Helmet |
| **Dev server** | `next dev` | `vite dev` |
| **Build** | `next build` | `vite build` |

**But components are IDENTICAL:**
- Same Button.tsx works in both
- Same design tokens
- Same component registry
- Same reuse logic

---

## Testing Strategy

### Unit Tests

**Core logic (100% coverage required):**
```typescript
// DesignSystemManager.test.ts
describe('DesignSystemManager', () => {
  test('reuses existing components', async () => {
    const manager = new DesignSystemManager(mockConfig)
    
    // Create Button
    await manager.addComponent(buttonDef)
    
    // Request another Button
    const result = await manager.findComponent({ type: 'Button' })
    
    expect(result).toBeDefined()
    expect(result.id).toBe(buttonDef.id)
  })
  
  test('cascading updates affect all pages', async () => {
    // ... test
  })
})
```

### Integration Tests

**Full workflow:**
```typescript
test('coherent init creates consistent multi-page app', async () => {
  const tmpDir = await createTempDir()
  
  await runCLI(['init'], {
    input: ['API Portal', 'Multi-page', 'Registration,Dashboard,Settings', '#3B82F6', 'Yes']
  })
  
  // Verify navigation links all pages
  const nav = await import(path.join(tmpDir, 'lib/navigation.tsx'))
  expect(nav.items).toHaveLength(3)
  
  // Verify components are shared
  const regPage = await readFile('app/register/page.tsx')
  const dashPage = await readFile('app/dashboard/page.tsx')
  expect(regPage).toContain("import { Button } from '@/components/button'")
  expect(dashPage).toContain("import { Button } from '@/components/button'")
  // Same Button component imported!
})
```

---

## Performance Targets

### CLI Startup
- **Target:** < 500ms
- **Strategy:** Lazy load, cache parsed config

### Code Generation  
- **Target:** < 3s for 5 components, 3 pages
- **Strategy:** Parallel generation, component reuse (skip duplicate generation)

### Incremental Updates
- **Target:** < 1s for single modification
- **Strategy:** Only regenerate affected files, leverage component registry

---

## Next Steps

1. ✅ **Read this document**
2. → **Review PROJECT_TASKS.md** (implementation steps)
3. → **Start with CLI boilerplate** (Task 1.1)
4. → **Implement Discovery Agent** with app type question (Task 1.2)
5. → **Build DesignSystemManager** with component registry (Task 2.1)

---

**Status:** Ready for implementation  
**Version:** 2.0 (Updated with MPA/SPA support and component reuse)  
**Last Updated:** 2025-01-26  
**Next Review:** After Phase 1 completion