import { describe, it, expect } from 'vitest'
import { createMinimalConfig } from './minimal-config.js'

describe('createMinimalConfig', () => {
  it('uses provided appName', () => {
    const config = createMinimalConfig('Test Projector')
    expect(config.name).toBe('Test Projector')
  })
  it('uses appName in page description', () => {
    const config = createMinimalConfig('TaskFlow')
    expect(config.pages[0].description).toBe('Welcome to TaskFlow')
  })
  it('defaults to My App when no name', () => {
    const config = createMinimalConfig()
    expect(config.name).toBe('My App')
  })
})
