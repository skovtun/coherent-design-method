/**
 * Claude API Wrapper
 *
 * Utility for interacting with Anthropic Claude API.
 * Handles authentication, error handling, and structured output.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { DiscoveryResult, DesignSystemConfig } from '@getcoherent/core'
import { validateConfig } from '@getcoherent/core'
import type { AIProviderInterface, ParseModificationOutput } from './ai-provider.js'

export class ClaudeClient implements AIProviderInterface {
  private client: Anthropic
  private defaultModel: string

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
    // Support model via environment variable or parameter, default to latest
    this.defaultModel = model || process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514'
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

      const response = await this.client.messages.create({
        model: this.defaultModel,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        system: this.getSystemPrompt(),
      })

      // Extract JSON from response
      const content = response.content[0]
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude API')
      }

      const jsonText = this.extractJSON(content.text)
      const config = JSON.parse(jsonText)

      // Validate config with Zod
      return validateConfig(config)
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        // Handle model not found error
        if (error.status === 404 && (error.error as any)?.type === 'not_found_error') {
          throw new Error(
            `❌ Model not found: ${this.defaultModel}\n\n` +
              'The specified Claude model is not available.\n' +
              'Try setting a different model:\n' +
              '  export CLAUDE_MODEL=claude-sonnet-4-20250514\n' +
              'Or use the default model by removing CLAUDE_MODEL from your environment.',
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
  async parseModification(prompt: string): Promise<ParseModificationOutput> {
    try {
      const response = await this.client.messages.create({
        model: this.defaultModel,
        max_tokens: 16384,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        system: `You are a design system modification parser. 
Parse natural language requests into structured ModificationRequest JSON.
Always check component registry before creating new components.
Return valid JSON only, no markdown. Use: { "requests": [ ... ], "uxRecommendations": "optional markdown" }
CRITICAL: All string values in JSON must be on one line. Escape double quotes inside strings with \\". Do not include unescaped newlines or quotes in string values.`,
      })

      // Detect truncated response (AI hit token limit before finishing)
      if (response.stop_reason === 'max_tokens') {
        const err = new Error('AI response truncated (max_tokens reached)')
        ;(err as any).code = 'RESPONSE_TRUNCATED'
        throw err
      }

      const content = response.content[0]
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude API')
      }

      const jsonText = this.extractJSON(content.text)
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
              'The specified Claude model is not available.\n' +
              'Try setting a different model:\n' +
              '  export CLAUDE_MODEL=claude-sonnet-4-20250514\n' +
              'Or use the default model by removing CLAUDE_MODEL from your environment.',
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
    const response = await this.client.messages.create({
      model: this.defaultModel,
      max_tokens: 8192,
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
    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')
    return content.text
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
    const response = await this.client.messages.create({
      model: this.defaultModel,
      max_tokens: 16384,
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

CRITICAL RULES:
- Return the COMPLETE modified page code. Do NOT return partial code or snippets.
- Preserve "use client" if present. Do NOT add export const metadata if "use client" is present.
- Keep ALL existing content, structure, and functionality UNLESS the instruction says to change it.
- If the user specifies exact CSS classes or colors — use them exactly, even if they conflict with design constraints.
- Use Tailwind CSS and shadcn/ui patterns.
- Return ONLY the raw TSX code, no markdown fence, no explanation.`,
        },
      ],
      system: 'Return only the raw TSX code, no markdown, no comments before or after.',
    })
    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')
    return content.text
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
    const response = await this.client.messages.create({
      model: this.defaultModel,
      max_tokens: 8192,
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
    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')
    return content.text
      .trim()
      .replace(/^```(?:tsx?|jsx?)\s*/i, '')
      .replace(/\s*```$/i, '')
  }

  /**
   * Story 2.11 B2: Extract a block from page code as a standalone React component.
   */
  async extractBlockAsComponent(pageCode: string, blockHint: string, componentName: string): Promise<string> {
    const response = await this.client.messages.create({
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
    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')
    return content.text
      .trim()
      .replace(/^```(?:tsx?|jsx?)\s*/i, '')
      .replace(/\s*```$/i, '')
  }
}
