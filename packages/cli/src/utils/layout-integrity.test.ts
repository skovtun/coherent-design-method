import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { resolve } from 'path'
import { validateLayoutIntegrity, loadPlanFromDisk } from './layout-integrity.js'

let projectRoot: string

beforeEach(() => {
  projectRoot = mkdtempSync(resolve(tmpdir(), 'layout-integrity-'))
})

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true })
})

function writeFile(rel: string, content: string) {
  const full = resolve(projectRoot, rel)
  mkdirSync(resolve(full, '..'), { recursive: true })
  writeFileSync(full, content, 'utf-8')
}

describe('validateLayoutIntegrity', () => {
  it('no issues when plan has no groups', () => {
    const issues = validateLayoutIntegrity(projectRoot, { groups: [] })
    expect(issues).toEqual([])
  })

  it('flags missing sidebar component when plan requires sidebar', () => {
    const plan = { groups: [{ id: 'app', layout: 'sidebar' as const, pages: ['/dashboard'] }] }
    const issues = validateLayoutIntegrity(projectRoot, plan)
    expect(issues.some(i => i.type === 'SIDEBAR_COMPONENT_MISSING')).toBe(true)
  })

  it('flags unwired app layout when sidebar component exists but layout is plain', () => {
    writeFile('components/shared/sidebar.tsx', 'export function AppSidebar() {}')
    writeFile(
      'app/(app)/layout.tsx',
      `export default function AppLayout({ children }) { return <main>{children}</main> }`,
    )
    const plan = { groups: [{ id: 'app', layout: 'sidebar' as const, pages: ['/dashboard'] }] }
    const issues = validateLayoutIntegrity(projectRoot, plan)
    expect(issues.some(i => i.type === 'APP_LAYOUT_NOT_WIRED')).toBe(true)
  })

  it('passes when sidebar component and properly wired layout both exist', () => {
    writeFile('components/shared/sidebar.tsx', 'export function AppSidebar() {}')
    writeFile(
      'app/(app)/layout.tsx',
      `import { AppSidebar } from '@/components/shared/sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'
export default function AppLayout({ children }) {
  return (<SidebarProvider><AppSidebar /><main>{children}</main></SidebarProvider>)
}`,
    )
    const plan = { groups: [{ id: 'app', layout: 'sidebar' as const, pages: ['/dashboard'] }] }
    const issues = validateLayoutIntegrity(projectRoot, plan)
    expect(issues).toEqual([])
  })

  it('flags missing header component when plan requires header', () => {
    const plan = { groups: [{ id: 'public', layout: 'header' as const, pages: ['/'] }] }
    const issues = validateLayoutIntegrity(projectRoot, plan)
    expect(issues.some(i => i.type === 'HEADER_FOOTER_MISSING')).toBe(true)
  })

  it('handles both layout (header + sidebar)', () => {
    const plan = { groups: [{ id: 'app', layout: 'both' as const, pages: ['/dashboard'] }] }
    const issues = validateLayoutIntegrity(projectRoot, plan)
    expect(issues.some(i => i.type === 'SIDEBAR_COMPONENT_MISSING')).toBe(true)
    expect(issues.some(i => i.type === 'HEADER_FOOTER_MISSING')).toBe(true)
  })
})

describe('loadPlanFromDisk', () => {
  it('returns null when plan.json missing', () => {
    expect(loadPlanFromDisk(projectRoot)).toBeNull()
  })

  it('returns null when plan.json is malformed', () => {
    writeFile('.coherent/plan.json', '{ not json')
    expect(loadPlanFromDisk(projectRoot)).toBeNull()
  })

  it('returns null when plan has no groups array', () => {
    writeFile('.coherent/plan.json', JSON.stringify({ something: 'else' }))
    expect(loadPlanFromDisk(projectRoot)).toBeNull()
  })

  it('loads valid plan', () => {
    writeFile(
      '.coherent/plan.json',
      JSON.stringify({ groups: [{ id: 'app', layout: 'sidebar', pages: ['/dashboard'] }] }),
    )
    const plan = loadPlanFromDisk(projectRoot)
    expect(plan).not.toBeNull()
    expect(plan?.groups[0]?.layout).toBe('sidebar')
  })
})
