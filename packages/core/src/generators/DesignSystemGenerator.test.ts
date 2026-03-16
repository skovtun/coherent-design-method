import { describe, it, expect } from 'vitest'
import { DesignSystemGenerator } from './DesignSystemGenerator.js'

const MINIMAL_CONFIG = {
  name: 'Test App',
  version: '1.0.0',
  description: 'Test',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  tokens: { colors: { light: {}, dark: {} } },
  components: [],
  pages: [
    { name: 'Home', route: '/', id: 'home' },
    { name: 'Projects', route: '/projects', id: 'projects' },
    { name: 'Project Detail', route: '/projects/[id]', id: 'project-detail' },
    { name: 'Settings', route: '/settings', id: 'settings' },
  ],
  navigation: { enabled: true, items: [] },
  settings: { appType: 'multi-page' as const },
}

function getSitemapContent(config: any): string | undefined {
  const generator = new DesignSystemGenerator(config)
  const structure = generator.generateStructure()
  for (const [path, content] of structure) {
    if (path.includes('sitemap')) return content
  }
  return undefined
}

describe('DesignSystemGenerator — sitemap', () => {
  it('generated sitemap code filters out dynamic routes with [id]', () => {
    const content = getSitemapContent(MINIMAL_CONFIG)
    expect(content).toBeDefined()
    expect(content).toContain("!route.includes('[')")
  })

  it('generated sitemap code strips trailing commas before JSON.parse', () => {
    const content = getSitemapContent(MINIMAL_CONFIG)
    expect(content).toBeDefined()
    expect(content).toContain(',\\s*([\\]\\}])')
  })

  it('generated sitemap code handles satisfies keyword', () => {
    const content = getSitemapContent(MINIMAL_CONFIG)
    expect(content).toBeDefined()
    expect(content).toContain('satisfies')
  })
})
