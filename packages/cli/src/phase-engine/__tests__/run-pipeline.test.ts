import { describe, it, expect, beforeEach } from 'vitest'
import { InMemorySessionStore } from '../in-memory-session-store.js'
import { MockProvider } from '../mock-provider.js'
import { runPipeline, type PhaseFallback, type RunPipelineHooks } from '../run-pipeline.js'
import type { AiPhase, DeterministicPhase, Phase } from '../phase.js'

function makeAiPhase(name: string, responseMatcher: string, onIngest?: (raw: string) => void): AiPhase {
  return {
    kind: 'ai',
    name,
    async prep() {
      return `prompt-for-${name}`
    },
    async ingest(raw) {
      onIngest?.(raw)
    },
    // responseMatcher retained on the object so the provider can key responses
    // on it without the test plumbing needing a shared map.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(responseMatcher ? { responseMatcher } : {}),
  } as AiPhase
}

function makeDeterministicPhase(name: string, onRun: () => void): DeterministicPhase {
  return {
    kind: 'deterministic',
    name,
    async run() {
      onRun()
    },
  }
}

describe('runPipeline', () => {
  let store: InMemorySessionStore
  let sessionId: string

  beforeEach(async () => {
    store = new InMemorySessionStore()
    const meta = await store.create()
    sessionId = meta.uuid
  })

  it('runs AI phases sequentially: prep → provider → ingest', async () => {
    const trace: string[] = []
    const provider = new MockProvider().enqueue('raw-a').enqueue('raw-b')

    const phaseA: AiPhase = {
      kind: 'ai',
      name: 'a',
      async prep() {
        trace.push('prep-a')
        return 'p-a'
      },
      async ingest(raw) {
        trace.push(`ingest-a:${raw}`)
      },
    }
    const phaseB: AiPhase = {
      kind: 'ai',
      name: 'b',
      async prep() {
        trace.push('prep-b')
        return 'p-b'
      },
      async ingest(raw) {
        trace.push(`ingest-b:${raw}`)
      },
    }

    const result = await runPipeline({
      phases: [phaseA, phaseB],
      provider,
      sessionId,
      store,
    })

    expect(trace).toEqual(['prep-a', 'ingest-a:raw-a', 'prep-b', 'ingest-b:raw-b'])
    expect(result.completed).toEqual(['a', 'b'])
    expect(result.recoveredViaFallback).toEqual([])
  })

  it('runs deterministic phases via run(), skipping the provider', async () => {
    const provider = new MockProvider()
    let ran = false
    const phase = makeDeterministicPhase('det', () => {
      ran = true
    })
    const result = await runPipeline({
      phases: [phase],
      provider,
      sessionId,
      store,
    })
    expect(ran).toBe(true)
    expect(provider.calls).toHaveLength(0)
    expect(result.completed).toEqual(['det'])
  })

  it('mixes AI and deterministic phases in order', async () => {
    const trace: string[] = []
    const provider = new MockProvider().enqueue('ok')
    const phases: Phase[] = [
      makeDeterministicPhase('d1', () => trace.push('d1')),
      makeAiPhase('a1', '', () => trace.push('a1')),
      makeDeterministicPhase('d2', () => trace.push('d2')),
    ]
    await runPipeline({ phases, provider, sessionId, store })
    expect(trace).toEqual(['d1', 'a1', 'd2'])
  })

  it('invokes lifecycle hooks in order (start → end)', async () => {
    const order: string[] = []
    const hooks: RunPipelineHooks = {
      onPhaseStart(phase) {
        order.push(`start:${phase.name}`)
      },
      onPhaseEnd(phase) {
        order.push(`end:${phase.name}`)
      },
    }
    const phases: Phase[] = [
      makeDeterministicPhase('a', () => order.push('run:a')),
      makeDeterministicPhase('b', () => order.push('run:b')),
    ]
    await runPipeline({ phases, provider: new MockProvider(), sessionId, store, hooks })
    expect(order).toEqual(['start:a', 'run:a', 'end:a', 'start:b', 'run:b', 'end:b'])
  })

  it('propagates errors from a phase when no fallback is registered', async () => {
    const phase: DeterministicPhase = {
      kind: 'deterministic',
      name: 'boom',
      async run() {
        throw new Error('nope')
      },
    }
    await expect(runPipeline({ phases: [phase], provider: new MockProvider(), sessionId, store })).rejects.toThrow(
      'nope',
    )
  })

  it('calls onPhaseError hook with the thrown error', async () => {
    const seen: Array<{ name: string; msg: string }> = []
    const hooks: RunPipelineHooks = {
      onPhaseError(phase, error) {
        seen.push({ name: phase.name, msg: error instanceof Error ? error.message : String(error) })
      },
    }
    const phase: DeterministicPhase = {
      kind: 'deterministic',
      name: 'x',
      async run() {
        throw new Error('kaboom')
      },
    }
    await expect(
      runPipeline({ phases: [phase], provider: new MockProvider(), sessionId, store, hooks }),
    ).rejects.toThrow('kaboom')
    expect(seen).toEqual([{ name: 'x', msg: 'kaboom' }])
  })

  it('invokes fallback when the phase throws, continues, records recoveredViaFallback', async () => {
    let fallbackCalled = false
    const fallback: PhaseFallback = async () => {
      fallbackCalled = true
    }
    const phase: DeterministicPhase = {
      kind: 'deterministic',
      name: 'flaky',
      async run() {
        throw new Error('primary-failed')
      },
    }
    const subsequent: DeterministicPhase = {
      kind: 'deterministic',
      name: 'after',
      async run() {
        // must still execute after successful fallback
      },
    }
    const result = await runPipeline({
      phases: [phase, subsequent],
      provider: new MockProvider(),
      sessionId,
      store,
      hooks: { fallback: { flaky: fallback } },
    })
    expect(fallbackCalled).toBe(true)
    expect(result.completed).toEqual(['flaky', 'after'])
    expect(result.recoveredViaFallback).toEqual(['flaky'])
  })

  it('propagates fallback errors verbatim (does not re-throw the original)', async () => {
    const phase: DeterministicPhase = {
      kind: 'deterministic',
      name: 'flaky',
      async run() {
        throw new Error('primary')
      },
    }
    await expect(
      runPipeline({
        phases: [phase],
        provider: new MockProvider(),
        sessionId,
        store,
        hooks: {
          fallback: {
            flaky: async () => {
              throw new Error('fallback-also-failed')
            },
          },
        },
      }),
    ).rejects.toThrow('fallback-also-failed')
  })

  it('passes the session id + store into each phase via ctx', async () => {
    const seen: Array<{ id: string; isStore: boolean }> = []
    const phase: DeterministicPhase = {
      kind: 'deterministic',
      name: 'inspect',
      async run(ctx) {
        seen.push({ id: ctx.sessionId, isStore: ctx.session === store })
      },
    }
    await runPipeline({ phases: [phase], provider: new MockProvider(), sessionId, store })
    expect(seen).toEqual([{ id: sessionId, isStore: true }])
  })
})
