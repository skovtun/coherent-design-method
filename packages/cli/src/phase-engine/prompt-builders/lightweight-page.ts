import { getDesignQualityForType } from '../../agents/design-constraints.js'

export function buildLightweightPagePrompt(
  pageName: string,
  route: string,
  styleContext: string,
  sharedComponentsSummary?: string,
  pageType?: 'marketing' | 'app' | 'auth',
  tieredComponentsPrompt?: string,
  reusePlanDirective?: string,
): string {
  const designConstraints = pageType ? getDesignQualityForType(pageType) : ''
  const sharedNote =
    reusePlanDirective ||
    tieredComponentsPrompt ||
    (sharedComponentsSummary ? `Available shared components:\n${sharedComponentsSummary}` : '')
  return [
    `Generate complete pageCode for a page called "${pageName}" at route "${route}".`,
    `Output valid TSX with a default export React component.`,
    `Use shadcn/ui components (import from @/components/ui/*). Use Tailwind CSS semantic tokens only.`,
    pageType ? `PAGE TYPE: ${pageType}` : '',
    designConstraints,
    styleContext ? `Follow this style context:\n${styleContext}` : '',
    sharedNote,
  ]
    .filter(Boolean)
    .join('\n\n')
}
