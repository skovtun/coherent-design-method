import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { labelClustersWithLLM } from './llm-label.js'
import { defaultCachePath } from './cache.js'
import { FALLBACK_CONFIDENCE } from './constants.js'
import type { Cluster } from './types.js'
import type { LabelChunkInput, LabelChunkResult, LabelProvider, RawLabelOutput } from './providers/types.js'

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'coh-llm-'))
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

function mkCluster(id: string, kind = 'inline_classes'): Cluster {
  return {
    cluster_id: id,
    signature: { kind: kind as never, tokens: ['btn', 'btn-primary'] },
    members: [
      {
        file: 'a.blade.php',
        line: 1,
        kind: kind as never,
        raw_class_string: 'btn btn-primary',
        surrounding_context: '<button class="btn btn-primary">x</button>',
      },
    ],
  }
}

function fakeOutput(id: string, conf = 0.9): RawLabelOutput {
  return { cluster_id: id, human_label: 'Primary CTA', suggested_role: 'button.primary', confidence: conf }
}

class MockProvider implements LabelProvider {
  calls = 0
  attempts: LabelChunkInput[] = []
  constructor(private impl: (input: LabelChunkInput, callIndex: number) => Promise<LabelChunkResult>) {}
  async labelChunk(input: LabelChunkInput): Promise<LabelChunkResult> {
    const i = this.calls++
    this.attempts.push(input)
    return this.impl(input, i)
  }
}

describe('labelClustersWithLLM — happy path', () => {
  it('labels all clusters in a single chunk on first try', async () => {
    const clusters = [mkCluster('a'), mkCluster('b'), mkCluster('c')]
    const provider = new MockProvider(async input => ({
      outputs: input.clusters.map(c => fakeOutput(c.cluster_id)),
      usage: { input_tokens: 1000, output_tokens: 50 },
    }))
    const result = await labelClustersWithLLM(clusters, {
      provider,
      designContext: null,
      cachePath: defaultCachePath(tmp),
    })
    expect(result.labeled).toHaveLength(3)
    expect(result.labeled.every(l => l.source === 'llm')).toBe(true)
    expect(result.cacheHits).toBe(0)
    expect(result.cacheMisses).toBe(3)
    expect(result.fallbackCount).toBe(0)
    expect(provider.calls).toBe(1)
  })

  it('preserves input order in output', async () => {
    const ids = ['c', 'a', 'b']
    const clusters = ids.map(id => mkCluster(id))
    const provider = new MockProvider(async input => ({
      outputs: input.clusters.map(c => fakeOutput(c.cluster_id)).reverse(),
      usage: { input_tokens: 1000, output_tokens: 50 },
    }))
    const result = await labelClustersWithLLM(clusters, {
      provider,
      designContext: null,
      cachePath: defaultCachePath(tmp),
    })
    expect(result.labeled.map(l => l.cluster.cluster_id)).toEqual(ids)
  })

  it('hits cache on second run with same inputs', async () => {
    const clusters = [mkCluster('a'), mkCluster('b')]
    const provider = new MockProvider(async input => ({
      outputs: input.clusters.map(c => fakeOutput(c.cluster_id)),
      usage: { input_tokens: 100, output_tokens: 10 },
    }))
    const cachePath = defaultCachePath(tmp)
    await labelClustersWithLLM(clusters, { provider, designContext: null, cachePath })
    expect(provider.calls).toBe(1)

    const result2 = await labelClustersWithLLM(clusters, { provider, designContext: null, cachePath })
    expect(provider.calls).toBe(1) // no new call
    expect(result2.cacheHits).toBe(2)
    expect(result2.cacheMisses).toBe(0)
    expect(result2.labeled.every(l => l.source === 'cache')).toBe(true)
  })
})

describe('labelClustersWithLLM — repair ladder', () => {
  it('repairs missing IDs on attempt 2 (full-chunk repair)', async () => {
    const clusters = [mkCluster('a'), mkCluster('b')]
    const provider = new MockProvider(async (input, i) => {
      if (i === 0) return { outputs: [fakeOutput('a')], usage: { input_tokens: 100, output_tokens: 10 } }
      return {
        outputs: input.clusters.map(c => fakeOutput(c.cluster_id)),
        usage: { input_tokens: 100, output_tokens: 10 },
      }
    })
    const result = await labelClustersWithLLM(clusters, {
      provider,
      designContext: null,
      cachePath: defaultCachePath(tmp),
    })
    expect(provider.calls).toBe(2)
    expect(provider.attempts[1].repair?.attempt).toBe(2)
    expect(provider.attempts[1].repair?.missing).toEqual(['b'])
    expect(result.labeled.every(l => l.source === 'llm')).toBe(true)
  })

  it('escalates to attempt 3 (subset repair) when attempt 2 still missing', async () => {
    const clusters = [mkCluster('a'), mkCluster('b'), mkCluster('c')]
    const provider = new MockProvider(async (_input, i) => {
      if (i === 0) return { outputs: [fakeOutput('a')], usage: { input_tokens: 100, output_tokens: 10 } }
      if (i === 1)
        return { outputs: [fakeOutput('a'), fakeOutput('b')], usage: { input_tokens: 100, output_tokens: 10 } }
      return { outputs: [fakeOutput('c')], usage: { input_tokens: 100, output_tokens: 10 } }
    })
    const result = await labelClustersWithLLM(clusters, {
      provider,
      designContext: null,
      cachePath: defaultCachePath(tmp),
    })
    expect(provider.calls).toBe(3)
    expect(provider.attempts[2].repair?.attempt).toBe(3)
    expect(provider.attempts[2].clusters.map(c => c.cluster_id)).toEqual(['c'])
    expect(result.labeled.every(l => l.source === 'llm')).toBe(true)
  })

  it('falls back to deterministic after exhausting repair attempts', async () => {
    const clusters = [mkCluster('a'), mkCluster('b')]
    const provider = new MockProvider(async () => ({
      outputs: [],
      usage: { input_tokens: 100, output_tokens: 10 },
    }))
    const result = await labelClustersWithLLM(clusters, {
      provider,
      designContext: null,
      cachePath: defaultCachePath(tmp),
    })
    expect(result.fallbackCount).toBe(2)
    expect(result.labeled.every(l => l.source === 'deterministic')).toBe(true)
    expect(result.labeled.every(l => l.confidence === FALLBACK_CONFIDENCE)).toBe(true)
  })

  it('throws with --strict-llm when LLM cannot label all clusters', async () => {
    const clusters = [mkCluster('a')]
    const provider = new MockProvider(async () => ({
      outputs: [],
      usage: { input_tokens: 100, output_tokens: 10 },
    }))
    await expect(
      labelClustersWithLLM(clusters, {
        provider,
        designContext: null,
        cachePath: defaultCachePath(tmp),
        strictLlm: true,
      }),
    ).rejects.toThrow(/strict-llm/)
  })

  it('recovers when provider throws (SDK failure treated as missing)', async () => {
    const clusters = [mkCluster('a'), mkCluster('b')]
    let throws = true
    const provider = new MockProvider(async input => {
      if (throws) {
        throws = false
        throw new Error('500')
      }
      return {
        outputs: input.clusters.map(c => fakeOutput(c.cluster_id)),
        usage: { input_tokens: 100, output_tokens: 10 },
      }
    })
    const result = await labelClustersWithLLM(clusters, {
      provider,
      designContext: null,
      cachePath: defaultCachePath(tmp),
    })
    // First call throws → recovered via attempt 2.
    expect(result.labeled.every(l => l.source === 'llm')).toBe(true)
    // The throw is RECORDED, not swallowed (2026-07-13 pilot run lesson).
    expect(result.providerErrors).toHaveLength(1)
    expect(result.providerErrors[0]).toMatchObject({ chunkIndex: 1, attempt: 1, message: '500' })
  })

  it('records every provider error with chunk/attempt context and fires onProviderError', async () => {
    const clusters = [mkCluster('a'), mkCluster('b')]
    const provider = new MockProvider(async () => {
      throw new Error('rate_limit_error: overloaded')
    })
    const seen: { chunkIndex: number; attempt: number; message: string }[] = []
    const result = await labelClustersWithLLM(clusters, {
      provider,
      designContext: null,
      cachePath: defaultCachePath(tmp),
      onProviderError: info => seen.push(info),
    })
    // All 3 ladder attempts threw → 3 recorded errors, all clusters fell back.
    expect(result.providerErrors).toHaveLength(3)
    expect(result.providerErrors.map(e => e.attempt)).toEqual([1, 2, 3])
    expect(result.providerErrors.every(e => e.message.includes('rate_limit_error'))).toBe(true)
    expect(seen).toHaveLength(3)
    expect(result.fallbackCount).toBe(2)
    expect(result.labeled.every(l => l.source === 'deterministic')).toBe(true)
  })

  it('clean run reports zero provider errors', async () => {
    const clusters = [mkCluster('a')]
    const provider = new MockProvider(async input => ({
      outputs: input.clusters.map(c => fakeOutput(c.cluster_id)),
      usage: { input_tokens: 100, output_tokens: 10 },
    }))
    const result = await labelClustersWithLLM(clusters, {
      provider,
      designContext: null,
      cachePath: defaultCachePath(tmp),
    })
    expect(result.providerErrors).toEqual([])
  })
})

describe('labelClustersWithLLM — cache invalidation', () => {
  it('invalidates cache when designContext changes (different design_hash)', async () => {
    const clusters = [mkCluster('a')]
    const provider = new MockProvider(async input => ({
      outputs: input.clusters.map(c => fakeOutput(c.cluster_id)),
      usage: { input_tokens: 100, output_tokens: 10 },
    }))
    const cachePath = defaultCachePath(tmp)
    await labelClustersWithLLM(clusters, { provider, designContext: '# A', cachePath })
    expect(provider.calls).toBe(1)
    await labelClustersWithLLM(clusters, { provider, designContext: '# B (different)', cachePath })
    expect(provider.calls).toBe(2) // cache miss → second call
  })

  it('disableCache skips read + write entirely', async () => {
    const clusters = [mkCluster('a')]
    const provider = new MockProvider(async input => ({
      outputs: input.clusters.map(c => fakeOutput(c.cluster_id)),
      usage: { input_tokens: 100, output_tokens: 10 },
    }))
    const cachePath = defaultCachePath(tmp)
    await labelClustersWithLLM(clusters, { provider, designContext: null, cachePath, disableCache: true })
    await labelClustersWithLLM(clusters, { provider, designContext: null, cachePath, disableCache: true })
    expect(provider.calls).toBe(2) // both runs hit the provider
  })
})

describe('Q13 stability — golden test', () => {
  it('produces identical labels across two cache-disabled runs', async () => {
    const clusters = [mkCluster('a'), mkCluster('b'), mkCluster('c')]
    const provider = new MockProvider(async input => ({
      outputs: input.clusters.map(c => fakeOutput(c.cluster_id, 0.85)),
      usage: { input_tokens: 100, output_tokens: 10 },
    }))
    const cachePath = defaultCachePath(tmp)

    const a = await labelClustersWithLLM(clusters, { provider, designContext: null, cachePath, disableCache: true })
    const b = await labelClustersWithLLM(clusters, { provider, designContext: null, cachePath, disableCache: true })

    expect(a.labeled.map(l => l.cluster.cluster_id)).toEqual(b.labeled.map(l => l.cluster.cluster_id))
    expect(a.labeled.map(l => l.human_label)).toEqual(b.labeled.map(l => l.human_label))
    expect(a.labeled.every(l => l.confidence !== undefined)).toBe(true)
    expect(a.fallbackCount).toBe(0)
  })
})
