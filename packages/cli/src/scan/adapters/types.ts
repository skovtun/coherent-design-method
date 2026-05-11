/**
 * `coherent scan` adapter contract — INTERNAL ONLY in B-1.
 *
 * D1 from PLAN.md is SOFTENED — Blade-only adapter in Phase B-1. TSX
 * adapter and StackAdapter as public API deferred to Phase E. Do NOT
 * export these types from the package public surface.
 *
 * EvidenceRow shape is the B-1 deliverable shape (direct JSON serialization).
 */

export type AntiPatternKind =
  | 'raw_button_tag'
  | 'include_partial'
  | 'x_component_usage'
  | 'at_class_directive'
  | 'conditional_class_array'
  | 'inline_classes'

export interface EvidenceRow {
  file: string
  line: number
  kind: AntiPatternKind
  raw_class_string: string
  surrounding_context: string
}

export interface StackAdapter {
  name: 'blade'
  filePatterns: string[]
  excludes: string[]
  extract(filePath: string, contents: string): EvidenceRow[]
}
