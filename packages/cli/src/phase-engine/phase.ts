/**
 * Phase-engine phase contract.
 *
 * Two archetypes, matching design doc 2026-04-23 Section 2:
 *  - AiPhase: a prompt → response cycle. `prep` builds the prompt; after the
 *    caller gets the raw string back from its {@link AiProvider}, `ingest`
 *    parses it and persists phase artifacts.
 *  - DeterministicPhase: a pure transform over prior-phase artifacts. No AI.
 *
 * Phases communicate only via the session's artifact store — never via direct
 * returns or shared mutable state. That way `coherent chat` (in-process) and
 * skill-mode (each phase a separate CLI invocation) both run the same code.
 *
 * Phases do NOT own:
 *   - Spinner/heartbeat/progress UI — those are caller hooks.
 *   - Project config mutation — phases write a `config-delta.json` artifact;
 *     `coherent session end` applies it atomically. (Scheduled refactor.)
 *   - Project-wide locking — caller holds the lock across the whole pipeline.
 */

import type { SessionStore } from './session-store.js'

export interface PhaseContext {
  /** Store backing session artifacts. */
  readonly session: SessionStore
  /** Id of the active session. */
  readonly sessionId: string
}

export interface AiPhase {
  readonly kind: 'ai'
  readonly name: string
  /** Build the prompt. Caller is responsible for actually invoking the provider. */
  prep(ctx: PhaseContext): Promise<string>
  /** Parse the raw provider response + write this phase's artifacts. */
  ingest(rawResponse: string, ctx: PhaseContext): Promise<void>
}

export interface DeterministicPhase {
  readonly kind: 'deterministic'
  readonly name: string
  /** Run the transform. Read prior artifacts from ctx.session; write outputs. */
  run(ctx: PhaseContext): Promise<void>
}

export type Phase = AiPhase | DeterministicPhase

export function isAiPhase(phase: Phase): phase is AiPhase {
  return phase.kind === 'ai'
}

export function isDeterministicPhase(phase: Phase): phase is DeterministicPhase {
  return phase.kind === 'deterministic'
}
