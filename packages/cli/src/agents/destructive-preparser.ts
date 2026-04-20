/**
 * Destructive Pre-Parser — deterministic detection of delete/remove intents.
 *
 * Why deterministic (not LLM-based): PJ-009 showed AI misinterprets "delete X
 * page" as "create a feature page for deleting X" ~30% of the time. Even after
 * adding RULE 4 to the modifier prompt, AI at temperature=0.3 misses the
 * instruction buried in a 5000-token prompt. The safer fix is to intercept the
 * common destructive patterns BEFORE sending to the LLM at all.
 *
 * What we match:
 *   "delete X page"   |   "remove X page"    |   "drop X page"
 *   "delete the X page"   |   "get rid of X page"   |   "trash X page"
 *   same for "component": "delete X component", etc.
 *
 * What we DO NOT match:
 *   "add a delete account page"        ← create-intent with destructive feature
 *   "make a page for deleting accounts"← create-intent
 *   "delete all old transactions"      ← data operation, not page operation
 *
 * If the message matches, we emit a delete-page/delete-component request
 * directly, bypassing LLM. The LLM gets called only when the pattern is
 * genuinely ambiguous or unrelated.
 */

import type { ModificationRequest, DesignSystemConfig } from '@getcoherent/core'
import { resolvePageByFuzzyMatch } from '../commands/chat/utils.js'

/**
 * Destructive patterns that unambiguously mean "remove this artefact".
 * Intentionally conservative — pages and components only, no data operations.
 */
const DELETE_PAGE_RE =
  /^\s*(?:please\s+)?(?:delete|remove|drop|trash|erase|kill|nuke|get\s+rid\s+of)\s+(?:the\s+)?(.+?)\s+page\s*\.?\s*$/i

const DELETE_COMPONENT_RE =
  /^\s*(?:please\s+)?(?:delete|remove|drop|trash|erase|kill|nuke|get\s+rid\s+of)\s+(?:the\s+)?(.+?)\s+(?:shared\s+)?component\s*\.?\s*$/i

/**
 * Patterns that LOOK destructive but actually request a feature page.
 * These take priority over the delete patterns so we don't over-trigger.
 */
const CREATE_DESTRUCTIVE_FEATURE_RE =
  /^\s*(?:add|create|make|build)\s+(?:a|an|the)?\s*(?:.*\s+)?(?:delete|remove|trash)\s+/i

export interface PreParsedRequest {
  requests: ModificationRequest[]
  reason: string
}

/**
 * Split a compound delete target like "X page and Y page and Z" into a list
 * of individual page names. Handles "and", "&", commas as separators.
 *
 * Input:  "account page and the delete-account"
 * Output: ["account", "delete-account"]
 *
 * The trailing " page" is stripped if present on each part.
 */
function splitCompoundTargets(raw: string): string[] {
  const separators = /\s+and\s+|\s*,\s*|\s+&\s+/i
  return raw
    .split(separators)
    .map(part =>
      part
        .replace(/^\s*the\s+/i, '')
        .replace(/\s+page\s*$/i, '')
        .trim(),
    )
    .filter(Boolean)
}

/**
 * Attempt to detect a destructive intent in the user message. Returns null
 * when no safe match is found OR when the extracted target doesn't resolve
 * to any existing page — in both cases the caller falls through to LLM
 * parsing rather than failing with a wrong target.
 */
export function preParseDestructive(message: string, config: DesignSystemConfig): PreParsedRequest | null {
  const trimmed = message.trim()

  // Rule out "add/create a delete X page" — that's a feature, not a deletion.
  if (CREATE_DESTRUCTIVE_FEATURE_RE.test(trimmed)) return null

  const componentMatch = trimmed.match(DELETE_COMPONENT_RE)
  if (componentMatch) {
    const target = componentMatch[1].trim()
    return {
      requests: [
        {
          type: 'delete-component',
          target,
          changes: {},
          reason: 'destructive intent detected deterministically (pre-parser)',
        },
      ],
      reason: `Matched delete-component pattern for target "${target}".`,
    }
  }

  const pageMatch = trimmed.match(DELETE_PAGE_RE)
  if (pageMatch) {
    const rawTarget = pageMatch[1].trim()
    // Handle compound: "X page and Y page and Z" → multiple requests.
    const targets = splitCompoundTargets(rawTarget)
    if (targets.length === 0) return null

    const requests: ModificationRequest[] = []
    const unresolved: string[] = []
    for (const t of targets) {
      const resolved = resolvePageByFuzzyMatch(config.pages, t)
      if (resolved) {
        requests.push({
          type: 'delete-page',
          target: resolved.id,
          changes: { route: resolved.route, name: resolved.name },
          reason: 'destructive intent detected deterministically (pre-parser)',
        })
      } else {
        unresolved.push(t)
      }
    }

    // Fall back to LLM if NO targets resolved — regex probably over-matched
    // (e.g., "account page and settings" where the split produced garbage).
    // Better to let the LLM reinterpret than fail loudly.
    if (requests.length === 0) {
      return null
    }

    const summary = requests.map(r => r.target).join(', ')
    const warn = unresolved.length > 0 ? ` (unresolved, skipping: ${unresolved.join(', ')} — not in project pages)` : ''
    return {
      requests,
      reason: `Matched delete-page pattern → ${requests.length} page(s) to delete: ${summary}${warn}`,
    }
  }

  return null
}

/**
 * Sanity-check on LLM output. If the user's message contains a destructive
 * verb but the AI emitted an add-page / update-page with a destructive-sounding
 * target name, that's almost certainly a misinterpretation — refuse to apply
 * and surface a clear error.
 *
 * Avoids the silent "Adjusted: add-page → update-page" coercion seen in
 * PJ-009's regression (2026-04-20 after 0.7.6).
 */
const DESTRUCTIVE_VERB_RE = /\b(?:delete|remove|drop|trash|erase|kill|nuke|get\s+rid\s+of)\b/i

export function messageHasDestructiveIntent(message: string): boolean {
  if (CREATE_DESTRUCTIVE_FEATURE_RE.test(message)) return false
  return DESTRUCTIVE_VERB_RE.test(message)
}
