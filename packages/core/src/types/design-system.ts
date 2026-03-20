/**
 * Design System Configuration Types
 *
 * This is the core type system for the entire Coherent project.
 * The DesignSystemConfig is the single source of truth for all UI generation.
 *
 * Philosophy:
 * - Config is machine-readable (not human prose like PRD)
 * - Changes to config cascade automatically through all components/pages
 * - Validation happens at config level via Zod schemas
 * - Config is versionable and git-friendly
 */

import { z } from 'zod'

// ============================================================================
// DESIGN TOKENS
// ============================================================================

/**
 * Color palette with semantic naming
 * Supports light/dark modes
 */
export const ColorTokenSchema = z.object({
  primary: z.string().regex(/^#[0-9A-F]{6}$/i, 'Must be valid hex color'),
  secondary: z.string().regex(/^#[0-9A-F]{6}$/i),
  accent: z
    .string()
    .regex(/^#[0-9A-F]{6}$/i)
    .optional(),
  success: z.string().regex(/^#[0-9A-F]{6}$/i),
  warning: z.string().regex(/^#[0-9A-F]{6}$/i),
  error: z.string().regex(/^#[0-9A-F]{6}$/i),
  info: z.string().regex(/^#[0-9A-F]{6}$/i),

  // Neutral palette (generated from base or explicit)
  background: z.string().regex(/^#[0-9A-F]{6}$/i),
  foreground: z.string().regex(/^#[0-9A-F]{6}$/i),
  muted: z.string().regex(/^#[0-9A-F]{6}$/i),
  border: z.string().regex(/^#[0-9A-F]{6}$/i),
})

export type ColorToken = z.infer<typeof ColorTokenSchema>

/**
 * Spacing scale (8pt grid system)
 */
export const SpacingTokenSchema = z.object({
  xs: z.string().default('0.25rem'), // 4px
  sm: z.string().default('0.5rem'), // 8px
  md: z.string().default('1rem'), // 16px
  lg: z.string().default('1.5rem'), // 24px
  xl: z.string().default('2rem'), // 32px
  '2xl': z.string().default('3rem'), // 48px
  '3xl': z.string().default('4rem'), // 64px
})

export type SpacingToken = z.infer<typeof SpacingTokenSchema>

/**
 * Typography scale
 */
export const TypographyTokenSchema = z.object({
  fontFamily: z.object({
    sans: z.string().default('Inter, system-ui, sans-serif'),
    mono: z.string().default('JetBrains Mono, monospace'),
  }),

  fontSize: z.object({
    xs: z.string().default('0.75rem'), // 12px
    sm: z.string().default('0.875rem'), // 14px
    base: z.string().default('1rem'), // 16px
    lg: z.string().default('1.125rem'), // 18px
    xl: z.string().default('1.25rem'), // 20px
    '2xl': z.string().default('1.5rem'), // 24px
    '3xl': z.string().default('1.875rem'), // 30px
    '4xl': z.string().default('2.25rem'), // 36px
  }),

  fontWeight: z.object({
    normal: z.number().default(400),
    medium: z.number().default(500),
    semibold: z.number().default(600),
    bold: z.number().default(700),
  }),

  lineHeight: z.object({
    tight: z.number().default(1.25),
    normal: z.number().default(1.5),
    relaxed: z.number().default(1.75),
  }),
})

export type TypographyToken = z.infer<typeof TypographyTokenSchema>

/**
 * Border radius tokens
 */
export const RadiusTokenSchema = z.object({
  none: z.string().default('0'),
  sm: z.string().default('0.25rem'),
  md: z.string().default('0.5rem'),
  lg: z.string().default('0.75rem'),
  xl: z.string().default('1rem'),
  full: z.string().default('9999px'),
})

export type RadiusToken = z.infer<typeof RadiusTokenSchema>

/**
 * All design tokens grouped
 */
export const DesignTokensSchema = z.object({
  colors: z.object({
    light: ColorTokenSchema,
    dark: ColorTokenSchema,
  }),
  spacing: SpacingTokenSchema,
  typography: TypographyTokenSchema,
  radius: RadiusTokenSchema,
})

export type DesignTokens = z.infer<typeof DesignTokensSchema>

// ============================================================================
// COMPONENTS
// ============================================================================

/**
 * Component variant definition
 * Each variant has a name and Tailwind classes
 */
export const ComponentVariantSchema = z.object({
  name: z.string(),
  className: z.string().default(''), // Tailwind classes only
  description: z.string().optional(),
})

export type ComponentVariant = z.infer<typeof ComponentVariantSchema>

/**
 * Component size definition
 */
export const ComponentSizeSchema = z.object({
  name: z.enum(['xs', 'sm', 'md', 'lg', 'xl']),
  className: z.string().default(''),
})

export type ComponentSize = z.infer<typeof ComponentSizeSchema>

/**
 * Component definition
 * Maps to a React component
 */
export const ComponentDefinitionSchema = z.object({
  // Identity
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Must be kebab-case'),
  name: z.string(), // PascalCase (e.g., "Button", "InputField")
  category: z.enum(['form', 'layout', 'navigation', 'feedback', 'data-display', 'overlay', 'typography']),

  // Source
  source: z.enum(['shadcn', 'custom']),
  shadcnComponent: z.string().optional(), // e.g., "button" if source is shadcn

  // Styling
  baseClassName: z.string(), // Base Tailwind classes
  variants: z.array(ComponentVariantSchema).default([]),
  sizes: z.array(ComponentSizeSchema).default([]),

  // Props
  defaultProps: z.record(z.any()).optional(),

  // Accessibility
  ariaLabel: z.string().optional(),
  ariaDescribedBy: z.string().optional(),

  // Usage tracking (for dependency management)
  usedInPages: z.array(z.string()).default([]),

  // Metadata
  description: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type ComponentDefinition = z.infer<typeof ComponentDefinitionSchema>

// ============================================================================
// PAGES
// ============================================================================

/**
 * Page section (e.g., Hero, Features, Pricing)
 */
export const PageSectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  componentId: z.string(), // Reference to ComponentDefinition.id
  props: z.record(z.any()).optional(),
  order: z.number(), // Display order
})

export type PageSection = z.infer<typeof PageSectionSchema>

// ============================================================================
// LAYOUT BLOCKS (reusable header/footer/banner across pages)
// ============================================================================

/**
 * Layout block — reusable chunk (header, footer, banner) shared across multiple pages.
 * When the block is updated (e.g. "add button to lb-header-main"), all pages that
 * reference it show the change.
 */
export const LayoutBlockDefinitionSchema = z.object({
  /** Unique id: kebab-case or generated (e.g. "lb-header-main", "lb-876") */
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Must be kebab-case'),
  /** Optional short numeric id for user-facing refs (e.g. "add button to id876" → numericId 876) */
  numericId: z.number().int().positive().optional(),
  /** Human-readable name (e.g. "Main Header", "Site Footer") */
  name: z.string(),
  /** Role for semantics and default placement */
  role: z.enum(['header', 'footer', 'banner', 'sidebar', 'custom']).default('custom'),
  /** Order when multiple blocks of same role exist (lower = earlier) */
  order: z.number().default(0),
  /** Structured content: sections (each can use a UI component + props) or raw markup hint for generator */
  sections: z.array(PageSectionSchema).default([]),
  /** Optional: custom JSX snippet (when generatedWithCode is true, generator may store last output) */
  generatedCode: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
})

export type LayoutBlockDefinition = z.infer<typeof LayoutBlockDefinitionSchema>

/**
 * Page layout type
 */
export const PageLayoutSchema = z.enum([
  'centered', // Single centered column
  'sidebar-left', // Sidebar on left, content on right
  'sidebar-right', // Content on left, sidebar on right
  'full-width', // No constraints
  'grid', // CSS Grid layout
])

export type PageLayout = z.infer<typeof PageLayoutSchema>

/**
 * Page definition
 */
/**
 * Structured analysis of a generated page's code (extracted post-generation, no AI call).
 */
export const PageAnalysisSchema = z
  .object({
    sections: z
      .array(
        z.object({
          name: z.string(),
          order: z.number(),
        }),
      )
      .optional(),
    componentUsage: z.record(z.string(), z.number()).optional(),
    iconCount: z.number().optional(),
    layoutPattern: z.string().optional(),
    hasForm: z.boolean().optional(),
    analyzedAt: z.string().optional(),
  })
  .optional()

export type PageAnalysis = z.infer<typeof PageAnalysisSchema>

export const PageDefinitionSchema = z.object({
  // Identity
  id: z
    .string()
    .transform(s =>
      s
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, ''),
    )
    .pipe(z.string().regex(/^[a-z][a-z0-9-]*$/, 'Must be kebab-case')),
  name: z.string(),
  route: z
    .string()
    .transform(r => (r.startsWith('/') ? r : `/${r}`))
    .pipe(z.string().regex(/^\/[a-z0-9\-/[\]]*$/, 'Must be a valid route (e.g. /page, /products/[id])')),

  // Layout
  layout: PageLayoutSchema,
  sections: z.array(PageSectionSchema).default([]),
  /** Optional: IDs of layout blocks to render around this page (e.g. ["lb-header-main", "lb-footer-main"]). Order = render order. */
  layoutBlockIds: z.array(z.string()).optional(),

  // Model-generated page: full page.tsx in request only; never stored. When true, PageGenerator is skipped.
  generatedWithPageCode: z.boolean().optional(),

  /** Post-generation code analysis: sections, component usage, layout pattern. */
  pageAnalysis: PageAnalysisSchema,

  // Metadata
  title: z.string(), // <title> tag
  description: z.string(), // <meta name="description">

  // Authentication
  requiresAuth: z.boolean().default(false),
  allowedRoles: z.array(z.string()).optional(),

  // SEO
  ogImage: z.string().url().optional(),
  noIndex: z.boolean().default(false),

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type PageDefinition = z.infer<typeof PageDefinitionSchema>

// ============================================================================
// NAVIGATION
// ============================================================================

/**
 * Navigation item — supports flat links and grouped dropdown menus.
 * Items with the same `group` value are rendered as a DropdownMenu.
 * Items with `children` render as a dropdown trigger with sub-items.
 */
export const NavigationItemSchema: z.ZodType<NavigationItem> = z.object({
  label: z.string(),
  route: z.string(),
  icon: z.string().optional(),
  requiresAuth: z.boolean().default(false),
  order: z.number(),
  group: z.string().optional(),
  children: z.lazy(() => z.array(NavigationItemSchema)).optional(),
})

export interface NavigationItem {
  label: string
  route: string
  icon?: string
  requiresAuth?: boolean
  order: number
  group?: string
  children?: NavigationItem[]
}

/**
 * Navigation configuration
 */
export const NavigationSchema = z.object({
  enabled: z.boolean().default(true),
  type: z.enum(['header', 'sidebar', 'both']).default('header'),
  items: z.array(NavigationItemSchema),
  logo: z
    .object({
      text: z.string().optional(),
      image: z.string().optional(),
    })
    .optional(),
})

export type Navigation = z.infer<typeof NavigationSchema>

// ============================================================================
// FEATURES
// ============================================================================

/**
 * Application features (authentication, payments, etc.)
 */
export const FeaturesSchema = z.object({
  authentication: z.object({
    enabled: z.boolean().default(false),
    provider: z.enum(['next-auth', 'clerk', 'supabase', 'custom']).optional(),
    strategies: z.array(z.enum(['email', 'google', 'github', 'magic-link'])).default([]),
  }),

  payments: z.object({
    enabled: z.boolean().default(false),
    provider: z.enum(['stripe', 'paddle', 'lemonsqueezy']).optional(),
  }),

  analytics: z.object({
    enabled: z.boolean().default(false),
    provider: z.enum(['google-analytics', 'plausible', 'posthog']).optional(),
  }),

  database: z.object({
    enabled: z.boolean().default(false),
    provider: z.enum(['prisma', 'drizzle', 'supabase']).optional(),
  }),

  stateManagement: z.object({
    enabled: z.boolean().default(false),
    provider: z.enum(['zustand', 'redux', 'jotai']).default('zustand'),
  }),
})

export type Features = z.infer<typeof FeaturesSchema>

// ============================================================================
// MAIN CONFIG
// ============================================================================

/**
 * Complete design system configuration
 * This is the single source of truth
 */
export const DesignSystemConfigSchema = z.object({
  // Metadata
  version: z.string().default('1.0.0'),
  coherentVersion: z.string().optional(), // CLI version that created this project
  frameworkVersions: z
    .object({
      next: z.string(),
      react: z.string(),
      tailwind: z.string(),
    })
    .optional(), // Framework versions used when project was created
  name: z.string(),
  description: z.string(),

  // Design tokens
  tokens: DesignTokensSchema,

  // Theme preferences
  theme: z.object({
    defaultMode: z.enum(['light', 'dark', 'system']).default('dark'),
    allowModeToggle: z.boolean().default(true),
  }),

  // Components registry
  components: z.array(ComponentDefinitionSchema),

  /** Reusable layout blocks (header, footer, etc.) shared across pages. Referenced by id in page.layoutBlockIds. */
  layoutBlocks: z.array(LayoutBlockDefinitionSchema).optional().default([]),

  // Pages
  pages: z.array(PageDefinitionSchema),

  // Navigation
  navigation: NavigationSchema.optional(),

  // Features
  features: FeaturesSchema,

  // Global settings
  settings: z.object({
    initialized: z.boolean().default(true),

    // Application type
    appType: z.enum(['multi-page', 'spa']).default('multi-page'),

    // Framework
    framework: z.enum(['next', 'react-spa']).default('next'),

    // Router (for SPA)
    router: z.enum(['react-router', 'tanstack-router']).optional(),

    // TypeScript
    typescript: z.boolean().default(true),

    // Styling
    cssFramework: z.enum(['tailwind', 'css-modules']).default('tailwind'),

    // Deployment
    deployTarget: z.enum(['vercel', 'netlify', 'cloudflare', 'self-hosted']).optional(),

    // Auto-scaffold linked pages (e.g. login → signup, forgot-password)
    autoScaffold: z.boolean().default(false),
  }),

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type DesignSystemConfig = z.infer<typeof DesignSystemConfigSchema>

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Modification request (from chat command)
 */
export interface ModificationRequest {
  type:
    | 'update-token'
    | 'add-component'
    | 'modify-component'
    | 'add-layout-block'
    | 'modify-layout-block'
    | 'add-page'
    | 'update-page'
    | 'update-navigation'
    | 'link-shared' // Story 2.11: replace inline block on target page with shared component (target=page, changes.sharedIdOrName, changes.blockHint?)
    | 'promote-and-link' // Story 2.11 B2: extract block from source page as shared, then link to source + targetPages (target=sourcePage, changes.blockHint, changes.componentName?, changes.targetPages[])
  target: string // ID of what to modify (component id, layout block id, page id, or page name/route for link-shared / source page for promote-and-link)
  changes: Record<string, any>
  reason?: string // Why this change is being made
}

/**
 * Modification result
 */
export interface ModificationResult {
  success: boolean
  modified: string[] // List of affected files/components
  config: DesignSystemConfig // Updated config
  message: string
  warnings?: string[]
}

/**
 * Component dependency graph node
 */
export interface ComponentDependency {
  componentId: string
  dependsOn: string[] // Other component IDs
  usedBy: string[] // Page IDs
}

/**
 * Criteria for searching components
 */
export interface ComponentCriteria {
  id?: string
  name?: string
  category?: ComponentDefinition['category']
  source?: ComponentDefinition['source']
  shadcnComponent?: string
  usedInPage?: string // Find components used in specific page
  hasVariant?: string // Find components with specific variant
  hasSize?: string // Find components with specific size
}

/**
 * Component specification for reuse checking
 */
export interface ComponentSpec {
  name?: string
  category?: ComponentDefinition['category']
  source?: ComponentDefinition['source']
  shadcnComponent?: string
  baseClassName?: string
  requiredVariants?: string[]
  requiredSizes?: string[]
}

/**
 * Discovery result (from init command)
 */
export interface DiscoveryResult {
  projectType: 'saas' | 'landing' | 'dashboard' | 'api-portal' | 'other'
  appType: 'multi-page' | 'spa'
  audience: string
  features: {
    authentication: boolean
    payments: boolean
    analytics: boolean
    database: boolean
    stateManagement: boolean
  }
  visualStyle: 'minimal' | 'corporate' | 'playful' | 'custom'
  primaryColor: string
  darkMode: boolean
  additionalRequirements?: string
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate entire config
 */
export function validateConfig(config: unknown): DesignSystemConfig {
  return DesignSystemConfigSchema.parse(config)
}

/**
 * Validate partial config (for updates)
 */
export function validatePartialConfig(config: unknown): Partial<DesignSystemConfig> {
  return DesignSystemConfigSchema.partial().parse(config)
}

/**
 * Check if a component ID exists in config
 */
export function componentExists(config: DesignSystemConfig, componentId: string): boolean {
  return config.components.some(c => c.id === componentId)
}

/**
 * Check if a page route exists
 */
export function pageRouteExists(config: DesignSystemConfig, route: string): boolean {
  return config.pages.some(p => p.route === route)
}

/**
 * Get component by ID
 */
export function getComponent(config: DesignSystemConfig, componentId: string): ComponentDefinition | undefined {
  return config.components.find(c => c.id === componentId)
}

/**
 * Get page by route
 */
export function getPage(config: DesignSystemConfig, route: string): PageDefinition | undefined {
  return config.pages.find(p => p.route === route)
}

// ============================================================================
// EXAMPLE CONFIG
// ============================================================================

/**
 * Example: Minimal valid config for Multi-page app
 */
export const EXAMPLE_MULTIPAGE_CONFIG: DesignSystemConfig = {
  version: '1.0.0',
  name: 'My Multi-page App',
  description: 'A beautiful multi-page application',

  tokens: {
    colors: {
      light: {
        primary: '#3B82F6',
        secondary: '#10B981',
        success: '#22C55E',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#3B82F6',
        background: '#FFFFFF',
        foreground: '#0F172A',
        muted: '#F1F5F9',
        border: '#E2E8F0',
      },
      dark: {
        primary: '#60A5FA',
        secondary: '#34D399',
        success: '#4ADE80',
        warning: '#FBBF24',
        error: '#F87171',
        info: '#60A5FA',
        background: '#0F172A',
        foreground: '#F1F5F9',
        muted: '#1E293B',
        border: '#334155',
      },
    },
    spacing: {
      xs: '0.25rem',
      sm: '0.5rem',
      md: '1rem',
      lg: '1.5rem',
      xl: '2rem',
      '2xl': '3rem',
      '3xl': '4rem',
    },
    typography: {
      fontFamily: {
        sans: 'Inter, system-ui, sans-serif',
        mono: 'JetBrains Mono, monospace',
      },
      fontSize: {
        xs: '0.75rem',
        sm: '0.875rem',
        base: '1rem',
        lg: '1.125rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '1.875rem',
        '4xl': '2.25rem',
      },
      fontWeight: {
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
      },
      lineHeight: {
        tight: 1.25,
        normal: 1.5,
        relaxed: 1.75,
      },
    },
    radius: {
      none: '0',
      sm: '0.25rem',
      md: '0.5rem',
      lg: '0.75rem',
      xl: '1rem',
      full: '9999px',
    },
  },

  theme: {
    defaultMode: 'dark',
    allowModeToggle: true,
  },

  components: [],
  layoutBlocks: [],
  pages: [],

  navigation: {
    enabled: true,
    type: 'header',
    items: [],
  },

  features: {
    authentication: { enabled: false, strategies: [] },
    payments: { enabled: false },
    analytics: { enabled: false },
    database: { enabled: false },
    stateManagement: { enabled: false, provider: 'zustand' },
  },

  settings: {
    initialized: true,
    appType: 'multi-page',
    framework: 'next',
    typescript: true,
    cssFramework: 'tailwind',
    autoScaffold: false,
  },

  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

/**
 * Example: SPA config
 */
export const EXAMPLE_SPA_CONFIG: DesignSystemConfig = {
  ...EXAMPLE_MULTIPAGE_CONFIG,
  name: 'My SPA',
  description: 'A beautiful single-page application',
  settings: {
    initialized: true,
    appType: 'spa',
    framework: 'react-spa',
    router: 'react-router',
    typescript: true,
    cssFramework: 'tailwind',
    autoScaffold: false,
  },
  features: {
    ...EXAMPLE_MULTIPAGE_CONFIG.features,
    stateManagement: {
      enabled: true,
      provider: 'zustand',
    },
  },
}
