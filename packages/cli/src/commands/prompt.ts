/**
 * `coherent prompt` — emit the structured constraint bundle that `coherent chat`
 * would send to the AI provider, without calling any API.
 *
 * Foundation for skill-mode distribution: a Claude Code skill reads this output
 * and feeds it to the user's own Claude (running in-session, on their
 * subscription), so generation happens inside the user's session, fully within
 * Anthropic's Terms of Service. No API key required on the Coherent side —
 * Coherent contributes constraints + validation, not tokens.
 *
 * Three output formats:
 *   - `markdown` (default): human + LLM-readable sections with ## headings.
 *   - `json`: machine-readable — useful for wiring into other tools.
 *   - `plain`: flat text dump (every constraint concatenated), closest to what
 *     the legacy prompt-assembly code produces.
 */

import chalk from 'chalk'
import {
  DESIGN_THINKING,
  CORE_CONSTRAINTS,
  DESIGN_QUALITY_COMMON,
  VISUAL_DEPTH,
  INTERACTION_PATTERNS,
  getDesignQualityForType,
  selectContextualRules,
} from '../agents/design-constraints.js'
import { pickGoldenPatterns } from '../agents/golden-patterns.js'
import { getAtmospherePreset, listAtmospherePresets } from './chat/atmosphere-presets.js'
import { renderAtmosphereDirective } from './chat/plan-generator.js'

type OutputFormat = 'markdown' | 'json' | 'plain'

const AUTH_INTENT_PATTERN =
  /\b(?:login|log[- ]?in|register|sign[- ]?up|sign[- ]?in|forgot[- ]?password|reset[- ]?password|auth|oauth)\b/i
const MARKETING_INTENT_PATTERN =
  /\b(?:landing|pricing|features?|about|blog|contact|hero|marketing|home[- ]?page|testimonials?|faq)\b/i

/**
 * Intent-string page type inference. Distinct from `inferPageTypeFromRoute` —
 * that one parses URL slugs; here we scan natural-language intents.
 */
export function inferPageTypeFromIntent(intent: string): 'marketing' | 'app' | 'auth' {
  if (AUTH_INTENT_PATTERN.test(intent)) return 'auth'
  if (MARKETING_INTENT_PATTERN.test(intent)) return 'marketing'
  return 'app'
}

export interface PromptCommandOptions {
  pageType?: 'marketing' | 'app' | 'auth'
  atmosphere?: string
  format?: OutputFormat
  listAtmospheres?: boolean
  _throwOnError?: boolean
}

export async function promptCommand(intent: string | undefined, options: PromptCommandOptions = {}) {
  if (options.listAtmospheres) {
    const names = listAtmospherePresets()
    console.log(chalk.bold('\nAvailable atmosphere presets:\n'))
    for (const name of names) {
      const preset = getAtmospherePreset(name)!
      console.log(`  ${chalk.cyan(name.padEnd(20))} ${chalk.dim(preset.moodPhrase)}`)
    }
    console.log(chalk.dim(`\n  Usage: coherent prompt "your intent" --atmosphere <name>\n`))
    return
  }

  if (!intent || !intent.trim()) {
    console.error(chalk.red('\n❌ No intent provided. Use: coherent prompt "your request"\n'))
    console.log(chalk.dim('   Example: coherent prompt "build a project dashboard" --atmosphere premium-focused\n'))
    if (options._throwOnError) throw new Error('No intent provided')
    process.exit(1)
  }

  let atmosphereValue: ReturnType<typeof getAtmospherePreset>
  if (options.atmosphere) {
    atmosphereValue = getAtmospherePreset(options.atmosphere)
    if (!atmosphereValue) {
      const names = listAtmospherePresets().join(', ')
      console.error(chalk.red(`\n❌ Unknown atmosphere preset: "${options.atmosphere}"`))
      console.log(chalk.dim(`   Available: ${names}`))
      console.log(chalk.dim(`   See all: coherent prompt --list-atmospheres\n`))
      if (options._throwOnError) throw new Error(`Unknown atmosphere: ${options.atmosphere}`)
      process.exit(1)
    }
  }

  const pageType = options.pageType ?? inferPageTypeFromIntent(intent)
  const format = options.format ?? 'markdown'

  const blocks = {
    designThinking: DESIGN_THINKING,
    coreConstraints: CORE_CONSTRAINTS,
    designQualityCommon: DESIGN_QUALITY_COMMON,
    designQualityForType: getDesignQualityForType(pageType),
    visualDepth: VISUAL_DEPTH,
    interactionPatterns: INTERACTION_PATTERNS,
    contextualRules: selectContextualRules(intent),
    goldenPatterns: pickGoldenPatterns(intent),
    atmosphereDirective: atmosphereValue ? renderAtmosphereDirective(atmosphereValue) : '',
  }

  if (format === 'json') {
    const payload = {
      intent,
      pageType,
      atmosphere: atmosphereValue ?? null,
      blocks,
      generationInstructions: buildGenerationInstructions(intent, pageType),
    }
    console.log(JSON.stringify(payload, null, 2))
    return
  }

  if (format === 'plain') {
    const concatenated = [
      `# Coherent constraints for: ${intent}`,
      `# Page type: ${pageType}`,
      atmosphereValue ? `# Atmosphere: ${options.atmosphere}` : '',
      '',
      blocks.designThinking,
      blocks.coreConstraints,
      blocks.designQualityCommon,
      blocks.designQualityForType,
      blocks.visualDepth,
      blocks.interactionPatterns,
      blocks.contextualRules,
      blocks.goldenPatterns,
      blocks.atmosphereDirective,
      '',
      buildGenerationInstructions(intent, pageType),
    ]
      .filter(Boolean)
      .join('\n\n')
    console.log(concatenated)
    return
  }

  // Default markdown — structured for LLM + human consumption
  console.log(renderMarkdown(intent, pageType, atmosphereValue, options.atmosphere, blocks))
}

function buildGenerationInstructions(intent: string, pageType: 'marketing' | 'app' | 'auth'): string {
  return [
    `## Your task`,
    ``,
    `Generate Next.js TSX for: **${intent}**`,
    ``,
    `- Detected page type: \`${pageType}\``,
    `- Use Tailwind v4 **semantic tokens** (\`bg-background\`, \`text-foreground\`, \`bg-muted\`, \`text-primary\`) — NEVER raw colors (\`bg-gray-100\`, \`bg-white\`, \`text-blue-600\`).`,
    `- Use shadcn/ui components (import from \`@/components/ui/*\`).`,
    `- Accessibility: WCAG AA contrast, keyboard nav, aria-labels on icon-only buttons.`,
    `- Write files with the \`Write\` tool under \`app/\` (Next.js App Router).`,
    ``,
    `## After generation`,
    ``,
    `1. Run \`coherent check\` to validate (no API key needed — deterministic).`,
    `2. If issues reported, run \`coherent fix\` to auto-fix.`,
    `3. Repeat until \`coherent check\` is clean.`,
    ``,
    `Your output is measured by whether the final files pass \`coherent check\`, not just whether they look reasonable.`,
  ].join('\n')
}

function renderMarkdown(
  intent: string,
  pageType: 'marketing' | 'app' | 'auth',
  atmosphere: ReturnType<typeof getAtmospherePreset> | undefined,
  atmosphereName: string | undefined,
  blocks: {
    designThinking: string
    coreConstraints: string
    designQualityCommon: string
    designQualityForType: string
    visualDepth: string
    interactionPatterns: string
    contextualRules: string
    goldenPatterns: string
    atmosphereDirective: string
  },
): string {
  const parts: string[] = []

  parts.push(
    `# Coherent design constraints`,
    ``,
    `You are generating code that follows Coherent's design rules.`,
    ``,
    `- **Intent:** ${intent}`,
    `- **Page type:** \`${pageType}\` (${pageType === 'marketing' ? 'landing/spacious' : pageType === 'app' ? 'sidebar/data-dense' : 'centered-card/auth'})`,
    atmosphere
      ? `- **Atmosphere:** \`${atmosphereName}\` — ${atmosphere.moodPhrase}`
      : `- **Atmosphere:** (none specified — infer from intent)`,
    ``,
    `---`,
    ``,
    `## Design thinking (TIER 0 — mindset)`,
    ``,
    blocks.designThinking.trim(),
    ``,
    `---`,
    ``,
    `## Core constraints (TIER 1 — always apply)`,
    ``,
    blocks.coreConstraints.trim(),
    ``,
    `---`,
    ``,
    `## Design quality — common + page-type specific`,
    ``,
    blocks.designQualityCommon.trim(),
    ``,
    blocks.designQualityForType.trim(),
    ``,
    `---`,
    ``,
    `## Visual depth + disclosure`,
    ``,
    blocks.visualDepth.trim(),
    ``,
    `---`,
    ``,
    `## Interaction patterns`,
    ``,
    blocks.interactionPatterns.trim(),
    ``,
  )

  if (blocks.contextualRules.trim()) {
    parts.push(
      `---`,
      ``,
      `## Contextual rules (TIER 2 — matched by intent keywords)`,
      ``,
      blocks.contextualRules.trim(),
      ``,
    )
  }

  if (blocks.goldenPatterns.trim()) {
    parts.push(`---`, ``, `## Golden patterns (exemplars to mirror)`, ``, blocks.goldenPatterns.trim(), ``)
  }

  if (blocks.atmosphereDirective.trim()) {
    parts.push(`---`, ``, `## Atmosphere directive`, ``, blocks.atmosphereDirective.trim(), ``)
  }

  parts.push(`---`, ``, buildGenerationInstructions(intent, pageType))

  return parts.join('\n')
}
