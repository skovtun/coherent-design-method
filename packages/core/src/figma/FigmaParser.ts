/**
 * Parse raw Figma API response into FigmaIntermediateData (Story 3.8).
 */

import type {
  FigmaFileResponse,
  FigmaNode,
  FigmaIntermediateData,
  FigmaPageData,
  FigmaComponentData,
  FigmaColorStyle,
  FigmaTextStyle,
  FigmaEffectStyle,
  FigmaLayout,
  FigmaRgba,
} from '../types/figma.js'

function isDocument(node: FigmaNode): node is FigmaNode & { type: 'DOCUMENT' } {
  return node.type === 'DOCUMENT'
}

function isCanvas(node: FigmaNode): node is FigmaNode & { type: 'CANVAS' } {
  return node.type === 'CANVAS'
}

function isFrame(node: FigmaNode): node is FigmaNode & { type: 'FRAME' } {
  return node.type === 'FRAME'
}

function frameNameToRoute(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
  if (s === 'home' || s === 'index' || s === '') return ''
  return s
}

function nodeToLayout(node: FigmaNode): FigmaLayout | undefined {
  if (node.layoutMode && node.layoutMode !== 'NONE') {
    return {
      layoutMode: node.layoutMode,
      itemSpacing: node.itemSpacing ?? 0,
      paddingLeft: node.paddingLeft ?? 0,
      paddingRight: node.paddingRight ?? 0,
      paddingTop: node.paddingTop ?? 0,
      paddingBottom: node.paddingBottom ?? 0,
    }
  }
  return undefined
}

/**
 * Parse raw file response into our intermediate format.
 */
export function parseFigmaFileResponse(raw: unknown, fileKey: string): FigmaIntermediateData {
  const file = raw as FigmaFileResponse
  const fileName = file.name ?? 'Untitled'
  const document = file.document
  if (!document || !isDocument(document)) {
    throw new Error('Invalid Figma file: missing or invalid document')
  }

  const pages: FigmaPageData[] = []
  const components: FigmaComponentData[] = []
  const colorStyles: FigmaColorStyle[] = []
  const textStyles: FigmaTextStyle[] = []
  const effectStyles: FigmaEffectStyle[] = []

  // Pages: each CANVAS is a Figma "page"; each top-level FRAME inside is our page (route).
  const canvases = document.children?.filter(isCanvas) ?? []
  for (const canvas of canvases) {
    const frames = canvas.children?.filter(isFrame) ?? []
    for (const frame of frames) {
      const route = frameNameToRoute(frame.name)
      pages.push({
        id: frame.id,
        name: frame.name,
        route: route || 'page',
        children: frame.children ?? [],
        layout: nodeToLayout(frame),
      })
    }
    // If no top-level frames, use first child only if it's a FRAME
    if (frames.length === 0 && canvas.children?.length) {
      const first = canvas.children[0]
      if (isFrame(first)) {
        const route = frameNameToRoute(first.name)
        pages.push({
          id: first.id,
          name: first.name,
          route: route || first.id,
          children: first.children ?? [],
          layout: nodeToLayout(first),
        })
      }
    }
  }

  // Components from file.components
  const compMap = file.components ?? {}
  for (const [nodeId, meta] of Object.entries(compMap)) {
    if (!meta || typeof meta !== 'object' || !meta.name) continue
    components.push({
      id: nodeId,
      key: meta.key ?? nodeId,
      name: meta.name,
      description: meta.description ?? '',
      variants: [],
      properties: [],
    })
  }

  // Styles from file.styles (id → { name, styleType })
  const stylesMap = file.styles ?? {}
  for (const [id, style] of Object.entries(stylesMap)) {
    if (!style || typeof style !== 'object' || !style.name || !style.styleType) continue
    if (style.styleType === 'FILL') {
      colorStyles.push({ id, name: style.name, color: { r: 0, g: 0, b: 0, a: 1 } })
    } else if (style.styleType === 'TEXT') {
      textStyles.push({ id, name: style.name })
    } else if (style.styleType === 'EFFECT') {
      effectStyles.push({ id, name: style.name, type: 'DROP_SHADOW' })
    }
  }

  return {
    fileName,
    fileKey,
    pages,
    components,
    colorStyles,
    textStyles,
    effectStyles,
  }
}

/** Convert Figma RGBA (0–1) to hex. */
export function figmaRgbaToHex(rgba: FigmaRgba): string {
  const r = Math.round((rgba.r ?? 0) * 255)
  const g = Math.round((rgba.g ?? 0) * 255)
  const b = Math.round((rgba.b ?? 0) * 255)
  const hex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}
