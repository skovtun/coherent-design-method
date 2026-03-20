import { describe, it, expect } from 'vitest'
import { ShadcnProvider } from './shadcn-provider.js'

describe('ShadcnProvider', () => {
  const provider = new ShadcnProvider()

  it('has id "shadcn"', () => {
    expect(provider.id).toBe('shadcn')
  })

  it('lists all shadcn components', () => {
    const components = provider.list()
    expect(components.length).toBeGreaterThan(40)
    expect(components.find(c => c.id === 'sidebar')).toBeTruthy()
    expect(components.find(c => c.id === 'button')).toBeTruthy()
  })

  it('returns ComponentAPI for sidebar', () => {
    const api = provider.getComponentAPI('sidebar')
    expect(api).not.toBeNull()
    expect(api!.subcomponents).toContain('SidebarProvider')
    expect(api!.subcomponents).toContain('SidebarMenu')
    expect(api!.subcomponents).toContain('SidebarMenuButton')
    expect(api!.antiPatterns.length).toBeGreaterThan(0)
  })

  it('returns ComponentAPI for dialog', () => {
    const api = provider.getComponentAPI('dialog')
    expect(api).not.toBeNull()
    expect(api!.subcomponents).toContain('Dialog')
    expect(api!.subcomponents).toContain('DialogContent')
    expect(api!.subcomponents).toContain('DialogHeader')
    expect(api!.subcomponents).toContain('DialogTitle')
  })

  it('returns ComponentAPI for select', () => {
    const api = provider.getComponentAPI('select')
    expect(api).not.toBeNull()
    expect(api!.subcomponents).toContain('Select')
    expect(api!.subcomponents).toContain('SelectTrigger')
    expect(api!.subcomponents).toContain('SelectContent')
    expect(api!.subcomponents).toContain('SelectItem')
  })

  it('returns ComponentAPI for dropdown-menu', () => {
    const api = provider.getComponentAPI('dropdown-menu')
    expect(api).not.toBeNull()
    expect(api!.subcomponents).toContain('DropdownMenu')
    expect(api!.subcomponents).toContain('DropdownMenuTrigger')
    expect(api!.subcomponents).toContain('DropdownMenuContent')
    expect(api!.subcomponents).toContain('DropdownMenuItem')
  })

  it('returns null for unknown component', () => {
    expect(provider.getComponentAPI('nonexistent')).toBeNull()
  })

  it('marks all components as managed', () => {
    const components = provider.list()
    expect(components.every(c => c.managed === true)).toBe(true)
  })
})
