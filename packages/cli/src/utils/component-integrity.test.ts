import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { findUnregisteredComponents, isPlatformInternalEntry, isUsedInLayout } from './component-integrity.js'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { SharedComponentsManifest } from '@getcoherent/core'

describe('isUsedInLayout', () => {
  const tmpRoot = join(tmpdir(), 'component-integrity-test')

  beforeEach(() => {
    mkdirSync(join(tmpRoot, 'app', '(app)'), { recursive: true })
    mkdirSync(join(tmpRoot, 'app', '(public)'), { recursive: true })
    mkdirSync(join(tmpRoot, 'app', '(auth)'), { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('finds component in root layout', () => {
    writeFileSync(join(tmpRoot, 'app', 'layout.tsx'), `import { Header } from '@/components/shared/header'`, 'utf-8')
    const result = isUsedInLayout(tmpRoot, 'Header')
    expect(result).toEqual(['app/layout.tsx'])
  })

  it('finds component in route group layout', () => {
    writeFileSync(
      join(tmpRoot, 'app', 'layout.tsx'),
      'export default function Layout({ children }) { return children }',
      'utf-8',
    )
    writeFileSync(
      join(tmpRoot, 'app', '(app)', 'layout.tsx'),
      `import { AppSidebar } from '@/components/shared/sidebar'`,
      'utf-8',
    )
    const result = isUsedInLayout(tmpRoot, 'AppSidebar')
    expect(result).toEqual(['app/(app)/layout.tsx'])
  })

  it('finds component in multiple layouts', () => {
    writeFileSync(join(tmpRoot, 'app', 'layout.tsx'), `import { ThemeProvider } from 'next-themes'`, 'utf-8')
    writeFileSync(
      join(tmpRoot, 'app', '(public)', 'layout.tsx'),
      `import { Header } from '@/components/shared/header'\nimport { Footer } from '@/components/shared/footer'`,
      'utf-8',
    )
    writeFileSync(
      join(tmpRoot, 'app', '(app)', 'layout.tsx'),
      `import { Header } from '@/components/shared/header'`,
      'utf-8',
    )
    const result = isUsedInLayout(tmpRoot, 'Header')
    expect(result).toContain('app/(public)/layout.tsx')
    expect(result).toContain('app/(app)/layout.tsx')
    expect(result).toHaveLength(2)
  })

  it('returns empty array when component not in any layout', () => {
    writeFileSync(
      join(tmpRoot, 'app', 'layout.tsx'),
      'export default function L({ children }) { return children }',
      'utf-8',
    )
    const result = isUsedInLayout(tmpRoot, 'NonExistent')
    expect(result).toEqual([])
  })
})

describe('findUnregisteredComponents (platform-internal filter, v0.11)', () => {
  let projectRoot: string

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'component-integrity-platform-'))
    mkdirSync(join(projectRoot, 'components', 'shared'), { recursive: true })
    mkdirSync(join(projectRoot, 'app'), { recursive: true })
  })

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true })
  })

  function emptyManifest(): SharedComponentsManifest {
    return { shared: [], nextId: 1 } as SharedComponentsManifest
  }

  it('skips DSButton (platform internal) so it never auto-registers', () => {
    writeFileSync(
      join(projectRoot, 'components', 'shared', 'ds-button.tsx'),
      `'use client'
import { usePathname } from 'next/navigation'
export function DSButton() { return <a href="/design-system">DS</a> }
`,
      'utf-8',
    )
    const result = findUnregisteredComponents(projectRoot, emptyManifest())
    expect(result.find(r => r.name === 'DSButton')).toBeUndefined()
  })

  it('still picks up genuine user components alongside the platform widget', () => {
    writeFileSync(
      join(projectRoot, 'components', 'shared', 'ds-button.tsx'),
      'export function DSButton() { return null }',
      'utf-8',
    )
    writeFileSync(
      join(projectRoot, 'components', 'shared', 'stat-card.tsx'),
      'export function StatCard() { return null }',
      'utf-8',
    )
    const result = findUnregisteredComponents(projectRoot, emptyManifest())
    expect(result.map(r => r.name).sort()).toEqual(['StatCard'])
  })
})

describe('isPlatformInternalEntry', () => {
  it('flags DSButton entries that were auto-registered by an older `coherent fix`', () => {
    expect(
      isPlatformInternalEntry({
        name: 'DSButton',
        file: 'components/shared/ds-button.tsx',
        source: 'extracted',
      }),
    ).toBe(true)
  })

  it('does NOT flag a user-curated DSButton-like entry (source !== extracted)', () => {
    // If the user genuinely registered a DSButton through the chat
    // rail (`source: 'generated'`) or by hand (`source: 'custom'`),
    // we don't strip it during the v0.11 manifest scrub. Only the
    // auto-registered platform leak gets cleaned.
    expect(
      isPlatformInternalEntry({
        name: 'DSButton',
        file: 'components/shared/ds-button.tsx',
        source: 'generated',
      }),
    ).toBe(false)
    expect(
      isPlatformInternalEntry({
        name: 'DSButton',
        file: 'components/shared/ds-button.tsx',
        source: undefined,
      }),
    ).toBe(false)
  })

  it('returns false for ordinary user components', () => {
    expect(
      isPlatformInternalEntry({
        name: 'StatCard',
        file: 'components/shared/stat-card.tsx',
        source: 'extracted',
      }),
    ).toBe(false)
  })
})
