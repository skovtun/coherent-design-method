import { describe, it, expect, vi } from 'vitest'
import {
  SemanticLlmOutputSchema,
  SemanticInferenceError,
  buildSemanticPrompt,
  extractJsonFromResponse,
  parseSemanticResponse,
  runSemanticInference,
  type SemanticLlmFn,
} from './semantic-inference.js'
import type { SemanticLlmInput, SemanticLlmOutput, ExtractedDesignTokens } from './types.js'

const baseTokens: ExtractedDesignTokens = {
  colors: [
    { hex: '#635BFF', usage: 'button-primary' },
    { hex: '#0A2540', usage: 'h1' },
    { hex: '#F6F9FC', usage: 'body-bg' },
  ],
  typography: {
    families: [{ family: 'Sohne' }],
    scale: [
      { role: 'h1', fontSize: '40px', fontWeight: 600 },
      { role: 'body', fontSize: '16px', fontWeight: 400 },
    ],
  },
  spacing: [{ px: 4 }, { px: 8 }, { px: 16 }],
  radius: [{ px: 8 }],
  shadows: [],
  motion: { tokens: [{ duration: '240ms', easing: 'ease-out' }] },
  backgrounds: { solid: [], roles: {} },
  gradients: [],
  patterns: [],
  glassmorphism: null,
  zIndexScale: [],
  focusRings: [],
  linkStates: { default: {}, hover: {} },
  formControlStates: {},
  breakpoints: { strategy: 'mobile-first', values: [] },
  containerWidths: [],
  borderStyles: [],
  iconStyle: { kind: 'unknown' },
}

const baseInput: SemanticLlmInput = {
  url: 'https://stripe.com',
  copyText: 'Build a real online business. Stripe powers payments for millions.',
  hero: { text: 'Build a real online business', fontSize: 56, source: 'h1' },
  metaDescription: 'Stripe is a financial infrastructure platform.',
  deterministic: baseTokens,
}

const validOutput: SemanticLlmOutput = {
  summary: 'Confident fintech with electric purple, technical voice, comfortable density.',
  colorRoles: [
    { hex: '#635BFF', role: 'brand' },
    { hex: '#0A2540', role: 'text' },
    { hex: '#F6F9FC', role: 'background' },
  ],
  voice: {
    tone: ['confident', 'technical', 'precise'],
    samples: [
      { source: 'hero', text: 'Build a real online business' },
      { source: 'meta-description', text: 'Stripe is a financial infrastructure platform.' },
    ],
  },
  density: 'comfortable',
  perCategoryConfidence: {
    color: { level: 'high', reasoning: 'three distinct hexes with clear usage' },
    voice: { level: 'medium' },
  },
}

describe('SemanticLlmOutputSchema', () => {
  it('accepts a well-formed output', () => {
    const result = SemanticLlmOutputSchema.safeParse(validOutput)
    expect(result.success).toBe(true)
  })

  it('rejects non-hex color entries', () => {
    const bad = { ...validOutput, colorRoles: [{ hex: 'rgb(99,91,255)', role: 'brand' }] }
    expect(SemanticLlmOutputSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects unknown density', () => {
    const bad = { ...validOutput, density: 'cozy' }
    expect(SemanticLlmOutputSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects empty tone array', () => {
    const bad = { ...validOutput, voice: { ...validOutput.voice, tone: [] } }
    expect(SemanticLlmOutputSchema.safeParse(bad).success).toBe(false)
  })

  it('caps summary length', () => {
    const bad = { ...validOutput, summary: 'x'.repeat(400) }
    expect(SemanticLlmOutputSchema.safeParse(bad).success).toBe(false)
  })
})

describe('buildSemanticPrompt', () => {
  it('embeds URL, hero, deterministic tokens, and copy excerpt', () => {
    const { system, user } = buildSemanticPrompt(baseInput)
    expect(system).toContain('design-system inspector')
    expect(system).toContain('NEVER invent hex')
    expect(user).toContain('https://stripe.com')
    expect(user).toContain('Build a real online business')
    expect(user).toContain('#635BFF')
    expect(user).toContain('Sohne')
    expect(user).toContain('240ms ease-out')
    expect(user).toContain('Stripe is a financial infrastructure platform.')
  })

  it('handles missing hero / meta gracefully', () => {
    const input: SemanticLlmInput = {
      ...baseInput,
      hero: { text: null, fontSize: null, source: 'none' },
      metaDescription: undefined,
    }
    const { user } = buildSemanticPrompt(input)
    expect(user).toContain('Hero: (none detected)')
    expect(user).toContain('Meta description: (none)')
  })

  it('caps copy excerpt to 2000 chars', () => {
    const long = 'a'.repeat(5000)
    const { user } = buildSemanticPrompt({ ...baseInput, copyText: long })
    // 2000 a's, plus surrounding prompt scaffolding
    expect(user.split('aaaa').length - 1).toBeGreaterThan(0)
    expect(user).not.toContain('a'.repeat(2001))
  })
})

describe('extractJsonFromResponse', () => {
  it('passes plain JSON through', () => {
    expect(extractJsonFromResponse('{"a":1}')).toBe('{"a":1}')
  })

  it('strips ```json fences', () => {
    expect(extractJsonFromResponse('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })

  it('strips bare ``` fences', () => {
    expect(extractJsonFromResponse('```\n{"a":1}\n```')).toBe('{"a":1}')
  })
})

describe('parseSemanticResponse', () => {
  it('parses + validates valid JSON', () => {
    const out = parseSemanticResponse(JSON.stringify(validOutput))
    expect(out.density).toBe('comfortable')
    expect(out.colorRoles[0].role).toBe('brand')
  })

  it('parses through markdown fence', () => {
    const fenced = '```json\n' + JSON.stringify(validOutput) + '\n```'
    expect(parseSemanticResponse(fenced).summary).toContain('Confident fintech')
  })

  it('throws SemanticInferenceError on malformed JSON', () => {
    expect(() => parseSemanticResponse('not json{')).toThrow(SemanticInferenceError)
  })

  it('throws SemanticInferenceError on schema mismatch', () => {
    const bad = JSON.stringify({ ...validOutput, density: 'cozy' })
    expect(() => parseSemanticResponse(bad)).toThrow(SemanticInferenceError)
  })
})

describe('runSemanticInference', () => {
  it('returns parsed output on first success', async () => {
    const llm: SemanticLlmFn = vi.fn().mockResolvedValue({ text: JSON.stringify(validOutput) })
    const out = await runSemanticInference(baseInput, llm)
    expect(out.density).toBe('comfortable')
    expect(llm).toHaveBeenCalledTimes(1)
  })

  it('retries once on schema-validation failure', async () => {
    const llm = vi
      .fn()
      .mockResolvedValueOnce({ text: JSON.stringify({ ...validOutput, density: 'cozy' }) })
      .mockResolvedValueOnce({ text: JSON.stringify(validOutput) })
    const out = await runSemanticInference(baseInput, llm)
    expect(out.density).toBe('comfortable')
    expect(llm).toHaveBeenCalledTimes(2)
  })

  it('throws SemanticInferenceError after retries exhausted', async () => {
    const llm = vi.fn().mockResolvedValue({ text: 'not json{' })
    await expect(runSemanticInference(baseInput, llm, { retries: 2 })).rejects.toThrow(SemanticInferenceError)
    expect(llm).toHaveBeenCalledTimes(3)
  })

  it('propagates underlying network errors immediately (no retry)', async () => {
    const networkErr = new Error('429 rate limited')
    const llm = vi.fn().mockRejectedValue(networkErr)
    await expect(runSemanticInference(baseInput, llm, { retries: 5 })).rejects.toBe(networkErr)
    expect(llm).toHaveBeenCalledTimes(1)
  })

  it('honors retries=0 (no retry on validation failure)', async () => {
    const llm = vi.fn().mockResolvedValue({ text: 'not json{' })
    await expect(runSemanticInference(baseInput, llm, { retries: 0 })).rejects.toThrow(SemanticInferenceError)
    expect(llm).toHaveBeenCalledTimes(1)
  })
})
