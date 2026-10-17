import { describe, it, expect } from 'vitest'
import type { ProjectGraph } from './graph.js'
import { parseApplyOutput, parsePlan, withImpact } from './router.js'

const node = (id: string, kind: 'page' | 'component', route?: string, imports: string[] = []) => ({
  id,
  kind,
  route,
  client: false,
  exports: [],
  imports,
  hash: 'x',
})

const graph: ProjectGraph = {
  root: '/p',
  appDir: 'src/app',
  nodes: {
    'src/app/a/page.tsx': node('src/app/a/page.tsx', 'page', '/a', ['src/components/kpi.tsx']),
    'src/app/b/page.tsx': node('src/app/b/page.tsx', 'page', '/b', ['src/components/kpi.tsx']),
    'src/components/kpi.tsx': node('src/components/kpi.tsx', 'component'),
  },
  importers: { 'src/components/kpi.tsx': ['src/app/a/page.tsx', 'src/app/b/page.tsx'] },
}

describe('parsePlan', () => {
  it('accepts a plan wrapped in prose and dedupes paths', () => {
    const p = parsePlan(
      'Sure:\n{"scope":"component","modify":["src/components/kpi.tsx","src/components/kpi.tsx"],"create":[],"rationale":"r"}',
      graph,
    )
    expect(p.modify).toEqual(['src/components/kpi.tsx'])
  })

  it('rejects unknown scopes, missing files, clobbering creates and empty plans', () => {
    expect(() => parsePlan('{"scope":"everything","modify":["src/components/kpi.tsx"]}', graph)).toThrow(
      /unknown scope/,
    )
    expect(() => parsePlan('{"scope":"page","modify":["src/app/zzz/page.tsx"]}', graph)).toThrow(/do not exist/)
    expect(() => parsePlan('{"scope":"new-component","create":["src/components/kpi.tsx"]}', graph)).toThrow(
      /already exist/,
    )
    expect(() => parsePlan('{"scope":"page","modify":[],"create":[]}', graph)).toThrow(/empty plan/)
  })
})

describe('withImpact', () => {
  it('unions transitive routes of every modified file', () => {
    const p = withImpact({ scope: 'component', modify: ['src/components/kpi.tsx'], create: [], rationale: '' }, graph)
    expect(p.impact.routes).toEqual(['/a', '/b'])
  })
})

describe('parseApplyOutput', () => {
  const plan = {
    scope: 'variant' as const,
    modify: ['src/components/kpi.tsx'],
    create: ['src/components/x.tsx'],
    rationale: '',
  }

  it('returns planned files and strips stray markdown fences', () => {
    const out = parseApplyOutput(
      '<file path="src/components/kpi.tsx">\n```tsx\nexport const K = 1\n```\n</file>\n<file path="src/components/x.tsx">\nexport const X = 2\n</file>',
      plan,
    )
    expect(out['src/components/kpi.tsx']).toBe('export const K = 1\n')
    expect(Object.keys(out)).toHaveLength(2)
  })

  it('refuses any file outside the plan', () => {
    expect(() =>
      parseApplyOutput('<file path="src/components/x.tsx">a</file><file path="src/app/b/page.tsx">sneaky</file>', plan),
    ).toThrow(/outside the plan/)
  })

  it('fails when a planned new file is missing', () => {
    expect(() => parseApplyOutput('<file path="src/components/kpi.tsx">a</file>', plan)).toThrow(/new file/)
  })
})
