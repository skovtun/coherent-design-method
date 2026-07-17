/**
 * The single source of truth for which Claude model Coherent's generation path
 * uses — and the self-healing that stops a model retirement from silently
 * killing the product again.
 *
 * ## Why this file exists
 *
 * `claude-sonnet-4-20250514` was hardcoded in four places. Anthropic retired it
 * on 2026-06-15 on the published schedule, and every `coherent chat` on the API
 * rail started returning a 404 `not_found_error`. Nobody noticed for a month:
 * Tool 2's labeler had been moved to `claude-sonnet-4-6` during the R10 saga, so
 * the paths people were actively working on kept passing while the flagship
 * command was dead. Three different model IDs scattered across the repo is what
 * let that divergence hide.
 *
 * ## Why a pin at all (rather than "just use whatever the user has")
 *
 * Asking the API for the newest available model would never go stale — but it
 * moves the choice rather than removing it (an account typically has Haiku
 * through Opus available, and silently picking the most capable one bills the
 * user ~1.7x without asking). A pin also buys two things Coherent specifically
 * relies on: reproducible evals (a floating model makes a gate score drift for
 * reasons unrelated to the code) and predictable cost.
 *
 * So: pin by default, override with `CLAUDE_MODEL`, and fall back automatically
 * — loudly — when the pin is gone. The pin is a default, never a cage.
 *
 * NOTE: Tool 2's labeler pins its own model separately in
 * `scan/cluster/constants.ts` (`MODEL_ID`). That is deliberate — its eval gate
 * and paid label cache are calibrated against that exact model. Do NOT collapse
 * it into `DEFAULT_MODEL`.
 */

/**
 * The model Coherent generates with unless overridden. Direct successor to the
 * retired `claude-sonnet-4-20250514`, same price tier ($3/$15 per MTok).
 */
export const DEFAULT_MODEL = 'claude-sonnet-5'

/**
 * Fallback order used when the configured model is unavailable. Ordered by
 * "closest to the pin's cost/quality profile first" — we degrade toward a
 * working model, never silently upgrade the user into a pricier tier without
 * saying so.
 */
export const MODEL_PREFERENCE_ORDER: readonly string[] = [
  DEFAULT_MODEL,
  'claude-sonnet-4-6',
  'claude-opus-4-8',
  'claude-haiku-4-5',
]

/** Resolve the model to use: explicit argument → `CLAUDE_MODEL` env → pin. */
export function resolveModel(explicit?: string): string {
  return explicit || process.env.CLAUDE_MODEL || DEFAULT_MODEL
}

/** True for the API's "this model does not exist" 404 — i.e. a retired/typo'd ID. */
export function isModelNotFoundError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const e = error as { status?: number; error?: { type?: string } }
  return e.status === 404 && e.error?.type === 'not_found_error'
}

/**
 * List the model IDs this API key can actually use.
 *
 * Deliberately a raw fetch rather than `client.models.list()`: the pinned SDK
 * (0.32.x) predates the Models API resource, and upgrading it is a much larger
 * change than this fix warrants. Fails soft — a null return means "couldn't
 * ask", and callers fall back to their configured model rather than erroring on
 * the diagnostic path.
 */
export async function fetchAvailableModels(apiKey: string): Promise<string[] | null> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    })
    if (!res.ok) return null
    const body = (await res.json()) as { data?: Array<{ id?: string }> }
    const ids = (body.data ?? []).map(m => m.id).filter((id): id is string => typeof id === 'string')
    return ids.length > 0 ? ids : null
  } catch {
    return null
  }
}

/**
 * Pick a live replacement for an unavailable model: the first entry of
 * {@link MODEL_PREFERENCE_ORDER} the account actually has, else the first model
 * it has at all. Returns null when the account has nothing (or we couldn't ask).
 */
export async function findAvailableModel(apiKey: string, unavailable?: string): Promise<string | null> {
  const available = await fetchAvailableModels(apiKey)
  if (!available) return null
  const usable = available.filter(id => id !== unavailable)
  for (const preferred of MODEL_PREFERENCE_ORDER) {
    if (usable.includes(preferred)) return preferred
  }
  return usable[0] ?? null
}
