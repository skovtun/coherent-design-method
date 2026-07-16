/**
 * The E3 CI-equivalence gate.
 *
 * `coherent export tokens` emits three formats from one token model. This check
 * proves they AGREE: every base color token declared in the model must appear
 * with the identical value in both `css-variables.css` and `tailwind-v4.css`.
 *
 * These nine tokens are pure passthroughs (no fallback / derivation in either
 * generator), so agreement is a real invariant — if a future edit makes one
 * generator diverge (e.g. changes how `--primary` is emitted), this fails.
 * Derived vars (`--primary-foreground`, `--muted-foreground`, `--accent`,
 * `--info`) are intentionally excluded: they carry generator-specific logic and
 * are not part of the equivalence contract.
 */

import type { DesignSystemConfig } from '@getcoherent/core'
import { buildCssVariables } from '@getcoherent/core'
import { generateV4GlobalsCss } from '../utils/tailwind-version.js'

export const EQUIVALENCE_TOKENS = [
  'background',
  'foreground',
  'primary',
  'secondary',
  'muted',
  'border',
  'success',
  'warning',
  'error',
] as const

export interface TokenValues {
  token: string
  model: string | undefined
  css: string | undefined
  tailwind: string | undefined
}

export type EquivalenceIssue = TokenValues

/** The model/css/tailwind value of each equivalence token, parsed from each output. */
export function readTokenValues(config: DesignSystemConfig): TokenValues[] {
  const light = config.tokens.colors.light as Record<string, string>
  const cssRoot = rootBlock(buildCssVariables(config))
  const twRoot = rootBlock(generateV4GlobalsCss(config))
  return EQUIVALENCE_TOKENS.map(token => ({
    token,
    model: norm(light[token]),
    css: norm(readVar(cssRoot, token)),
    tailwind: norm(readVar(twRoot, token)),
  }))
}

/** Return an empty array when all formats agree, else one issue per divergent token. */
export function checkEquivalence(config: DesignSystemConfig): EquivalenceIssue[] {
  return readTokenValues(config).filter(v => v.model !== v.css || v.model !== v.tailwind)
}

/** The first `:root { … }` block of a stylesheet (the light theme). */
function rootBlock(css: string): string {
  const start = css.indexOf(':root')
  if (start === -1) return ''
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  if (open === -1 || close === -1) return ''
  return css.slice(open + 1, close)
}

function readVar(block: string, name: string): string | undefined {
  const m = block.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`))
  return m ? m[1].trim() : undefined
}

function norm(value: string | undefined): string | undefined {
  return value?.trim().toLowerCase()
}
