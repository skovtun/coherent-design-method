import { describe, expect, it } from 'vitest'
import { deterministicLabel } from './deterministic-label.js'
import type { Cluster } from './types.js'

function cluster(tokens: string[]): Cluster {
  return {
    cluster_id: 'abcd1234',
    signature: { kind: 'inline_classes', tokens },
    members: [
      {
        file: 'a.blade.php',
        line: 1,
        kind: 'inline_classes',
        raw_class_string: tokens.join(' '),
        surrounding_context: '',
      },
    ],
  }
}

describe('deterministicLabel — class-signature label', () => {
  it('is the clean class signature, no -cluster-hash suffix', () => {
    expect(deterministicLabel(cluster(['text-grey_light_text'])).human_label).toBe('text-grey_light_text')
    expect(deterministicLabel(cluster(['lb-label'])).human_label).toBe('lb-label')
    expect(deterministicLabel(cluster(['grid', 'grid-cols-a1a'])).human_label).toBe('grid grid-cols-a1a')
  })

  it('drops spacing/sizing tokens from the signature', () => {
    expect(
      deterministicLabel(cluster(['container', 'mx-auto', 'px-5', 'lg:px-30', 'pt-4', 'lg:pt-6', 'pb-1', 'text-sm']))
        .human_label,
    ).toBe('container text-sm')
    expect(deterministicLabel(cluster(['mb-6', 'text-grey'])).human_label).toBe('text-grey')
  })

  it('keeps a pure-dimensional cluster rather than emitting an empty label', () => {
    expect(deterministicLabel(cluster(['pr-4', 'py-2'])).human_label).toBe('pr-4 py-2')
  })

  it('never contains the -cluster-hash noise', () => {
    for (const toks of [['block'], ['font-bold', 'text-lg'], ['grid', 'grid-cols-a1a']]) {
      expect(deterministicLabel(cluster(toks)).human_label).not.toMatch(/-cluster-/)
    }
  })

  it('caps a class-soup cluster on a token boundary with an elision mark', () => {
    const many = Array.from({ length: 12 }, (_, i) => `custom-classname-${i}`)
    const label = deterministicLabel(cluster(many)).human_label
    expect(label.length).toBeLessThanOrEqual(58)
    expect(label.endsWith('…')).toBe(true)
  })

  it('is deterministic — same input, same label', () => {
    const c = cluster(['container', 'px-5', 'text-sm'])
    expect(deterministicLabel(c).human_label).toBe(deterministicLabel(c).human_label)
  })
})
