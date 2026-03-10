# Welcome to Coherent Design Method 🎨

Congratulations! You just created a **stateful design system** that maintains architectural coherence as your project grows.

## What Did Coherent Create?

### ✅ Component Registry
Your components are registered once and reused everywhere. No more duplicate Button implementations scattered across your codebase.

**Current components:**
- Button (shadcn/ui style)
- Ready to add more via chat

### ✅ Design Tokens
Centralized design decisions in `design-system.config.ts`:
- Colors (light + dark mode)
- Spacing
- Typography
- Border radius

**Changes cascade automatically** — update primary color once, see it everywhere.

### ✅ Architecture Memory
Coherent tracks:
- Which components exist
- Where they're used
- What tokens they depend on
- Your project's evolution

## Quick Start — Build with AI

### 1️⃣ Add Pages
```bash
coherent chat "add a dashboard page with welcome message and stats cards"
coherent chat "add pricing page with 3 tier cards"
coherent chat "add about page with team section"
```

### 2️⃣ Customize Design
```bash
coherent chat "make all buttons rounded with green primary color"
coherent chat "change dashboard to use sidebar layout"
coherent chat "add dark mode toggle to navigation"
```

### 3️⃣ Preview Changes
```bash
coherent preview
```
Opens http://localhost:3000 with hot reload

### 4️⃣ Deploy
```bash
coherent export
```
Creates production-ready build for Vercel/Netlify

## How It's Different

### Traditional Approach ❌
1. Designer creates mockup in Figma
2. Developer codes components from scratch
3. Another developer creates similar component
4. Components diverge over time
5. Design system falls apart

### Coherent Approach ✅
1. Define component once in registry
2. AI checks registry before creating
3. Existing components reused automatically
4. Changes cascade through design tokens
5. System stays architecturally coherent

## What Makes This "Coherent"?

**Consistency** = things look the same (surface level)  
**Coherence** = things are fundamentally connected (structural)

Traditional tools give you consistency through willpower.  
Coherent gives you coherence through architecture.

### Example:
```typescript
// Traditional: 5 different Button implementations
<Button1 className="bg-blue-500 px-4 py-2 rounded" />
<Button2 style={{backgroundColor: 'blue', padding: '8px 16px'}} />
<BlueButton size="md" />
// ... and 2 more variations

// Coherent: 1 Button, used 47 times
<Button variant="primary" size="md" />
// All instances update when you change design tokens
```

## File Structure

```
your-project/
├── design-system.config.ts    ← Single source of truth
├── app/
│   ├── page.tsx               ← This welcome page
│   ├── layout.tsx             ← Root layout with navigation
│   └── globals.css            ← Design tokens as CSS variables
├── components/
│   └── button.tsx             ← Generated components
└── lib/
    └── utils.ts               ← Utilities (cn helper)
```

## Learn More

- **Methodology:** [coherent-design/coherent-design-method](https://github.com/skovtun/coherent-design-method)
- **Case Studies:** [API Portal Example](https://github.com/skovtun/coherent-design-method/blob/main/docs/examples/api-portal-case-study.md)
- **Principles:** [Core Concepts](https://github.com/skovtun/coherent-design-method/blob/main/docs/philosophy/core-concepts.md)
- **Issues:** [Report bugs or request features](https://github.com/skovtun/coherent-design-method/issues)

## Pro Tips 💡

- **Start small:** Add one page at a time
- **Reuse first:** AI automatically checks for existing components
- **Token-based:** Change colors/spacing through design tokens, not hardcoded values
- **Check history:** Run `coherent status` to see recent changes
- **Iterate fast:** Use `coherent chat` to describe changes in natural language

---

**Ready to build?** Try:
```bash
coherent chat "add a hero section to home page with headline and CTA button"
```

Created by [Sergei Kovtun](https://github.com/skovtun)  
Powered by Coherent Design Method
