import { z } from 'zod'

export const URL_EXTRACT_SCHEMA_VERSION = '1' as const

export const ConfidenceSchema = z.enum(['high', 'medium', 'low'])
export type Confidence = z.infer<typeof ConfidenceSchema>

const Hex = z.string().regex(/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/)
const Px = z.string().regex(/^-?\d+(?:\.\d+)?px$/)
const Ms = z.string().regex(/^-?\d+(?:\.\d+)?ms$/)

export const ExtractedColorTokenSchema = z.object({
  hex: Hex,
  role: z.enum(['brand', 'accent', 'neutral', 'semantic', 'text', 'border', 'background']).optional(),
  usage: z.string().optional(),
})
export type ExtractedColorToken = z.infer<typeof ExtractedColorTokenSchema>

export const FontFaceSchema = z.object({
  family: z.string(),
  weight: z.number().int().min(100).max(950).optional(),
  style: z.enum(['normal', 'italic']).optional(),
})

export const TypeStepSchema = z.object({
  role: z.enum(['display', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body', 'small', 'code']),
  fontSize: z.string(),
  lineHeight: z.string().optional(),
  fontWeight: z.number().int().optional(),
  letterSpacing: z.string().optional(),
  fontFamily: z.string().optional(),
  sample: z.string().optional(),
})
export type TypeStep = z.infer<typeof TypeStepSchema>

export const ExtractedSpacingTokenSchema = z.object({ name: z.string().optional(), px: z.number() })
export const ExtractedRadiusTokenSchema = z.object({ name: z.string().optional(), px: z.number() })

export const ShadowTokenSchema = z.object({
  name: z.string().optional(),
  value: z.string(),
  intensity: z.enum(['xs', 'sm', 'md', 'lg', 'xl']).optional(),
})

export const MotionTokenSchema = z.object({
  duration: Ms,
  easing: z.string(),
  property: z.string().optional(),
})
export type MotionToken = z.infer<typeof MotionTokenSchema>

export const SolidBgTokenSchema = z.object({
  hex: Hex,
  role: z.enum(['page', 'section', 'card', 'elevated']).optional(),
})

export const GradientStopSchema = z.object({ color: z.string(), position: z.string().optional() })
export const GradientTokenSchema = z.object({
  kind: z.enum(['linear', 'radial', 'conic']),
  angle: z.string().optional(),
  center: z.string().optional(),
  stops: z.array(GradientStopSchema),
  raw: z.string(),
})
export type GradientToken = z.infer<typeof GradientTokenSchema>

export const PatternTokenSchema = z.object({
  kind: z.enum(['noise', 'dot', 'grid', 'svg', 'unknown']),
  raw: z.string(),
})

export const BorderTokenSchema = z.object({
  width: Px,
  color: z.string(),
  style: z.enum(['solid', 'dashed', 'dotted', 'double']).default('solid'),
  role: z.enum(['subtle', 'strong', 'focus']).optional(),
})

export const ZIndexEntrySchema = z.object({ layer: z.string(), z: z.number().int() })

export const FocusRingSchema = z.object({
  outline: z.string(),
  outlineOffset: z.string().optional(),
  boxShadow: z.string().optional(),
})

const LinkStyleSchema = z.object({
  color: z.string().optional(),
  textDecoration: z.string().optional(),
  fontWeight: z.number().int().optional(),
})
export const LinkStatesSchema = z.object({
  default: LinkStyleSchema,
  hover: LinkStyleSchema,
  visited: LinkStyleSchema.optional(),
})

const ControlStateSchema = z.object({
  background: z.string().optional(),
  color: z.string().optional(),
  border: z.string().optional(),
  outline: z.string().optional(),
  opacity: z.number().optional(),
})
const ControlMatrixSchema = z.object({
  default: ControlStateSchema,
  hover: ControlStateSchema.optional(),
  focus: ControlStateSchema.optional(),
  active: ControlStateSchema.optional(),
  disabled: ControlStateSchema.optional(),
})
export const FormControlStatesSchema = z.object({
  input: ControlMatrixSchema.optional(),
  button: ControlMatrixSchema.optional(),
  select: ControlMatrixSchema.optional(),
})

export const BreakpointSchema = z.object({ name: z.string(), px: z.number().int() })
export const BreakpointsSchema = z.object({
  strategy: z.enum(['mobile-first', 'desktop-first', 'unknown']),
  values: z.array(BreakpointSchema),
})

export const ContainerWidthSchema = z.object({
  name: z.string(),
  max: z.string(),
  role: z.enum(['page', 'prose', 'media', 'form']).optional(),
})

export const IconStyleSchema = z.object({
  kind: z.enum(['filled', 'outline', 'duotone', 'mixed', 'unknown']),
  commonSize: z.number().int().optional(),
  weight: z.number().optional(),
})

export const GlassmorphismSchema = z.object({
  backdropFilter: z.string(),
  samples: z.array(z.object({ blur: z.string(), context: z.string().optional() })),
})

export const VoiceSampleSchema = z.object({
  source: z.enum(['hero', 'cta', 'body', 'meta-description']),
  text: z.string(),
})
export const VoiceSchema = z.object({
  tone: z.array(z.string()),
  samples: z.array(VoiceSampleSchema),
})

export const DensitySchema = z.enum(['compact', 'comfortable', 'spacious'])

export const CategoryConfidenceSchema = z.object({
  level: ConfidenceSchema,
  reasoning: z.string().optional(),
})

const CategoryKeySchema = z.enum([
  'color',
  'typography',
  'spacing',
  'radius',
  'shadows',
  'motion',
  'backgrounds',
  'gradients',
  'patterns',
  'glassmorphism',
  'zIndex',
  'focusRings',
  'linkStates',
  'formControlStates',
  'breakpoints',
  'containerWidths',
  'borderStyles',
  'iconStyle',
  'voice',
  'density',
])
export type CategoryKey = z.infer<typeof CategoryKeySchema>

export const ExtractedAtmosphereSchema = z.object({
  schemaVersion: z.literal(URL_EXTRACT_SCHEMA_VERSION),
  source: z.object({
    url: z.string().url(),
    capturedAt: z.string(),
    mode: z.enum(['light', 'dark', 'cream']).default('light'),
    finalUrl: z.string().url().optional(),
    title: z.string().optional(),
    metaDescription: z.string().optional(),
  }),
  summary: z.string().optional(),
  colors: z.array(ExtractedColorTokenSchema),
  typography: z.object({
    families: z.array(FontFaceSchema),
    scale: z.array(TypeStepSchema),
    bodyLineHeight: z.string().optional(),
  }),
  spacing: z.array(ExtractedSpacingTokenSchema),
  radius: z.array(ExtractedRadiusTokenSchema),
  shadows: z.array(ShadowTokenSchema),
  motion: z.object({ tokens: z.array(MotionTokenSchema) }),
  backgrounds: z.object({
    solid: z.array(SolidBgTokenSchema),
    roles: z.object({
      page: z.string().optional(),
      section: z.string().optional(),
      card: z.string().optional(),
      elevated: z.string().optional(),
    }),
  }),
  gradients: z.array(GradientTokenSchema),
  patterns: z.array(PatternTokenSchema),
  glassmorphism: GlassmorphismSchema.nullable(),
  zIndexScale: z.array(ZIndexEntrySchema),
  focusRings: z.array(FocusRingSchema),
  linkStates: LinkStatesSchema,
  formControlStates: FormControlStatesSchema,
  breakpoints: BreakpointsSchema,
  containerWidths: z.array(ContainerWidthSchema),
  borderStyles: z.array(BorderTokenSchema),
  iconStyle: IconStyleSchema,
  voice: VoiceSchema,
  density: DensitySchema,
  confidence: z.object({
    overall: ConfidenceSchema,
    perCategory: z.record(CategoryKeySchema, CategoryConfidenceSchema),
  }),
  missing: z.array(CategoryKeySchema),
})
export type ExtractedAtmosphere = z.infer<typeof ExtractedAtmosphereSchema>

export const ExtractedDesignTokensSchema = ExtractedAtmosphereSchema.pick({
  colors: true,
  typography: true,
  spacing: true,
  radius: true,
  shadows: true,
  motion: true,
  backgrounds: true,
  gradients: true,
  patterns: true,
  glassmorphism: true,
  zIndexScale: true,
  focusRings: true,
  linkStates: true,
  formControlStates: true,
  breakpoints: true,
  containerWidths: true,
  borderStyles: true,
  iconStyle: true,
})
export type ExtractedDesignTokens = z.infer<typeof ExtractedDesignTokensSchema>

export interface HeroDetection {
  text: string | null
  fontSize: number | null
  source: 'h1' | 'largest-visible-text' | 'multimodal-llm' | 'none'
  selector?: string
}

export interface CapturedSnapshot {
  url: string
  finalUrl: string
  capturedAt: string
  title: string
  metaDescription?: string
  mode: 'light' | 'dark' | 'cream'
  screenshotPng: Buffer | null
  domHtml: string
  computedStyles: ComputedStyleSample[]
  hero: HeroDetection
  copyText: string
  mediaQueries: string[]
  loadTimeMs: number
}

export interface ComputedStyleSample {
  selector: string
  role:
    | 'body'
    | 'page'
    | 'section'
    | 'card'
    | 'h1'
    | 'h2'
    | 'h3'
    | 'h4'
    | 'h5'
    | 'h6'
    | 'p'
    | 'a'
    | 'button-primary'
    | 'button-secondary'
    | 'input'
    | 'select'
    | 'icon'
    | 'footer'
    | 'nav'
  styles: Record<string, string>
  pseudo?: 'hover' | 'focus' | 'focus-visible' | 'active' | 'visited' | 'disabled'
}

export interface ExtractOptions {
  timeoutMs?: number
  scrollGraceMs?: number
  /** When true (default), fetches robots.txt and aborts if the target path is disallowed. */
  honorRobotsTxt?: boolean
  /** Override robots.txt check (for tests / custom UA). Default: defaultRobotsCheck. */
  robotsCheck?: (url: string) => Promise<{ allowed: boolean; reason: string; matchedRule?: string }>
  llmCall?: (input: SemanticLlmInput) => Promise<SemanticLlmOutput>
  capture?: (url: string, opts: ExtractOptions) => Promise<CapturedSnapshot>
  ssrfGuard?: (url: string) => Promise<void> | void
}

export interface SemanticLlmInput {
  url: string
  copyText: string
  screenshotBase64?: string
  deterministic: ExtractedDesignTokens
  hero: HeroDetection
  metaDescription?: string
}

export interface SemanticLlmOutput {
  summary: string
  colorRoles: { hex: string; role: 'brand' | 'accent' | 'neutral' | 'semantic' | 'text' | 'border' | 'background' }[]
  voice: { tone: string[]; samples: { source: 'hero' | 'cta' | 'body' | 'meta-description'; text: string }[] }
  density: 'compact' | 'comfortable' | 'spacious'
  perCategoryConfidence: Partial<Record<CategoryKey, { level: Confidence; reasoning?: string }>>
}
