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
  const className = (pageName || 'Page').replace(/[^a-zA-Z0-9]/g, '') || 'Page'
  return [
    `Generate complete pageCode for a page called "${pageName}" at route "${route}".`,
    `Use shadcn/ui components (import from @/components/ui/*). Use Tailwind CSS semantic tokens only.`,
    pageType ? `PAGE TYPE: ${pageType}` : '',
    designConstraints,
    styleContext ? `Follow this style context:\n${styleContext}` : '',
    sharedNote,
    // Fenced-TSX output lock (same protocol as the anchor). Cramming a full page
    // into an escaped JSON string is unreliable for Sonnet 5, and "output TSX"
    // alone tempts it to return bare TSX that fails JSON parsing → empty page.
    // A JSON header + a real ```tsx fence is parsed by parseFencedTsxResponse.
    `## Output format (OVERRIDES the "return pageCode as a JSON string" instructions above)

Return a JSON header, a blank line, then the ENTIRE page as raw TSX in a \`\`\`tsx fenced block. The TSX goes in the fence ONLY — never inside the JSON:

\`\`\`
{ "type": "add-page", "target": "new", "changes": { "name": "${pageName}", "route": "${route}" } }
\`\`\`

\`\`\`tsx
export default function ${className}() {
  return <div>...</div>
}
\`\`\``,
  ]
    .filter(Boolean)
    .join('\n\n')
}
