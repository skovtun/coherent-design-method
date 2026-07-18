/**
 * Claude API Wrapper
 *
 * Utility for interacting with Anthropic Claude API.
 * Handles authentication, error handling, and structured output.
 */

import Anthropic from '@anthropic-ai/sdk'
import chalk from 'chalk'
import type { DiscoveryResult, DesignSystemConfig } from '@getcoherent/core'
import { validateConfig } from '@getcoherent/core'
import { resolveModel, isModelNotFoundError, findAvailableModel, DEFAULT_MODEL } from './model.js'
import type {
  AIProviderInterface,
  AIRequestOptions,
  ParseModificationOutput,
  SharedExtractionItem,
} from './ai-provider.js'

export class ClaudeClient implements AIProviderInterface {
  private client: Anthropic
  private defaultModel: string
  private apiKey: string
  /** Guard so a retired model triggers at most one fallback probe per process. */
  private fallbackAttempted = false

  constructor(apiKey?: string, model?: string) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY
    if (!key) {
      throw new Error(
        'ANTHROPIC_API_KEY not found in environment.\n' +
          'Please set it in your .env file or export it:\n' +
          '  export ANTHROPIC_API_KEY=your_key_here',
      )
    }
    this.client = new Anthropic({ apiKey: key, maxRetries: 1 })
    this.apiKey = key
    // Model resolution + the pin live in utils/model.ts — see that file for why
    // this is pinned rather than auto-selected, and why a retirement must never
    // be able to kill the command silently again.
    this.defaultModel = resolveModel(model)
  }

  /**
   * Pull the assistant's text out of a response, wherever it sits.
   *
   * `response.content[0]` is NOT reliably the text block. Models with thinking
   * enabled put a `thinking` block first — and on Claude Sonnet 5 adaptive
   * thinking is ON when the `thinking` field is omitted, so simply moving off
   * the retired Sonnet 4 turned every generation into "Unexpected response
   * type". Fable 5 goes further: thinking is always on and cannot be disabled.
   *
   * Scanning for the text block works on every model regardless of thinking
   * mode, which is why we do that rather than pinning `thinking: disabled`
   * (that would 400 on Fable 5 if a user set CLAUDE_MODEL to it).
   */
  private textOf(response: Anthropic.Message): string | null {
    for (const block of response.content) {
      if (block.type === 'text') return block.text
    }
    return null
  }

  /** Same as {@link textOf}, but throws a diagnostic naming what did come back. */
  private requireText(response: Anthropic.Message, context: string): string {
    const text = this.textOf(response)
    if (text !== null) return text
    const seen = response.content.map(b => b.type).join(', ') || 'nothing'
    throw new Error(
      `Unexpected response type from Claude API while ${context}: got [${seen}], expected a text block. ` +
        `Model: ${this.defaultModel}.`,
    )
  }

  /**
   * Run an API call, and if it fails *because the model no longer exists*, find
   * a live model on this account, say so loudly, and retry once.
   *
   * Anthropic retires models on a published schedule. Before this, a retirement
   * turned every `coherent chat` into a hard 404 — which is exactly what
   * happened when `claude-sonnet-4-20250514` was retired on 2026-06-15 and went
   * unnoticed for a month. A stale pin should degrade to a working model with a
   * warning, not take the product down.
   */
  private async withModelFallback<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call()
    } catch (error) {
      if (!isModelNotFoundError(error) || this.fallbackAttempted) throw error
      this.fallbackAttempted = true
      const replacement = await findAvailableModel(this.apiKey, this.defaultModel)
      if (!replacement) throw error
      console.warn(
        chalk.yellow(
          `⚠ Model ${this.defaultModel} is unavailable (it may have been retired). ` +
            `Falling back to ${replacement}.\n` +
            `  Pin a model with: export CLAUDE_MODEL=<model-id>  ·  Update Coherent: npm i -g @getcoherent/cli`,
        ),
      )
      this.defaultModel = replacement
      return await call()
    }
  }

  /**
   * The single entry point for every Anthropic call. Applies two protections
   * uniformly so no method can silently regain the gaps the 2026-07 audit
   * found:
   *   - model-retirement self-heal (`withModelFallback`), and
   *   - a `max_tokens` truncation guard.
   *
   * The truncation guard is load-bearing: four code-edit methods
   * (editPageCode, editSharedComponentCode, replaceInlineWithShared,
   * extractBlockAsComponent) previously returned whatever text came back even
   * when the model hit `max_tokens` mid-file — writing truncated, unparseable
   * TSX straight into the user's page. Routing every call through here closes
   * that for all of them at once (and for any future method).
   *
   * `model` is injected fresh from `this.defaultModel` on each attempt so a
   * mid-session fallback actually takes effect on retries.
   */
  private async send(
    params: Anthropic.MessageCreateParamsNonStreaming,
    context = 'generating',
    requestOptions?: Anthropic.RequestOptions,
  ): Promise<Anthropic.Message> {
    const response = await this.withModelFallback(() =>
      this.client.messages.create({ ...params, model: this.defaultModel }, requestOptions),
    )
    if (response.stop_reason === 'max_tokens') {
      const err = new Error(`AI response truncated (max_tokens reached) while ${context}`)
      ;(err as { code?: string }).code = 'RESPONSE_TRUNCATED'
      throw err
    }
    return response
  }

  /**
   * Factory method for creating ClaudeClient
   */
  static create(apiKey?: string, model?: string): ClaudeClient {
    return new ClaudeClient(apiKey, model)
  }

  /**
   * Generate design system config from discovery results
   */
  async generateConfig(discovery: DiscoveryResult): Promise<DesignSystemConfig> {
    try {
      const prompt = this.buildConfigPrompt(discovery)

      const response = await this.send(
        {
          model: this.defaultModel,
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
          system: this.getSystemPrompt(),
        },
        'generating config',
      )

      // Extract JSON from response
      const jsonText = this.extractJSON(this.requireText(response, 'parsing the request'))
      const config = JSON.parse(jsonText)

      // Validate config with Zod
      return validateConfig(config)
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        // Handle model not found error
        if (error.status === 404 && (error.error as any)?.type === 'not_found_error') {
          throw new Error(
            `❌ Model not found: ${this.defaultModel}\n\n` +
              'This model is not available to your API key — it may have been retired.\n' +
              'Coherent tried to fall back to another model on your account and could not.\n' +
              'Pick a model your key can use:\n' +
              `  export CLAUDE_MODEL=${DEFAULT_MODEL}\n` +
              'List what your key can use:\n' +
              '  curl https://api.anthropic.com/v1/models -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01"\n' +
              'Or update Coherent, which ships a current default:\n' +
              '  npm i -g @getcoherent/cli',
          )
        }
        throw new Error(
          `Claude API error (${error.status}): ${error.message}\n` + 'Please check your API key and try again.',
        )
      }
      if (error instanceof Error) {
        throw new Error(`Failed to generate config: ${error.message}`)
      }
      throw new Error('Unknown error occurred while generating config')
    }
  }

  /**
   * Build prompt for config generation
   */
  private buildConfigPrompt(discovery: DiscoveryResult): string {
    const featuresList =
      Object.entries(discovery.features)
        .filter(([_, enabled]) => enabled)
        .map(([name]) => name)
        .join(', ') || 'none'

    return `Generate a complete DesignSystemConfig JSON for the following project:

Project Type: ${discovery.projectType}
App Type: ${discovery.appType}
Audience: ${discovery.audience}
Visual Style: ${discovery.visualStyle}
Primary Color: ${discovery.primaryColor}
Dark Mode: ${discovery.darkMode ? 'Yes' : 'No'}
Features: ${featuresList}
${discovery.additionalRequirements ? `Additional Requirements: ${discovery.additionalRequirements}` : ''}

Requirements:
- Use 8pt grid system for spacing (0.25rem, 0.5rem, 1rem, 1.5rem, 2rem, 3rem, 4rem)
- Ensure WCAG AA contrast (4.5:1 for text) for all colors
- Generate dark mode colors based on primary color ${discovery.primaryColor}
- Include commonly needed components for ${discovery.projectType} projects
- Set appType to "${discovery.appType}" in settings
- Enable stateManagement if SPA or authentication is needed
- Use semantic color naming (primary, secondary, success, warning, error, info)
- Set createdAt and updatedAt to current ISO timestamp

Output ONLY valid JSON matching DesignSystemConfig schema. Do not include markdown code blocks or explanations.`
  }

  /**
   * Get system prompt for Claude
   */
  private getSystemPrompt(): string {
    return `You are a design system architect expert. Your task is to generate complete, valid DesignSystemConfig JSON objects.

Key principles:
- Always generate valid JSON that matches the DesignSystemConfig schema
- Use semantic color tokens (primary, secondary, etc.) not hardcoded values
- Ensure all required fields are present
- Generate realistic, production-ready configurations
- Follow 8pt grid system for spacing
- Ensure WCAG AA contrast compliance
- Include appropriate components for the project type

Return ONLY the JSON object, no markdown, no code blocks, no explanations.`
  }

  /**
   * Extract JSON from Claude's response (handles markdown code blocks)
   */
  private extractJSON(text: string): string {
    // Remove markdown code blocks if present
    let jsonText = text.trim()

    // Remove ```json or ``` markers
    if (jsonText.startsWith('```')) {
      const lines = jsonText.split('\n')
      // Remove first line (```json or ```)
      lines.shift()
      // Remove last line (```)
      if (lines[lines.length - 1].trim() === '```') {
        lines.pop()
      }
      jsonText = lines.join('\n')
    }

    return jsonText.trim()
  }

  async generateJSON(systemPrompt: string, userPrompt: string): Promise<unknown> {
    const response = await this.send(
      {
        model: this.defaultModel,
        max_tokens: 32000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      },
      'generating JSON',
    )
    return JSON.parse(this.extractJSON(this.requireText(response, 'generating JSON')))
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: this.defaultModel,
        max_tokens: 10,
        messages: [
          {
            role: 'user',
            content: 'Say "OK"',
          },
        ],
      })
      return true
    } catch (error) {
      return false
    }
  }

  /**
   * Parse modification request from natural language
   */
  async parseModification(prompt: string, options?: AIRequestOptions): Promise<ParseModificationOutput> {
    try {
      const response = await this.send(
        {
          model: this.defaultModel,
          // Sized for Sonnet 5 adaptive thinking (ON when `thinking` is omitted):
          // the thinking block AND the emitted page JSON both draw from this
          // budget. 16384 fit Sonnet 4 (no thinking) but truncated the anchor
          // page under Sonnet 5, producing empty pages. See RESPONSE_TRUNCATED
          // guard in send() and PATTERNS_JOURNAL.
          max_tokens: 32000,
          messages: [{ role: 'user', content: prompt }],
          system: `Design system modification parser. Parse requests into ModificationRequest JSON. Check component registry before creating new. Return valid JSON only: { "requests": [...], "uxRecommendations": "brief markdown or omit" }. Escape quotes with \\", no newlines in string values.`,
        },
        'parsing the request',
        options?.signal ? { signal: options.signal } : undefined,
      )

      const jsonText = this.extractJSON(this.requireText(response, 'parsing the request'))
      const parsed = JSON.parse(jsonText)

      if (Array.isArray(parsed)) {
        return { requests: parsed }
      }
      const requests = parsed?.requests
      if (!Array.isArray(requests)) {
        throw new Error('Expected "requests" array in response')
      }
      return {
        requests,
        uxRecommendations:
          typeof parsed.uxRecommendations === 'string' && parsed.uxRecommendations.trim()
            ? parsed.uxRecommendations.trim()
            : undefined,
      }
    } catch (error) {
      if ((error as any)?.code === 'RESPONSE_TRUNCATED') {
        throw error
      }
      if (error instanceof Anthropic.APIError) {
        // Handle model not found error
        if (error.status === 404 && (error.error as any)?.type === 'not_found_error') {
          throw new Error(
            `❌ Model not found: ${this.defaultModel}\n\n` +
              'This model is not available to your API key — it may have been retired.\n' +
              'Coherent tried to fall back to another model on your account and could not.\n' +
              'Pick a model your key can use:\n' +
              `  export CLAUDE_MODEL=${DEFAULT_MODEL}\n` +
              'List what your key can use:\n' +
              '  curl https://api.anthropic.com/v1/models -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01"\n' +
              'Or update Coherent, which ships a current default:\n' +
              '  npm i -g @getcoherent/cli',
          )
        }
        throw new Error(
          `Claude API error (${error.status}): ${error.message}\n` + 'Please check your API key and try again.',
        )
      }
      if (error instanceof Error) {
        throw new Error(`Failed to parse modification: ${error.message}`)
      }
      throw new Error('Unknown error occurred while parsing modification')
    }
  }

  /**
   * Edit shared component code by instruction (Epic 2).
   */
  async editSharedComponentCode(currentCode: string, instruction: string, componentName: string): Promise<string> {
    const response = await this.send({
      model: this.defaultModel,
      max_tokens: 16384,
      messages: [
        {
          role: 'user',
          content: `You are a React/Next.js component editor. Update the following component according to the user's instruction.

Component name: ${componentName}

Current code:
\`\`\`tsx
${currentCode}
\`\`\`

Instruction: ${instruction}

Rules: Preserve "use client" if present. Use Tailwind and shadcn/ui patterns. Return ONLY the complete updated component code, no markdown fence, no explanation.`,
        },
      ],
      system: 'Return only the raw TSX code, no markdown, no comments before or after.',
    })
    return this.requireText(response, 'generating code')
      .trim()
      .replace(/^```(?:tsx?|jsx?)\s*/i, '')
      .replace(/\s*```$/i, '')
  }

  /**
   * Edit existing page code by instruction. Returns full modified page code.
   */
  async editPageCode(
    currentCode: string,
    instruction: string,
    pageName: string,
    designConstraints?: string,
  ): Promise<string> {
    const constraintBlock = designConstraints
      ? `\nDesign constraints (follow unless user explicitly overrides):\n${designConstraints}\n`
      : ''
    const response = await this.send({
      model: this.defaultModel,
      max_tokens: 32000,
      messages: [
        {
          role: 'user',
          content: `You are a React/Next.js page editor. Modify the existing page according to the user's instruction.

Page name: ${pageName}
${constraintBlock}
Current code:
\`\`\`tsx
${currentCode}
\`\`\`

Instruction: ${instruction}

SURGICAL EDIT RULES (critical — violation wastes the user's time):
- Change ONLY the lines needed to satisfy the instruction. Leave every other line byte-identical.
- Do NOT rewrite, reformat, rename, or "improve" unrelated sections. No quote-style changes, no import reordering, no whitespace reflow.
- Do NOT add features the user didn't ask for. No "while we're here" additions.
- Preserve all existing imports, comments, content, and structure outside the edited region.
- If the instruction is ambiguous, pick the narrowest interpretation — smaller scope beats broader.

Before returning, verify:
- Diff vs. current code is as small as possible to satisfy the instruction.
- No unrelated code changed.
- "use client" preserved if present (no metadata export alongside it).
- Honor exact CSS/colors if specified. Tailwind + shadcn/ui only.
- Return COMPLETE modified code (not snippets). Raw TSX only, no markdown fence.`,
        },
      ],
      system: 'Return only the raw TSX code, no markdown, no comments before or after.',
    })
    return this.requireText(response, 'generating code')
      .trim()
      .replace(/^```(?:tsx?|jsx?)\s*/i, '')
      .replace(/\s*```$/i, '')
  }

  /**
   * Story 2.11: Replace inline block on page with shared component import and usage.
   */
  async replaceInlineWithShared(
    pageCode: string,
    sharedComponentCode: string,
    sharedComponentName: string,
    blockHint?: string,
  ): Promise<string> {
    const hint = blockHint ? ` Identify the block that corresponds to: "${blockHint}".` : ''
    const response = await this.send({
      model: this.defaultModel,
      max_tokens: 16384,
      messages: [
        {
          role: 'user',
          content: `You are a React/Next.js page editor. Replace an INLINE block on the page with the shared component "${sharedComponentName}".

PAGE CODE (find and replace one block):
\`\`\`tsx
${pageCode}
\`\`\`

SHARED COMPONENT (use this instead of the inline block):
\`\`\`tsx
${sharedComponentCode}
\`\`\`

Tasks:
1.${hint} Find the inline block that matches or is similar to the shared component (e.g. same structure: hero, CTA, card section).
2. Add an import at the top: import { ${sharedComponentName} } from '@/components/shared/${sharedComponentName.replace(/([A-Z])/g, m => '-' + m.toLowerCase()).replace(/^-/, '')}'
   (Use kebab-case file name: HeroSection → hero-section, PricingCard → pricing-card.)
3. Replace the inline block with <${sharedComponentName} /> (or with props if the shared component accepts them and the page needs different values).
4. Return the COMPLETE updated page code. Preserve "use client" if present. No markdown fence, no explanation.`,
        },
      ],
      system: 'Return only the raw TSX page code, no markdown, no comments before or after.',
    })
    return this.requireText(response, 'generating code')
      .trim()
      .replace(/^```(?:tsx?|jsx?)\s*/i, '')
      .replace(/\s*```$/i, '')
  }

  /**
   * Story 2.11 B2: Extract a block from page code as a standalone React component.
   */
  async extractBlockAsComponent(pageCode: string, blockHint: string, componentName: string): Promise<string> {
    const response = await this.send({
      model: this.defaultModel,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `You are a React/Next.js refactoring assistant. Extract ONE section/block from the page code into a standalone React component.

PAGE CODE:
\`\`\`tsx
${pageCode}
\`\`\`

Block to extract: "${blockHint}"

Requirements:
1. Find the block that matches "${blockHint}" (e.g. CTA section, hero, feature grid).
2. Create a new component named ${componentName} that contains ONLY that block's JSX and logic.
3. The component must be self-contained: export function ${componentName}() { ... } with "use client" if it uses hooks.
4. Use the same imports (Button, Card, etc.) inside the component - include any needed import statements at the top.
5. Return ONLY the complete component file content (no markdown fence, no explanation).`,
        },
      ],
      system: 'Return only the raw TSX code for the extracted component, no markdown, no explanation.',
    })
    return this.requireText(response, 'generating code')
      .trim()
      .replace(/^```(?:tsx?|jsx?)\s*/i, '')
      .replace(/\s*```$/i, '')
  }

  async extractSharedComponents(
    pageCode: string,
    reservedNames: string[],
    existingSharedNames: string[],
  ): Promise<{ components: SharedExtractionItem[] }> {
    try {
      const response = await this.client.messages.create({
        model: this.defaultModel,
        max_tokens: 32000,
        messages: [
          {
            role: 'user',
            content: `Analyze this page and extract reusable components.

PAGE CODE:
${pageCode}

Rules:
- Extract 1-5 components maximum
- Each component must be ≥10 lines of meaningful JSX
- Output complete, self-contained TypeScript modules with:
  - "use client" directive (if hooks or event handlers are used)
  - All necessary imports (shadcn/ui from @/components/ui/*, lucide-react, next/link, etc.)
  - A typed props interface exported as a named type
  - A named export function (not default export)
- Do NOT extract: the entire page, trivial wrappers, layout components (header, footer, nav)
- Do NOT use these names (reserved for shadcn/ui): ${reservedNames.join(', ')}
- Do NOT use these names (already shared): ${existingSharedNames.join(', ')}
- Look for: cards with icon+title+description, pricing tiers, testimonial blocks, stat displays, CTA sections

Each component object: "name" (PascalCase), "type" ("layout"|"navigation"|"data-display"|"form"|"feedback"|"section"|"widget"), "description", "propsInterface", "code" (full TSX module as string)

If no repeating patterns found: { "components": [] }`,
          },
        ],
        system:
          'You are a React/Next.js component extraction specialist. ' +
          'Analyze page code and identify reusable UI patterns that can be extracted into shared components. ' +
          'Return ONLY valid JSON. No markdown fencing, no explanation outside the JSON object.',
      })

      const jsonText = this.extractJSON(this.requireText(response, 'extracting shared components'))
      const parsed = JSON.parse(jsonText)
      const components: SharedExtractionItem[] = Array.isArray(parsed.components) ? parsed.components : []
      return { components }
    } catch (err) {
      // Do NOT swallow API / truncation / no-text errors as "no components" —
      // that silently ships every page with duplicated inline blocks and no
      // signal (audit P1; the same silent-degrade class that hid for a month).
      // The pipeline can continue without extraction, but the failure must be
      // VISIBLE rather than reported as an empty result.
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(chalk.yellow(`⚠ Shared-component extraction failed (${msg}) — pages may duplicate inline blocks.`))
      return { components: [] }
    }
  }
}
