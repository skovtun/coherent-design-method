/**
 * runPipeline — sequentially drive a list of phases over a shared session.
 *
 * The orchestrator is intentionally small: for each phase, `prep` builds the
 * prompt (or `run` for deterministic phases), the caller-provided AiProvider
 * handles the actual model call, then `ingest` writes artifacts. Hooks let the
 * caller bolt on spinner/heartbeat UX and per-phase fallbacks (components has a
 * per-component retry on batch-parse failure; page has an empty-page retry via
 * the lightweight prompt builder).
 *
 * Phases never call the provider directly — `runPipeline` mediates so skill-mode
 * can substitute a stub provider and parity harnesses can replay MockProvider
 * scripts.
 *
 * Hook semantics:
 *  - onPhaseStart / onPhaseEnd fire exactly once per phase on the success path.
 *  - onPhaseError fires for any thrown error; it does not short-circuit the
 *    fallback decision — fallbacks are a separate keyed map, not a return
 *    value, so the pipeline stays readable.
 *  - If a fallback exists for a phase, it is invoked when the phase throws.
 *    Fallback success advances the pipeline; fallback failure propagates.
 *  - If no fallback exists, the original error propagates.
 */

import { isAiPhase, type Phase, type PhaseContext } from './phase.js'
import type { AiProvider } from './ai-provider.js'
import type { SessionStore } from './session-store.js'

export interface RunPipelineHooks {
  onPhaseStart?(phase: Phase): void | Promise<void>
  onPhaseEnd?(phase: Phase): void | Promise<void>
  onPhaseError?(phase: Phase, error: unknown): void | Promise<void>
  /**
   * Per-phase fallback keyed by `phase.name`. Invoked with the same context
   * and the original error so the fallback can read whatever prior artifacts
   * it needs and write its own artifacts in place of the failed phase.
   */
  fallback?: Record<string, PhaseFallback>
}

export type PhaseFallback = (phase: Phase, ctx: PhaseContext, error: unknown) => Promise<void>

export interface RunPipelineInput {
  phases: Phase[]
  provider: AiProvider
  sessionId: string
  store: SessionStore
  hooks?: RunPipelineHooks
}

export interface RunPipelineResult {
  /** Phase names that finished successfully, in order. */
  completed: string[]
  /** Phase names for which the fallback replaced the primary path. */
  recoveredViaFallback: string[]
}

export async function runPipeline(input: RunPipelineInput): Promise<RunPipelineResult> {
  const { phases, provider, sessionId, store, hooks } = input
  const ctx: PhaseContext = { session: store, sessionId }

  const completed: string[] = []
  const recoveredViaFallback: string[] = []

  for (const phase of phases) {
    await hooks?.onPhaseStart?.(phase)
    try {
      if (isAiPhase(phase)) {
        const prompt = await phase.prep(ctx)
        const raw = await provider.generate(prompt)
        await phase.ingest(raw, ctx)
      } else {
        await phase.run(ctx)
      }
      completed.push(phase.name)
      await hooks?.onPhaseEnd?.(phase)
    } catch (error) {
      await hooks?.onPhaseError?.(phase, error)
      const fallback = hooks?.fallback?.[phase.name]
      if (!fallback) throw error

      // Fallback throws propagate verbatim — pipeline fails with the fallback's
      // error, not the original. That mirrors how a second-chance retry in the
      // old chat rail surfaces: the user sees the actual cause of final failure.
      await fallback(phase, ctx, error)
      completed.push(phase.name)
      recoveredViaFallback.push(phase.name)
      await hooks?.onPhaseEnd?.(phase)
    }
  }

  return { completed, recoveredViaFallback }
}
