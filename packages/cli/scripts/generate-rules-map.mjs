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
 *   - Validator issue types + messages (TypeScript AST walk over `quality-validator.ts`).
 *   - Pattern files in templates/patterns/.
 *
 * Output: `docs/wiki/RULES_MAP.md`, replacing the `<!-- AUTO-GENERATED -->`
 * block. The human-maintained preamble and footer (if present) are preserved.
 *
 * AST migration (M18, 2026-05-07): the validator extractor previously used a
 * regex `type:\s*['"]...['"][\s,\n]+message:` which silently dropped any rule
 * with an inline comment between `type:` and `message:`. Caught on PR #106
 * pre-merge — three rules vanished from the wiki because comments rationalising
 * a severity bump landed inline. The AST walk finds every ObjectLiteralExpression
 * with both `type` and `message` properties regardless of comment placement.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { dirname, join, relative, resolve } from 'path'
import { fileURLToPath } from 'url'
import ts from 'typescript'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../../..')
const CONSTRAINTS_FILE = join(repoRoot, 'packages/cli/src/agents/design-constraints.ts')
const VALIDATOR_FILE = join(repoRoot, 'packages/cli/src/utils/quality-validator.ts')
const PATTERNS_DIR = join(repoRoot, 'packages/cli/templates/patterns')
const OUTPUT_FILE = join(repoRoot, 'docs/wiki/RULES_MAP.md')
const AUTO_MARKER_START = '<!-- AUTO-GENERATED:START -->'
const AUTO_MARKER_END = '<!-- AUTO-GENERATED:END -->'

const VALIDATOR_TYPE_RE = /^[A-Z_][A-Z0-9_]*$/

export function extractConstraintBlocks(source) {
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

function readStringExpression(expr) {
  if (!expr) return null
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return expr.text
  }
  if (ts.isTemplateExpression(expr)) {
    // Approximate: head + every span's literal, dropping interpolations to "…".
    // RULES_MAP.md is descriptive — exact value isn't required.
    let out = expr.head.text
    for (const span of expr.templateSpans) {
      out += '…' + span.literal.text
    }
    return out
  }
  return null
}

function readPropertyName(prop) {
  if (!prop.name) return null
  if (ts.isIdentifier(prop.name)) return prop.name.text
  if (ts.isStringLiteral(prop.name)) return prop.name.text
  return null
}

export function extractValidatorTypes(source) {
  // AST walk: find every ObjectLiteralExpression with both `type:` (string
  // matching the validator-shape) and `message:` (string-ish). Comment
  // placement, key order, and surrounding wrapper (issues.push, push(...arr),
  // helper return) don't affect correctness.
  const sf = ts.createSourceFile('quality-validator.ts', source, ts.ScriptTarget.Latest, true)
  const types = new Map()

  function visit(node) {
    if (ts.isObjectLiteralExpression(node)) {
      let typeValue = null
      let messageValue = null
      for (const prop of node.properties) {
        if (!ts.isPropertyAssignment(prop)) continue
        const key = readPropertyName(prop)
        if (!key) continue
        if (key === 'type') {
          const v = readStringExpression(prop.initializer)
          if (v && VALIDATOR_TYPE_RE.test(v)) typeValue = v
        } else if (key === 'message') {
          const v = readStringExpression(prop.initializer)
          if (v) messageValue = v
        }
      }
      if (typeValue && messageValue && !types.has(typeValue)) {
        types.set(typeValue, messageValue.slice(0, 140))
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sf)
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

function escapeCell(s) {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function renderAutoSection(blocks, validators, patterns) {
  const lines = []
  lines.push('## Constraint blocks (auto-generated)')
  lines.push('')
  lines.push(
    'These are the exported rule blocks Claude sees in `design-constraints.ts`. CORE and TIER-1 blocks always ship with the prompt; RULES_* blocks are keyword-matched.',
  )
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
  lines.push(
    'Every validator fires a typed issue. Grep for the type in `quality-validator.ts` to see the detection logic.',
  )
  lines.push('')
  lines.push('| Issue type | Default message |')
  lines.push('|------------|-----------------|')
  for (const v of validators) {
    lines.push(`| \`${v.type}\` | ${escapeCell(v.message)} |`)
  }
  lines.push('')
  lines.push('## Golden patterns (auto-generated)')
  lines.push('')
  lines.push(
    'Canonical implementations under `packages/cli/templates/patterns/`. AI is shown the inline string from `golden-patterns.ts` when keyword matches.',
  )
  lines.push('')
  for (const p of patterns) {
    lines.push(`- [\`${p}.tsx\`](../../packages/cli/templates/patterns/${p}.tsx)`)
  }
  lines.push('')
  return lines.join('\n')
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

function main() {
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
}

// Only run main when executed directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
