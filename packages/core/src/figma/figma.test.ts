/**
 * Unit tests for Figma import (Stories 3.8–3.12).
 * No network or Figma token required — mock data only.
 */

import { describe, it, expect } from 'vitest'
import { parseFigmaFileResponse, figmaRgbaToHex } from './FigmaParser.js'
import {
  extractTokensFromFigma,
  mergeExtractedColorsWithDefaults,
  figmaComponentNameToBaseId,
  normalizeFigmaComponents,
  generateSharedComponentTsx,
  getPageFilePath,
  generatePageFromFrame,
  generatePagesFromFigma,
} from './index.js'

const MOCK_FIGMA_RAW = {
  name: 'Test File',
  document: {
    id: 'doc',
    name: 'Document',
    type: 'DOCUMENT',
    children: [
      {
        id: 'canvas:0',
        name: 'Page 1',
        type: 'CANVAS',
        children: [
          {
            id: 'frame:home',
            name: 'Home',
            type: 'FRAME',
            children: [],
            layoutMode: 'VERTICAL',
            itemSpacing: 16,
            paddingLeft: 24,
            paddingRight: 24,
            paddingTop: 24,
            paddingBottom: 24,
          },
          {
            id: 'frame:dash',
            name: 'Dashboard',
            type: 'FRAME',
            children: [{ id: 'node:1', name: 'Button', type: 'COMPONENT', componentId: 'comp:btn' }],
          },
        ],
      },
    ],
  },
  components: {
    'comp:btn': { key: 'abc', name: 'Button', description: '' },
    'comp:card': { key: 'def', name: 'PricingCard', description: '' },
  },
  styles: {
    'style:fill:primary': { name: 'Primary', styleType: 'FILL' },
    'style:fill:bg': { name: 'Background', styleType: 'FILL' },
    'style:text:body': { name: 'Body', styleType: 'TEXT' },
    'style:effect:shadow': { name: 'Shadow', styleType: 'EFFECT' },
  },
}

describe('FigmaParser', () => {
  it('parseFigmaFileResponse returns intermediate with pages, components, styles', () => {
    const data = parseFigmaFileResponse(MOCK_FIGMA_RAW, 'fileKey123')
    expect(data.fileName).toBe('Test File')
    expect(data.fileKey).toBe('fileKey123')
    expect(data.pages.length).toBeGreaterThanOrEqual(1)
    expect(data.pages.some(p => p.route === '' || p.name === 'Home')).toBe(true)
    expect(data.components.length).toBe(2)
    expect(data.colorStyles.length).toBe(2)
    expect(data.textStyles.length).toBe(1)
    expect(data.effectStyles.length).toBe(1)
  })

  it('figmaRgbaToHex converts 0-1 rgba to hex', () => {
    expect(figmaRgbaToHex({ r: 1, g: 0, b: 0, a: 1 })).toBe('#ff0000')
    expect(figmaRgbaToHex({ r: 0, g: 0.5, b: 0, a: 1 })).toBe('#008000')
  })
})

describe('FigmaTokenExtractor', () => {
  it('extractTokensFromFigma maps color style names to tokens', () => {
    const data = parseFigmaFileResponse(MOCK_FIGMA_RAW, 'key')
    const extracted = extractTokensFromFigma(data)
    expect(extracted.colors.light).toBeDefined()
    expect(extracted.colors.dark).toBeDefined()
  })

  it('mergeExtractedColorsWithDefaults returns full ColorToken', () => {
    const data = parseFigmaFileResponse(MOCK_FIGMA_RAW, 'key')
    const extracted = extractTokensFromFigma(data)
    const merged = mergeExtractedColorsWithDefaults(extracted)
    expect(merged.light.primary).toBeDefined()
    expect(merged.light.background).toBeDefined()
    expect(merged.dark.primary).toBeDefined()
  })
})

describe('FigmaComponentNormalizer', () => {
  it('figmaComponentNameToBaseId maps Button/Card/Input to base ids', () => {
    expect(figmaComponentNameToBaseId('Button')).toBe('button')
    expect(figmaComponentNameToBaseId('btn')).toBe('button')
    expect(figmaComponentNameToBaseId('Card')).toBe('card')
    expect(figmaComponentNameToBaseId('Input')).toBe('input')
    expect(figmaComponentNameToBaseId('TextField')).toBe('input')
    expect(figmaComponentNameToBaseId('UnknownWidget')).toBeNull()
  })

  it('normalizeFigmaComponents splits base vs shared', () => {
    const data = parseFigmaFileResponse(MOCK_FIGMA_RAW, 'key')
    const result = normalizeFigmaComponents(data)
    const baseEntries = result.entries.filter(e => e.kind === 'base')
    const sharedEntries = result.entries.filter(e => e.kind === 'shared')
    expect(baseEntries.length + sharedEntries.length).toBe(data.components.length)
    expect(result.figmaToCoherent.size).toBe(data.components.length)
  })

  it('generateSharedComponentTsx returns valid TSX string', () => {
    const tsx = generateSharedComponentTsx('PricingCard', {
      layoutMode: 'VERTICAL',
      itemSpacing: 16,
      paddingLeft: 0,
      paddingRight: 0,
      paddingTop: 0,
      paddingBottom: 0,
    })
    expect(tsx).toContain("'use client'")
    expect(tsx).toContain('export function')
    expect(tsx).toContain('PricingCard')
    expect(tsx).toContain('flex')
    expect(tsx).toContain('rounded-lg')
  })
})

describe('FigmaPageGenerator', () => {
  it('getPageFilePath returns app path for route', () => {
    expect(getPageFilePath('')).toBe('app/page.tsx')
    expect(getPageFilePath('dashboard')).toBe('app/dashboard/page.tsx')
    expect(getPageFilePath('pricing')).toBe('app/pricing/page.tsx')
  })

  it('generatePageFromFrame produces valid page TSX with metadata', () => {
    const data = parseFigmaFileResponse(MOCK_FIGMA_RAW, 'key')
    const page = data.pages[0]
    const componentMap: Record<
      string,
      { kind: 'base'; baseId: string } | { kind: 'shared'; cid: string; name: string; file: string }
    > = {}
    if (data.components.length > 0) {
      componentMap[data.components[0].id] = { kind: 'base', baseId: 'button' }
    }
    const content = generatePageFromFrame(page, componentMap)
    expect(content).toContain("import { Metadata } from 'next'")
    expect(content).toContain('export const metadata')
    expect(content).toContain('export default function')
    expect(content).toContain('<main')
  })

  it('generatePagesFromFigma returns one entry per page', () => {
    const data = parseFigmaFileResponse(MOCK_FIGMA_RAW, 'key')
    const generated = generatePagesFromFigma(data.pages, {})
    expect(generated.length).toBe(data.pages.length)
    expect(generated.every(p => p.filePath.endsWith('page.tsx'))).toBe(true)
  })
})
