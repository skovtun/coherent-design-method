/**
 * Signature tokenization + normalization for B-2 clustering.
 *
 * Tokens are kept verbatim (px-4 and px-6 stay separate). Only Tailwind
 * arbitrary-value brackets are collapsed: `bg-[#fff]` → `bg-[*]`,
 * `min-h-[100dvh]` → `min-h-[*]`. This stops one-off literal values from
 * fragmenting clusters. See codex consult 2026-05-11 Q1.
 */

import { createHash } from 'node:crypto'
import type { AntiPatternKind } from '../adapters/types.js'
import type { ClusterSignature } from './types.js'

const BRACKET_VALUE_RE = /\[[^\]]*\]/g

export function normalizeToken(token: string): string {
  return token.replace(BRACKET_VALUE_RE, '[*]')
}

export function tokenize(raw: string): string[] {
  return raw
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 0)
    .map(normalizeToken)
}

export function canonicalSignature(kind: AntiPatternKind, rawClassString: string): ClusterSignature {
  const tokens = tokenize(rawClassString).slice().sort()
  return { kind, tokens }
}

export function signatureKey(sig: ClusterSignature): string {
  return JSON.stringify({ kind: sig.kind, tokens: sig.tokens })
}

export function clusterId(sig: ClusterSignature): string {
  return createHash('sha256').update(signatureKey(sig)).digest('hex').slice(0, 8)
}
