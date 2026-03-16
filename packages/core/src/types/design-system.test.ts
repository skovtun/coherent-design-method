import { describe, it, expect } from 'vitest'
import { PageDefinitionSchema } from './design-system.js'

describe('PageDefinitionSchema', () => {
  const base = {
    name: 'Test',
    title: 'Test Page',
    description: 'A test page',
    layout: 'centered' as const,
    sections: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  it('accepts route with leading /', () => {
    const result = PageDefinitionSchema.safeParse({ ...base, id: 'test', route: '/test' })
    expect(result.success).toBe(true)
  })

  it('auto-prepends / to route without it', () => {
    const result = PageDefinitionSchema.safeParse({ ...base, id: 'test', route: 'test' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.route).toBe('/test')
    }
  })

  it('accepts dynamic route segments [id]', () => {
    const result = PageDefinitionSchema.safeParse({ ...base, id: 'detail', route: '/products/[id]' })
    expect(result.success).toBe(true)
  })

  it('accepts [slug] route segments', () => {
    const result = PageDefinitionSchema.safeParse({ ...base, id: 'article', route: '/blog/[slug]' })
    expect(result.success).toBe(true)
  })

  it('normalizes uppercase id to kebab-case', () => {
    const result = PageDefinitionSchema.safeParse({ ...base, id: 'My Page', route: '/my-page' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe('my-page')
    }
  })
})
