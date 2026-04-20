#!/usr/bin/env node
/**
 * Token-budget sanity check for design-constraints.ts.
 *
 * Why: every string in CORE_CONSTRAINTS + DESIGN_QUALITY_COMMON + VISUAL_DEPTH +
 * INTERACTION_PATTERNS rides along with EVERY LLM generation call. When their
 * combined length crosses ~3000 tokens, the AI starts averaging rules instead
 * of applying them (empirically noticed on broad app prompts). This script
 * warns (and in future can fail CI) when the always-sent bundle grows past a
 * safe ceiling.
 *
 * Approximation: chars / 4 ≈ tokens (good enough for English + JSX).
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcFile = join(__dirname, '../src/agents/design-constraints.ts')

// Baseline: ~5400 tokens as of v0.6.99 (seven blocks of always-sent rules).
// Warn threshold = 20% growth over baseline. Hard ceiling = 40% over baseline.
// Calibrate upward cautiously when a new rule legitimately requires it, so the
// signal stays meaningful.
const WARN_THRESHOLD_TOKENS = 6500
const HARD_THRESHOLD_TOKENS = 7500

// Always-sent exports — changing this list changes the budget semantics.
// Keep in sync with `modifier.ts` / the prompt-assembly code that unconditionally
// concatenates these strings.
const ALWAYS_SENT_EXPORTS = ['CORE_CONSTRAINTS', 'DESIGN_QUALITY_COMMON', 'VISUAL_DEPTH', 'INTERACTION_PATTERNS']

function extractExportString(source, name) {
  // Matches: export const NAME = `...`
  // (template-literal body only; we deliberately don't evaluate JS — we just
  // need raw length for a character-count approximation.)
  const re = new RegExp(`export const ${name}\\s*=\\s*\`([\\s\\S]*?)\``, 'm')
  const match = source.match(re)
  return match ? match[1] : null
}

function approximateTokens(text) {
  return Math.ceil(text.length / 4)
}

const source = readFileSync(srcFile, 'utf-8')
const report = []
let total = 0

for (const name of ALWAYS_SENT_EXPORTS) {
  const body = extractExportString(source, name)
  if (body === null) {
    console.error(`  ⚠ Could not find export: ${name}`)
    process.exit(1)
  }
  const tokens = approximateTokens(body)
  total += tokens
  report.push({ name, chars: body.length, tokens })
}

console.log('Constraint bundle size (approx tokens, always-sent):')
for (const row of report) {
  console.log(`  ${row.name.padEnd(26)} ${String(row.chars).padStart(6)} chars  ~${String(row.tokens).padStart(4)} tokens`)
}
console.log(`  ${'TOTAL'.padEnd(26)} ${''.padStart(6)}        ~${String(total).padStart(4)} tokens`)

// Never fail CI from this script — it's informational. The signal is the
// trajectory between releases: if CORE grows by 500+ tokens in one patch bump,
// review whether it all belongs in always-sent or should move to TIER 2.
if (total > HARD_THRESHOLD_TOKENS) {
  console.error(
    `\n❌ Constraint bundle exceeds hard ceiling (${total} > ${HARD_THRESHOLD_TOKENS} tokens). Move detail to TIER 2 contextual blocks — AI will average rules at this size.`,
  )
} else if (total > WARN_THRESHOLD_TOKENS) {
  console.warn(
    `\n⚠  Constraint bundle over soft warn threshold (${total} > ${WARN_THRESHOLD_TOKENS} tokens). Consider moving page-specific detail to TIER 2.`,
  )
} else {
  console.log(`\n✓ Under soft warn threshold (${WARN_THRESHOLD_TOKENS} tokens).`)
}
