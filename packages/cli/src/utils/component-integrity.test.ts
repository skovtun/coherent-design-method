import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isUsedInLayout } from './component-integrity.js'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

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
    writeFileSync(join(tmpRoot, 'app', 'layout.tsx'), 'export default function Layout({ children }) { return children }', 'utf-8')
    writeFileSync(join(tmpRoot, 'app', '(app)', 'layout.tsx'), `import { AppSidebar } from '@/components/shared/sidebar'`, 'utf-8')
    const result = isUsedInLayout(tmpRoot, 'AppSidebar')
    expect(result).toEqual(['app/(app)/layout.tsx'])
  })

  it('finds component in multiple layouts', () => {
    writeFileSync(join(tmpRoot, 'app', 'layout.tsx'), `import { ThemeProvider } from 'next-themes'`, 'utf-8')
    writeFileSync(join(tmpRoot, 'app', '(public)', 'layout.tsx'), `import { Header } from '@/components/shared/header'\nimport { Footer } from '@/components/shared/footer'`, 'utf-8')
    writeFileSync(join(tmpRoot, 'app', '(app)', 'layout.tsx'), `import { Header } from '@/components/shared/header'`, 'utf-8')
    const result = isUsedInLayout(tmpRoot, 'Header')
    expect(result).toContain('app/(public)/layout.tsx')
    expect(result).toContain('app/(app)/layout.tsx')
    expect(result).toHaveLength(2)
  })

  it('returns empty array when component not in any layout', () => {
    writeFileSync(join(tmpRoot, 'app', 'layout.tsx'), 'export default function L({ children }) { return children }', 'utf-8')
    const result = isUsedInLayout(tmpRoot, 'NonExistent')
    expect(result).toEqual([])
  })
})
