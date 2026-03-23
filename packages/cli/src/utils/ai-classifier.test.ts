import { describe, it, expect } from 'vitest'
import { buildClassificationPrompt, parseClassificationResponse } from './ai-classifier.js'

describe('buildClassificationPrompt', () => {
  it('builds prompt from component signatures', () => {
    const components = [
      { name: 'StatsCard', signature: 'export function StatsCard({ icon, value, label }: Props)' },
      { name: 'FilterToolbar', signature: 'export function FilterToolbar({ filters, onFilter }: Props)' },
    ]
    const prompt = buildClassificationPrompt(components)
    expect(prompt).toContain('StatsCard')
    expect(prompt).toContain('FilterToolbar')
    expect(prompt).toContain('data-display')
  })
})

describe('parseClassificationResponse', () => {
  it('parses valid JSON response', () => {
    const response = JSON.stringify([
      { name: 'StatsCard', type: 'data-display', description: 'Metric card with trend' },
      { name: 'FilterToolbar', type: 'form', description: 'Search and filter controls' },
    ])
    const result = parseClassificationResponse(response)
    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('data-display')
  })

  it('falls back to section for unknown types', () => {
    const response = JSON.stringify([{ name: 'Widget', type: 'unknown-type', description: 'Something' }])
    const result = parseClassificationResponse(response)
    expect(result[0].type).toBe('section')
  })
})
