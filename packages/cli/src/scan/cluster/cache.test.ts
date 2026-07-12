import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildCacheKey,
  defaultCachePath,
  hashDesign,
  hashSignature,
  loadCache,
  lookupBatch,
  saveCache,
  upsertBatch,
} from './cache.js'
import type { LabeledCluster } from './types.js'

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'coh-cache-'))
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

function makeLabeled(id: string): LabeledCluster {
  return {
    cluster: {
      cluster_id: id,
      signature: { kind: 'inline_classes', tokens: ['x', 'y'] },
      members: [],
    },
    human_label: 'Field label',
    suggested_role: 'label.field',
    confidence: 0.9,
    source: 'llm',
  }
}

describe('cache key + hash helpers', () => {
  it('hashDesign returns "none" for empty/null/blank', () => {
    expect(hashDesign(null)).toBe('none')
    expect(hashDesign('')).toBe('none')
    expect(hashDesign('   \n\t  ')).toBe('none')
  })

  it('hashDesign is deterministic and 16 hex chars for non-empty input', () => {
    const a = hashDesign('# Design')
    const b = hashDesign('# Design')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{16}$/)
  })

  it('hashSignature is deterministic and 16 hex chars', () => {
    const a = hashSignature('inline_classes', ['x', 'y'])
    const b = hashSignature('inline_classes', ['x', 'y'])
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{16}$/)
  })

  it('hashSignature differs when tokens change', () => {
    const a = hashSignature('inline_classes', ['x', 'y'])
    const b = hashSignature('inline_classes', ['x', 'z'])
    expect(a).not.toBe(b)
  })

  it('buildCacheKey concatenates all 5 parts', () => {
    const key = buildCacheKey({
      cluster_id: 'abc',
      signature_hash: 'sig',
      prompt_version: 'pv',
      model_id: 'm',
      design_hash: 'd',
    })
    expect(key).toBe('abc::sig::pv::m::d')
  })
})

describe('cache I/O', () => {
  it('returns empty file when path missing', () => {
    const file = loadCache(join(tmp, 'nope.json'))
    expect(file.version).toBe(1)
    expect(Object.keys(file.entries)).toHaveLength(0)
  })

  it('round-trips entries through saveCache → loadCache', () => {
    const path = defaultCachePath(tmp)
    const initial = loadCache(path)
    const updated = upsertBatch(initial, { prompt_version: 'pv', model_id: 'm', design_hash: 'd' }, [
      { signature_hash: 'sig', labeled: makeLabeled('id1') },
    ])
    saveCache(path, updated)

    expect(existsSync(path)).toBe(true)
    const reread = loadCache(path)
    expect(Object.keys(reread.entries)).toHaveLength(1)
    expect(Object.values(reread.entries)[0].labeled.human_label).toBe('Field label')
  })

  it('lookupBatch returns hits only for matching keys', () => {
    const path = defaultCachePath(tmp)
    const seeded = upsertBatch({ version: 1, entries: {} }, { prompt_version: 'pv', model_id: 'm', design_hash: 'd' }, [
      { signature_hash: 'sig1', labeled: makeLabeled('id1') },
    ])
    saveCache(path, seeded)

    const reread = loadCache(path)
    const hits = lookupBatch(reread, { prompt_version: 'pv', model_id: 'm', design_hash: 'd' }, [
      { cluster_id: 'id1', signature_hash: 'sig1' },
      { cluster_id: 'id2', signature_hash: 'sig2' },
    ])
    expect(hits.size).toBe(1)
    expect(hits.get('id1')?.labeled.cluster.cluster_id).toBe('id1')
  })

  it('lookupBatch misses when prompt_version changes (cache invalidates)', () => {
    const seeded = upsertBatch(
      { version: 1, entries: {} },
      { prompt_version: 'pv-1', model_id: 'm', design_hash: 'd' },
      [{ signature_hash: 'sig1', labeled: makeLabeled('id1') }],
    )
    const hits = lookupBatch(seeded, { prompt_version: 'pv-2', model_id: 'm', design_hash: 'd' }, [
      { cluster_id: 'id1', signature_hash: 'sig1' },
    ])
    expect(hits.size).toBe(0)
  })

  it('lookupBatch misses when design_hash changes', () => {
    const seeded = upsertBatch(
      { version: 1, entries: {} },
      { prompt_version: 'pv', model_id: 'm', design_hash: 'none' },
      [{ signature_hash: 'sig1', labeled: makeLabeled('id1') }],
    )
    const hits = lookupBatch(seeded, { prompt_version: 'pv', model_id: 'm', design_hash: 'abc123' }, [
      { cluster_id: 'id1', signature_hash: 'sig1' },
    ])
    expect(hits.size).toBe(0)
  })

  it('loadCache returns empty when JSON is corrupt', () => {
    const path = join(tmp, 'corrupt.json')
    require('node:fs').writeFileSync(path, 'not json', 'utf8')
    const file = loadCache(path)
    expect(Object.keys(file.entries)).toHaveLength(0)
  })

  it('cache file under .coherent/cache/labels.json by convention', () => {
    expect(defaultCachePath('/some/project')).toBe('/some/project/.coherent/cache/labels.json')
  })

  it('saveCache creates parent directories', () => {
    const nested = join(tmp, 'a', 'b', 'c', 'labels.json')
    saveCache(nested, { version: 1, entries: {} })
    expect(existsSync(nested)).toBe(true)
    expect(JSON.parse(readFileSync(nested, 'utf8')).version).toBe(1)
  })
})
