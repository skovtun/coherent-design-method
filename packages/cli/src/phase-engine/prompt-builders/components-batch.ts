import { CORE_CONSTRAINTS, getDesignQualityForType } from '../../agents/design-constraints.js'
import type { ArchitecturePlan } from '../../commands/chat/plan-generator.js'

/**
 * Batch shared-component generation prompt — one AI call yields code for
 * every component in `plan.sharedComponents`. Falls back to per-component
 * prompts in the legacy `generateSharedComponentsFromPlan` path when the
 * batch parse fails; the per-component path is caller-orchestrated and
 * not reproduced here (lives in plan-generator.ts).
 *
 * Hardcodes 'app' page-type design rules — shared components live in
 * `components/shared/` and target app routes by convention.
 */
export function buildComponentsBatchPrompt(
  sharedComponents: ArchitecturePlan['sharedComponents'],
  styleContext: string,
): string {
  const componentSpecs = sharedComponents
    .map(
      c =>
        `- ${c.name}: ${c.description}. Props: ${c.props}. Type: ${c.type}. shadcn deps: ${c.shadcnDeps.join(', ') || 'none'}`,
    )
    .join('\n')

  const designRules = `${CORE_CONSTRAINTS}\n${getDesignQualityForType('app')}`

  return `Generate React components as separate files. For EACH component below, return an add-page request with name and pageCode fields.

Components to generate:
${componentSpecs}

Style context: ${styleContext || 'default'}

${designRules}

Requirements:
- Each component MUST use a NAMED export: \`export function ComponentName\` (NOT export default)
- Use shadcn/ui imports from @/components/ui/*
- Use Tailwind CSS classes matching the style context
- TypeScript with proper props interface
- Each component is a standalone file
- Icon props MUST use \`icon: React.ElementType\` (NOT React.ReactNode) and render as \`<Icon className="size-4" />\` where \`const Icon = icon\`. Lucide icons are forwardRef components, not elements.

Return JSON with { requests: [{ type: "add-page", changes: { name: "ComponentName", pageCode: "..." } }, ...] }`
}
