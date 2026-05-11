import { describe, expect, it } from 'vitest'
import { formatRedactionWarning, scanClustersForSecrets } from './redaction.js'
import type { Cluster } from './types.js'

function cluster(id: string, snippet: string): Cluster {
  return {
    cluster_id: id,
    signature: { kind: 'inline_classes', tokens: ['x'] },
    members: [
      {
        file: 'a.blade.php',
        line: 10,
        kind: 'inline_classes',
        raw_class_string: 'x',
        surrounding_context: snippet,
      },
    ],
  }
}

describe('scanClustersForSecrets', () => {
  it('flags emails', () => {
    const hits = scanClustersForSecrets([cluster('c1', 'mailto:alice@example.com')])
    expect(hits[0].pattern).toBe('email')
  })

  it('flags JWT-like tokens', () => {
    const hits = scanClustersForSecrets([cluster('c1', 'Authorization: Bearer eyJabcdefgh.eyJpayload12.signature99')])
    expect(hits.length).toBeGreaterThan(0)
  })

  it('flags AWS access keys', () => {
    const hits = scanClustersForSecrets([cluster('c1', 'AKIAIOSFODNN7EXAMPLE')])
    expect(hits[0].pattern).toBe('aws-key')
  })

  it('flags api_key=... patterns', () => {
    const hits = scanClustersForSecrets([cluster('c1', 'api_key=sk_live_abcd1234abcd1234')])
    expect(hits[0].pattern).toBe('api-key-like')
  })

  it('returns empty for clean snippets', () => {
    const hits = scanClustersForSecrets([cluster('c1', '<button class="btn">Click me</button>')])
    expect(hits).toEqual([])
  })
})

describe('formatRedactionWarning', () => {
  it('returns empty string when no hits', () => {
    expect(formatRedactionWarning([])).toBe('')
  })

  it('groups hits by pattern and shows up to 3 examples', () => {
    const hits = scanClustersForSecrets([
      cluster('c1', 'alice@example.com'),
      cluster('c2', 'bob@example.com'),
      cluster('c3', 'carol@example.com'),
      cluster('c4', 'AKIAIOSFODNN7EXAMPLE'),
    ])
    const out = formatRedactionWarning(hits)
    expect(out).toContain('email ×3')
    expect(out).toContain('aws-key ×1')
    expect(out).toContain('.coherentignore')
  })
})
