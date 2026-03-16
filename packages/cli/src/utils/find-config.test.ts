import { describe, it, expect } from 'vitest'
import { isVolatileDirectory } from './find-config.js'

describe('isVolatileDirectory', () => {
  it('detects /tmp as volatile', () => {
    expect(isVolatileDirectory('/tmp/my-project')).toBe(true)
  })

  it('detects /private/tmp as volatile (macOS)', () => {
    expect(isVolatileDirectory('/private/tmp/my-project')).toBe(true)
  })

  it('detects /var/tmp as volatile', () => {
    expect(isVolatileDirectory('/var/tmp/my-project')).toBe(true)
  })

  it('does NOT flag home directory', () => {
    expect(isVolatileDirectory('/Users/dev/projects/my-app')).toBe(false)
  })

  it('does NOT flag /opt', () => {
    expect(isVolatileDirectory('/opt/apps/my-app')).toBe(false)
  })
})
