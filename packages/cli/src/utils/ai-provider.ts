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

/**
 * Extract the first complete, balanced JSON value (object or array) from a
 * model response, tolerating leading prose and — critically — trailing content.
 *
 * Sonnet 5 sometimes emits valid JSON followed by extra text: a ```tsx code
 * block, a prose note, or a second object. `JSON.parse` on the whole string
 * then throws "Unexpected non-whitespace character after JSON", and a strict
 * consumer discards a page it actually produced. It also sometimes wraps the
 * JSON in a ```json fence. This scanner strips a leading fence, finds the first
 * `{`/`[`, and returns the substring up to its matching close, respecting
 * strings and escapes so braces inside string literals don't miscount.
 *
 * Returns the trimmed input unchanged when no JSON value is found (e.g. a raw
 * TSX response) so the caller's existing parse-error path still fires. Pure.
 */
export function extractFirstJson(text: string): string {
  let s = text.trim()
  if (s.startsWith('```')) {
    const nl = s.indexOf('\n')
    if (nl !== -1) s = s.slice(nl + 1)
    const fence = s.lastIndexOf('```')
    if (fence !== -1) s = s.slice(0, fence)
    s = s.trim()
  }

  const start = s.search(/[{[]/)
  if (start === -1) return s

  const open = s[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  // Unbalanced (e.g. truncated) — return from the first bracket so the caller
  // gets the most-complete fragment and its parse error is meaningful.
  return s.slice(start)
}

/**
 * Envelope keys that belong on a ModificationRequest itself, not inside its
 * `changes` payload.
 */
const REQUEST_ENVELOPE_KEYS = new Set(['type', 'target', 'reason', 'changes'])

/**
 * Normalize a parsed request to the `{ type, target, changes: {...} }` shape.
 *
 * Retired Sonnet 4 nested page fields under `changes`; Sonnet 5 frequently
 * FLATTENS them onto the request itself (`{ type, target, id, name, route,
 * pageCode, ... }`). Every consumer reads `request.changes.pageCode`, so a
 * flattened request looks empty ("no code") even when it carries a full page.
 * When `changes` is absent but non-envelope fields are present, rehome them
 * into `changes`. Already-nested requests pass through untouched. Pure.
 */
export function normalizeRequestShape(req: unknown): unknown {
  if (!req || typeof req !== 'object') return req
  const r = req as Record<string, unknown>
  if (r.changes !== undefined) return req
  const changes: Record<string, unknown> = {}
  const envelope: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(r)) {
    if (REQUEST_ENVELOPE_KEYS.has(k)) envelope[k] = v
    else changes[k] = v
  }
  if (Object.keys(changes).length === 0) return req
  return { ...envelope, changes }
}

/**
 * Options passed to every AI provider method call.
 *
 * Currently only carries an AbortSignal so callers can cancel in-flight
 * requests (used by `withAbortableTimeout` to kill a hung LLM call and avoid
 * leaking a background HTTP request + tokens).
 */
export interface AIRequestOptions {
  signal?: AbortSignal
}

export interface AIProviderInterface {
  generateConfig(discovery: DiscoveryResult): Promise<DesignSystemConfig>
  parseModification(prompt: string, options?: AIRequestOptions): Promise<ParseModificationOutput>
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
