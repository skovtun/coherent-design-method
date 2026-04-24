import { existsSync, readFileSync, readdirSync } from 'fs'
import { resolve } from 'path'

/**
 * Read components.json and installed UI components to build project-specific context.
 * This tells the AI exactly what's available in the user's project.
 *
 * Named `FromRoot` to disambiguate from `buildProjectContext` in harness-context.ts
 * (which takes a manifest + config, not a filesystem root).
 */
export function buildProjectContextFromRoot(projectRoot?: string): string {
  if (!projectRoot) return ''
  const parts: string[] = []

  // Read components.json (shadcn config)
  const componentsJsonPath = resolve(projectRoot, 'components.json')
  if (existsSync(componentsJsonPath)) {
    try {
      const raw = JSON.parse(readFileSync(componentsJsonPath, 'utf-8'))
      if (raw.style) parts.push(`shadcn style: ${raw.style}`)
      if (raw.tailwind?.cssVariables !== undefined) parts.push(`CSS variables: ${raw.tailwind.cssVariables}`)
      if (raw.aliases?.components) parts.push(`component alias: ${raw.aliases.components}`)
    } catch {
      /* ignore parse errors */
    }
  }

  // List installed UI components
  const uiDir = resolve(projectRoot, 'components', 'ui')
  if (existsSync(uiDir)) {
    try {
      const files = readdirSync(uiDir).filter((f: string) => f.endsWith('.tsx'))
      const names = files.map((f: string) => f.replace('.tsx', ''))
      if (names.length > 0) parts.push(`Installed shadcn components: ${names.join(', ')}`)
    } catch {
      /* ignore */
    }
  }

  // Detect Tailwind version
  const pkgPath = resolve(projectRoot, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
      const twVersion = allDeps['tailwindcss'] || allDeps['@tailwindcss/postcss'] || ''
      if (
        twVersion.startsWith('^4') ||
        twVersion.startsWith('~4') ||
        twVersion.startsWith('4') ||
        allDeps['@tailwindcss/postcss']
      ) {
        parts.push('TAILWIND_V4: This project uses Tailwind CSS v4 (CSS-first configuration)')
      }
    } catch {
      /* ignore */
    }
  }

  return parts.length > 0 ? `\nProject Context:\n${parts.join('\n')}` : ''
}
