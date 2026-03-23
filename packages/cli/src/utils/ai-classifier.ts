import { z } from 'zod'

const VALID_TYPES = ['layout', 'navigation', 'data-display', 'form', 'feedback', 'section', 'widget'] as const

interface ComponentSignature {
  name: string
  signature: string
}

interface ClassificationResult {
  name: string
  type: (typeof VALID_TYPES)[number]
  description: string
}

export function buildClassificationPrompt(components: ComponentSignature[]): string {
  const specs = components.map((c, i) => `${i + 1}. ${c.name}: ${c.signature}`).join('\n')
  return `Classify these React components into one of these types: ${VALID_TYPES.join(', ')}.

${specs}

Return JSON array: [{ "name": "...", "type": "...", "description": "one sentence" }]`
}

const ClassificationSchema = z.array(
  z.object({
    name: z.string(),
    type: z.string(),
    description: z.string().default(''),
  }),
)

export function parseClassificationResponse(response: string): ClassificationResult[] {
  const jsonMatch = response.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []

  const parsed = ClassificationSchema.safeParse(JSON.parse(jsonMatch[0]))
  if (!parsed.success) return []

  return parsed.data.map(item => ({
    name: item.name,
    type: VALID_TYPES.includes(item.type as (typeof VALID_TYPES)[number])
      ? (item.type as (typeof VALID_TYPES)[number])
      : 'section',
    description: item.description,
  }))
}

export async function classifyComponents(
  components: ComponentSignature[],
  aiCall: (prompt: string) => Promise<string>,
): Promise<ClassificationResult[]> {
  if (components.length === 0) return []
  const prompt = buildClassificationPrompt(components)
  const response = await aiCall(prompt)
  return parseClassificationResponse(response)
}
