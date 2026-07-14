import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertOutsideRepo, serializeAuthoringCards } from './eval-authoring.js'
import type { Cluster } from './types.js'

function cluster(id: string, memberCount: number, tokens = ['text-muted']): Cluster {
  return {
    cluster_id: id,
    signature: { kind: 'inline_classes', tokens },
    members: Array.from({ length: memberCount }, (_, i) => ({
      file: `views/f${i}.blade.php`,
      line: i + 1,
      kind: 'inline_classes' as const,
      raw_class_string: tokens.join(' '),
      surrounding_context: `<span class="${tokens.join(' ')}">sample ${i}</span>`,
    })),
  }
}

describe('assertOutsideRepo', () => {
  it('throws for a path inside the repo', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'coh-auth-'))
    try {
      expect(() => assertOutsideRepo(join(tmp, 'sub', 'CARDS.md'), tmp)).toThrow(/refusing to write/)
      expect(() => assertOutsideRepo(tmp, tmp)).toThrow(/refusing to write/)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('allows a path outside the repo', () => {
    const repo = mkdtempSync(join(tmpdir(), 'coh-repo-'))
    const outside = mkdtempSync(join(tmpdir(), 'coh-outside-'))
    try {
      expect(() => assertOutsideRepo(join(outside, 'CARDS.md'), repo)).not.toThrow()
    } finally {
      rmSync(repo, { recursive: true, force: true })
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('is not fooled by sibling directories with a shared name prefix', () => {
    const repo = mkdtempSync(join(tmpdir(), 'coh-prefix-'))
    try {
      // "<repo>-evil/x.md" starts with the repo path STRING but is outside it.
      expect(() => assertOutsideRepo(`${repo}-evil/x.md`, repo)).not.toThrow()
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })
})

describe('serializeAuthoringCards', () => {
  const sampled = [cluster('rep00001', 3), cluster('rep00002', 25)]
  const hardCases = [cluster('hard0001', 47, ['text-grey_light_text'])]

  it('marks the file PRIVATE and separates hard-case vs representative suites', () => {
    const md = serializeAuthoringCards({ sampled, hardCases, designPath: '/p/DESIGN.md', seed: 42 })
    expect(md).toContain('PRIVATE — do not commit')
    expect(md).toContain('## Hard-case suite')
    expect(md).toContain('## Representative sample')
    expect(md).toContain('### hard0001 (hard-case)')
    expect(md).toContain('### rep00001 (representative)')
    expect(md).toContain('- **seed:** 42')
  })

  it('shows the same context the labeler sees: tokens, samples, spread', () => {
    const md = serializeAuthoringCards({ sampled, hardCases, designPath: null, seed: 1 })
    expect(md).toContain('`text-grey_light_text`')
    expect(md).toContain('- **occurrences:** 47')
    expect(md).toContain('- **distinct files:**')
    expect(md).toContain('views/f0.blade.php:1')
    expect(md).toContain('sample 0')
    expect(md).toContain('must_be_generic')
  })

  it('contains NO deterministic label hint (anchor-bias guard)', () => {
    const md = serializeAuthoringCards({ sampled, hardCases, designPath: null, seed: 1 })
    // deterministic labels look like "<token>-cluster-<id>" — must not appear.
    expect(md).not.toMatch(/-cluster-[0-9a-f]{8}/)
  })

  it('caps samples per card at 3', () => {
    const md = serializeAuthoringCards({ sampled: [cluster('rep00002', 25)], hardCases: [], designPath: null, seed: 1 })
    const sampleRefs = md.match(/views\/f\d+\.blade\.php:\d+/g) ?? []
    expect(sampleRefs).toHaveLength(3)
  })
})
