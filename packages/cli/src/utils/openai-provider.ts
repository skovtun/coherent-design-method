/**
 * OpenAI API Provider
 *
 * Implementation of AIProviderInterface for OpenAI/ChatGPT.
 * Supports automatic detection from Cursor and other IDE environments.
 */

// Dynamic import - package may not be installed
// We'll use dynamic import in createAIProvider instead
import type { DiscoveryResult, DesignSystemConfig } from '@getcoherent/core'
import { validateConfig } from '@getcoherent/core'
import type { AIProviderInterface, ParseModificationOutput } from './ai-provider.js'

export class OpenAIClient implements AIProviderInterface {
  private client: any
  private defaultModel: string

  constructor(apiKey: string, model?: string, OpenAIModule?: any) {
    if (!OpenAIModule) {
      throw new Error('OpenAI package not installed. Install it with:\n' + '  npm install openai')
    }
    this.client = new OpenAIModule({ apiKey, maxRetries: 1 })
    this.defaultModel = model || process.env.OPENAI_MODEL || 'gpt-4o'
  }

  /**
   * Factory method for creating OpenAIClient
   */
  static async create(apiKey: string, model?: string): Promise<OpenAIClient> {
    // Dynamic import for ESM
    // @ts-ignore openai is an optional peer dependency
    const OpenAI = await import('openai').catch(() => null)
    if (!OpenAI) {
      throw new Error('OpenAI package not installed. Install it with:\n' + '  npm install openai')
    }
    return new OpenAIClient(apiKey, model, OpenAI.default || OpenAI)
  }

  /**
   * Generate design system config from discovery results
   */
  async generateConfig(discovery: DiscoveryResult): Promise<DesignSystemConfig> {
    try {
      const prompt = this.buildConfigPrompt(discovery)

      const response = await this.client.chat.completions.create({
        model: this.defaultModel,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt(),
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' }, // Force JSON output
        temperature: 0.7,
        max_tokens: 4096,
      })

      const content = response.choices[0]?.message?.content
      if (!content) {
        throw new Error('Empty response from OpenAI API')
      }

      const jsonText = this.extractJSON(content)
      const config = JSON.parse(jsonText)

      // Validate config with Zod
      return validateConfig(config)
    } catch (error: any) {
      // Check if it's an OpenAI API error
      if (error?.status || error?.message?.includes('OpenAI')) {
        throw new Error(
          `OpenAI API error (${error.status}): ${error.message}\n` + 'Please check your API key and try again.',
        )
      }
      if (error instanceof Error) {
        throw new Error(`Failed to generate config: ${error.message}`)
      }
      throw new Error('Unknown error occurred while generating config')
    }
  }

  /**
   * Parse modification request from natural language
   */
  async parseModification(prompt: string): Promise<ParseModificationOutput> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.defaultModel,
        messages: [
          {
            role: 'system',
            content: `You are a design system modification parser. 
Parse natural language requests into structured ModificationRequest JSON.
Always check component registry before creating new components.
Return valid JSON only. Use: { "requests": [ ... ], "uxRecommendations": "optional markdown" }
CRITICAL: All string values in JSON must be on one line. Escape double quotes inside strings with \\". Do not include unescaped newlines or quotes in string values.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3, // Lower temperature for more structured output
        max_tokens: 16384,
      })

      if (response.choices[0]?.finish_reason === 'length') {
        const err = new Error('AI response truncated (max_tokens reached)')
        ;(err as any).code = 'RESPONSE_TRUNCATED'
        throw err
      }

      const content = response.choices[0]?.message?.content
      if (!content) {
        throw new Error('Empty response from OpenAI API')
      }

      const jsonText = this.extractJSON(content)
      const parsed = JSON.parse(jsonText)

      const requests = Array.isArray(parsed) ? parsed : parsed.requests || parsed.modifications || []
      if (!Array.isArray(requests)) {
        throw new Error('Expected array of ModificationRequest objects')
      }
      const uxRecommendations = Array.isArray(parsed)
        ? undefined
        : typeof parsed.uxRecommendations === 'string' && parsed.uxRecommendations.trim()
          ? parsed.uxRecommendations.trim()
          : undefined
      return { requests, uxRecommendations }
    } catch (error: any) {
      if (error?.code === 'RESPONSE_TRUNCATED') throw error
      // Check if it's an OpenAI API error
      if (error?.status || error?.message?.includes('OpenAI')) {
        throw new Error(
          `OpenAI API error (${error.status}): ${error.message}\n` + 'Please check your API key and try again.',
        )
      }
      if (error instanceof Error) {
        throw new Error(`Failed to parse modification: ${error.message}`)
      }
      throw new Error('Unknown error occurred while parsing modification')
    }
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.client.chat.completions.create({
        model: this.defaultModel,
        messages: [{ role: 'user', content: 'Say "OK"' }],
        max_tokens: 10,
      })
      return true
    } catch (error) {
      return false
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
   * Get system prompt
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
   * Extract JSON from response (handles markdown code blocks)
   */
  private extractJSON(text: string): string {
    let jsonText = text.trim()

    // Remove markdown code blocks if present
    if (jsonText.startsWith('```')) {
      const lines = jsonText.split('\n')
      lines.shift() // Remove first line (```json or ```)
      if (lines[lines.length - 1].trim() === '```') {
        lines.pop() // Remove last line (```)
      }
      jsonText = lines.join('\n')
    }

    return jsonText.trim()
  }

  /**
   * Edit shared component code by instruction (Epic 2).
   */
  async editSharedComponentCode(currentCode: string, instruction: string, componentName: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.defaultModel,
      messages: [
        {
          role: 'system',
          content: 'Return only the raw TSX code, no markdown fences, no explanation.',
        },
        {
          role: 'user',
          content: `You are a React/Next.js component editor. Update the following component according to the user's instruction.

Component name: ${componentName}

Current code:
\`\`\`tsx
${currentCode}
\`\`\`

Instruction: ${instruction}

Rules: Preserve "use client" if present. Use Tailwind and shadcn/ui patterns. Return ONLY the complete updated component code.`,
        },
      ],
      max_tokens: 8192,
      temperature: 0.3,
    })
    const content = response.choices[0]?.message?.content
    if (!content) throw new Error('Empty response from OpenAI')
    return content
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
    const response = await this.client.chat.completions.create({
      model: this.defaultModel,
      messages: [
        {
          role: 'system',
          content: 'Return only the raw TSX code, no markdown, no comments before or after.',
        },
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

CRITICAL RULES:
- Return the COMPLETE modified page code. Do NOT return partial code or snippets.
- Preserve "use client" if present. Do NOT add export const metadata if "use client" is present.
- Keep ALL existing content, structure, and functionality UNLESS the instruction says to change it.
- If the user specifies exact CSS classes or colors — use them exactly, even if they conflict with design constraints.
- Use Tailwind CSS and shadcn/ui patterns.
- Return ONLY the raw TSX code, no markdown fence, no explanation.`,
        },
      ],
      max_tokens: 16384,
      temperature: 0.3,
    })
    const content = response.choices[0]?.message?.content
    if (!content) throw new Error('Empty response from OpenAI')
    return content
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
    const kebab = sharedComponentName.replace(/([A-Z])/g, m => '-' + m.toLowerCase()).replace(/^-/, '')
    const hint = blockHint ? ` Identify the block that corresponds to: "${blockHint}".` : ''
    const response = await this.client.chat.completions.create({
      model: this.defaultModel,
      messages: [
        {
          role: 'system',
          content: 'Return only the raw TSX page code, no markdown fences, no explanation.',
        },
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
1.${hint} Find the inline block that matches or is similar to the shared component.
2. Add import: import { ${sharedComponentName} } from '@/components/shared/${kebab}'
3. Replace the inline block with <${sharedComponentName} /> (or with props if needed).
4. Return the COMPLETE updated page code. Preserve "use client" if present.`,
        },
      ],
      max_tokens: 8192,
      temperature: 0.3,
    })
    const content = response.choices[0]?.message?.content
    if (!content) throw new Error('Empty response from OpenAI')
    return content
      .trim()
      .replace(/^```(?:tsx?|jsx?)\s*/i, '')
      .replace(/\s*```$/i, '')
  }

  async extractBlockAsComponent(pageCode: string, blockHint: string, componentName: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.defaultModel,
      messages: [
        {
          role: 'system',
          content: 'Return only the raw TSX code for the extracted component, no markdown fences, no explanation.',
        },
        {
          role: 'user',
          content: `Extract ONE section from the page code into a standalone React component.

PAGE CODE:
\`\`\`tsx
${pageCode}
\`\`\`

Block to extract: "${blockHint}". Create component named ${componentName}. Export function ${componentName}(). Include "use client" if it uses hooks. Include needed imports. Return ONLY the component file content.`,
        },
      ],
      max_tokens: 4096,
      temperature: 0.3,
    })
    const content = response.choices[0]?.message?.content
    if (!content) throw new Error('Empty response from OpenAI')
    return content
      .trim()
      .replace(/^```(?:tsx?|jsx?)\s*/i, '')
      .replace(/\s*```$/i, '')
  }
}
