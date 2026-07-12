/**
 * L1 Blade extractors — 6 kinds, line-aware regex (NO LLM, NO AST).
 *
 * Per PLAN.md Phase B-1: walks line by line, emits raw EvidenceRow per
 * match. Multi-line constructs (class strings broken across `\n`,
 * nested @class) are NOT joined in B-1 — open Q4 in MAPPING.md will be
 * answered by test outcomes against the pilot Blade app's fixtures.
 *
 * Surrounding context = 3 lines before + matched line + 3 lines after,
 * line-numbered. Mirrors the codex-grade evidence-bundle shape so B-2
 * cluster-labeling LLM has stable context, not just isolated lines.
 */

import type { AntiPatternKind, EvidenceRow } from './adapters/types.js'

const CONTEXT_LINES = 3

const RAW_BUTTON_RE = /<button\b[^>]*\bclass\s*=\s*["']([^"']+)["']/i

/**
 * Matches Laravel `@include('partials.X_button')` or `@include("partials/X-banner")`.
 * Captures the target string for evidence (drift severity comes from filename
 * keyword match in MAPPING.md table, not from this regex).
 */
const INCLUDE_PARTIAL_RE = /@include\(\s*['"]([^'"]*(?:partials|components)[^'"]*)['"]/

/**
 * Matches `<x-btn ...>`, `<x-form.input ...>`, `<x-filament::button ...>` —
 * any x-prefixed Blade component. Captures full opening tag for token
 * signature (attributes carry variant info per the pilot app's convention).
 */
const X_COMPONENT_RE = /<x-([\w.:-]+)\b([^>]*)>/

// `@class(...)` is detected via `indexOf('@class(')` + balanced-paren walk,
// not a regex — see extractAtClassMultiline below. Answers Q1 (MAPPING.md):
// the pilot app has multi-line `@class([\n ... ])` blocks (multi-attribute
// components) that line-aware regex misses entirely.

/**
 * Conditional class via PHP ternary inside `class="..."`. Matches
 * `class="{{ $cond ? 'a' : 'b' }}"`, `class="@if(...) ... @endif"`, or
 * inline string-concatenation ternaries. Heuristic — false positives on
 * pure-value interpolation expected and tracked via FP rate gate.
 */
const CONDITIONAL_CLASS_RE = /\bclass\s*=\s*["']\s*(?:\{\{[^}]*\?[^}]*:[^}]*\}\}|@if\b)/

/**
 * Generic inline class attribute on any HTML/Blade element NOT covered by
 * the more specific extractors above. Captures the raw class string.
 * Runs last and only on lines that didn't match any prior extractor —
 * prevents double-counting `<button class="...">` as both raw_button_tag
 * AND inline_classes.
 */
const INLINE_CLASS_RE = /<(?!button\b)([\w-]+)\b[^>]*\bclass\s*=\s*["']([^"']+)["']/i

export function extractBlade(filePath: string, contents: string): EvidenceRow[] {
  const lines = contents.split('\n')
  const rows: EvidenceRow[] = []
  const atClassLines = extractAtClassMultiline(filePath, lines)
  const atClassLineSet = new Set(atClassLines.map(r => r.line))
  rows.push(...atClassLines)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNo = i + 1
    if (atClassLineSet.has(lineNo)) continue
    let matchedKind: AntiPatternKind | null = null
    let rawClass = ''

    const rawBtn = RAW_BUTTON_RE.exec(line)
    if (rawBtn) {
      matchedKind = 'raw_button_tag'
      rawClass = rawBtn[1]
    }

    if (!matchedKind) {
      const inc = INCLUDE_PARTIAL_RE.exec(line)
      if (inc) {
        matchedKind = 'include_partial'
        rawClass = inc[1]
      }
    }

    if (!matchedKind) {
      const xc = X_COMPONENT_RE.exec(line)
      if (xc) {
        matchedKind = 'x_component_usage'
        rawClass = `x-${xc[1]}${xc[2]}`.trim()
      }
    }

    if (!matchedKind) {
      const cond = CONDITIONAL_CLASS_RE.exec(line)
      if (cond) {
        matchedKind = 'conditional_class_array'
        rawClass = line.trim()
      }
    }

    if (!matchedKind) {
      const inline = INLINE_CLASS_RE.exec(line)
      if (inline) {
        matchedKind = 'inline_classes'
        rawClass = inline[2]
      }
    }

    if (matchedKind) {
      rows.push({
        file: filePath,
        line: lineNo,
        kind: matchedKind,
        raw_class_string: rawClass,
        surrounding_context: contextSlice(lines, i),
      })
    }
  }

  rows.sort((a, b) => a.line - b.line)
  return rows
}

/**
 * Multi-line @class([...]) extractor. Walks file content character by
 * character once a `@class(` marker is hit, tracking paren depth (with
 * naive string-escape awareness — Blade arrays are PHP so quoted parens
 * inside strings must not affect depth). Emits one row per directive,
 * keyed to the START line. Captures the full argument list across lines.
 */
function extractAtClassMultiline(filePath: string, lines: string[]): EvidenceRow[] {
  const contents = lines.join('\n')
  const rows: EvidenceRow[] = []
  let cursor = 0
  while (true) {
    const startIdx = contents.indexOf('@class(', cursor)
    if (startIdx === -1) break
    const argStart = startIdx + '@class('.length
    const closeIdx = findBalancedClose(contents, argStart)
    if (closeIdx === -1) {
      cursor = argStart
      continue
    }
    const arg = contents.slice(argStart, closeIdx).trim()
    const lineNo = contents.slice(0, startIdx).split('\n').length
    rows.push({
      file: filePath,
      line: lineNo,
      kind: 'at_class_directive',
      raw_class_string: arg,
      surrounding_context: contextSlice(lines, lineNo - 1),
    })
    cursor = closeIdx + 1
  }
  return rows
}

function findBalancedClose(text: string, start: number): number {
  let depth = 1
  let inString: '"' | "'" | null = null
  let i = start
  while (i < text.length) {
    const ch = text[i]
    const prev = i > 0 ? text[i - 1] : ''
    if (inString) {
      if (ch === inString && prev !== '\\') inString = null
    } else if (ch === '"' || ch === "'") {
      inString = ch
    } else if (ch === '(') {
      depth++
    } else if (ch === ')') {
      depth--
      if (depth === 0) return i
    }
    i++
  }
  return -1
}

function contextSlice(lines: string[], idx: number): string {
  const start = Math.max(0, idx - CONTEXT_LINES)
  const end = Math.min(lines.length, idx + CONTEXT_LINES + 1)
  const out: string[] = []
  for (let i = start; i < end; i++) {
    out.push(`${i + 1}: ${lines[i]}`)
  }
  return out.join('\n')
}
