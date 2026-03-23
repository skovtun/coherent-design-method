/**
 * AI Provider Abstraction
 *
 * Supports multiple AI providers (Claude, OpenAI, etc.)
 * with automatic API key detection from environment.
 */

import chalk from 'chalk'
import type { SharedComponentType } from '@getcoherent/core'

export type AIProvider = 'claude' | 'openai' | 'auto'

export interface AIProviderConfig {
  provider: AIProvider
  apiKey?: string
  model?: string
}

export interface AIResponse {
  text: string
  error?: Error
}

export interface ParseModificationOutput {
  requests: unknown[]
  uxRecommendations?: string
  navigation?: { type: string }
}

export interface SharedExtractionItem {
  name: string
  type: SharedComponentType
  description: string
  propsInterface: string
  code: string
}

export interface AIProviderInterface {
  generateConfig(discovery: DiscoveryResult): Promise<DesignSystemConfig>
  parseModification(prompt: string): Promise<ParseModificationOutput>
  /** Send a system+user prompt and return raw parsed JSON (no requests wrapper). */
  generateJSON(systemPrompt: string, userPrompt: string): Promise<unknown>
  testConnection(): Promise<boolean>
  /** Edit shared component source by instruction (Epic 2). Returns full new file content. */
  editSharedComponentCode?(currentCode: string, instruction: string, componentName: string): Promise<string>
  /** Edit existing page code by instruction. Returns full modified page code. */
  editPageCode?(currentCode: string, instruction: string, pageName: string, designConstraints?: string): Promise<string>
  /** Story 2.11: Replace inline block on page with shared component usage. Returns full page code. */
  replaceInlineWithShared?(
    pageCode: string,
    sharedComponentCode: string,
    sharedComponentName: string,
    blockHint?: string,
  ): Promise<string>
  /** Story 2.11 B2: Extract a block from page code as a standalone React component. Returns component TSX code. */
  extractBlockAsComponent?(pageCode: string, blockHint: string, componentName: string): Promise<string>
  /** Extract reusable UI component patterns from a page's TSX code. */
  extractSharedComponents?(
    pageCode: string,
    reservedNames: string[],
    existingSharedNames: string[],
  ): Promise<{ components: SharedExtractionItem[] }>
}

// Import types for interface
import type { DiscoveryResult, DesignSystemConfig } from '@getcoherent/core'

/**
 * Detect available AI provider from environment
 */
export function detectAIProvider(): AIProvider {
  // Check for OpenAI (Cursor, GitHub Copilot, etc.)
  if (process.env.OPENAI_API_KEY || process.env.CURSOR_OPENAI_API_KEY) {
    return 'openai'
  }

  // Check for Anthropic Claude
  if (process.env.ANTHROPIC_API_KEY) {
    return 'claude'
  }

  // Default to Claude if none found (will show error)
  return 'claude'
}

/**
 * Check if any API key is available
 */
export function hasAnyAPIKey(): boolean {
  return !!(
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.CURSOR_OPENAI_API_KEY ||
    process.env.GITHUB_COPILOT_OPENAI_API_KEY
  )
}

/**
 * Get API key for provider
 */
export function getAPIKey(provider: AIProvider): string | undefined {
  switch (provider) {
    case 'openai':
      return (
        process.env.OPENAI_API_KEY || process.env.CURSOR_OPENAI_API_KEY || process.env.GITHUB_COPILOT_OPENAI_API_KEY
      )
    case 'claude':
      return process.env.ANTHROPIC_API_KEY
    case 'auto':
      const detected = detectAIProvider()
      return getAPIKey(detected)
    default:
      return undefined
  }
}

/**
 * Show helpful error message when no API key is found
 */
function showAPIKeyHelp(): void {
  console.log(chalk.red('\n❌ No API key found\n'))
  console.log('To use Coherent, you need an AI provider API key.\n')

  console.log(chalk.cyan('┌─ Quick Setup ─────────────────────────────────────┐'))
  console.log(chalk.cyan('│                                                    │'))
  console.log(chalk.cyan('│  Option 1: Claude (Anthropic)                     │'))
  console.log(chalk.gray('│  Get key: https://console.anthropic.com/          │'))
  console.log(chalk.cyan('│                                                    │'))
  console.log(chalk.cyan('│  Copy and run this command:                       │'))
  console.log(chalk.cyan('│  ┌──────────────────────────────────────────────┐ │'))
  console.log(chalk.white('│  │ echo "ANTHROPIC_API_KEY=sk-..." > .env       │ │'))
  console.log(chalk.cyan('│  └──────────────────────────────────────────────┘ │'))
  console.log(chalk.cyan('│                                                    │'))
  console.log(chalk.cyan('│  Option 2: OpenAI (ChatGPT)                       │'))
  console.log(chalk.gray('│  Get key: https://platform.openai.com/            │'))
  console.log(chalk.cyan('│                                                    │'))
  console.log(chalk.cyan('│  Copy and run this command:                       │'))
  console.log(chalk.cyan('│  ┌──────────────────────────────────────────────┐ │'))
  console.log(chalk.white('│  │ echo "OPENAI_API_KEY=sk-..." > .env          │ │'))
  console.log(chalk.cyan('│  └──────────────────────────────────────────────┘ │'))
  console.log(chalk.cyan('│                                                    │'))
  console.log(chalk.cyan('│  Then run: coherent init                          │'))
  console.log(chalk.cyan('│                                                    │'))
  console.log(chalk.cyan('└────────────────────────────────────────────────────┘\n'))

  console.log(chalk.gray('Note: If using Cursor, your CURSOR_OPENAI_API_KEY'))
  console.log(chalk.gray('will be detected automatically.\n'))
}

/**
 * Create AI provider instance
 */
export async function createAIProvider(
  preferredProvider: AIProvider = 'auto',
  config?: Omit<AIProviderConfig, 'provider'>,
): Promise<AIProviderInterface> {
  // Check if any API key is available first
  if (!hasAnyAPIKey() && !config?.apiKey) {
    showAPIKeyHelp()
    throw new Error('API key required')
  }

  // If specific provider is requested, use it (even if auto-detection would choose different)
  if (preferredProvider !== 'auto') {
    const apiKey = config?.apiKey || getAPIKey(preferredProvider)

    if (!apiKey) {
      const providerName = preferredProvider === 'openai' ? 'OpenAI' : 'Anthropic Claude'
      const envVar = preferredProvider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'
      showAPIKeyHelp()
      throw new Error(`${providerName} API key not found.\n` + `Please set ${envVar} in your environment or .env file.`)
    }

    // Create specific provider
    if (preferredProvider === 'openai') {
      try {
        const { OpenAIClient } = await import('./openai-provider.js')
        return await OpenAIClient.create(apiKey, config?.model)
      } catch (error: any) {
        if (error.message?.includes('not installed')) {
          throw error
        }
        throw new Error(
          'OpenAI provider requires "openai" package. Install it with:\n' +
            '  npm install openai\n' +
            'Or use Claude provider instead.\n' +
            `Error: ${error.message}`,
        )
      }
    } else {
      // Claude
      const { ClaudeClient } = await import('./claude.js')
      return ClaudeClient.create(apiKey, config?.model)
    }
  }

  // Auto-detection logic
  const provider = detectAIProvider()
  const apiKey = config?.apiKey || getAPIKey(provider)

  if (!apiKey) {
    showAPIKeyHelp()
    throw new Error('API key required')
  }

  switch (provider) {
    case 'openai':
      try {
        const { OpenAIClient } = await import('./openai-provider.js')
        return await OpenAIClient.create(apiKey, config?.model)
      } catch (error: any) {
        if (error.message?.includes('not installed')) {
          throw error
        }
        throw new Error(
          'OpenAI provider requires "openai" package. Install it with:\n' +
            '  npm install openai\n' +
            'Or use Claude provider instead.\n' +
            `Error: ${error.message}`,
        )
      }
    case 'claude':
      const { ClaudeClient } = await import('./claude.js')
      return ClaudeClient.create(apiKey, config?.model)
    default:
      throw new Error(`Unsupported AI provider: ${provider}`)
  }
}
