import { describe, it, expect } from 'vitest'
import { validateV4GlobalsCss } from './css-validator.js'

describe('validateV4GlobalsCss', () => {
  it('catches missing --color-transparent', () => {
    const css =
      '@import "tailwindcss";\n@theme inline {\n  --color-background: var(--background);\n}\n:root {\n  --background: #fff;\n}'
    const issues = validateV4GlobalsCss(css)
    expect(issues).toContain('Missing @theme token: --color-transparent')
  })

  it('catches missing sidebar tokens', () => {
    const css =
      '@import "tailwindcss";\n@theme inline {\n  --color-transparent: transparent;\n}\n:root {\n  --background: #fff;\n}'
    const issues = validateV4GlobalsCss(css)
    expect(issues.some(i => i.includes('--color-sidebar-background'))).toBe(true)
  })

  it('catches stale v3 directives in v4 CSS', () => {
    const css = '@tailwind base;\n@import "tailwindcss";'
    const issues = validateV4GlobalsCss(css)
    expect(issues.some(i => i.includes('@tailwind'))).toBe(true)
  })

  it('returns empty array for complete v4 CSS', () => {
    const css = `@import "tailwindcss";
@theme inline {
  --color-transparent: transparent;
  --color-black: #000;
  --color-white: #fff;
  --color-background: var(--background);
  --color-sidebar-background: var(--sidebar-background);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-muted: var(--sidebar-muted);
  --color-sidebar-muted-foreground: var(--sidebar-muted-foreground);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --radius-xs: 0.125rem;
}
:root {
  --background: #fff;
  --sidebar-background: #fff;
  --sidebar-foreground: #09090b;
  --sidebar-primary: #2563eb;
  --sidebar-primary-foreground: #fafafa;
  --sidebar-accent: #f1f5f9;
  --sidebar-accent-foreground: #09090b;
  --sidebar-border: #e2e8f0;
  --sidebar-ring: #2563eb;
  --sidebar-muted: #f1f5f9;
  --sidebar-muted-foreground: #64748b;
  --chart-1: #2563eb;
  --chart-2: #16a34a;
  --chart-3: #eab308;
  --chart-4: #dc2626;
  --chart-5: #2563eb;
}`
    const issues = validateV4GlobalsCss(css)
    expect(issues).toHaveLength(0)
  })

  it('catches @theme token without corresponding :root variable', () => {
    const css = `@import "tailwindcss";
@theme inline {
  --color-transparent: transparent;
  --color-black: #000;
  --color-white: #fff;
  --color-sidebar-background: var(--sidebar-background);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-muted: var(--sidebar-muted);
  --color-sidebar-muted-foreground: var(--sidebar-muted-foreground);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --radius-xs: 0.125rem;
}
:root {
  --background: #fff;
}`
    const issues = validateV4GlobalsCss(css)
    expect(issues.some(i => i.includes('--sidebar-background') && i.includes(':root'))).toBe(true)
  })
})
