/**
 * JSON output shape for B-1. Single source of truth for
 * `B1-EVIDENCE.json` schema. Schema versioning: bump `schema_version`
 * on any breaking shape change so B-2 + downstream tools can guard.
 */

import type { EvidenceRow } from './adapters/types.js'

export const SCHEMA_VERSION = '1.0.0'

export interface ScanRunMetadata {
  schema_version: string
  adapter: string
  scanned_at: string
  project_root: string
  files_scanned: number
  duration_ms: number
}

export interface ScanOutput {
  metadata: ScanRunMetadata
  rows: EvidenceRow[]
}

export function serializeScan(output: ScanOutput): string {
  return JSON.stringify(output, null, 2)
}
