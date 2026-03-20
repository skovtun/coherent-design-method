import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('AUTH_LAYOUT template', () => {
  it('centers children with flex', () => {
    const src = readFileSync(resolve(__dirname, 'auth-route-group.ts'), 'utf-8')
    expect(src).toContain('flex items-center justify-center')
  })

  it('has padding for mobile', () => {
    const src = readFileSync(resolve(__dirname, 'auth-route-group.ts'), 'utf-8')
    expect(src).toContain('p-4')
  })
})
