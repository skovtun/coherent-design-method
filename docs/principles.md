# Core Principles of Coherent Design Method

The Coherent Design Method is built on five foundational principles that ensure design systems remain consistent, maintainable, and scalable.

---

## 1. Component Registry

### The Principle

**Every component lives in a single source of truth.**

Instead of creating components ad-hoc across different pages or features, all components are registered in a centralized registry. This registry serves as the canonical list of what exists in your design system.

### Why It Matters

**Without a registry:**
- Components are duplicated across pages
- Variations emerge unintentionally
- No visibility into what components exist
- Difficult to maintain consistency
- Breaking changes go unnoticed

**With a registry:**
- Single source of truth for all components
- Enforced reuse over recreation
- Clear dependency tracking
- Safe refactoring and updates
- Architectural visibility

### In Practice

```typescript
// Component Registry (design-system.config.ts)
{
  components: {
    Button: {
      path: './components/Button.tsx',
      variants: ['primary', 'secondary', 'ghost'],
      usedIn: ['/home', '/dashboard', '/settings']
    },
    Input: {
      path: './components/Input.tsx',
      variants: ['text', 'email', 'password'],
      usedIn: ['/login', '/register', '/settings']
    }
  }
}
```

When generating a new page:
1. **Check registry first** — Does Button already exist?
2. **Reuse if appropriate** — Use existing Button component
3. **Create only if necessary** — Generate new component only if truly unique
4. **Register immediately** — Add to registry for future reuse

### Anti-patterns to Avoid

❌ **Creating duplicate components**
```typescript
// Page 1: components/LoginButton.tsx
// Page 2: components/SignupButton.tsx
// Result: Same button, different names, different styles
```

✅ **Reusing registered components**
```typescript
// Both pages import: components/Button.tsx
// Result: Same button everywhere, one source of truth
```

---

## 2. Design Tokens as Foundation

### The Principle

**All design decisions are encoded as reusable tokens, not hardcoded values.**

Design tokens are the atomic design decisions (colors, spacing, typography) that form the foundation of your design system. They're centralized, named semantically, and applied consistently.

### Why It Matters

**Without design tokens:**
- Hardcoded values scattered across codebase
- Inconsistent colors, spacing, fonts
- Difficult to maintain visual consistency
- Painful to implement design changes
- Brand updates require global find-replace

**With design tokens:**
- Single source for design decisions
- Semantic naming (primary, success, danger)
- Cascading updates automatically
- Easy theme switching (light/dark mode)
- Brand consistency enforced at build time

### Token Categories

#### 1. **Color Tokens**
```typescript
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
    // ... 200-900
  }
}
```

#### 2. **Typography Tokens**
```typescript
typography: {
  fontFamily: {
    sans: ['Inter', 'system-ui', 'sans-serif'],
    mono: ['JetBrains Mono', 'monospace']
  },
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    // ... 2xl-9xl
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700'
  }
}
```

#### 3. **Spacing Tokens**
```typescript
spacing: {
  0: '0',
  1: '0.25rem',  // 4px
  2: '0.5rem',   // 8px
  3: '0.75rem',  // 12px
  4: '1rem',     // 16px
  // ... up to 96
}
```

#### 4. **Border Tokens**
```typescript
borderRadius: {
  none: '0',
  sm: '0.125rem',
  base: '0.25rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
  full: '9999px'
}
```

### In Practice

❌ **Hardcoded values**
```tsx
<button className="bg-blue-500 text-white px-4 py-2 rounded">
  Click me
</button>
```

✅ **Token-based styling**
```tsx
<button className="bg-primary text-white px-4 py-2 rounded-md">
  Click me
</button>
```

When primary color changes from blue to green:
- Hardcoded version: Manual find-replace across entire codebase
- Token version: Change one value, cascades everywhere

### Token Hierarchy

Design tokens follow a hierarchy from abstract to concrete:

```
Brand tokens (abstract)
    ↓
Semantic tokens (purpose)
    ↓
Component tokens (specific)
    ↓
Applied styles (implementation)
```

Example:
```typescript
// Brand token
brandBlue: '#3B82F6'

// Semantic token
primary: brandBlue

// Component token
buttonPrimary: primary

// Applied style
<Button variant="primary" />
```

---

## 3. Stateful Design System

### The Principle

**The design system remembers architectural decisions and maintains state between iterations.**

Unlike stateless generators that start from scratch every time, a stateful design system maintains knowledge of:
- What components exist
- How they're configured
- Where they're used
- What's been tried and rejected
- Evolution over time

### Why It Matters

**Stateless (traditional AI tools):**
```
Request 1: "Create login page"
→ Generates fresh Button, Input, Form

Request 2: "Create dashboard"
→ Forgets about login page
→ Generates NEW Button (looks different!)
```

**Stateful (Coherent):**
```
Request 1: "Create login page"
→ Generates Button, Input, Form
→ Saves to component registry

Request 2: "Create dashboard"
→ Checks registry: Button exists
→ Reuses existing Button
→ Generates only new components
```

### What Gets Remembered

1. **Component Inventory**
   - Which components exist
   - Their props and variants
   - Usage locations

2. **Design Decisions**
   - Chosen color palette
   - Typography choices
   - Spacing system
   - Border radius preferences

3. **Architectural Patterns**
   - Layout structure (header/footer/sidebar)
   - Navigation approach
   - State management strategy
   - Routing structure

4. **Rejected Approaches**
   - What was tried and didn't work
   - Why certain decisions were made
   - Evolution rationale

### State Storage

State lives in version-controlled config files:

```typescript
// design-system.config.ts
export const designSystem = {
  version: '1.2.0',
  
  metadata: {
    projectName: 'API Portal',
    createdAt: '2025-01-15',
    lastModified: '2025-01-26',
    theme: 'light-and-dark'
  },
  
  tokens: { /* design tokens */ },
  components: { /* component registry */ },
  pages: { /* page structure */ },
  
  history: [
    { 
      date: '2025-01-20',
      change: 'Updated primary color from blue to indigo',
      reason: 'Better brand alignment'
    }
  ]
}
```

### Benefits of Statefulness

✅ **Incremental Evolution**
- Build on top of existing work
- No need to regenerate everything
- Preserves manual customizations

✅ **Architectural Memory**
- System knows why decisions were made
- Can reference past choices
- Prevents regression

✅ **Collaborative Context**
- Team members see full history
- Onboarding is easier
- Knowledge isn't lost

✅ **Safe Refactoring**
- System knows all dependencies
- Can simulate impact of changes
- Prevents breaking changes

---

## 4. Incremental Updates

### The Principle

**Modify once, update only what's affected. Never regenerate everything.**

When a design decision changes (e.g., "make buttons more rounded"), the system should:
1. Identify what's affected
2. Update only those specific parts
3. Leave everything else untouched
4. Verify no breaking changes

### Why It Matters

**Regenerative approach (bad):**
```
User: "Change button border radius"
System: Regenerates entire Button.tsx from scratch
Result: Custom logic lost, props changed, breaks existing usage
```

**Incremental approach (good):**
```
User: "Change button border radius"
System: Updates only borderRadius value in Button.tsx
Result: Everything else preserved, zero breaking changes
```

### Types of Updates

#### 1. **Token Updates** (Cascading)
```typescript
// Change design token
primary: '#3B82F6' → '#10B981'

// Automatically affects:
- All buttons using bg-primary
- All links using text-primary
- All borders using border-primary

// Nothing breaks, just changes color
```

#### 2. **Component Updates** (Targeted)
```typescript
// Modify Button component
export function Button({ children, variant = 'primary' }) {
  // Add new "size" prop
  return (
    <button className={`btn btn-${variant} btn-${size}`}>
      {children}
    </button>
  )
}

// System checks: Where is Button used?
// Updates all import sites with default size='medium'
// No breaking changes
```

#### 3. **Structural Updates** (Surgical)
```typescript
// Change navigation from horizontal to vertical
// System:
// 1. Identifies <Navigation /> component
// 2. Updates only layout classes
// 3. Preserves all menu items and logic
// 4. Tests in all pages using Navigation
```

### Update Strategy

```
1. Parse requested change
   ↓
2. Identify affected components/tokens
   ↓
3. Simulate impact (what breaks?)
   ↓
4. Make minimal necessary changes
   ↓
5. Validate no breaking changes
   ↓
6. Update registry with changes
```

### Anti-patterns

❌ **Over-regeneration**
```
User: "Change button color"
System: Regenerates entire page including forms, cards, layout
```

❌ **Losing context**
```
User: "Update navigation"
System: Forgets custom menu items added manually
```

❌ **Breaking changes**
```
User: "Add new button variant"
System: Changes existing variant names, breaks all pages
```

### Best Practices

✅ **Minimal scope**
- Change only what's requested
- Preserve everything else

✅ **Dependency awareness**
- Know what depends on what
- Update dependents safely

✅ **Backward compatibility**
- Add new features without breaking old ones
- Use defaults for new props

✅ **Validation**
- Check that nothing breaks
- Run automated tests
- Preview changes before applying

---

## 5. Architectural Consistency

### The Principle

**Pages aren't isolated artifacts — they're parts of a cohesive system.**

Every page should feel like it belongs to the same application. This goes beyond visual consistency to include:
- Shared navigation and routing
- Consistent layout structure
- Unified state management
- Common data patterns
- Integrated user flows

### Why It Matters

**Without architectural consistency:**
- Each page feels like a separate mini-app
- Navigation is fragmented
- State doesn't persist across pages
- User experience is disjointed
- Maintenance is painful

**With architectural consistency:**
- Seamless user flows across pages
- Shared authentication state
- Consistent navigation experience
- Integrated data management
- Feels like one cohesive application

### Elements of Architectural Consistency

#### 1. **Shared Layout**
```tsx
// All pages use same layout structure
<Layout>
  <Header />
  <Navigation />
  <main>
    {/* Page-specific content */}
  </main>
  <Footer />
</Layout>
```

#### 2. **Unified Routing**
```typescript
// Centralized route configuration
routes: {
  home: '/',
  dashboard: '/dashboard',
  settings: '/settings',
  profile: '/profile/:id'
}

// All pages reference same routes
// No hardcoded paths scattered around
```

#### 3. **Shared State Management**
```typescript
// Global state accessible everywhere
useAuthStore() // User authentication
useThemeStore() // Light/dark mode
useNotificationStore() // Toast messages

// Pages don't manage their own auth
// Consistent state across the app
```

#### 4. **Common Data Patterns**
```typescript
// Consistent API interaction
useQuery('users', fetchUsers) // All pages use same pattern
useMutation('updateUser', updateUser)

// Consistent loading states
// Consistent error handling
// Consistent caching strategy
```

#### 5. **Integrated Navigation**
```tsx
// Navigation knows about all pages
<Navigation>
  <NavLink to="/">Home</NavLink>
  <NavLink to="/dashboard">Dashboard</NavLink>
  <NavLink to="/settings">Settings</NavLink>
</Navigation>

// Current page is highlighted
// Breadcrumbs work automatically
// Back navigation is consistent
```

### In Practice

**Creating a new page:**

❌ **Isolated approach**
```tsx
// settings.tsx
export default function Settings() {
  const [user, setUser] = useState(null) // Own auth
  
  return (
    <div className="p-4"> {/* Custom layout */}
      <h1>Settings</h1>
      {/* Custom navigation */}
      <a href="/">Home</a>
      <a href="/dashboard">Dashboard</a>
      {/* Page content */}
    </div>
  )
}
```

✅ **Consistent approach**
```tsx
// settings.tsx
import { Layout } from '@/components/Layout'
import { useAuthStore } from '@/stores/auth' // Shared state

export default function Settings() {
  const { user } = useAuthStore() // Reuse global auth
  
  return (
    <Layout> {/* Shared layout */}
      <h1>Settings</h1>
      {/* Navigation handled by Layout */}
      {/* Page content */}
    </Layout>
  )
}
```

### Architectural Patterns to Maintain

1. **Layout Hierarchy**
```
App
├── Layout (consistent across all pages)
│   ├── Header
│   ├── Navigation
│   ├── Main
│   │   └── Page Content (varies)
│   └── Footer
```

2. **State Management**
```
Global Stores (Zustand/Redux/Context)
├── Auth Store
├── Theme Store
├── Notification Store
└── User Preferences Store

Page-specific State (React useState/useReducer)
└── Form state, filters, local UI state
```

3. **Data Fetching**
```
API Layer (consistent across app)
├── useQuery hooks (reading data)
├── useMutation hooks (writing data)
└── Error/loading states (standardized)
```

### Benefits

✅ **Seamless UX**
- Users feel like they're in one app, not jumping between disconnected pages

✅ **Maintainability**
- Change layout once, affects all pages
- Update navigation logic in one place

✅ **Onboarding**
- New developers understand structure immediately
- Consistent patterns = faster ramp-up

✅ **Scalability**
- Adding new pages follows established patterns
- No architectural drift over time

---

## Applying All Five Principles Together

When all five principles work in harmony:

```
1. Component Registry
   ↓ Tracks all components
   
2. Design Tokens
   ↓ Define visual consistency
   
3. Stateful System
   ↓ Remembers decisions
   
4. Incremental Updates
   ↓ Evolve safely
   
5. Architectural Consistency
   ↓ Unified application
   
= Coherent Design System
```

### Example: Adding a New Feature

**Request:** "Add a user profile page with edit functionality"

**How Coherent Method applies:**

1. **Component Registry** → Checks: Do we have Card, Button, Input, Avatar?
   - Card: ✓ Exists, reuse
   - Button: ✓ Exists, reuse
   - Input: ✓ Exists, reuse
   - Avatar: ✗ New, generate and register

2. **Design Tokens** → Uses existing tokens for colors, spacing, typography
   - No new color values
   - Follows spacing system
   - Matches typography scale

3. **Stateful System** → Knows about auth, knows about layout patterns
   - Uses shared auth store
   - Follows Layout pattern
   - Integrates with existing routing

4. **Incremental Updates** → Doesn't regenerate existing pages
   - Creates only new profile page
   - Adds Avatar to registry
   - Updates navigation to include new route

5. **Architectural Consistency** → Matches rest of application
   - Same Layout as other pages
   - Same navigation style
   - Same form patterns
   - Same loading states

**Result:** New page that feels native to the app, not bolted on.

---

## Summary

The five principles of Coherent Design Method work together to create design systems that are:

- **Consistent** — Visual and functional uniformity
- **Maintainable** — Easy to update and evolve
- **Scalable** — Grows without technical debt
- **Cohesive** — Everything connects logically
- **Predictable** — Clear patterns and expectations

By following these principles, you build applications that feel designed by a team with a clear vision and style guide — even when generated with AI assistance.

---

**Next:** [Core Concepts](./core-concepts.md) — Deep dive into the key concepts that make Coherent possible.
