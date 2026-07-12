/**
 * Unit tests for B-1 L1 extractors. One fixture per extractor kind.
 * Coverage target: 90%+ branch on grep-blade.ts (PLAN.md §371).
 *
 * Fixtures are tiny synthetic .blade.php files in __fixtures__/.
 * Real-world fixtures (pilot Blade app, 30-50 files) land in B-2 snapshot tests.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { extractBlade } from './grep-blade.js'
import { bladeAdapter } from './adapters/blade.js'
import { walk } from './walk.js'
import { serializeScan, SCHEMA_VERSION, type ScanOutput } from './json-output.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURES = resolve(__dirname, '__fixtures__')

function load(name: string): string {
  return readFileSync(resolve(FIXTURES, name), 'utf8')
}

describe('grep-blade extractors', () => {
  it('extracts raw <button> with class attribute', () => {
    const rows = extractBlade('raw_button.blade.php', load('raw_button.blade.php'))
    const btn = rows.filter(r => r.kind === 'raw_button_tag')
    expect(btn).toHaveLength(2)
    expect(btn[0].raw_class_string).toContain('bg-mantis-400')
    expect(btn[1].raw_class_string).toContain('border-mantis-400')
    expect(btn[0].surrounding_context).toContain('3: ')
  })

  it('extracts @include partial calls', () => {
    const rows = extractBlade('partial_include.blade.php', load('partial_include.blade.php'))
    const inc = rows.filter(r => r.kind === 'include_partial')
    expect(inc).toHaveLength(3)
    expect(inc.map(r => r.raw_class_string)).toEqual([
      'partials.inverse_button',
      'partials/header_button',
      'partials.empty_state',
    ])
  })

  it('extracts <x-component> usages', () => {
    const rows = extractBlade('x_component.blade.php', load('x_component.blade.php'))
    const xc = rows.filter(r => r.kind === 'x_component_usage')
    // 5 components: x-card, x-btn x2, x-badge, x-empty-state
    expect(xc.length).toBeGreaterThanOrEqual(4)
    expect(xc.some(r => r.raw_class_string.startsWith('x-btn'))).toBe(true)
    expect(xc.some(r => r.raw_class_string.startsWith('x-badge'))).toBe(true)
  })

  it('extracts @class([...]) directive (single-line)', () => {
    const rows = extractBlade('at_class.blade.php', load('at_class.blade.php'))
    const atc = rows.filter(r => r.kind === 'at_class_directive')
    expect(atc).toHaveLength(2)
    expect(atc[0].raw_class_string).toContain("'base-card'")
    expect(atc[1].raw_class_string).toContain("'text-mantis-400'")
  })

  it('extracts @class([...]) across multiple lines with paren-balanced parser', () => {
    const rows = extractBlade('at_class_multiline.blade.php', load('at_class_multiline.blade.php'))
    const atc = rows.filter(r => r.kind === 'at_class_directive')
    expect(atc).toHaveLength(2)
    // First @class starts on line 1, contains 'base-card' and 'border border-mantis-400'.
    expect(atc[0].line).toBe(1)
    expect(atc[0].raw_class_string).toContain('base-card')
    expect(atc[0].raw_class_string).toContain('border border-mantis-400')
    expect(atc[0].raw_class_string).toContain('opacity-50')
    // Second @class starts on line 6, captures both array entries.
    expect(atc[1].line).toBe(6)
    expect(atc[1].raw_class_string).toContain('text-mantis-400')
    expect(atc[1].raw_class_string).toContain('text-red font-bold')
  })

  it('extracts conditional class arrays (ternary + @if)', () => {
    const rows = extractBlade('conditional_class.blade.php', load('conditional_class.blade.php'))
    const cond = rows.filter(r => r.kind === 'conditional_class_array')
    expect(cond.length).toBeGreaterThanOrEqual(2)
  })

  it('does NOT double-count a <button> line as both raw_button_tag and inline_classes', () => {
    const rows = extractBlade('raw_button.blade.php', load('raw_button.blade.php'))
    const buttonLines = new Set(rows.filter(r => r.kind === 'raw_button_tag').map(r => r.line))
    const inlineOnButtonLine = rows.filter(r => r.kind === 'inline_classes' && buttonLines.has(r.line))
    expect(inlineOnButtonLine).toHaveLength(0)
  })

  it('extracts inline class on non-button elements (e.g. wrapper div)', () => {
    const rows = extractBlade('raw_button.blade.php', load('raw_button.blade.php'))
    const inline = rows.filter(r => r.kind === 'inline_classes')
    expect(inline.length).toBeGreaterThanOrEqual(1)
    expect(inline[0].raw_class_string).toBe('wrapper')
  })

  it('includes surrounding context with line numbers', () => {
    const rows = extractBlade('raw_button.blade.php', load('raw_button.blade.php'))
    expect(rows[0].surrounding_context).toMatch(/^\d+: /m)
  })

  it('emits empty array on empty file', () => {
    expect(extractBlade('empty.blade.php', '')).toEqual([])
  })

  it('emits empty array on file with no patterns', () => {
    expect(extractBlade('plain.blade.php', '<p>Hello world</p>\n')).toEqual([])
  })
})

describe('blade adapter', () => {
  it('delegates to extractBlade and preserves identity', () => {
    const contents = load('raw_button.blade.php')
    const direct = extractBlade('raw_button.blade.php', contents)
    const viaAdapter = bladeAdapter.extract('raw_button.blade.php', contents)
    expect(viaAdapter).toEqual(direct)
  })

  it('declares blade file pattern + standard excludes', () => {
    expect(bladeAdapter.name).toBe('blade')
    expect(bladeAdapter.filePatterns).toContain('.blade.php')
    expect(bladeAdapter.excludes).toContain('vendor')
    expect(bladeAdapter.excludes).toContain('node_modules')
  })
})

describe('walk', () => {
  it('finds all .blade.php files in fixtures dir', () => {
    const files = walk(FIXTURES, { extensions: ['.blade.php'] })
    expect(files.length).toBeGreaterThanOrEqual(5)
    expect(files.every(f => f.endsWith('.blade.php'))).toBe(true)
  })

  it('returns empty list for non-existent dir', () => {
    expect(walk(resolve(FIXTURES, '__does_not_exist__'), { extensions: ['.blade.php'] })).toEqual([])
  })
})

describe('json-output', () => {
  it('serializes scan output with stable schema_version', () => {
    const output: ScanOutput = {
      metadata: {
        schema_version: SCHEMA_VERSION,
        adapter: 'blade',
        scanned_at: '2026-05-11T00:00:00Z',
        project_root: '/tmp/test',
        files_scanned: 0,
        duration_ms: 0,
      },
      rows: [],
    }
    const json = serializeScan(output)
    expect(JSON.parse(json).metadata.schema_version).toBe(SCHEMA_VERSION)
  })
})
