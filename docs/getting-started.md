# Getting Started with Coherent Design Method

This guide will help you apply Coherent Design Method to your projects, whether you're starting from scratch or improving an existing design system.

---

## Using the Coherent CLI (recommended)

The fastest way to get started is with the CLI:

```bash
npm install -g @coherent/cli
coherent init
npm install
coherent preview
```

You can then **edit in Cursor/IDE** (config, components, pages) or use **`coherent chat`** for natural-language changes (e.g. `coherent chat "add pricing page"`). See the root [README](../README.md) and [QUICK_REFERENCE.md](../QUICK_REFERENCE.md) for both workflows and examples. The rest of this document describes the methodology and how to apply it manually or in existing projects.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [For New Projects](#for-new-projects)
3. [For Existing Projects](#for-existing-projects)
4. [Step-by-Step Application](#step-by-step-application)
5. [Common Patterns](#common-patterns)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Knowledge Requirements

Before applying Coherent Design Method, you should understand:

✅ **Component-based architecture** (React, Vue, Svelte, etc.)  
✅ **Design tokens** (colors, spacing, typography)  
✅ **Basic state management** (Context, Redux, Zustand, etc.)  
✅ **CSS fundamentals** (or Tailwind/CSS-in-JS)

### Technical Requirements

- Modern JavaScript/TypeScript
- Component-based framework (React, Vue, etc.)
- Build system (Vite, Webpack, Next.js, etc.)
- Version control (Git)

### Mindset Requirements

💡 **Think in systems, not pages**  
💡 **Prioritize reuse over recreation**  
💡 **Document decisions, not just code**  
💡 **Evolve incrementally, not regeneratively**

---

## For New Projects

Starting fresh? Perfect! Coherent Design Method is easiest to implement from the beginning.

### Step 1: Define Your Design System

Create a `design-system.config.ts` (or `.js`) file:

```typescript
export const designSystem = {
  // Project metadata
  metadata: {
    name: 'My Application',
    version: '1.0.0',
    createdAt: new Date().toISOString(),
  },

  // Design tokens
  tokens: {
    colors: {
      // Brand colors
      primary: '#3B82F6',
      secondary: '#8B5CF6',
      accent: '#F59E0B',
      
      // Semantic colors
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#3B82F6',
      
      // Neutral scale
      gray: {
        50: '#F9FAFB',
        100: '#F3F4F6',
        200: '#E5E7EB',
        300: '#D1D5DB',
        400: '#9CA3AF',
        500: '#6B7280',
        600: '#4B5563',
        700: '#374151',
        800: '#1F2937',
        900: '#111827',
      }
    },
    
    spacing: {
      xs: '0.25rem',   // 4px
      sm: '0.5rem',    // 8px
      md: '1rem',      // 16px
      lg: '1.5rem',    // 24px
      xl: '2rem',      // 32px
      '2xl': '3rem',   // 48px
    },
    
    typography: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        xs: '0.75rem',
        sm: '0.875rem',
        base: '1rem',
        lg: '1.125rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '1.875rem',
      },
      fontWeight: {
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
      }
    },
    
    borderRadius: {
      none: '0',
      sm: '0.125rem',
      base: '0.25rem',
      md: '0.375rem',
      lg: '0.5rem',
      xl: '0.75rem',
      full: '9999px',
    }
  },

  // Component registry (starts empty)
  components: {},

  // Decision log
  decisions: [],
}
```

### Step 2: Create Core Components

Start with the most common components:

#### Button Component
```tsx
// components/Button.tsx
import { designSystem } from '../design-system.config'

interface ButtonProps {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'small' | 'medium' | 'large'
  disabled?: boolean
  onClick?: () => void
}

export function Button({ 
  children, 
  variant = 'primary',
  size = 'medium',
  disabled = false,
  onClick 
}: ButtonProps) {
  return (
    <button
      className={`
        btn btn-${variant} btn-${size}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
```

**Register it:**
```typescript
// Update design-system.config.ts
components: {
  Button: {
    path: './components/Button.tsx',
    variants: ['primary', 'secondary', 'ghost'],
    sizes: ['small', 'medium', 'large'],
    usedIn: [],
    createdAt: new Date().toISOString(),
  }
}
```

### Step 3: Build Pages Using Components

```tsx
// pages/Home.tsx
import { Button } from '../components/Button'

export function HomePage() {
  return (
    <div className="container">
      <h1>Welcome</h1>
      <Button variant="primary">Get Started</Button>
      <Button variant="secondary">Learn More</Button>
    </div>
  )
}
```

**Update registry:**
```typescript
components: {
  Button: {
    // ... existing fields
    usedIn: ['/home'], // Track usage
  }
}
```

### Step 4: Document Decisions

```typescript
decisions: [
  {
    date: new Date().toISOString(),
    decision: 'Chose blue (#3B82F6) as primary color',
    reason: 'Aligns with brand guidelines, good contrast',
    alternatives: ['Green (#10B981)', 'Purple (#8B5CF6)'],
  }
]
```

---

## For Existing Projects

Already have a codebase? Here's how to migrate to Coherent Design Method.

### Step 1: Audit Current State

Create an inventory:

```bash
# Find all components
find src/components -name "*.tsx" -o -name "*.jsx"

# Find duplicate components (same name in different folders)
find src -name "Button.*" -o -name "Input.*"

# Find hardcoded colors
grep -r "bg-blue-500" src/
grep -r "#3B82F6" src/
```

**Document findings:**
```markdown
# Component Audit

## Duplicate Components
- Button: Found in 3 places (components/, pages/login/, pages/dashboard/)
- Input: Found in 2 places (components/, pages/forms/)

## Hardcoded Values
- Colors: 47 instances of hardcoded hex values
- Spacing: 89 instances of hardcoded px values
- Font sizes: 34 instances of hardcoded rem values

## Inconsistencies
- Login page uses different button styles than dashboard
- Settings page has custom input styling
```

### Step 2: Extract Design Tokens

Identify common values:

```typescript
// Analyze existing code
const colorsUsed = [
  '#3B82F6', // Used 23 times
  '#10B981', // Used 12 times
  '#EF4444', // Used 8 times
  // ...
]

// Convert to tokens
export const designSystem = {
  tokens: {
    colors: {
      primary: '#3B82F6',   // Was hardcoded 23 times
      success: '#10B981',   // Was hardcoded 12 times
      error: '#EF4444',     // Was hardcoded 8 times
    }
  }
}
```

### Step 3: Consolidate Components

Merge duplicate components:

```tsx
// Before: 3 different Button components
// components/Button.tsx
// pages/login/LoginButton.tsx
// pages/dashboard/DashboardButton.tsx

// After: 1 unified Button component
// components/Button.tsx (with all variants)

export function Button({ 
  variant = 'primary',
  size = 'medium',
  // ... all props from all versions
}) {
  // Unified implementation
}
```

### Step 4: Migrate Pages Incrementally

Don't rewrite everything at once!

**Week 1:** Migrate homepage
```tsx
// Before
import { LoginButton } from './LoginButton'
<LoginButton style={{ background: '#3B82F6' }}>Login</LoginButton>

// After
import { Button } from '@/components/Button'
<Button variant="primary">Login</Button>
```

**Week 2:** Migrate dashboard
**Week 3:** Migrate settings
**etc.**

### Step 5: Build Registry Gradually

As you migrate:

```typescript
// After migrating homepage
components: {
  Button: {
    usedIn: ['/home'],
  }
}

// After migrating dashboard
components: {
  Button: {
    usedIn: ['/home', '/dashboard'],
  }
}
```

---

## Step-by-Step Application

### Phase 1: Foundation (Week 1)

1. **Create design system config**
   - Define color tokens
   - Define spacing tokens
   - Define typography tokens

2. **Document existing patterns**
   - What components exist?
   - What patterns are used?
   - What inconsistencies exist?

3. **Set up component registry**
   - List all components
   - Track where they're used
   - Identify duplicates

### Phase 2: Core Components (Week 2-3)

1. **Create/consolidate primitives**
   - Button
   - Input
   - Card
   - Badge
   - Icon

2. **Register each component**
   - Add to registry
   - Track usage
   - Document variants

3. **Update one page as proof of concept**
   - Use new components
   - Apply design tokens
   - Validate approach

### Phase 3: Systematic Migration (Week 4-8)

1. **Migrate pages incrementally**
   - Start with simplest pages
   - Move to complex pages
   - One page at a time

2. **Update registry continuously**
   - Track usage as you migrate
   - Document decisions
   - Note patterns

3. **Refactor as you go**
   - Eliminate duplicates
   - Extract common patterns
   - Improve component APIs

### Phase 4: Optimization (Week 9+)

1. **Analyze usage patterns**
   - Which components are overused?
   - Which are underused?
   - What's missing?

2. **Optimize component library**
   - Split large components
   - Merge similar components
   - Add missing variants

3. **Document extensively**
   - Update decision log
   - Write usage guides
   - Create examples

---

## Common Patterns

### Pattern 1: Layout Components

```tsx
// components/Layout.tsx
export function Layout({ children }) {
  return (
    <div className="layout">
      <Header />
      <Navigation />
      <main className="main-content">
        {children}
      </main>
      <Footer />
    </div>
  )
}

// Use in all pages
export function HomePage() {
  return (
    <Layout>
      <h1>Home</h1>
      {/* page content */}
    </Layout>
  )
}
```

### Pattern 2: Compound Components

```tsx
// components/Card.tsx
export function Card({ children }) {
  return <div className="card">{children}</div>
}

Card.Header = function CardHeader({ children }) {
  return <div className="card-header">{children}</div>
}

Card.Body = function CardBody({ children }) {
  return <div className="card-body">{children}</div>
}

Card.Footer = function CardFooter({ children }) {
  return <div className="card-footer">{children}</div>
}

// Usage
<Card>
  <Card.Header>Title</Card.Header>
  <Card.Body>Content</Card.Body>
  <Card.Footer>Actions</Card.Footer>
</Card>
```

### Pattern 3: Token-based Variants

```tsx
// Use tokens for variants
const buttonVariants = {
  primary: {
    background: 'bg-primary',
    text: 'text-white',
    hover: 'hover:bg-primary-dark'
  },
  secondary: {
    background: 'bg-secondary',
    text: 'text-white',
    hover: 'hover:bg-secondary-dark'
  }
}

export function Button({ variant = 'primary' }) {
  const styles = buttonVariants[variant]
  return (
    <button className={`${styles.background} ${styles.text} ${styles.hover}`}>
      {children}
    </button>
  )
}
```

### Pattern 4: Dependency Injection

```tsx
// Inject dependencies via props
export function Form({ validationSchema, onSubmit }) {
  // Use injected validation
  const form = useForm({
    resolver: zodResolver(validationSchema)
  })
  
  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {children}
    </form>
  )
}

// Usage
<Form 
  validationSchema={loginSchema}
  onSubmit={handleLogin}
>
  {/* form fields */}
</Form>
```

---

## Troubleshooting

### Problem: Components Look Inconsistent

**Symptom:** Buttons on different pages look different

**Diagnosis:**
```bash
# Find all button implementations
find src -name "*Button*"

# Check for hardcoded styles
grep -r "className=" src/components/Button.tsx
```

**Solution:**
1. Consolidate to single Button component
2. Use design tokens for styles
3. Register in component registry
4. Update all pages to use unified Button

### Problem: Can't Track Component Usage

**Symptom:** Don't know where components are used

**Diagnosis:**
```bash
# Search for component imports
grep -r "from.*Button" src/
```

**Solution:**
1. Build usage map manually first time
2. Add to component registry
3. Update registry when adding new usage
4. Use TypeScript for compile-time checking

### Problem: Breaking Changes When Updating

**Symptom:** Changing a component breaks pages

**Diagnosis:**
```typescript
// Check component interface
// Has required props changed?
// Are new props required instead of optional?
```

**Solution:**
1. Always add new props as optional
2. Provide sensible defaults
3. Use TypeScript for type safety
4. Test in all known usage locations

### Problem: Design Tokens Not Cascading

**Symptom:** Changing token doesn't update components

**Diagnosis:**
```tsx
// Check if components use tokens
// Bad: <button className="bg-blue-500">
// Good: <button className="bg-primary">
```

**Solution:**
1. Replace hardcoded values with token references
2. Ensure build system supports token variables
3. Use CSS variables or Tailwind config
4. Restart dev server after token changes

### Problem: Registry Out of Sync

**Symptom:** Registry says component used in page, but it's not

**Diagnosis:**
```bash
# Verify actual usage
grep -r "from.*Button" src/pages/home.tsx
```

**Solution:**
1. Audit registry against actual code
2. Update registry to match reality
3. Automate registry updates (if using CLI tool)
4. Regular manual audits until automated

---

## Next Steps

Once you've applied the basics:

1. **Read [Principles](../philosophy/principles.md)** — Understand the why
2. **Study [Core Concepts](../philosophy/core-concepts.md)** — Deep dive into concepts
3. **Explore [Examples](../examples/)** — See real-world applications
4. **Try the CLI tool** (when available) — Automate the process

---

## Getting Help

- 📝 **Documentation:** Start with philosophy docs
- 💬 **Community:** [Coming soon - Discord/Forum]
- 🐛 **Issues:** Report problems on GitHub
- 💼 **Professional help:** Contact for consulting

---

**Remember:** Coherent Design Method is about thinking in systems, not just writing better code. Focus on the principles and patterns, and the implementation will follow naturally.

**Good luck building coherent design systems!** 🚀
