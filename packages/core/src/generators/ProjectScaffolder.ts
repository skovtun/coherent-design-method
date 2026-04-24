/**
 * Project Scaffolder
 *
 * Creates complete Next.js 15 project structure with components, pages, and configuration.
 */

import type { DesignSystemConfig } from '../types/design-system.js'
import { ComponentGenerator } from './ComponentGenerator.js'
import { DesignSystemGenerator } from './DesignSystemGenerator.js'
import { PageGenerator } from './PageGenerator.js'
import { TailwindConfigGenerator } from './TailwindConfigGenerator.js'
import { generateSharedComponent } from './SharedComponentGenerator.js'
import { integrateSharedLayoutIntoRootLayout } from './SharedLayoutIntegration.js'
import { FRAMEWORK_VERSIONS } from '../versions.js'
import { writeFile as fsWriteFile, mkdir } from 'fs/promises'
import { dirname, join } from 'path'
import { existsSync, rmSync } from 'fs'

export class ProjectScaffolder {
  private config: DesignSystemConfig
  private componentGenerator: ComponentGenerator
  private pageGenerator: PageGenerator
  private tailwindGenerator: TailwindConfigGenerator
  private projectRoot: string

  constructor(config: DesignSystemConfig, projectRoot: string = process.cwd()) {
    this.config = config
    this.projectRoot = projectRoot
    this.componentGenerator = new ComponentGenerator(config)
    this.pageGenerator = new PageGenerator(config)
    this.tailwindGenerator = new TailwindConfigGenerator(config)
  }

  /** Options for scaffold (e.g. custom home page content from WELCOME.md) */
  private scaffoldOptions?: { homePageContent?: string }

  /**
   * Scaffold complete Next.js project
   */
  async scaffold(options?: { homePageContent?: string }): Promise<void> {
    this.scaffoldOptions = options
    const appType = this.config.settings.appType || 'multi-page'

    if (appType === 'multi-page') {
      await this.scaffoldNextJsProject()
    } else {
      // SPA scaffolding will be implemented in Phase 2
      throw new Error('SPA scaffolding not yet implemented')
    }
  }

  /**
   * Scaffold Next.js 15 project
   */
  private async scaffoldNextJsProject(): Promise<void> {
    // Create directory structure
    await this.createDirectories()

    // Generate package.json
    await this.generatePackageJson()

    // Generate Next.js config
    await this.generateNextConfig()

    // Generate TypeScript config
    await this.generateTsConfig()

    // Generate Tailwind config
    await this.generateTailwindConfig()

    // Generate PostCSS config
    await this.generatePostCssConfig()

    // Generate globals.css
    await this.generateGlobalsCss()

    // Generate lib/utils.ts (cn utility)
    await this.generateUtils()

    // Generate components
    await this.generateComponents()

    // Generate pages
    await this.generatePages()

    // Generate root layout
    await this.generateRootLayout()

    // Generate default pages (404, loading, error)
    await this.generateDefaultPages()

    // Generate favicon
    await this.generateFavicon()

    // Generate VS Code settings (for Tailwind CSS support)
    await this.generateVSCodeSettings()

    // Generate .gitignore
    await this.generateGitignore()

    // Generate README
    await this.generateReadme()
  }

  /**
   * Create directory structure
   */
  private async createDirectories(): Promise<void> {
    const dirs = ['app', 'components', 'lib', 'public']

    for (const dir of dirs) {
      const fullPath = join(this.projectRoot, dir)
      if (!existsSync(fullPath)) {
        await mkdir(fullPath, { recursive: true })
      }
    }
  }

  /**
   * Generate package.json
   */
  private async generatePackageJson(): Promise<void> {
    const packageJson = {
      name: this.config.name.toLowerCase().replace(/\s+/g, '-'),
      version: '0.1.0',
      private: true,
      scripts: {
        dev: 'next dev --turbo',
        build: 'next build',
        start: 'next start',
        lint: 'next lint',
      },
      dependencies: {
        react: `${FRAMEWORK_VERSIONS.react}`,
        'react-dom': `${FRAMEWORK_VERSIONS['react-dom']}`,
        next: `${FRAMEWORK_VERSIONS.next}`,
        'class-variance-authority': '^0.7.0',
        clsx: '^2.1.0',
        'tailwind-merge': '^2.2.0',
        'lucide-react': '^1.8.0',
      },
      devDependencies: {
        typescript: `^${FRAMEWORK_VERSIONS.typescript}`,
        '@types/node': `^${FRAMEWORK_VERSIONS['@types/node']}`,
        '@types/react': `^${FRAMEWORK_VERSIONS['@types/react']}`,
        '@types/react-dom': `^${FRAMEWORK_VERSIONS['@types/react-dom']}`,
        tailwindcss: `^${FRAMEWORK_VERSIONS.tailwindcss}`,
        postcss: `^${FRAMEWORK_VERSIONS.postcss}`,
        autoprefixer: `^${FRAMEWORK_VERSIONS.autoprefixer}`,
        eslint: `^${FRAMEWORK_VERSIONS.eslint}`,
        'eslint-config-next': `^${FRAMEWORK_VERSIONS['eslint-config-next']}`,
      },
    }

    const content = JSON.stringify(packageJson, null, 2)
    await this.writeFile('package.json', content)
  }

  /**
   * Generate next.config.js
   */
  private async generateNextConfig(): Promise<void> {
    const content = `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
}

module.exports = nextConfig
`
    await this.writeFile('next.config.js', content)
  }

  /**
   * Generate tsconfig.json
   */
  private async generateTsConfig(): Promise<void> {
    const tsconfig = {
      compilerOptions: {
        target: 'ES2022',
        lib: ['dom', 'dom.iterable', 'esnext'],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: 'esnext',
        moduleResolution: 'bundler',
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: 'preserve',
        incremental: true,
        plugins: [
          {
            name: 'next',
          },
        ],
        paths: {
          '@/*': ['./*'],
        },
      },
      include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
      exclude: ['node_modules'],
    }

    const content = JSON.stringify(tsconfig, null, 2)
    await this.writeFile('tsconfig.json', content)
  }

  /**
   * Generate Tailwind config as .cjs so require() works; avoids jiti/sucrase (SyntaxError 51:12).
   */
  async generateTailwindConfig(): Promise<void> {
    const content = await this.tailwindGenerator.generateCjs()
    await this.writeFile('tailwind.config.cjs', content)
  }

  /**
   * Generate tailwind.config.ts (TypeScript ESM format).
   * Used when overwriting create-next-app's default tailwind.config.ts.
   */
  async generateTailwindConfigTs(): Promise<void> {
    const content = await this.tailwindGenerator.generate()
    await this.writeFile('tailwind.config.ts', content)
  }

  /**
   * Generate postcss.config.mjs (ESM for Next.js).
   * No explicit Tailwind config path — Tailwind auto-discovers tailwind.config.*.
   */
  private async generatePostCssConfig(): Promise<void> {
    const content = `/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}

export default config
`
    await this.writeFile('postcss.config.mjs', content)
  }

  /**
   * Generate globals.css with Tailwind directives and CSS variables from design tokens.
   */
  async generateGlobalsCss(): Promise<void> {
    const tokens = this.config.tokens
    const light = tokens.colors.light
    const dark = tokens.colors.dark

    const content = `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: ${light.background};
    --foreground: ${light.foreground};
    --card: ${light.background};
    --card-foreground: ${light.foreground};
    --popover: ${light.background};
    --popover-foreground: ${light.foreground};
    --primary: ${light.primary};
    --primary-foreground: ${ProjectScaffolder.contrastingForeground(light.primary)};
    --secondary: ${light.secondary};
    --secondary-foreground: ${ProjectScaffolder.contrastingForeground(light.secondary)};
    --muted: ${light.muted};
    --muted-foreground: ${ProjectScaffolder.blendColors(light.foreground, light.background, 0.45)};
    --accent: ${light.muted};
    --accent-foreground: ${light.foreground};
    --destructive: ${light.error};
    --destructive-foreground: ${ProjectScaffolder.contrastingForeground(light.error)};
    --border: ${light.border};
    --input: ${light.border};
    --ring: ${light.primary};
    --radius: ${tokens.radius.md || '0.5rem'};
    --success: ${light.success};
    --warning: ${light.warning};
    --error: ${light.error};
    --info: ${light.info || light.primary};
    --sidebar-background: ${light.background};
    --sidebar-foreground: ${light.foreground};
    --sidebar-primary: ${light.primary};
    --sidebar-primary-foreground: ${ProjectScaffolder.contrastingForeground(light.primary)};
    --sidebar-accent: ${light.muted};
    --sidebar-accent-foreground: ${light.foreground};
    --sidebar-border: ${light.border};
    --sidebar-ring: ${light.primary};
    --chart-1: ${light.primary};
    --chart-2: ${light.secondary};
    --chart-3: ${light.success};
    --chart-4: ${light.warning};
    --chart-5: ${light.error};
  }

  .dark {
    --background: ${dark.background};
    --foreground: ${dark.foreground};
    --card: ${dark.background};
    --card-foreground: ${dark.foreground};
    --popover: ${dark.background};
    --popover-foreground: ${dark.foreground};
    --primary: ${dark.primary};
    --primary-foreground: ${ProjectScaffolder.contrastingForeground(dark.primary)};
    --secondary: ${dark.secondary};
    --secondary-foreground: ${ProjectScaffolder.contrastingForeground(dark.secondary)};
    --muted: ${dark.muted};
    --muted-foreground: ${ProjectScaffolder.blendColors(dark.foreground, dark.background, 0.45)};
    --accent: ${dark.muted};
    --accent-foreground: ${dark.foreground};
    --destructive: ${dark.error};
    --destructive-foreground: ${ProjectScaffolder.contrastingForeground(dark.error)};
    --border: ${dark.border};
    --input: ${dark.border};
    --ring: ${dark.primary};
    --success: ${dark.success};
    --warning: ${dark.warning};
    --error: ${dark.error};
    --info: ${dark.info || dark.primary};
    --sidebar-background: ${dark.background};
    --sidebar-foreground: ${dark.foreground};
    --sidebar-primary: ${dark.primary};
    --sidebar-primary-foreground: ${ProjectScaffolder.contrastingForeground(dark.primary)};
    --sidebar-accent: ${dark.muted};
    --sidebar-accent-foreground: ${dark.foreground};
    --sidebar-border: ${dark.border};
    --sidebar-ring: ${dark.primary};
    --chart-1: ${dark.primary};
    --chart-2: ${dark.secondary};
    --chart-3: ${dark.success};
    --chart-4: ${dark.warning};
    --chart-5: ${dark.error};
  }

  * {
    border-color: var(--border);
  }

  body {
    background-color: var(--background);
    color: var(--foreground);
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
    await this.writeFile('app/globals.css', content)
  }

  /**
   * Blend two hex colors. ratio=0 returns color1, ratio=1 returns color2.
   * Used to derive muted-foreground (a mid-gray between foreground and background).
   */
  private static blendColors(hex1: string, hex2: string, ratio: number): string {
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

  private static contrastingForeground(bgHex: string): string {
    const c = bgHex.replace('#', '')
    const r = parseInt(c.slice(0, 2), 16)
    const g = parseInt(c.slice(2, 4), 16)
    const b = parseInt(c.slice(4, 6), 16)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance > 0.5 ? '#09090b' : '#fafafa'
  }

  /**
   * Generate lib/utils.ts (cn utility)
   */
  private async generateUtils(): Promise<void> {
    const content = `import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
`
    await this.writeFile('lib/utils.ts', content)
  }

  /**
   * Generate all components
   */
  private async generateComponents(): Promise<void> {
    for (const component of this.config.components) {
      const code = await this.componentGenerator.generate(component)
      const fileName = this.toKebabCase(component.name) + '.tsx'
      await this.writeFile(`components/${fileName}`, code)
    }
  }

  /**
   * Generate all pages. Root route (/) uses homePageContent if provided (welcome page from WELCOME.md).
   */
  private async generatePages(): Promise<void> {
    const appType = this.config.settings.appType || 'multi-page'
    const homePageContent = this.scaffoldOptions?.homePageContent

    for (const page of this.config.pages) {
      const isRoot = page.route === '/' || page.route === ''
      const code = isRoot && homePageContent ? homePageContent : await this.pageGenerator.generate(page, appType)
      const routePath = this.getPagePath(page.route)
      const filePath = isRoot ? 'app/page.tsx' : `app/${routePath}/page.tsx`
      await this.writeFile(filePath, code)
    }
  }

  /**
   * Generate root layout with shared Header/Footer components.
   * Creates layout.tsx (without inline nav), then registers shared Header and Footer
   * in the manifest and wires them into layout.tsx via integrateSharedLayoutIntoRootLayout.
   */
  async generateRootLayout(): Promise<void> {
    const appType = this.config.settings.appType || 'multi-page'
    const layout = this.config.pages[0]?.layout || 'centered'
    const code = await this.pageGenerator.generateLayout(layout, appType, { skipNav: true })
    await this.writeFile('app/layout.tsx', code)

    // DS FAB as its own client component so it can self-hide on
    // /design-system routes (root layout is a Server Component).
    await generateSharedComponent(this.projectRoot, {
      name: 'DSButton',
      type: 'layout',
      code: this.pageGenerator.generateDSButtonCode(),
      description: 'Floating "Design System" button — hides itself on /design-system routes',
      usedIn: ['app/layout.tsx'],
    })

    if (this.config.navigation?.enabled && appType === 'multi-page') {
      const navType = this.config.navigation.type || 'header'

      if (navType === 'header' || navType === 'both') {
        const headerCode = this.generateInitialHeaderCode()
        await generateSharedComponent(this.projectRoot, {
          name: 'Header',
          type: 'layout',
          code: headerCode,
          description: 'Main site header with navigation and theme toggle',
          usedIn: ['app/layout.tsx'],
        })
      }

      const footerCode = this.generateInitialFooterCode()
      await generateSharedComponent(this.projectRoot, {
        name: 'Footer',
        type: 'layout',
        code: footerCode,
        description: 'Site footer',
        usedIn: ['app/layout.tsx'],
      })

      if (navType === 'sidebar' || navType === 'both') {
        const sidebarCode = this.pageGenerator.generateSharedSidebarCode()
        await generateSharedComponent(this.projectRoot, {
          name: 'AppSidebar',
          type: 'layout',
          code: sidebarCode,
          description: 'Application sidebar using shadcn/ui Sidebar components',
          usedIn: ['app/(app)/layout.tsx'],
        })
      }

      const isSidebar = navType === 'sidebar' || navType === 'both'
      if (!isSidebar) {
        await integrateSharedLayoutIntoRootLayout(this.projectRoot)
      }
    }
  }

  private async generateDefaultPages(): Promise<void> {
    await this.writeFile(
      'app/not-found.tsx',
      `import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-2xl font-bold tracking-tight">Page not found</h1>
      <p className="text-sm text-muted-foreground">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link
        href="/"
        className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 active:opacity-80 transition-opacity"
      >
        Go home
      </Link>
    </main>
  )
}
`,
    )

    await this.writeFile(
      'app/loading.tsx',
      `export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="space-y-4 w-full max-w-md px-4">
        <div className="h-6 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-full animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-3/4 animate-pulse rounded-lg bg-muted" />
        <div className="grid gap-4 md:grid-cols-2 mt-6">
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    </div>
  )
}
`,
    )

    await this.writeFile(
      'app/error.tsx',
      `'use client'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
      <p className="text-sm text-muted-foreground max-w-md text-center">
        An unexpected error occurred. Please try again.
      </p>
      <button
        onClick={reset}
        className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 active:opacity-80 transition-opacity"
      >
        Try again
      </button>
    </main>
  )
}
`,
    )
  }

  private async generateFavicon(): Promise<void> {
    // Unified logo + favicon: same 4-square grid, same color. Logo uses
    // `currentColor` so the header can theme it via `text-primary`; favicon
    // hardcodes primary blue (#3B82F6, matching minimal-config default) since
    // static SVG files can't reference CSS custom properties.
    const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <rect x="1.25" y="1.25" width="21.5" height="21.5" rx="3" stroke="currentColor" stroke-width="2"/>
  <rect x="5.5" y="5.5" width="6" height="6" rx="1" fill="currentColor"/>
  <rect x="12.5" y="5.5" width="6" height="6" rx="1" fill="currentColor" opacity="0.45"/>
  <rect x="5.5" y="12.5" width="6" height="6" rx="1" fill="currentColor" opacity="0.45"/>
  <rect x="12.5" y="12.5" width="6" height="6" rx="1" fill="currentColor"/>
</svg>`
    await this.writeFile('public/coherent-logo.svg', logoSvg)

    const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <rect x="1.75" y="1.75" width="28.5" height="28.5" rx="4" stroke="#3B82F6" stroke-width="2.5"/>
  <rect x="7.25" y="7.25" width="8" height="8" rx="1.25" fill="#3B82F6"/>
  <rect x="16.75" y="7.25" width="8" height="8" rx="1.25" fill="#3B82F6" opacity="0.45"/>
  <rect x="7.25" y="16.75" width="8" height="8" rx="1.25" fill="#3B82F6" opacity="0.45"/>
  <rect x="16.75" y="16.75" width="8" height="8" rx="1.25" fill="#3B82F6"/>
</svg>`
    await this.writeFile('public/favicon.svg', faviconSvg)
  }

  /**
   * Generate .gitignore
   */
  private async generateGitignore(): Promise<void> {
    const content = `# dependencies
/node_modules
/.pnp
.pnp.js

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# local env files
.env*.local
.env

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts

# coherent — fix session journals + backups (regeneratable, user-local)
.coherent/fix-sessions/
.coherent/backups/
`
    await this.writeFile('.gitignore', content)
  }

  /**
   * Generate README.md
   */
  private async generateReadme(): Promise<void> {
    const content = `# ${this.config.name}

${this.config.description}

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Project Structure

- \`app/\` - Next.js App Router pages
- \`components/\` - React components
- \`lib/\` - Utilities and helpers
- \`design-system.config.ts\` - Design system configuration

## Learn More

This project was generated with [Coherent Design Method](https://github.com/skovtun/coherent-design-method).
`
    await this.writeFile('README.md', content)
  }

  /**
   * Get page path from route
   */
  private getPagePath(route: string): string {
    // Convert /home to home, /dashboard/settings to dashboard/settings
    // Special case: root route / becomes 'page' directory
    const path = route.slice(1).trim()
    return path || 'page'
  }

  /**
   * Convert PascalCase to kebab-case
   */
  private toKebabCase(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
  }

  /**
   * Generate VS Code settings for Tailwind CSS support
   */
  private async generateVSCodeSettings(): Promise<void> {
    const settings = {
      'css.validate': false,
      'files.associations': {
        '*.css': 'tailwindcss',
      },
      'tailwindCSS.experimental.classRegex': [
        ['cn\\(([^)]*)\\)', '(?:\'|\\"|\\`)([^\\"\'\\`]*)(?:\'|\\"|\\`)'],
        ['cva\\(([^)]*)\\)', '["\'\\`]([^"\'\\`]*).*?["\'\\`]'],
      ],
      'editor.quickSuggestions': {
        strings: true,
      },
    }
    const content = JSON.stringify(settings, null, 2) + '\n'
    await this.writeFile('.vscode/settings.json', content)
  }

  /**
   * Generate design system pages (layout, home, component showcases, tokens)
   */
  public async generateDesignSystemPages(): Promise<void> {
    const generator = new DesignSystemGenerator(this.config)
    const files = generator.generateStructure()
    for (const [filePath, content] of files) {
      await this.writeFile(filePath, content)
    }
  }

  /**
   * Generate docs pages under Design System (layout, index, components, tokens, for-designers, recommendations) and recommendations.md
   */
  public async generateDocsPages(): Promise<void> {
    const oldDocsPath = join(this.projectRoot, 'app', 'docs')
    if (existsSync(oldDocsPath)) {
      rmSync(oldDocsPath, { recursive: true })
    }
    await this.writeFile('app/design-system/docs/layout.tsx', this.getDocsLayoutContent())
    await this.writeFile('app/design-system/docs/page.tsx', this.getDocsSinglePageContent())
    await this.writeFile('app/design-system/recommendations/page.tsx', this.getDocsRecommendationsPageContent())
    await this.writeFile('recommendations.md', this.getRecommendationsMdPlaceholder())
  }

  private getDocsLayoutContent(): string {
    return `export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
`
  }

  /**
   * Single Documentation page: one scrollable page with all sections (no cards/sub-pages).
   * Use browser Print / Save as PDF to download.
   */
  private getDocsSinglePageContent(): string {
    return `import { config } from '../../../design-system.config'
import Link from 'next/link'

export default function DocumentationPage() {
  const components = Array.isArray(config.components) ? config.components : []
  const tokens = config.tokens ?? {}
  const colors = tokens.colors ?? { light: {}, dark: {} }
  const spacing = tokens.spacing ?? {}
  const typography = tokens.typography ?? { fontFamily: {}, fontSize: {}, fontWeight: {}, lineHeight: {} }
  const radius = tokens.radius ?? {}
  const light = colors.light ?? {}
  const dark = colors.dark ?? {}

  return (
    <div className="flex flex-col gap-8 max-w-none print:max-w-none">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Documentation</h1>
        <p className="text-sm text-muted-foreground">
          Complete project reference: components, tokens, structure. Print or Save as PDF to download.
        </p>
      </div>

      {/* How to work */}
      <section>
        <h2 className="text-sm font-semibold mb-3">How to work</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border p-4">
            <div className="text-sm font-medium mb-1">IDE + AI</div>
            <p className="text-sm text-muted-foreground">
              Edit code and <code className="rounded bg-muted px-1 text-xs">design-system.config.ts</code> directly. Changes appear via hot reload.
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-sm font-medium mb-1">CLI chat</div>
            <p className="text-sm text-muted-foreground">
              Use <code className="rounded bg-muted px-1 text-xs">coherent chat &quot;add pricing page&quot;</code> for quick generation, then refine in the IDE.
            </p>
          </div>
        </div>
      </section>

      {/* Project structure */}
      <section>
        <h2 className="text-sm font-semibold mb-3">Project structure</h2>
        <div className="rounded-lg border overflow-hidden text-sm">
          {[
            ['design-system.config.ts', 'Single source of truth'],
            ['app/', 'Next.js pages and layouts'],
            ['components/', 'Reusable UI components'],
            ['/design-system', 'Design System viewer'],
          ].map(([path, desc], i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b last:border-0">
              <code className="text-xs font-mono text-muted-foreground w-48">{path}</code>
              <span className="text-sm text-muted-foreground">{desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Components */}
      <section>
        <h2 className="text-sm font-semibold mb-3">Components ({components.length})</h2>
        {components.length === 0 ? (
          <p className="text-sm text-muted-foreground">No components registered yet.</p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Name</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">ID</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Category</th>
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Source</th>
                </tr>
              </thead>
              <tbody>
                {components.map((c: { id: string; name?: string; category?: string; source?: string }) => (
                  <tr key={c.id} className="border-t">
                    <td className="p-3 text-sm font-medium">
                      <Link href={\`/design-system/components/\${c.id}\`} className="hover:text-primary hover:underline">{c.name ?? c.id}</Link>
                    </td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">{c.id}</td>
                    <td className="p-3 text-sm text-muted-foreground">{String(c.category ?? '—')}</td>
                    <td className="p-3 text-sm text-muted-foreground">{String(c.source ?? '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Tokens: Colors */}
      <section>
        <h2 className="text-sm font-semibold mb-3">Color tokens</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-2">Light</h3>
            <div className="space-y-1.5">
              {Object.entries(light).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2 text-sm">
                  <div className="size-4 rounded border shrink-0" style={{ backgroundColor: typeof value === 'string' ? value : undefined }} />
                  <span className="font-mono text-xs w-24">{key}</span>
                  <span className="text-xs text-muted-foreground">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-2">Dark</h3>
            <div className="space-y-1.5">
              {Object.entries(dark).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2 text-sm">
                  <div className="size-4 rounded border shrink-0" style={{ backgroundColor: typeof value === 'string' ? value : undefined }} />
                  <span className="font-mono text-xs w-24">{key}</span>
                  <span className="text-xs text-muted-foreground">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Tokens: Typography */}
      <section>
        <h2 className="text-sm font-semibold mb-3">Typography tokens</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {typeof typography === 'object' && typography !== null && !Array.isArray(typography) && Object.entries(typography).map(([group, values]) => (
            <div key={group}>
              <h3 className="text-xs font-medium text-muted-foreground mb-2">{group}</h3>
              <div className="space-y-1 text-sm">
                {typeof values === 'object' && values !== null && !Array.isArray(values)
                  ? Object.entries(values).map(([k, v]) => (
                      <div key={k} className="flex gap-2"><span className="font-mono text-xs">{k}</span><span className="text-xs text-muted-foreground">{String(v)}</span></div>
                    ))
                  : <div className="text-xs text-muted-foreground">{String(values)}</div>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Tokens: Spacing & Radius */}
      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold mb-3">Spacing tokens</h2>
          <div className="space-y-1.5">
            {Object.entries(spacing).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2 text-sm">
                <span className="font-mono text-xs w-12">{key}</span>
                <span className="text-xs text-muted-foreground">{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-sm font-semibold mb-3">Radius tokens</h2>
          <div className="space-y-1.5">
            {Object.entries(radius).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2 text-sm">
                <span className="font-mono text-xs w-12">{key}</span>
                <span className="text-xs text-muted-foreground">{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
`
  }

  private getDocsRecommendationsPageContent(): string {
    return `import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

function SimpleMarkdown({ children }: { children: string }) {
  const lines = children.split('\\n')
  const elements: React.ReactNode[] = []
  lines.forEach((line, i) => {
    if (line.startsWith('### ')) elements.push(<h3 key={i} className="text-lg font-medium mt-4 mb-2">{line.slice(4)}</h3>)
    else if (line.startsWith('## ')) elements.push(<h2 key={i} className="text-xl font-semibold mt-6 mb-3">{line.slice(3)}</h2>)
    else if (line.startsWith('# ')) elements.push(<h1 key={i} className="text-2xl font-bold mt-6 mb-3">{line.slice(2)}</h1>)
    else if (line.startsWith('- ')) elements.push(<li key={i} className="ml-4 list-disc text-sm">{line.slice(2)}</li>)
    else if (line.trim()) elements.push(<p key={i} className="text-sm text-muted-foreground my-1">{line}</p>)
  })
  return <>{elements}</>
}

export default function RecommendationsPage() {
  const path = join(process.cwd(), 'recommendations.md')
  const raw = existsSync(path) ? readFileSync(path, 'utf-8') : ''
  const body = raw
    .replace(/^#[^\\n]*\\n?/, '')
    .replace(/^[^#\\n-][^\\n]*\\n?/, '')
    .replace(/^---\\n?/, '')
    .trim()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">UX/UI Recommendations</h1>
        <p className="text-sm text-muted-foreground">
          Generated as you build. The AI adds suggestions for accessibility, layout, and consistency.
        </p>
      </div>
      {!body ? (
        <p className="text-sm text-muted-foreground">
          No recommendations yet. Use <code className="rounded bg-muted px-1.5 py-0.5 text-xs">coherent chat</code> to modify the interface — the AI will add UX suggestions here.
        </p>
      ) : (
        <div className="max-w-none">
          <SimpleMarkdown>{body}</SimpleMarkdown>
        </div>
      )}
    </div>
  )
}
`
  }

  private getRecommendationsMdPlaceholder(): string {
    return `# UX/UI Recommendations

Recommendations are added here when you use \`coherent chat\` and the AI suggests improvements (accessibility, layout, consistency, etc.). View this content on the [Recommendations page](/design-system/recommendations) in the app.
`
  }

  /**
   * Write file to project root
   */
  private async writeFile(relativePath: string, content: string): Promise<void> {
    const fullPath = join(this.projectRoot, relativePath)
    const dir = dirname(fullPath)

    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }

    await fsWriteFile(fullPath, content, 'utf-8')
  }

  /**
   * Update config reference
   */
  updateConfig(newConfig: DesignSystemConfig): void {
    this.config = newConfig
    this.componentGenerator.updateConfig(newConfig)
    this.pageGenerator.updateConfig(newConfig)
    this.tailwindGenerator.updateConfig(newConfig)
  }

  /**
   * Initial header for coherent init — Coherent Design Method branding.
   * Replaced by app-branded header on first `coherent chat` via regenerateLayout().
   */
  private generateInitialHeaderCode(): string {
    return `'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

function ThemeToggle() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])
  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
  }
  return (
    <button
      onClick={toggle}
      className="flex items-center justify-center w-9 h-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-label="Toggle theme"
    >
      {dark ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
      )}
    </button>
  )
}

export function Header() {
  const pathname = usePathname()
  if (pathname?.startsWith('/design-system')) return null
  return (
    <>
      <nav className="sticky top-0 z-50 shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0 text-primary">
              <rect x="1.25" y="1.25" width="21.5" height="21.5" rx="3" stroke="currentColor" strokeWidth="2"/>
              <rect x="5.5" y="5.5" width="6" height="6" rx="1" fill="currentColor"/>
              <rect x="12.5" y="5.5" width="6" height="6" rx="1" fill="currentColor" opacity="0.45"/>
              <rect x="5.5" y="12.5" width="6" height="6" rx="1" fill="currentColor" opacity="0.45"/>
              <rect x="12.5" y="12.5" width="6" height="6" rx="1" fill="currentColor"/>
            </svg>
            <Link href="/" className="text-sm font-semibold text-foreground hover:text-foreground/90 transition-colors">
              Coherent Design Method
            </Link>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
          </div>
        </div>
      </nav>
    </>
  )
}
`
  }

  /**
   * Initial footer for coherent init — Coherent Design Method branding.
   * Replaced by app-branded footer on first `coherent chat` via regenerateLayout().
   */
  private generateInitialFooterCode(): string {
    return `'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function Footer() {
  const pathname = usePathname()
  if (pathname?.startsWith('/design-system')) return null
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 py-10 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0 text-primary">
                <path d="M10 4C10.5523 4 11 4.44772 11 5V13H19C19.5523 13 20 13.4477 20 14V20.4287C19.9999 22.401 18.401 23.9999 16.4287 24H3.57129C1.59895 23.9999 7.5245e-05 22.401 0 20.4287V7.57129C7.53742e-05 5.59895 1.59895 4.00008 3.57129 4H10ZM2 20.4287C2.00008 21.2965 2.70352 21.9999 3.57129 22H9V15H2V20.4287ZM11 22H16.4287C17.2965 21.9999 17.9999 21.2965 18 20.4287V15H11V22ZM3.57129 6C2.70352 6.00008 2.00008 6.70352 2 7.57129V13H9V6H3.57129ZM20.5 0C22.433 0 24 1.567 24 3.5V9.90039C23.9998 10.5076 23.5076 10.9998 22.9004 11H14.0996C13.4924 10.9998 13.0002 10.5076 13 9.90039V1.09961C13.0002 0.492409 13.4924 0.000211011 14.0996 0H20.5ZM15 9H22V3.5C22 2.67157 21.3284 2 20.5 2H15V9Z" fill="currentColor"/>
              </svg>
              <span className="text-sm font-semibold">Coherent Design Method</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Design once. Stay consistent everywhere.
            </p>
          </div>
          <div>
            <h4 className="mb-3 text-sm font-semibold">Product</h4>
            <ul className="space-y-2">
              <li><Link href="/design-system" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Design System</Link></li>
              <li><a href="https://getcoherent.design" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Website</a></li>
              <li><a href="https://github.com/skovtun/coherent-design-method" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors">GitHub</a></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-sm font-semibold">Legal</h4>
            <ul className="space-y-2">
              <li><span className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors">Terms of Use</span></li>
              <li><span className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors">Privacy Policy</span></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-sm font-semibold">Author</h4>
            <ul className="space-y-2">
              <li><a href="https://www.linkedin.com/in/sergeikovtun/" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Sergei Kovtun</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t py-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Coherent Design Method. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
`
  }
}
