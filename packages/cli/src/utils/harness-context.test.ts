import { describe, it, expect } from 'vitest'
import type { DesignSystemConfig, SharedComponentsManifest } from '@getcoherent/core'
import { buildCursorRules } from './cursor-rules.js'
import { buildProjectContext } from './harness-context.js'

const TEST_MANIFEST: SharedComponentsManifest = {
  shared: [
    {
      id: 'CID-001',
      name: 'Header',
      type: 'layout',
      file: 'components/shared/header.tsx',
      description: 'Site header with navigation',
      propsInterface: '{ logoUrl?: string }',
      usageExample: '<Header logoUrl="/logo.svg" />',
      usedIn: ['app/layout.tsx'],
      dependencies: [],
    },
    {
      id: 'CID-002',
      name: 'ActivityFeed',
      type: 'data-display',
      file: 'components/shared/activity-feed.tsx',
      description: 'Recent activity timeline',
      usedIn: ['app/(app)/dashboard/page.tsx', 'app/(app)/activity/page.tsx'],
      dependencies: [],
    },
  ],
  nextId: 3,
}

const TEST_CONFIG = {
  tokens: {
    colors: {
      light: {
        primary: 'oklch(0.637 0.237 25.331)',
        background: 'oklch(1 0 0)',
        foreground: 'oklch(0.145 0 0)',
        muted: 'oklch(0.97 0 0)',
        border: 'oklch(0.922 0 0)',
      },
      dark: {},
    },
    spacing: {},
    radius: { md: '0.5rem' },
  },
  pages: [],
  name: 'Test Project',
} as unknown as DesignSystemConfig

describe('buildCursorRules (harness baseline)', () => {
  it('matches snapshot for TEST_MANIFEST + TEST_CONFIG', () => {
    expect(buildCursorRules(TEST_MANIFEST, TEST_CONFIG)).toMatchSnapshot()
  })
})

describe('buildProjectContext', () => {
  it('produces all required fields', () => {
    const ctx = buildProjectContext(TEST_MANIFEST, TEST_CONFIG)
    expect(ctx.sharedComponents).toContain('CID-001 Header')
    expect(ctx.sharedComponents).toContain('Import: import { Header }')
    expect(ctx.sharedComponentsCompact).toContain('CID-001 Header (layout)')
    expect(ctx.sharedComponentsCompact).not.toContain('Import:')
    expect(ctx.designTokens).toContain('Primary')
    expect(ctx.architectureDetailed).toContain('### Key directories')
    expect(ctx.architectureDetailed).toContain('### Config files')
    expect(ctx.architectureCompact).toContain('app/ —')
    expect(ctx.architectureCompact).not.toContain('### Key directories')
    expect(ctx.rulesDetailed).toContain('## Component Rules (MANDATORY)')
    expect(ctx.rulesDetailed).toContain('### Animation')
    expect(ctx.rulesCompact).toContain('ONLY use @/components/ui/*')
    expect(ctx.rulesCompact).not.toContain('## Component Rules (MANDATORY)')
    expect(ctx.designQuality).toContain('Design Quality Standards')
    expect(ctx.forms).toContain('Form Layout Rules')
    expect(ctx.accessibility).toContain('WCAG 2.2 AA')
    expect(ctx.auth).toContain('Auth Pages')
    expect(ctx.commands).toContain('coherent check')
    expect(ctx.platform).toContain('DO NOT')
  })

  it('handles empty manifest', () => {
    const ctx = buildProjectContext({ shared: [], nextId: 1 }, null)
    expect(ctx.sharedComponents).toContain('No shared components')
    expect(ctx.sharedComponentsCompact).toContain('No shared components')
    expect(ctx.designTokens).toContain('semantic')
  })
})
