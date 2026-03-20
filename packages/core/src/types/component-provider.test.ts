import { describe, it, expect } from 'vitest'
import type { ComponentProvider, ComponentAPI, ComponentMeta } from './component-provider.js'

describe('ComponentProvider types', () => {
  it('should allow implementing the ComponentProvider interface', () => {
    const mockProvider: ComponentProvider = {
      id: 'test',
      init: async () => {},
      install: async () => {},
      has: () => false,
      list: () => [],
      listNames: () => [],
      getComponentAPI: () => null,
      getCssVariables: () => '',
      getThemeBlock: () => '',
    }
    expect(mockProvider.id).toBe('test')
  })

  it('should define ComponentAPI with required fields', () => {
    const api: ComponentAPI = {
      name: 'Button',
      subcomponents: ['Button'],
      importPath: '@/components/ui/button',
      keyProps: { variant: '"default" | "ghost"' },
      usage: '<Button variant="ghost">Click</Button>',
      antiPatterns: ['Never use custom bg-* on Button'],
    }
    expect(api.name).toBe('Button')
    expect(api.subcomponents).toHaveLength(1)
  })

  it('should define ComponentMeta with required fields', () => {
    const meta: ComponentMeta = {
      id: 'button',
      name: 'Button',
      category: 'form',
      managed: true,
    }
    expect(meta.managed).toBe(true)
  })
})
