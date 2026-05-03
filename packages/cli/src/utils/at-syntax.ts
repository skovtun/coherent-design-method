import type { SharedComponentEntry, SharedComponentsManifest } from '@getcoherent/core'

/**
 * @-syntax for explicit component reference in CLI prompts.
 *
 * Users can pin specific shared components by writing `@<name>` or
 * `@<CID-XXX>` directly in their `coherent chat` message. These pinned
 * components get a stronger "MUST USE" directive in the AI prompt vs
 * the default keyword-match resolution.
 *
 *   coherent chat "build a pricing page using @PricingTable + @TestimonialGrid"
 *   coherent chat "regenerate landing with @CID-001 header"
 *
 * Why: today the AI resolves shared component references by keyword match
 * (e.g. "pricing table" → looks for an entry with "pricing" in the name).
 * That's probabilistic. @-syntax gives the user a deterministic handle
 * over what enters the prompt — the same pattern Aura ships in their
 * editor as their `@component` reference.
 *
 * Infra reuse: `SharedComponentsRegistry.findSharedComponent` already
 * accepts CID-XXX or name (case-insensitive). This module just wraps
 * extraction + bulk lookup.
 */

const AT_MENTION_RE = /@([A-Za-z][A-Za-z0-9_-]*)/g

/**
 * Extract every `@<token>` from a free-form message. Returns the raw
 * tokens (without the leading @), in the order they appear, deduped.
 *
 *   extractAtMentions("use @hero + @pricing and @hero again")
 *   // → ["hero", "pricing"]
 *
 * Tokens must start with an ASCII letter; `@123` is NOT extracted.
 * Email addresses inside the message are NOT extracted (the regex
 * requires `@` to be the FIRST character of the captured group, so
 * `user@example.com` matches but the captured token starts with the
 * letter "user" only if `@` is preceded by whitespace or string
 * boundary). To avoid the email false-positive, we additionally
 * filter on a simple boundary check: `@` must follow whitespace, the
 * start of the string, or a punctuation character.
 */
export function extractAtMentions(message: string): string[] {
  if (!message) return []
  const seen = new Set<string>()
  const out: string[] = []

  for (const m of message.matchAll(AT_MENTION_RE)) {
    const matchIndex = m.index ?? 0
    const before = matchIndex === 0 ? '' : message[matchIndex - 1]
    if (before && !/[\s,;:.!?({[]/.test(before)) {
      // Looks like an email or other inline `@` — skip
      continue
    }
    const token = m[1]
    const key = token.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(token)
  }

  return out
}

export interface ResolvedAtMentions {
  resolved: SharedComponentEntry[]
  unresolved: string[]
}

/**
 * Resolve a list of raw @-mention tokens against a shared-components
 * manifest. Match priority:
 *   1. Exact CID match (case-insensitive — "cid-001" matches "CID-001")
 *   2. Exact name match (case-insensitive — "pricing" matches "Pricing")
 *   3. Otherwise unresolved
 *
 * Order of `resolved` mirrors order of input tokens. Unresolved tokens
 * are kept verbatim so we can surface a warning to the user.
 */
export function resolveAtMentions(tokens: string[], manifest: SharedComponentsManifest): ResolvedAtMentions {
  const resolved: SharedComponentEntry[] = []
  const unresolved: string[] = []
  const seenIds = new Set<string>()

  for (const token of tokens) {
    const upper = token.toUpperCase()
    const lower = token.toLowerCase()

    let hit: SharedComponentEntry | undefined

    if (upper.startsWith('CID-')) {
      hit = manifest.shared.find(e => e.id.toUpperCase() === upper)
    }
    if (!hit) {
      hit = manifest.shared.find(e => e.name.toLowerCase() === lower)
    }

    if (hit) {
      if (seenIds.has(hit.id)) continue
      seenIds.add(hit.id)
      resolved.push(hit)
    } else {
      unresolved.push(token)
    }
  }

  return { resolved, unresolved }
}

/**
 * Build a strong "MUST USE" directive block that prepends the regular
 * `sharedComponentsSummary`. Returns undefined when no entries pinned.
 *
 * The directive is intentionally louder than `buildSharedComponentsNote`
 * because the user EXPLICITLY asked for these components — there should
 * be no ambiguity about whether to use them.
 */
export function buildPinnedComponentsDirective(pinned: SharedComponentEntry[]): string | undefined {
  if (pinned.length === 0) return undefined

  const lines: string[] = []
  lines.push('USER EXPLICITLY PINNED THESE COMPONENTS (via @-mention) — YOU MUST IMPORT AND USE EACH ONE:')
  lines.push('')
  for (const c of pinned) {
    const importPath = c.file.replace(/^components\/shared\//, '').replace(/\.tsx$/, '')
    const desc = c.description ? ` — ${c.description}` : ''
    const props = c.propsInterface ? `\n    Props: ${c.propsInterface}` : ''
    lines.push(`  ${c.id} ${c.name} (${c.type})${desc}`)
    lines.push(`    Import: import { ${c.name} } from '@/components/shared/${importPath}'${props}`)
  }
  lines.push('')
  lines.push('Do NOT skip any of these. Do NOT re-implement them inline. They are the authoritative version.')
  return lines.join('\n')
}

/**
 * One-shot helper. Extracts mentions, resolves against the manifest, and
 * returns the directive + warnings ready to feed into the chat command.
 *
 * Returns `undefined` for both directive and warnings when no `@`
 * mentions appear in the message (zero-cost path).
 */
export function processAtMentions(
  message: string,
  manifest: SharedComponentsManifest,
): {
  directive: string | undefined
  unresolvedWarnings: string[]
  pinnedCount: number
} {
  const tokens = extractAtMentions(message)
  if (tokens.length === 0) {
    return { directive: undefined, unresolvedWarnings: [], pinnedCount: 0 }
  }

  const { resolved, unresolved } = resolveAtMentions(tokens, manifest)
  const directive = buildPinnedComponentsDirective(resolved)
  const unresolvedWarnings = unresolved.map(
    t => `@${t} did not match any shared component (CID or name) — falling back to keyword match.`,
  )

  return { directive, unresolvedWarnings, pinnedCount: resolved.length }
}
