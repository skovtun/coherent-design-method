# Case Study: API Portal with Coherent Design Method

> **Project:** Developer API Portal  
> **Timeline:** 6 weeks  
> **Team:** 2 developers, 1 designer  
> **Status:** Production (serving 50k+ developers)

---

## Overview

Built a comprehensive API portal for a SaaS platform, featuring user registration, interactive documentation, dashboard with API keys management, and usage analytics. Applied Coherent Design Method to ensure consistency across all pages while maintaining rapid development velocity.

---

## Context

### The Challenge

Our company needed to launch a developer portal quickly to support our new public API. Requirements included:

- **User registration and authentication**
- **Interactive API documentation** with live testing
- **Dashboard** for managing API keys
- **Usage analytics** with charts and tables
- **Settings page** for account management

**Time constraint:** 6 weeks from kickoff to production launch.

### Previous Attempts

Earlier attempts using traditional AI code generators (Bolt, V0) resulted in:
- Each page looked visually different
- Duplicated components (5 different Button implementations)
- No shared state management
- Inconsistent form patterns
- Significant refactoring needed to achieve coherence

### Why Coherent Design Method?

We needed:
✅ **Rapid development** — AI-assisted generation  
✅ **Visual consistency** — All pages look cohesive  
✅ **Maintainability** — Single source of truth  
✅ **Scalability** — Easy to add new pages later  

---

## Application of Coherent Design Method

### Phase 1: Foundation (Week 1)

#### 1. Design System Definition

Created `design-system.config.ts` with:

```typescript
export const designSystem = {
  metadata: {
    name: 'API Portal',
    theme: 'developer-focused',
    darkMode: true,
  },
  
  tokens: {
    colors: {
      // Brand
      primary: '#3B82F6',      // Tech blue
      secondary: '#8B5CF6',    // Purple accent
      
      // Semantic
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      
      // Code syntax highlighting
      codeBg: '#1E293B',
      codeText: '#E2E8F0',
    },
    
    spacing: {
      // Comfortable spacing for documentation
      xs: '0.25rem',
      sm: '0.5rem',
      md: '1rem',
      lg: '1.5rem',
      xl: '2.5rem',
    },
    
    typography: {
      fontFamily: {
        sans: ['Inter', 'system-ui'],
        mono: ['JetBrains Mono', 'monospace'], // For code
      },
      fontSize: {
        xs: '0.75rem',
        sm: '0.875rem',
        base: '1rem',
        lg: '1.125rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
      }
    }
  },
  
  components: {}, // Built up incrementally
  
  decisions: [
    {
      date: '2024-12-01',
      decision: 'Use blue (#3B82F6) as primary color',
      reason: 'Conveys trust and professionalism for developer audience',
      alternatives: ['Green', 'Purple'],
    },
    {
      date: '2024-12-01',
      decision: 'Enable dark mode by default',
      reason: 'Developers prefer dark mode for extended reading',
      alternatives: ['Light mode only', 'User preference'],
    }
  ]
}
```

#### 2. Core Components

Identified essential components:
- Button (primary CTA)
- Input (forms)
- Card (content containers)
- CodeBlock (API examples)
- Table (API keys, usage data)
- Badge (status indicators)

### Phase 2: Registration Page (Week 2)

#### Generated Components

```typescript
// Components created and registered
components: {
  Button: {
    path: './components/Button.tsx',
    variants: ['primary', 'secondary', 'ghost'],
    usedIn: ['/register'],
  },
  Input: {
    path: './components/Input.tsx',
    types: ['text', 'email', 'password'],
    usedIn: ['/register'],
  },
  Form: {
    path: './components/Form.tsx',
    features: ['validation', 'error-handling'],
    usedIn: ['/register'],
  }
}
```

#### Key Decision

**Used react-hook-form + zod for validation** — Documented in decisions:

```typescript
decisions: [
  // ...
  {
    date: '2024-12-05',
    decision: 'Use react-hook-form + zod for all forms',
    reason: 'Best DX, type-safe validation, consistent error handling',
    alternatives: ['Formik', 'Custom solution'],
  }
]
```

### Phase 3: Dashboard (Week 3-4)

#### Component Reuse

Dashboard needed buttons and inputs — **reused existing components**:

```typescript
// ✅ No new Button created
// ✅ No new Input created

// Only new components:
components: {
  // ... existing Button, Input
  
  ApiKeyCard: {
    path: './components/ApiKeyCard.tsx',
    usedIn: ['/dashboard'],
  },
  UsageChart: {
    path: './components/UsageChart.tsx',
    library: 'recharts',
    usedIn: ['/dashboard'],
  },
  DataTable: {
    path: './components/DataTable.tsx',
    features: ['sorting', 'pagination'],
    usedIn: ['/dashboard'],
  }
}
```

#### Architectural Consistency

All pages used shared layout:

```tsx
// Layout.tsx
export function Layout({ children }) {
  return (
    <div className="app-layout">
      <Header />
      <Sidebar />
      <main>{children}</main>
    </div>
  )
}

// Every page
export function DashboardPage() {
  return (
    <Layout>
      <h1>Dashboard</h1>
      {/* page content */}
    </Layout>
  )
}
```

### Phase 4: Documentation & Settings (Week 5-6)

#### Incremental Evolution

Added **CodeBlock** component for API examples:

```typescript
components: {
  // ... existing components
  
  CodeBlock: {
    path: './components/CodeBlock.tsx',
    languages: ['javascript', 'python', 'curl'],
    features: ['syntax-highlighting', 'copy-button'],
    usedIn: ['/docs', '/docs/authentication', '/docs/endpoints'],
  }
}
```

Reused forms for settings page:
- Same Input component
- Same Button component
- Same Form validation pattern

**Result:** Settings page built in 1 day (vs 3 days for registration page).

---

## Results

### Development Speed

- **Week 1-2:** Slower (building foundation)
- **Week 3-4:** 2x faster (reusing components)
- **Week 5-6:** 3x faster (established patterns)

**Total:** 6 weeks vs estimated 10 weeks with traditional approach.

### Code Metrics

**Before Coherent (previous attempts):**
- 5 different Button implementations
- 3 different Input implementations
- No shared state management
- 47 hardcoded color values
- 89 hardcoded spacing values

**After Coherent:**
- ✅ 1 Button component (used 47 times across 8 pages)
- ✅ 1 Input component (used 23 times across 5 pages)
- ✅ Shared Zustand store for auth state
- ✅ 0 hardcoded values (all use design tokens)
- ✅ Perfect visual consistency

### User Feedback

**Developers using the portal:**
- "Feels polished and professional"
- "Navigation is intuitive — everything is where I expect"
- "Dark mode is perfect for late-night coding"

**Internal team:**
- "Adding new pages is trivial now"
- "Design system makes onboarding new devs easy"
- "Zero visual bugs after updates"

### Maintenance

**First major update (rebrand to new primary color):**
- Changed 1 token value
- Cascaded to all 47 Button instances automatically
- 0 bugs, 0 manual changes
- Completed in 5 minutes

**Adding new page (pricing page):**
- Reused existing components
- Followed established patterns
- Deployed in 2 hours

---

## Lessons Learned

### What Worked Well

✅ **Component registry prevented duplication**  
Starting with a registry mindset meant we always checked "does this exist?" before creating new components.

✅ **Design tokens made theming effortless**  
When marketing wanted to try a different shade of blue, we changed one token and previewed across the entire app.

✅ **Stateful system saved hours of work**  
Each new page built on previous work instead of starting from scratch.

✅ **Architectural consistency made navigation intuitive**  
Users never got lost because all pages followed the same structure.

### Challenges

⚠️ **Initial setup took longer than expected**  
Week 1 felt slow because we were building the foundation. But this paid off massively in weeks 3-6.

⚠️ **Learning curve for team members**  
One developer initially resisted the "check registry first" approach, preferring to "just build it". After seeing how much faster iteration became, they converted.

⚠️ **Discipline required**  
Manual maintenance of registry requires discipline. We set up a rule: "No PR approved without registry update."

### What We'd Do Differently

**1. Automate registry updates**  
Next time, we'd build a simple script to auto-detect component usage and update the registry.

**2. Start with more components**  
We initially only created Button, Input, Card. We should have also created Badge, Modal, Toast upfront.

**3. Document patterns earlier**  
We discovered useful patterns (like form validation) organically. Should have documented them immediately.

### Advice for Others

💡 **Don't skip the foundation phase**  
The first week feels slow, but it's an investment that pays 10x later.

💡 **Get team buy-in early**  
Show the benefits of component reuse with a concrete example. Our "Button reuse demo" converted skeptics.

💡 **Start with your most common components**  
Button, Input, Card are used everywhere — nail these first.

💡 **Document decisions as you go**  
Don't wait until the end. Document why you chose blue over green the moment you decide.

💡 **Celebrate reuse wins**  
When someone reuses a component instead of creating a new one, celebrate it. It reinforces the behavior.

---

## Conclusion

Coherent Design Method transformed how we build UIs. What started as a 10-week project with concerns about consistency was completed in 6 weeks with perfect visual coherence.

**Key Takeaway:** Coherent design isn't just about making things look the same — it's about building a **system** where consistency is enforced by structure, not by discipline.

**Would we use it again?** Absolutely. Every project from now on.

---

## Appendix: Component Registry

Final state of our component registry:

```typescript
components: {
  // Primitives
  Button: { 
    usedIn: ['/register', '/login', '/dashboard', '/settings', '/docs', '/pricing', '/support', '/profile'],
    instances: 47 
  },
  Input: { 
    usedIn: ['/register', '/login', '/settings', '/support', '/profile'],
    instances: 23 
  },
  Card: { 
    usedIn: ['/dashboard', '/docs', '/pricing', '/profile'],
    instances: 18 
  },
  Badge: { 
    usedIn: ['/dashboard', '/docs'],
    instances: 12 
  },
  
  // Complex components
  CodeBlock: { 
    usedIn: ['/docs/*'],
    instances: 34 
  },
  ApiKeyCard: { 
    usedIn: ['/dashboard'],
    instances: 1 
  },
  UsageChart: { 
    usedIn: ['/dashboard', '/analytics'],
    instances: 3 
  },
  DataTable: { 
    usedIn: ['/dashboard', '/analytics'],
    instances: 2 
  },
  
  // Forms
  Form: { 
    usedIn: ['/register', '/login', '/settings', '/support'],
    instances: 8 
  },
  
  // Layout
  Layout: { 
    usedIn: ['/*'],
    instances: 11 
  },
  Header: { 
    usedIn: ['/*'],
    instances: 1 
  },
  Sidebar: { 
    usedIn: ['/*'],
    instances: 1 
  },
}
```

**Total:** 14 unique components, used 160 times across 11 pages.

---

**Project:** API Portal  
**Method:** Coherent Design Method  
**Author:** [Team name]  
**Date:** December 2024  
**Status:** ✅ Production
