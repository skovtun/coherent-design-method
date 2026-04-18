/**
 * Detect Tailwind CSS version in a project.
 * create-next-app@15 uses Tailwind v4 (@tailwindcss/postcss).
 * Our scaffolder originally targeted v3 (@tailwind base/components/utilities).
 */

import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import type { DesignSystemConfig } from '@getcoherent/core'

export function isTailwindV4(projectRoot: string): boolean {
  const pkgPath = resolve(projectRoot, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (allDeps['@tailwindcss/postcss']) return true
      const twVersion = allDeps['tailwindcss'] || ''
      if (twVersion.startsWith('^4') || twVersion.startsWith('~4') || twVersion.startsWith('4')) return true
    } catch {
      /* ignore */
    }
  }

  const globalsPath = resolve(projectRoot, 'app', 'globals.css')
  if (existsSync(globalsPath)) {
    const content = readFileSync(globalsPath, 'utf-8')
    if (content.includes('@import "tailwindcss"') || content.includes("@import 'tailwindcss'")) return true
  }

  return false
}

/**
 * Generate Tailwind v4–compatible globals.css with @import "tailwindcss",
 * @theme inline for color utilities, and CSS variables in :root/.dark.
 */
export function generateV4GlobalsCss(config: DesignSystemConfig): string {
  const light = config.tokens.colors.light
  const dark = config.tokens.colors.dark

  const contrastFg = (hex: string): string => {
    const c = hex.replace('#', '')
    const r = parseInt(c.slice(0, 2), 16)
    const g = parseInt(c.slice(2, 4), 16)
    const b = parseInt(c.slice(4, 6), 16)
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return lum > 0.5 ? '#09090b' : '#fafafa'
  }

  const blendColors = (hex1: string, hex2: string, ratio: number): string => {
    const parse = (h: string) => {
      const c = h.replace('#', '')
      return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]
    }
    const [r1, g1, b1] = parse(hex1)
    const [r2, g2, b2] = parse(hex2)
    const blend = (a: number, b: number) => Math.round(a + (b - a) * ratio)
    const toHex = (n: number) => n.toString(16).padStart(2, '0')
    return `#${toHex(blend(r1, r2))}${toHex(blend(g1, g2))}${toHex(blend(b1, b2))}`
  }

  const radius = config.tokens.radius

  return `@import "tailwindcss";

@utility container {
  margin-inline: auto;
  padding-inline: 1rem;
  max-width: 80rem;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-transparent: transparent;
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-error: var(--error);
  --color-info: var(--info);
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
  --radius-sm: ${radius.sm || '0.25rem'};
  --radius-md: ${radius.md || '0.5rem'};
  --radius-lg: ${radius.lg || '0.75rem'};
  --radius-xl: ${radius.xl || '1rem'};
}

:root {
  --background: ${light.background};
  --foreground: ${light.foreground};
  --primary: ${light.primary};
  --primary-foreground: ${contrastFg(light.primary)};
  --secondary: ${light.secondary};
  --secondary-foreground: ${contrastFg(light.secondary)};
  --muted: ${light.muted};
  --muted-foreground: ${blendColors(light.foreground, light.background, 0.45)};
  --accent: ${light.accent || light.muted};
  --accent-foreground: ${light.foreground};
  --destructive: ${light.error};
  --destructive-foreground: ${contrastFg(light.error)};
  --border: ${light.border};
  --input: ${light.border};
  --ring: ${light.primary};
  --radius: ${radius.md || '0.5rem'};
  --card: ${light.background};
  --card-foreground: ${light.foreground};
  --popover: ${light.background};
  --popover-foreground: ${light.foreground};
  --success: ${light.success};
  --warning: ${light.warning};
  --error: ${light.error};
  --info: ${light.info || light.primary};
  --sidebar-background: ${light.background};
  --sidebar-foreground: ${light.foreground};
  --sidebar-primary: ${light.primary};
  --sidebar-primary-foreground: ${contrastFg(light.primary)};
  --sidebar-accent: ${light.accent || light.muted};
  --sidebar-accent-foreground: ${light.foreground};
  --sidebar-border: ${light.border};
  --sidebar-ring: ${light.primary};
  --sidebar-muted: ${light.muted};
  --sidebar-muted-foreground: ${blendColors(light.foreground, light.background, 0.45)};
  --chart-1: ${light.primary};
  --chart-2: ${light.success};
  --chart-3: ${light.warning};
  --chart-4: ${light.error};
  --chart-5: ${light.info || light.primary};
}

.dark {
  --background: ${dark.background};
  --foreground: ${dark.foreground};
  --primary: ${dark.primary};
  --primary-foreground: ${contrastFg(dark.primary)};
  --secondary: ${dark.secondary};
  --secondary-foreground: ${contrastFg(dark.secondary)};
  --muted: ${dark.muted};
  --muted-foreground: ${blendColors(dark.foreground, dark.background, 0.45)};
  --accent: ${dark.accent || dark.muted};
  --accent-foreground: ${dark.foreground};
  --destructive: ${dark.error};
  --destructive-foreground: ${contrastFg(dark.error)};
  --border: ${dark.border};
  --input: ${dark.border};
  --ring: ${dark.primary};
  --card: ${dark.background};
  --card-foreground: ${dark.foreground};
  --popover: ${dark.background};
  --popover-foreground: ${dark.foreground};
  --success: ${dark.success};
  --warning: ${dark.warning};
  --error: ${dark.error};
  --info: ${dark.info || dark.primary};
  --sidebar-background: ${dark.background};
  --sidebar-foreground: ${dark.foreground};
  --sidebar-primary: ${dark.primary};
  --sidebar-primary-foreground: ${contrastFg(dark.primary)};
  --sidebar-accent: ${dark.accent || dark.muted};
  --sidebar-accent-foreground: ${dark.foreground};
  --sidebar-border: ${dark.border};
  --sidebar-ring: ${dark.primary};
  --sidebar-muted: ${dark.muted};
  --sidebar-muted-foreground: ${blendColors(dark.foreground, dark.background, 0.45)};
  --chart-1: ${dark.primary};
  --chart-2: ${dark.success};
  --chart-3: ${dark.warning};
  --chart-4: ${dark.error};
  --chart-5: ${dark.info || dark.primary};
}

@layer base {
  *,
  ::after,
  ::before,
  ::backdrop,
  ::file-selector-button {
    border-color: var(--border);
  }

  body {
    background-color: var(--background);
    color: var(--foreground);
    font-family: Arial, Helvetica, sans-serif;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
`
}
