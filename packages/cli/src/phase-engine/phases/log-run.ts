/**
 * Log-run phase (deterministic).
 *
 * Renders a RunRecord JSON artifact into the YAML form that lives at
 * `.coherent/runs/<timestamp>.yaml` on the project. The phase only renders
 * + writes the YAML to session artifact storage; placement on project disk
 * is `coherent session end`'s job, mirroring how `config-delta.json` is
 * applied at the end of the run rather than mid-pipeline.
 *
 * Caller assembles `run-record.json` by aggregating data from earlier
 * artifacts (plan.json, anchor.json, pages-written.txt, validator results)
 * plus session-level metadata (timestamp, durationMs, outcome). Keeping
 * the assembly in the caller lets future phases (page, components) extend
 * the record additively without log-run knowing their internal shapes.
 */

import type { DeterministicPhase, PhaseContext } from '../phase.js'
import type { RunRecord } from '../../utils/run-record.js'
import { renderRunRecordYaml } from '../../utils/run-record.js'

export interface LogRunPhaseOptions {
  /** Artifact to read RunRecord JSON from. Default `run-record.json`. */
  inputArtifact?: string
  /** Artifact to write rendered YAML to. Default `run-record.yaml`. */
  outputArtifact?: string
}

function isValidRecord(value: unknown): value is RunRecord {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  return (
    typeof r.timestamp === 'string' &&
    typeof r.coherentVersion === 'string' &&
    typeof r.intent === 'string' &&
    typeof r.options === 'object' &&
    r.options !== null &&
    Array.isArray(r.pagesWritten) &&
    Array.isArray(r.sharedComponentsWritten) &&
    typeof r.durationMs === 'number' &&
    typeof r.outcome === 'string'
  )
}

export function createLogRunPhase(options: LogRunPhaseOptions = {}): DeterministicPhase {
  const inputFile = options.inputArtifact ?? 'run-record.json'
  const outputFile = options.outputArtifact ?? 'run-record.yaml'

  return {
    kind: 'deterministic',
    name: 'log-run',

    async run(ctx: PhaseContext): Promise<void> {
      const raw = await ctx.session.readArtifact(ctx.sessionId, inputFile)
      if (raw === null) {
        throw new Error(`log-run: missing required artifact ${JSON.stringify(inputFile)}`)
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch (err) {
        throw new Error(
          `log-run: artifact ${JSON.stringify(inputFile)} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
      if (!isValidRecord(parsed)) {
        throw new Error(
          `log-run: artifact ${JSON.stringify(inputFile)} must be a valid RunRecord (timestamp, coherentVersion, intent, options, pagesWritten, sharedComponentsWritten, durationMs, outcome required)`,
        )
      }
      const yaml = renderRunRecordYaml(parsed)
      await ctx.session.writeArtifact(ctx.sessionId, outputFile, yaml)
    },
  }
}
