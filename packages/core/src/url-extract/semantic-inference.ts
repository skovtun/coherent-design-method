/**
 * Semantic Inference (Wk1 #2)
 *
 * Single LLM-call layer for the URL-extract pipeline. Numerical fields
 * (hex, px, ms) come from the deterministic extractor; this module does only
 * the work where an LLM beats deterministic CSS reading: color role inference,
 * voice tone + sample annotation, density classification, per-category
 * confidence, and a one-sentence atmosphere summary.
 *
 * SDK-free by design — `@getcoherent/core` keeps zod as its only runtime dep.
 * The actual Anthropic call is injected via `llmCall` from the CLI side.
 */

import { z } from 'zod'
import { ConfidenceSchema, type CategoryKey, type SemanticLlmInput, type SemanticLlmOutput } from './types.js'

const COLOR_ROLE = z.enum(['brand', 'accent', 'neutral', 'semantic', 'text', 'border', 'background'])
const VOICE_SOURCE = z.enum(['hero', 'cta', 'body', 'meta-description'])

export const SemanticLlmOutputSchema = z.object({
  summary: z.string().min(1).max(280),
  colorRoles: z.array(z.object({ hex: z.string().regex(/^#[0-9a-fA-F]{6}$/), role: COLOR_ROLE })),
  voice: z.object({
    tone: z.array(z.string().min(1)).min(1).max(6),
    samples: z.array(z.object({ source: VOICE_SOURCE, text: z.string().min(1) })).max(8),
  }),
  density: z.enum(['compact', 'comfortable', 'spacious']),
  perCategoryConfidence: z.record(z.string(), z.object({ level: ConfidenceSchema, reasoning: z.string().optional() })),
}) satisfies z.ZodType<SemanticLlmOutput>

const SYSTEM_PROMPT = [
  'You are a design-system inspector. You receive deterministic CSS tokens already extracted from a live website',
  'plus the hero copy and meta description. Your job is the SEMANTIC layer only:',
  '',
  '1. Color role inference. For each input hex, label it brand / accent / neutral / semantic / text / border / background.',
  '   Use frequency hints from the deterministic input. Brand = the dominant non-neutral color in CTAs and headers.',
  '   Accent = secondary highlights. Neutral = grays and off-whites. Semantic = success/warning/error/info.',
  '   Text = colors used on copy. Border = thin outlines. Background = page/section/card fills.',
  '2. Voice. 2 to 5 short tone descriptors (e.g. "confident", "playful", "technical"). Pull 2 to 6 verbatim samples',
  '   from the provided copy. Tag each sample with its source (hero, cta, body, meta-description). NEVER paraphrase.',
  '3. Density. One of compact, comfortable, spacious. Comfortable is the default; only deviate with clear evidence.',
  '4. perCategoryConfidence. For categories you have evidence for, emit { level: high|medium|low, reasoning?: short }.',
  '5. summary. One sentence, ≤ 200 chars, naming the atmosphere (e.g. "Confident fintech with electric purple,',
  '   editorial type, generous whitespace.").',
  '',
  'NEVER invent hex values, px scales, or ms durations — those come from the deterministic input and are immutable.',
  'Output ONLY valid JSON matching the schema. No markdown fence, no explanation.',
].join('\n')

export function buildSemanticPrompt(input: SemanticLlmInput): { system: string; user: string } {
  const tokens = input.deterministic
  const colorList = tokens.colors
    .slice(0, 24)
    .map(c => `  - ${c.hex}${c.usage ? `  (${c.usage})` : ''}`)
    .join('\n')
  const families = tokens.typography.families
    .slice(0, 4)
    .map(f => f.family)
    .join(', ')
  const scale = tokens.typography.scale
    .slice(0, 8)
    .map(s => `${s.role}=${s.fontSize}${s.fontWeight ? `/w${s.fontWeight}` : ''}`)
    .join(', ')
  const spacing = tokens.spacing
    .slice(0, 12)
    .map(s => `${s.px}px`)
    .join(' ')
  const motion = tokens.motion.tokens
    .slice(0, 4)
    .map(m => `${m.duration} ${m.easing}`)
    .join('; ')
  const heroLine = input.hero.text ? `${input.hero.text} (source: ${input.hero.source})` : '(none detected)'
  const metaLine = input.metaDescription || '(none)'
  // Cap copy at ~2000 chars: enough to surface tone, well under per-call cost.
  const copyExcerpt = input.copyText.slice(0, 2000)

  const user = [
    `URL: ${input.url}`,
    `Hero: ${heroLine}`,
    `Meta description: ${metaLine}`,
    '',
    'DETERMINISTIC TOKENS (DO NOT CHANGE NUMERICAL VALUES):',
    `Colors:\n${colorList || '  (none)'}`,
    `Type families: ${families || '(none)'}`,
    `Type scale: ${scale || '(none)'}`,
    `Spacing scale: ${spacing || '(none)'}`,
    `Motion samples: ${motion || '(none)'}`,
    '',
    'COPY EXCERPT (verbatim source for voice samples):',
    copyExcerpt || '(empty)',
    '',
    'Return JSON: { summary, colorRoles[], voice{tone[],samples[]}, density, perCategoryConfidence{} }.',
  ].join('\n')

  return { system: SYSTEM_PROMPT, user }
}

export class SemanticInferenceError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'SemanticInferenceError'
  }
}

export interface RawLlmResponse {
  text: string
}

export interface SemanticLlmFn {
  (prompt: { system: string; user: string }): Promise<RawLlmResponse>
}

export interface RunSemanticInferenceOptions {
  /** Number of retry attempts on JSON parse / schema-validation failure. Default 1. */
  retries?: number
}

/**
 * Strip optional markdown fences (```json … ```) from the raw response.
 */
export function extractJsonFromResponse(text: string): string {
  let body = text.trim()
  if (body.startsWith('```')) {
    const lines = body.split('\n')
    lines.shift()
    if (lines.length > 0 && lines[lines.length - 1].trim() === '```') lines.pop()
    body = lines.join('\n').trim()
  }
  return body
}

/**
 * Parse + zod-validate the LLM response. Throws SemanticInferenceError on
 * malformed JSON or schema mismatch (caller can retry).
 */
export function parseSemanticResponse(raw: string): SemanticLlmOutput {
  const json = extractJsonFromResponse(raw)
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (err) {
    throw new SemanticInferenceError(`Semantic LLM returned invalid JSON: ${(err as Error).message}`, err)
  }
  const result = SemanticLlmOutputSchema.safeParse(parsed)
  if (!result.success) {
    throw new SemanticInferenceError(
      `Semantic LLM output failed schema validation: ${result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      result.error,
    )
  }
  return result.data
}

/**
 * Drive a single semantic-inference call with up to `retries` retries on
 * malformed output. Underlying network errors propagate immediately (no point
 * retrying a 401 or rate-limit on the same call).
 */
export async function runSemanticInference(
  input: SemanticLlmInput,
  llmCall: SemanticLlmFn,
  opts: RunSemanticInferenceOptions = {},
): Promise<SemanticLlmOutput> {
  const retries = opts.retries ?? 1
  const prompt = buildSemanticPrompt(input)
  let lastErr: unknown = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await llmCall(prompt)
    try {
      return parseSemanticResponse(response.text)
    } catch (err) {
      lastErr = err
      if (!(err instanceof SemanticInferenceError)) throw err
      // fall through to retry
    }
  }
  throw lastErr ?? new SemanticInferenceError('Semantic inference failed for unknown reason')
}

/**
 * Subset of CategoryKey we expect the LLM to score. Exposed for callers that
 * want to default missing keys to confidence:low without re-deriving the list.
 */
export const SEMANTIC_CONFIDENCE_KEYS: readonly CategoryKey[] = [
  'color',
  'typography',
  'voice',
  'density',
  'backgrounds',
  'motion',
  'iconStyle',
] as const
