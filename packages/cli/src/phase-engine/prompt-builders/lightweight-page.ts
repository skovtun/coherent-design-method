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
    // Output-shape lock: the wrapping system prompt asks for a JSON envelope, but
    // "Output valid TSX" tempts Sonnet 5 to return bare TSX outside it — which
    // fails JSON parsing and the page falls back to an empty template. Be explicit
    // that the TSX must live inside changes.pageCode of a single add-page request.
    `Return ONE add-page request as JSON; put the ENTIRE page as a default-export React component in its changes.pageCode string. Do NOT return bare TSX outside the JSON envelope.`,
    `Use shadcn/ui components (import from @/components/ui/*). Use Tailwind CSS semantic tokens only.`,
    pageType ? `PAGE TYPE: ${pageType}` : '',
    designConstraints,
    styleContext ? `Follow this style context:\n${styleContext}` : '',
    sharedNote,
  ]
    .filter(Boolean)
    .join('\n\n')
}
