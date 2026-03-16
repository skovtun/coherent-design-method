/**
 * Dark mode helpers (Story 3.5).
 * - setDefaultDarkTheme: add className="dark" to <html> in root layout
 * - THEME_TOGGLE_CODE: shared component that toggles dark class on document
 */

import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { generateSharedComponent, loadManifest, integrateSharedLayoutIntoRootLayout } from '@getcoherent/core'

const THEME_TOGGLE_CODE = `'use client'

import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ThemeToggle() {
  const toggle = () => {
    document.documentElement.classList.toggle('dark')
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label="Toggle theme"
      className="relative"
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  )
}
`

/**
 * Add className="dark" to <html> in app/layout.tsx so default theme is dark.
 */
export async function setDefaultDarkTheme(projectRoot: string): Promise<boolean> {
  const layoutPath = join(projectRoot, 'app', 'layout.tsx')
  if (!existsSync(layoutPath)) return false
  let content = await readFile(layoutPath, 'utf-8')
  if (content.includes('<html className="dark"') || content.includes("<html className='dark'")) return true
  content = content.replace(/<html(\s|>)/, '<html className="dark"$1')
  await writeFile(layoutPath, content, 'utf-8')
  return true
}

/**
 * Remove default dark class from <html> (for "switch to light mode" if needed later).
 */
export async function setDefaultLightTheme(projectRoot: string): Promise<boolean> {
  const layoutPath = join(projectRoot, 'app', 'layout.tsx')
  if (!existsSync(layoutPath)) return false
  let content = await readFile(layoutPath, 'utf-8')
  content = content.replace(/\s*className="dark"\s*/, ' ').replace(/\s*className='dark'\s*/, ' ')
  await writeFile(layoutPath, content, 'utf-8')
  return true
}

/**
 * Create ThemeToggle shared component (layout type) and integrate into root layout.
 * Idempotent: if ThemeToggle already exists in manifest, only runs layout integration.
 */
export async function ensureThemeToggle(projectRoot: string): Promise<{ created: boolean; id: string }> {
  const manifest = await loadManifest(projectRoot)
  const existing = manifest.shared.find(e => e.name === 'ThemeToggle' || e.name.toLowerCase().includes('themetoggle'))
  if (existing) {
    await integrateSharedLayoutIntoRootLayout(projectRoot)
    return { created: false, id: existing.id }
  }
  const result = await generateSharedComponent(projectRoot, {
    name: 'ThemeToggle',
    type: 'layout',
    code: THEME_TOGGLE_CODE,
    usedIn: ['app/layout.tsx'],
  })
  await integrateSharedLayoutIntoRootLayout(projectRoot)
  return { created: true, id: result.id }
}
