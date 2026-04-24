import type { DesignSystemConfig } from '@getcoherent/core'

/**
 * Lightweight prompt for plan-only phase — returns only page names/routes, no pageCode.
 * ~500 tokens vs ~3000+ for the full prompt.
 */
export function buildPlanOnlyPrompt(message: string, config: DesignSystemConfig): string {
  return `You are a web app planner. Given the user's request, determine which pages need to be created.

Existing pages: ${config.pages.map(p => `${p.name} (${p.route})`).join(', ') || '(none)'}

User Request: "${message}"

Return ONLY a JSON object with this structure (no pageCode, no sections, no content):
{
  "appName": "Extracted App Name",
  "requests": [
    { "type": "add-page", "target": "new", "changes": { "id": "page-id", "name": "Page Name", "route": "/page-route" } }
  ],
  "navigation": {
    "type": "header"
  }
}

Rules:
- appName: Extract the app/product name from the user's request if mentioned (e.g. "app called TaskFlow" → "TaskFlow", "build a CRM" → "CRM"). If no name is mentioned, omit this field.
- Use kebab-case for id and route
- Route must start with /
- Keep response under 500 tokens
- Do NOT include pageCode, sections, or any other fields
- Navigation type: Detect from user's request and include in response:
  * "sidebar" — if user mentions sidebar, side menu, left panel, admin panel, or app has 6+ main sections
  * "header" — if user mentions top navigation, header nav, or app is simple (< 6 sections). This is the default.
  * "both" — if complex multi-level app needs both header and sidebar navigation
- Include ALL pages the user explicitly requested
- ALSO include logically related pages that a real app would need. For example:
  * If there is a catalog/listing page, add a detail page (e.g. /products → /products/[id])
  * If there is login, also add registration and forgot-password (and vice versa)
  * If there is a dashboard, consider adding settings and/or profile pages
  * If there is a blog/news listing, add an article/post detail page
  * Think about what pages users would naturally navigate to from the requested pages`
}
