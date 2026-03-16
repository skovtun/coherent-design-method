/**
 * Tailwind Config Generator
 *
 * Generates Tailwind CSS configuration from design tokens.
 */

import type { DesignSystemConfig, DesignTokens } from '../types/design-system.js'

export class TailwindConfigGenerator {
  private config: DesignSystemConfig

  constructor(config: DesignSystemConfig) {
    this.config = config
  }

  /**
   * Generate Tailwind config file (TypeScript)
   */
  async generate(): Promise<string> {
    const tokens = this.config.tokens
    const colors = this.generateColors(tokens)
    const spacing = this.generateSpacing(tokens)
    const typography = this.generateTypography(tokens)
    const borderRadius = this.generateBorderRadius(tokens)
    const safelist = this.generateSafelist()

    return `import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './design-system.config.ts',
  ],
${safelist}
  theme: {
    extend: {
      colors: {
${colors}
      },
      spacing: {
${spacing}
      },
      fontFamily: {
${typography.fontFamily}
      },
      fontSize: {
${typography.fontSize}
      },
      fontWeight: {
${typography.fontWeight}
      },
      lineHeight: {
${typography.lineHeight}
      },
      borderRadius: {
${borderRadius}
      },
    },
  },
  plugins: [],
}

export default config
`
  }

  /**
   * Generate Tailwind config as CommonJS (tailwind.config.cjs).
   * Simplified colors (no dark: {} block) to avoid PostCSS parsing errors.
   * Dark mode is handled via CSS variables in globals.css.
   */
  async generateCjs(): Promise<string> {
    const tokens = this.config.tokens
    const spacing = this.generateSpacing(tokens)
    const typography = this.generateTypography(tokens)
    const borderRadius = this.generateBorderRadius(tokens)
    const safelist = this.generateSafelist()

    return `/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './design-system.config.ts',
  ],
${safelist}
  theme: {
    extend: {
      colors: {
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        success: 'var(--success)',
        warning: 'var(--warning)',
        error: 'var(--error)',
        info: 'var(--info)',
      },
      spacing: {
${spacing}
      },
      fontFamily: {
${typography.fontFamily}
      },
      fontSize: {
${typography.fontSize}
      },
      borderRadius: {
${borderRadius}
      },
    },
  },
  plugins: [],
}
`
  }

  /**
   * Extract all Tailwind class names from component configs and generate safelist.
   * This ensures Tailwind generates CSS for classes used dynamically at runtime.
   */
  private generateSafelist(): string {
    const components = this.config.components ?? []
    if (components.length === 0) return ''

    const classes = new Set<string>()
    for (const comp of components) {
      if (comp.baseClassName) {
        comp.baseClassName.split(/\s+/).forEach(c => c && classes.add(c))
      }
      for (const v of comp.variants ?? []) {
        if (v.className) {
          v.className.split(/\s+/).forEach(c => c && classes.add(c))
        }
      }
      for (const s of comp.sizes ?? []) {
        if (s.className) {
          s.className.split(/\s+/).forEach(c => c && classes.add(c))
        }
      }
    }

    if (classes.size === 0) return ''

    const sorted = [...classes].sort()
    const items = sorted.map(c => `    '${c}',`).join('\n')
    return `  safelist: [\n${items}\n  ],\n`
  }

  /**
   * Generate color tokens
   */
  private generateColors(_tokens: DesignTokens): string {
    return `        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        success: 'var(--success)',
        warning: 'var(--warning)',
        error: 'var(--error)',
        info: 'var(--info)',`
  }

  /**
   * Generate spacing tokens (quote keys starting with digit, e.g. '2xl')
   */
  private generateSpacing(tokens: DesignTokens): string {
    const spacing = tokens.spacing
    const entries: string[] = []

    Object.entries(spacing).forEach(([key, value]) => {
      const safeKey = /^\d/.test(key) ? `'${key}'` : key
      entries.push(`        ${safeKey}: '${value}',`)
    })

    return entries.join('\n')
  }

  /**
   * Generate typography tokens
   */
  private generateTypography(tokens: DesignTokens): {
    fontFamily: string
    fontSize: string
    fontWeight: string
    lineHeight: string
  } {
    const typography = tokens.typography

    const fontFamily = `        sans: [${typography.fontFamily.sans
      .split(',')
      .map(f => `'${f.trim()}'`)
      .join(', ')}],
        mono: [${typography.fontFamily.mono
          .split(',')
          .map(f => `'${f.trim()}'`)
          .join(', ')}],`

    const safeKey = (k: string) => (/^\d/.test(k) ? `'${k}'` : k)
    const fontSize = Object.entries(typography.fontSize)
      .map(([key, value]) => `        ${safeKey(key)}: '${value}',`)
      .join('\n')

    const fontWeight = Object.entries(typography.fontWeight)
      .map(([key, value]) => `        ${safeKey(key)}: '${value}',`)
      .join('\n')

    const lineHeight = Object.entries(typography.lineHeight)
      .map(([key, value]) => `        ${safeKey(key)}: '${value}',`)
      .join('\n')

    return {
      fontFamily,
      fontSize,
      fontWeight,
      lineHeight,
    }
  }

  /**
   * Generate border radius tokens (quote keys starting with digit)
   */
  private generateBorderRadius(tokens: DesignTokens): string {
    const radius = tokens.radius
    const entries: string[] = []

    Object.entries(radius).forEach(([key, value]) => {
      const safeKey = /^\d/.test(key) ? `'${key}'` : key
      entries.push(`        ${safeKey}: '${value}',`)
    })

    return entries.join('\n')
  }

  /**
   * Update config reference
   */
  updateConfig(newConfig: DesignSystemConfig): void {
    this.config = newConfig
  }
}
