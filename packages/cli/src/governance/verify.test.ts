import { describe, it, expect } from 'vitest'
import { shotName } from './verify.js'

describe('shotName', () => {
  it('keeps routes that slug alike apart', () => {
    expect(shotName('/foo-bar', 'desktop')).not.toBe(shotName('/foo/bar', 'desktop'))
    expect(shotName('/', 'mobile')).toMatch(/^root-[0-9a-f]{8}-mobile\.png$/)
  })
})
