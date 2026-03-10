# Core Concepts of Coherent Design Method

This document explains the fundamental concepts that make Coherent Design Method work. Understanding these concepts is essential to applying the method effectively.

---

## Table of Contents

1. [Coherence vs Consistency](#coherence-vs-consistency)
2. [Component Registry](#component-registry)
3. [Design Tokens](#design-tokens)
4. [Dependency Tracking](#dependency-tracking)
5. [Stateful vs Stateless Generation](#stateful-vs-stateless-generation)
6. [Incremental Evolution](#incremental-evolution)
7. [Architectural Memory](#architectural-memory)
8. [Cascading Updates](#cascading-updates)

---

## Coherence vs Consistency

### The Distinction

**Consistency** and **coherence** are often used interchangeably, but they mean different things:

**Consistency** = Surface-level uniformity
- Things look the same
- Same colors, fonts, spacing
- Visual harmony
- Can be achieved through style guides

**Coherence** = Deep systemic connection
- Things are fundamentally connected
- Share structure, logic, state
- Work together as a unified system
- Requires architectural discipline

### Example: Two Buttons

#### Consistent but not coherent:
```tsx
// Button in LoginPage.tsx
function LoginButton() {
  return <button className="bg-blue-500 text-white px-4 py-2 rounded">
    Login
  </button>
}

// Button in DashboardPage.tsx
function DashboardButton() {
  return <button className="bg-blue-500 text-white px-4 py-2 rounded">
    Submit
  </button>
}
```

These buttons **look consistent** (same styles) but they're **not coherent**:
- Defined separately in different files
- Duplicated code
- Changes require updating both
- No single source of truth

#### Coherent (and therefore consistent):
```tsx
// components/Button.tsx
export function Button({ children }) {
  return <button className="bg-primary text-white px-4 py-2 rounded">
    {children}
  </button>
}

// LoginPage.tsx
import { Button } from '@/components/Button'
<Button>Login</Button>

// DashboardPage.tsx
import { Button } from '@/components/Button'
<Button>Submit</Button>
```

These buttons are **coherent**:
- Single source of truth
- Shared implementation
- Changes propagate automatically
- Consistency is guaranteed by structure

### Why Coherence Matters More

Consistency can break easily:
- Developer forgets to use shared styles
- Copy-paste creates divergence
- Style guide isn't enforced
- Manual discipline required

Coherence is structural:
- Can't use wrong button (there's only one)
- Changes cascade automatically
- Architecture enforces consistency
- Zero manual discipline needed

**Goal of Coherent Method:** Achieve consistency through coherence, not through willpower.

---

## Component Registry

### What It Is

A **component registry** is a declarative manifest that tracks all components in your design system:

```typescript
// design-system.config.ts
{
  components: {
    Button: {
      path: './components/Button.tsx',
      type: 'interactive',
      variants: ['primary', 'secondary', 'ghost', 'danger'],
      props: {
        variant: { type: 'string', default: 'primary' },
        size: { type: 'string', default: 'medium' },
        disabled: { type: 'boolean', default: false }
      },
      usedIn: ['/home', '/dashboard', '/settings', '/profile'],
      dependencies: ['clsx'],
      createdAt: '2025-01-15',
      lastModified: '2025-01-20'
    },
    
    Input: {
      path: './components/Input.tsx',
      type: 'form',
      variants: ['text', 'email', 'password', 'search'],
      props: {
        type: { type: 'string', default: 'text' },
        placeholder: { type: 'string', optional: true },
        error: { type: 'string', optional: true }
      },
      usedIn: ['/login', '/register', '/settings'],
      dependencies: ['react-hook-form'],
      createdAt: '2025-01-15',
      lastModified: '2025-01-18'
    }
  }
}
```

### What It Tracks

1. **Component identity** — Name, path, type
2. **Interface** — Props, variants, defaults
3. **Usage** — Where component is used
4. **Dependencies** — What it depends on
5. **History** — When created, when modified

### How It's Used

#### Before Generating Components
```typescript
// AI Agent checks registry
const existingButton = registry.components.Button

if (existingButton) {
  // Button exists, reuse it
  return {
    action: 'reuse',
    component: existingButton
  }
} else {
  // Button doesn't exist, create new
  return {
    action: 'create',
    component: generateButton()
  }
}
```

#### When Modifying Components
```typescript
// User: "Delete Button component"
// System checks usage
const usedIn = registry.components.Button.usedIn

if (usedIn.length > 0) {
  throw new Error(
    `Cannot delete Button. Used in: ${usedIn.join(', ')}\n` +
    `Remove from these pages first or replace with another component.`
  )
}
```

#### When Updating Design
```typescript
// User: "Make all buttons more rounded"
// System identifies affected components
const affectedComponents = registry.components
  .filter(c => c.type === 'interactive' || c.name === 'Button')

// Updates each component
// Validates no breaking changes
// Updates registry
```

### Benefits

✅ **Prevents duplication** — Can't create Button twice  
✅ **Enables reuse** — System knows what exists  
✅ **Safe refactoring** — Tracks dependencies  
✅ **Clear inventory** — See all components at a glance  
✅ **Auditability** — History of all changes  

---

## Design Tokens

### What They Are

**Design tokens** are named design decisions that get reused throughout your application. They're the atomic building blocks of visual design.

### Token Hierarchy

```
Brand Tokens (abstract)
    ↓
Semantic Tokens (purpose-driven)
    ↓
Component Tokens (context-specific)
    ↓
Applied Styles (implementation)
```

### Example: Color Token Flow

```typescript
// 1. Brand Tokens (abstract values)
brand: {
  blue: '#3B82F6',
  purple: '#8B5CF6',
  green: '#10B981'
}

// 2. Semantic Tokens (purpose)
colors: {
  primary: brand.blue,      // Main brand color
  secondary: brand.purple,  // Accent color
  success: brand.green,     // Positive actions
  error: '#EF4444',        // Negative actions
  warning: '#F59E0B'       // Caution
}

// 3. Component Tokens (specific use)
button: {
  primary: colors.primary,
  secondary: colors.secondary,
  danger: colors.error
}

// 4. Applied Styles (implementation)
<button className="bg-primary hover:bg-primary-dark">
  Click me
</button>
```

### Why This Hierarchy?

**Flexibility:** Change brand color, semantic tokens update automatically  
**Clarity:** Each level has a clear purpose  
**Maintainability:** Cascade changes from top to bottom  
**Scalability:** Add new semantic meanings without touching brand  

### Token Categories

#### 1. **Color Tokens**
```typescript
colors: {
  // Primitives
  blue50: '#EFF6FF',
  blue500: '#3B82F6',
  blue900: '#1E3A8A',
  
  // Semantic
  primary: blue500,
  primaryLight: blue50,
  primaryDark: blue900,
  
  // Contextual
  textPrimary: gray900,
  textSecondary: gray600,
  textDisabled: gray400,
  
  backgroundPrimary: white,
  backgroundSecondary: gray50,
  
  borderDefault: gray300,
  borderFocus: primary
}
```

#### 2. **Spacing Tokens**
```typescript
spacing: {
  xs: '0.25rem',   // 4px
  sm: '0.5rem',    // 8px
  md: '1rem',      // 16px
  lg: '1.5rem',    // 24px
  xl: '2rem',      // 32px
  '2xl': '3rem',   // 48px
  '3xl': '4rem'    // 64px
}
```

#### 3. **Typography Tokens**
```typescript
typography: {
  fontFamily: {
    body: ['Inter', 'system-ui', 'sans-serif'],
    heading: ['Inter', 'system-ui', 'sans-serif'],
    mono: ['JetBrains Mono', 'monospace']
  },
  
  fontSize: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '1.875rem' // 30px
  },
  
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75
  },
  
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700
  }
}
```

#### 4. **Border & Radius Tokens**
```typescript
borders: {
  width: {
    none: '0',
    thin: '1px',
    medium: '2px',
    thick: '4px'
  },
  
  radius: {
    none: '0',
    sm: '0.125rem',   // 2px
    base: '0.25rem',  // 4px
    md: '0.375rem',   // 6px
    lg: '0.5rem',     // 8px
    xl: '0.75rem',    // 12px
    full: '9999px'    // Fully rounded
  }
}
```

### Token Usage in Components

```tsx
// ❌ Bad: Hardcoded values
export function Button({ children }) {
  return (
    <button className="bg-blue-500 text-white px-4 py-2 rounded-md font-medium">
      {children}
    </button>
  )
}

// ✅ Good: Token-based
export function Button({ children, variant = 'primary' }) {
  return (
    <button className={`
      bg-${variant}           // Uses color token
      text-white
      px-md py-sm            // Uses spacing tokens
      rounded-base           // Uses radius token
      font-medium            // Uses typography token
    `}>
      {children}
    </button>
  )
}
```

### Cascading Token Changes

**Scenario:** Rebrand from blue to green

```typescript
// Before
colors: {
  primary: '#3B82F6'  // Blue
}

// After
colors: {
  primary: '#10B981'  // Green
}

// Automatic cascading effects:
// - All buttons turn green
// - All links turn green
// - All primary borders turn green
// - All focus states turn green
// - ZERO manual changes needed
```

**Tokens affected:**
- Button backgrounds
- Link colors
- Active states
- Focus rings
- Icons using primary color
- Charts using primary color

**Components updated automatically:**
- Button
- Link
- Tab (active state)
- Checkbox (checked state)
- Radio (selected state)
- Progress bar
- Badge (primary variant)

---

## Dependency Tracking

### What It Is

The system maintains a graph of dependencies:
- Which components depend on other components
- Which pages use which components
- Which tokens affect which components

### Dependency Types

#### 1. **Component Dependencies**
```typescript
// Card depends on Button
dependencies: {
  Card: {
    components: ['Button', 'Icon'],
    tokens: ['colors.primary', 'spacing.md', 'borderRadius.lg']
  }
}
```

#### 2. **Page Dependencies**
```typescript
// Dashboard uses Card, Button, Table
dependencies: {
  '/dashboard': {
    components: ['Card', 'Button', 'Table', 'Chart'],
    layout: 'MainLayout'
  }
}
```

#### 3. **Token Dependencies**
```typescript
// primary color affects multiple components
dependencies: {
  'colors.primary': {
    affectedComponents: ['Button', 'Link', 'Badge', 'Progress'],
    affectedPages: ['/home', '/dashboard', '/settings']
  }
}
```

### Why Track Dependencies?

#### Safe Deletion
```bash
$ coherent chat "delete Button component"

Error: Cannot delete Button
Reason: Used in 5 pages:
  - /home (2 instances)
  - /dashboard (7 instances)
  - /settings (3 instances)
  - /profile (1 instance)
  - /login (2 instances)

Suggestions:
1. Replace Button with another component
2. Delete Button from pages first
3. Create migration plan
```

#### Impact Analysis
```bash
$ coherent chat "change primary color to green"

Impact Analysis:
- Will affect 12 components
- Will update 8 pages
- Estimated changes: 47 files

Components affected:
  ✓ Button (all variants)
  ✓ Link
  ✓ Badge (primary variant)
  ✓ Progress Bar
  ✓ Tab (active state)
  ... and 7 more

Preview changes? (y/n)
```

#### Refactoring Safety
```bash
$ coherent chat "rename Button to PrimaryButton"

Analyzing dependencies...

Button is used in:
- 5 pages (15 total imports)
- 3 other components (Card, Modal, Dialog)

Refactoring plan:
1. Rename Button.tsx → PrimaryButton.tsx
2. Update 15 imports across 5 pages
3. Update 3 component dependencies
4. Update component registry
5. Validate no breaking changes

Execute refactoring? (y/n)
```

### Dependency Graph Example

```
Button
├── Used in pages:
│   ├── /home
│   ├── /dashboard
│   └── /settings
├── Used in components:
│   ├── Card
│   ├── Modal
│   └── Dialog
└── Depends on tokens:
    ├── colors.primary
    ├── spacing.md
    └── borderRadius.base

colors.primary
├── Affects components:
│   ├── Button
│   ├── Link
│   ├── Badge
│   └── Progress
└── Used in pages:
    └── (all pages via components)
```

---

## Stateful vs Stateless Generation

### The Fundamental Difference

**Stateless generation** (traditional AI tools):
- Starts from scratch every time
- No memory of previous decisions
- Each generation is independent
- Results in inconsistency

**Stateful generation** (Coherent Method):
- Maintains architectural memory
- Builds on previous decisions
- Each generation is contextual
- Results in coherence

### Example: Building an App

#### Stateless Approach

```
Request 1: "Create login page"
AI generates:
- LoginPage.tsx (standalone)
- Button.tsx (in login folder)
- Input.tsx (in login folder)
- Form.tsx (in login folder)

Request 2: "Create dashboard"
AI generates:
- DashboardPage.tsx (standalone)
- Button.tsx (NEW, in dashboard folder) ← Different!
- Card.tsx (in dashboard folder)
- Table.tsx (in dashboard folder)

Request 3: "Create settings"
AI generates:
- SettingsPage.tsx (standalone)
- Button.tsx (NEW AGAIN, in settings folder) ← Yet another!
- Input.tsx (NEW, different from login!)
- Form.tsx (NEW, different from login!)

Result: 
- 3 different Button implementations
- 2 different Input implementations
- 2 different Form implementations
- Zero consistency
```

#### Stateful Approach

```
Initialize: Create design system config
System knows:
- Color palette
- Component standards
- Layout patterns

Request 1: "Create login page"
System generates:
- LoginPage.tsx
- Button.tsx → Registers in design-system.config.ts
- Input.tsx → Registers in design-system.config.ts
- Form.tsx → Registers in design-system.config.ts

Request 2: "Create dashboard"
System checks registry:
- Button exists? YES → Reuse
- Card exists? NO → Generate & register
- Table exists? NO → Generate & register

System generates:
- DashboardPage.tsx (imports existing Button)
- Card.tsx → Registers
- Table.tsx → Registers

Request 3: "Create settings"
System checks registry:
- Button exists? YES → Reuse
- Input exists? YES → Reuse
- Form exists? YES → Reuse

System generates:
- SettingsPage.tsx (imports all existing components)
- No new components needed!

Result:
- 1 Button implementation (used everywhere)
- 1 Input implementation (used everywhere)
- 1 Form implementation (used everywhere)
- Perfect consistency
```

### What Gets Remembered

1. **Component Inventory**
```typescript
{
  components: {
    Button: { /* metadata */ },
    Input: { /* metadata */ },
    Card: { /* metadata */ }
  }
}
```

2. **Design Decisions**
```typescript
{
  decisions: {
    colorScheme: 'blue',
    borderRadius: 'medium',
    spacing: 'comfortable',
    theme: 'light-and-dark'
  }
}
```

3. **Architectural Patterns**
```typescript
{
  patterns: {
    layout: 'sidebar-navigation',
    stateManagement: 'zustand',
    routing: 'file-based',
    authentication: 'jwt'
  }
}
```

4. **History**
```typescript
{
  history: [
    {
      date: '2025-01-20',
      action: 'updated primary color',
      from: '#3B82F6',
      to: '#10B981',
      reason: 'rebrand'
    }
  ]
}
```

### Benefits of Statefulness

✅ **Consistency by default** — Can't create inconsistent components  
✅ **Faster iteration** — Build on existing work  
✅ **Knowledge retention** — Don't lose context  
✅ **Collaborative** — Team sees full picture  
✅ **Auditability** — Track all decisions  

---

## Incremental Evolution

### The Concept

Instead of regenerating entire components or pages when making changes, update only what's necessary while preserving everything else.

### Evolution Patterns

#### 1. **Token Evolution**
```typescript
// Change token
spacing.md: '1rem' → '1.25rem'

// Auto-updates:
- All components using spacing.md
- All pages using those components

// Preserves:
- Component logic
- Component props
- Custom implementations
```

#### 2. **Component Evolution**
```typescript
// Before
export function Button({ children, variant = 'primary' }) {
  return <button className={`btn btn-${variant}`}>
    {children}
  </button>
}

// Evolution: Add size prop
export function Button({ 
  children, 
  variant = 'primary',
  size = 'medium'  // ← New prop with default
}) {
  return <button className={`btn btn-${variant} btn-${size}`}>
    {children}
  </button>
}

// All existing usage still works (backward compatible)
<Button variant="primary">Click</Button> // size defaults to 'medium'

// New usage can use size
<Button variant="primary" size="large">Click</Button>
```

#### 3. **Page Evolution**
```typescript
// Add new section to existing page
// System:
// 1. Identifies where to add section
// 2. Checks what components are needed
// 3. Reuses existing or creates new
// 4. Integrates with existing structure
// 5. Preserves custom logic
```

### Anti-patterns

❌ **Full regeneration**
```
User: "Change button color"
Bad: Regenerate entire Button.tsx from scratch
     → Loses custom logic
     → Might change props
     → Breaks existing usage
```

✅ **Targeted update**
```
User: "Change button color"
Good: Update only color token in design system
      → Cascades to Button automatically
      → Preserves all logic
      → Zero breaking changes
```

### Version Control Integration

Incremental evolution means meaningful git diffs:

```diff
# Bad: Full regeneration
- export function Button() { // 100 lines deleted
+ export function Button() { // 100 lines added (mostly same)

# Good: Incremental update
export function Button() {
-   className="bg-blue-500"
+   className="bg-green-500"
}
```

Benefits:
- Easy code review
- Clear change history
- Simple rollback if needed
- Merge conflicts are rare

---

## Architectural Memory

### What It Is

The system maintains memory of:
- Why decisions were made
- What alternatives were considered
- How the system evolved
- Patterns that emerged

### Memory Components

#### 1. **Decision Log**
```typescript
{
  decisions: [
    {
      date: '2025-01-15',
      decision: 'Use Zustand for state management',
      reason: 'Simpler than Redux, better DX than Context',
      alternatives: ['Redux', 'Context API', 'Jotai'],
      madeBy: 'system'
    },
    {
      date: '2025-01-18',
      decision: 'Sidebar navigation instead of top nav',
      reason: 'More space for menu items, better mobile',
      alternatives: ['Top navigation', 'Hamburger menu'],
      madeBy: 'user'
    }
  ]
}
```

#### 2. **Evolution History**
```typescript
{
  evolution: [
    {
      version: '1.0.0',
      date: '2025-01-15',
      changes: ['Initial design system created']
    },
    {
      version: '1.1.0',
      date: '2025-01-20',
      changes: [
        'Added dark mode support',
        'Updated primary color',
        'Added new Card variants'
      ]
    }
  ]
}
```

#### 3. **Pattern Catalog**
```typescript
{
  patterns: {
    forms: {
      pattern: 'react-hook-form + zod validation',
      usage: 'All forms use this pattern',
      examples: ['/login', '/register', '/settings']
    },
    dataFetching: {
      pattern: 'React Query with custom hooks',
      usage: 'All API calls',
      examples: ['useUsers()', 'useSettings()']
    }
  }
}
```

### Why Memory Matters

**Without memory:**
- Each change is made in isolation
- Easy to introduce inconsistencies
- Hard to understand why things are the way they are
- Difficult for new team members to onboard

**With memory:**
- Changes consider full context
- Consistency is maintained
- Clear rationale for all decisions
- Easy onboarding with documented history

### Using Memory

#### When Adding Features
```typescript
// System references memory:
// "We use Zustand for state, follow that pattern"
// "Forms use react-hook-form, generate form accordingly"
// "Navigation is sidebar-based, add to sidebar"
```

#### When Refactoring
```typescript
// System checks history:
// "Primary color was changed from blue to green on 2025-01-20"
// "Reason: Rebrand to match company colors"
// "Don't revert to blue accidentally"
```

#### When Onboarding
```typescript
// New developer reads memory:
decisions.md → "Why do we use Zustand? Because..."
patterns.md → "How do we handle forms? We use..."
evolution.md → "How did we get here? Started with..."
```

---

## Cascading Updates

### The Concept

When you change a design token or core component, the change should cascade automatically to all dependent components and pages.

### Cascade Mechanism

```
Token Change
    ↓
Identify affected components
    ↓
Update component styles/logic
    ↓
Identify affected pages
    ↓
Update page imports/usage
    ↓
Validate no breaking changes
    ↓
Complete
```

### Example: Color Cascade

```typescript
// Change primary color
colors.primary: '#3B82F6' → '#10B981'

// Cascade chain:
colors.primary
├→ Button (background)
│  ├→ /home (3 buttons)
│  ├→ /dashboard (7 buttons)
│  └→ /settings (2 buttons)
├→ Link (text color)
│  ├→ /home (5 links)
│  └→ All pages (navigation links)
├→ Badge (primary variant)
│  └→ /dashboard (status badges)
└→ Progress (bar color)
   └→ /dashboard (loading states)

Total updates: 47 files automatically updated
```

### Cascade Types

#### 1. **Style Cascades** (most common)
```typescript
// Token change cascades through styles
spacing.md: '1rem' → '1.25rem'

// Affects:
- Button padding
- Card gaps
- Form spacing
- Grid gaps
```

#### 2. **Prop Cascades**
```typescript
// Component interface change cascades
Button: add 'size' prop with default 'medium'

// Existing usage:
<Button>Click</Button>
// Still works, size defaults to 'medium'

// New usage:
<Button size="large">Click</Button>
// Can now use size
```

#### 3. **Structural Cascades**
```typescript
// Layout change cascades
Layout: Change from fixed header to sticky header

// Affects:
- All pages using Layout
- Main content padding adjusted
- Scroll behavior updated
```

### Preventing Breaking Changes

#### Validation Steps
```typescript
1. Parse change request
2. Identify all affected components
3. Simulate changes
4. Check for breaking changes:
   - Missing required props?
   - Type mismatches?
   - Logic errors?
5. If safe → apply
6. If unsafe → warn user and suggest fix
```

#### Safe Cascade Example
```typescript
// Adding optional prop (safe)
function Button({ children, icon }) {
  return <button>
    {icon && <span>{icon}</span>}
    {children}
  </button>
}

// All existing usage still works:
<Button>Click</Button> // icon is optional

// New usage possible:
<Button icon={<Icon />}>Click</Button>
```

#### Unsafe Cascade Example
```typescript
// Making prop required (unsafe!)
function Button({ children, variant }) { // variant now required!
  return <button className={`btn-${variant}`}>
    {children}
  </button>
}

// Breaks existing usage:
<Button>Click</Button> // Error: variant is required!

// System warns:
// "Cannot make variant required - used without variant in 12 places"
// "Suggestion: Make it optional with default value"
```

---

## Summary

These eight core concepts work together to create coherent design systems:

1. **Coherence vs Consistency** — Structural connection, not just visual similarity
2. **Component Registry** — Single source of truth for all components
3. **Design Tokens** — Centralized design decisions that cascade
4. **Dependency Tracking** — Know what affects what
5. **Stateful vs Stateless** — Remember context, don't regenerate
6. **Incremental Evolution** — Targeted updates, not full regeneration
7. **Architectural Memory** — Document why, not just what
8. **Cascading Updates** — Changes propagate safely and automatically

Understanding these concepts is essential to applying Coherent Design Method effectively.

---

**Next:** [Getting Started Guide](getting-started.md) — Learn how to apply these concepts in practice.
