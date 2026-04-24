/**
 * Modifier Agent
 *
 * AI agent that handles incremental modifications with component reuse.
 * Parses natural language into structured ModificationRequest.
 */

import chalk from 'chalk'
import type { ModificationRequest, ComponentSpec } from '@getcoherent/core'
import { ComponentManager } from '@getcoherent/core'
import { createAIProvider, type AIProvider } from '../utils/ai-provider.js'
import { expandPageRequest } from './page-templates.js'
import { preParseDestructive } from './destructive-preparser.js'
import {
  buildPlanOnlyPrompt,
  buildComponentRegistry,
  buildModificationPrompt,
  buildLightweightPagePrompt,
} from '../phase-engine/prompt-builders/index.js'

// Re-export for split-generator.ts + split-generator.test.ts (chat zero-change).
export { buildLightweightPagePrompt }

export interface ModificationContext {
  config: import('@getcoherent/core').DesignSystemConfig
  componentManager: ComponentManager
}

/**
 * Parse natural language modification request
 */
export interface ParseModificationResult {
  requests: ModificationRequest[]
  uxRecommendations?: string
  navigation?: { type: string }
}

export interface ParseModificationOptions {
  sharedComponentsSummary?: string
  tieredComponentsPrompt?: string
  reusePlanDirective?: string
  planOnly?: boolean
  lightweight?: boolean
  pageSections?: string[]
  projectRoot?: string
  /**
   * Optional AbortSignal — wires through to the provider SDK so a timeout or
   * user interrupt actually kills the in-flight HTTP request instead of just
   * ignoring its response.
   */
  signal?: AbortSignal
}

export async function parseModification(
  message: string,
  context: ModificationContext,
  provider: AIProvider = 'auto',
  options?: ParseModificationOptions,
): Promise<ParseModificationResult> {
  // Deterministic destructive pre-parser — intercept "delete X page" BEFORE
  // touching the LLM. AI was misinterpreting these ~30% of the time even
  // after RULE 4 in prompt (PJ-009). Skip the LLM entirely for clear patterns.
  // Returns null when regex fires but no target resolves to a real page — in
  // that case we fall through to the LLM rather than emit a broken request.
  if (!options?.planOnly && !options?.lightweight) {
    const preParsed = preParseDestructive(message, context.config)
    if (preParsed) {
      console.log(chalk.dim(`  [pre-parser] ${preParsed.reason}`))
      return { requests: preParsed.requests, uxRecommendations: undefined }
    }
  }

  const ai = await createAIProvider(provider)

  if (options?.planOnly) {
    const prompt = buildPlanOnlyPrompt(message, context.config)
    const raw = await ai.parseModification(prompt, options?.signal ? { signal: options.signal } : undefined)
    const requestsArray = Array.isArray(raw) ? raw : (raw?.requests ?? [])
    const navigation = !Array.isArray(raw) && raw?.navigation ? (raw.navigation as { type: string }) : undefined
    return { requests: requestsArray as ModificationRequest[], uxRecommendations: undefined, navigation }
  }

  if (options?.lightweight) {
    const raw = await ai.parseModification(message, options?.signal ? { signal: options.signal } : undefined)
    const requestsArray = Array.isArray(raw) ? raw : (raw?.requests ?? [])
    return { requests: requestsArray as ModificationRequest[], uxRecommendations: undefined }
  }

  const componentRegistry = buildComponentRegistry(context.componentManager)

  let enhancedMessage = message
  let isExpandedPageRequest = false

  const isAddPage = /add|create|make.*page/i.test(message)
  if (isAddPage) {
    const pageNameMatch = message.match(/(?:add|create|make)\s+(?:a\s+)?(\w+)\s+page/i)
    if (pageNameMatch) {
      const pageName = pageNameMatch[1]
      enhancedMessage = expandPageRequest(pageName, message)
      if (enhancedMessage !== message) {
        isExpandedPageRequest = true
        console.log(chalk.cyan('💡 Expanding request with best practices...'))
      }
    }
  }

  const prompt = buildModificationPrompt(enhancedMessage, context.config, componentRegistry, {
    isExpandedPageRequest,
    sharedComponentsSummary: options?.sharedComponentsSummary,
    tieredComponentsPrompt: options?.tieredComponentsPrompt,
    reusePlanDirective: options?.reusePlanDirective,
    pageSections: options?.pageSections,
    projectRoot: options?.projectRoot,
  })

  const raw = await ai.parseModification(prompt, options?.signal ? { signal: options.signal } : undefined)
  const requestsArray = Array.isArray(raw) ? raw : (raw?.requests ?? [])
  const uxRecommendations = Array.isArray(raw)
    ? undefined
    : raw?.uxRecommendations && String(raw.uxRecommendations).trim()
      ? String(raw.uxRecommendations)
      : undefined

  const requests = await checkComponentReuse(requestsArray as ModificationRequest[], context.componentManager)
  return { requests, uxRecommendations }
}

/**
 * Check component registry for reuse opportunities
 */
async function checkComponentReuse(
  requests: ModificationRequest[],
  componentManager: ComponentManager,
): Promise<ModificationRequest[]> {
  const enhanced: ModificationRequest[] = []

  for (const request of requests) {
    if (request.type === 'add-component') {
      const componentSpec = extractComponentSpec(request.changes)
      const requestedId = (request.changes as Record<string, unknown>)?.id as string | undefined
      const existing = componentManager.findBestMatch(componentSpec)

      if (existing && requestedId && existing.id === requestedId) {
        enhanced.push({
          type: 'modify-component',
          target: existing.id,
          changes: request.changes,
          reason: `${request.reason || ''} (Reusing existing component: ${existing.name})`,
        })
      } else {
        enhanced.push(request)
      }
    } else if (request.type === 'add-page') {
      // Check if page components exist in registry
      const sections = request.changes.sections || []
      const missingComponents: string[] = []

      for (const section of sections) {
        if (section.componentId) {
          const component = componentManager.read(section.componentId)
          if (!component) {
            missingComponents.push(section.componentId)
          }
        }
      }

      if (missingComponents.length > 0) {
        // Try to find similar components
        for (const missingId of missingComponents) {
          const spec: ComponentSpec = {
            name: missingId,
          }
          const match = componentManager.findBestMatch(spec)
          if (match) {
            // Update section to use existing component
            const section = sections.find((s: any) => s.componentId === missingId)
            if (section) {
              section.componentId = match.id
            }
          }
        }
      }

      enhanced.push(request)
    } else {
      enhanced.push(request)
    }
  }

  return enhanced
}

/**
 * Extract ComponentSpec from modification changes
 */
function extractComponentSpec(changes: Record<string, any>): ComponentSpec {
  return {
    name: changes.name,
    category: changes.category,
    source: changes.source,
    shadcnComponent: changes.shadcnComponent,
    baseClassName: changes.baseClassName,
    requiredVariants: changes.variants?.map((v: any) => v.name),
    requiredSizes: changes.sizes?.map((s: any) => s.name),
  }
}
