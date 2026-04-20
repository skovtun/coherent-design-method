#!/usr/bin/env node
/**
 * Generate `docs/wiki/RULES_MAP.md` from the code.
 *
 * Why: rules live in three places — design-constraints.ts (prompt injection),
 * quality-validator.ts (detection), templates/patterns/*.tsx (golden examples).
 * Keeping a hand-maintained RULES_MAP.md in sync with four sources is brittle;
 * we've already seen drift. Parse the code → generate the table.
 *
 * What it extracts:
 *   - CORE_CONSTRAINTS / RULES_* export names + first sentence of each.
 *   - Validator issue types + messages (from `type: 'XXX'` in the validator).
 *   - Pattern files in templates/patterns/.
 *
 * Output: `docs/wiki/RULES_MAP.md`, replacing the `<!-- AUTO-GENERATED -->`
 * block. The human-maintained preamble and footer (if present) are preserved.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { dirname, join, relative, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../../..')
const CONSTRAINTS_FILE = join(repoRoot, 'packages/cli/src/agents/design-constraints.ts')
const VALIDATOR_FILE = join(repoRoot, 'packages/cli/src/utils/quality-validator.ts')
const PATTERNS_DIR = join(repoRoot, 'packages/cli/templates/patterns')
const OUTPUT_FILE = join(repoRoot, 'docs/wiki/RULES_MAP.md')
const AUTO_MARKER_START = '<!-- AUTO-GENERATED:START -->'
const AUTO_MARKER_END = '<!-- AUTO-GENERATED:END -->'

function extractConstraintBlocks(source) {
  // Find every `export const NAME = \`...\`` and take the first line of the
  // template-literal body as the description.
  const blocks = []
  const re = /export\s+const\s+([A-Z_][A-Z0-9_]*)\s*=\s*`([\s\S]{0,200})/g
  for (const match of source.matchAll(re)) {
    const name = match[1]
    const preview = match[2]
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)[0]
    if (!name || !preview) continue
    blocks.push({ name, preview: preview.slice(0, 120) })
  }
  return blocks
}

function extractValidatorTypes(source) {
  // Find all `type: 'XXX'` literals inside `issues.push({...})` or similar,
  // with their `message:` siblings. Conservative regex — misses some, that's
  // fine; auto-generated table is a starting point.
  const types = new Map() // type → message
  const re = /type:\s*['"]([A-Z_][A-Z0-9_]*)['"][\s,\n]+message:\s*['"`]([^'"`]+)['"`]/g
  for (const match of source.matchAll(re)) {
    const type = match[1]
    const message = match[2].slice(0, 140)
    if (!types.has(type)) types.set(type, message)
  }
  return [...types.entries()].map(([type, message]) => ({ type, message }))
}

function listPatterns(dir) {
  try {
    return readdirSync(dir)
      .filter(f => f.endsWith('.tsx'))
      .map(f => f.replace(/\.tsx$/, ''))
      .sort()
  } catch {
    return []
  }
}

function renderAutoSection(blocks, validators, patterns) {
  const lines = []
  lines.push('## Constraint blocks (auto-generated)')
  lines.push('')
  lines.push('These are the exported rule blocks Claude sees in `design-constraints.ts`. CORE and TIER-1 blocks always ship with the prompt; RULES_* blocks are keyword-matched.')
  lines.push('')
  lines.push('| Block | First line |')
  lines.push('|-------|------------|')
  for (const b of blocks) {
    const tier = b.name.startsWith('RULES_') ? 'TIER-2' : b.name === 'CORE_CONSTRAINTS' ? 'CORE' : 'TIER-1'
    lines.push(`| \`${b.name}\` (${tier}) | ${escapeCell(b.preview)} |`)
  }
  lines.push('')
  lines.push('## Validator issue types (auto-generated)')
  lines.push('')
  lines.push('Every validator fires a typed issue. Grep for the type in `quality-validator.ts` to see the detection logic.')
  lines.push('')
  lines.push('| Issue type | Default message |')
  lines.push('|------------|-----------------|')
  for (const v of validators) {
    lines.push(`| \`${v.type}\` | ${escapeCell(v.message)} |`)
  }
  lines.push('')
  lines.push('## Golden patterns (auto-generated)')
  lines.push('')
  lines.push('Canonical implementations under `packages/cli/templates/patterns/`. AI is shown the inline string from `golden-patterns.ts` when keyword matches.')
  lines.push('')
  for (const p of patterns) {
    lines.push(`- [\`${p}.tsx\`](../../packages/cli/templates/patterns/${p}.tsx)`)
  }
  lines.push('')
  return lines.join('\n')
}

function escapeCell(s) {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function spliceIntoExisting(existing, fresh) {
  const startIdx = existing.indexOf(AUTO_MARKER_START)
  const endIdx = existing.indexOf(AUTO_MARKER_END)
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    // Append at end if markers missing
    return existing + `\n\n${AUTO_MARKER_START}\n${fresh}\n${AUTO_MARKER_END}\n`
  }
  const head = existing.slice(0, startIdx + AUTO_MARKER_START.length)
  const tail = existing.slice(endIdx)
  return `${head}\n${fresh}\n${tail}`
}

// ---- Main ----

const constraintsSource = readFileSync(CONSTRAINTS_FILE, 'utf-8')
const validatorSource = readFileSync(VALIDATOR_FILE, 'utf-8')

const blocks = extractConstraintBlocks(constraintsSource)
const validators = extractValidatorTypes(validatorSource)
const patterns = listPatterns(PATTERNS_DIR)

const fresh = renderAutoSection(blocks, validators, patterns)

let existing = ''
try {
  existing = readFileSync(OUTPUT_FILE, 'utf-8')
} catch {
  existing = `# Rules Map\n\n${AUTO_MARKER_START}\n\n${AUTO_MARKER_END}\n`
}

const updated = spliceIntoExisting(existing, fresh)
writeFileSync(OUTPUT_FILE, updated)

console.log(`[wiki] RULES_MAP.md updated:`)
console.log(`  constraint blocks: ${blocks.length}`)
console.log(`  validator types:   ${validators.length}`)
console.log(`  golden patterns:   ${patterns.length}`)
console.log(`  → ${relative(repoRoot, OUTPUT_FILE)}`)
