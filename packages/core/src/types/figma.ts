/**
 * Figma import types (Story 3.8–3.12).
 * Intermediate representation between raw Figma API response and Coherent app.
 */

/** Raw Figma API file response (minimal shape we consume). */
export interface FigmaFileResponse {
  name: string
  lastModified?: string
  version?: string
  document: FigmaDocumentNode
  components?: Record<string, FigmaComponentMeta>
  componentSets?: Record<string, unknown>
  styles?: Record<string, FigmaStyleMeta>
  schemaVersion?: number
}

export interface FigmaDocumentNode {
  id: string
  name: string
  type: 'DOCUMENT'
  children?: FigmaNode[]
}

/** Generic node in Figma tree (frame, component instance, text, etc.). */
export interface FigmaNode {
  id: string
  name: string
  type: string
  visible?: boolean
  children?: FigmaNode[]
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL'
  itemSpacing?: number
  paddingLeft?: number
  paddingRight?: number
  paddingTop?: number
  paddingBottom?: number
  primaryAxisSizingMode?: string
  counterAxisSizingMode?: string
  fills?: Array<{ type: string; color?: FigmaRgba }>
  strokes?: unknown[]
  effects?: unknown[]
  style?: { fontFamily?: string; fontSize?: number; fontWeight?: number }
  characters?: string
  componentId?: string
  componentProperties?: Record<string, unknown>
}

export interface FigmaRgba {
  r: number
  g: number
  b: number
  a: number
}

export interface FigmaComponentMeta {
  key: string
  name: string
  description?: string
}

export interface FigmaStyleMeta {
  name: string
  styleType: 'FILL' | 'TEXT' | 'EFFECT'
  description?: string
}

/** Our intermediate data (output of FigmaParser, input to token/component/page extractors). */
export interface FigmaIntermediateData {
  fileName: string
  fileKey: string
  pages: FigmaPageData[]
  components: FigmaComponentData[]
  colorStyles: FigmaColorStyle[]
  textStyles: FigmaTextStyle[]
  effectStyles: FigmaEffectStyle[]
}

export interface FigmaPageData {
  id: string
  name: string
  /** Route segment (e.g. "dashboard", "pricing"). "Home" → "" for root. */
  route: string
  children: FigmaNode[]
  layout?: FigmaLayout
}

export interface FigmaLayout {
  layoutMode: 'NONE' | 'HORIZONTAL' | 'VERTICAL'
  itemSpacing: number
  paddingLeft: number
  paddingRight: number
  paddingTop: number
  paddingBottom: number
}

export interface FigmaComponentData {
  id: string
  key: string
  name: string
  description?: string
  /** Resolved node tree for this component (from file.document). */
  node?: FigmaNode
  variants?: FigmaVariant[]
  properties?: FigmaProperty[]
  layout?: FigmaLayout
}

export interface FigmaVariant {
  name: string
  value: string
}

export interface FigmaProperty {
  name: string
  type: string
  value: string | number | boolean
}

export interface FigmaColorStyle {
  id: string
  name: string
  color: FigmaRgba
}

export interface FigmaTextStyle {
  id: string
  name: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  lineHeight?: number
}

export interface FigmaEffectStyle {
  id: string
  name: string
  type: 'DROP_SHADOW' | 'INNER_SHADOW'
  radius?: number
  offset?: { x: number; y: number }
  color?: FigmaRgba
}
