import { describe, it, expect, vi } from 'vitest'
import { manifestCommand } from './manifest.js'

describe('coherent manifest', () => {
  it('emits a valid design-contract JSON with the static agent-contract surface', async () => {
    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((s: unknown) => {
      logs.push(String(s))
    })
    await manifestCommand({}) // no Command passed → cli self-description is null; static parts still present
    spy.mockRestore()

    const m = JSON.parse(logs.join('\n'))
    expect(m.$schema).toContain('coherent-manifest')
    expect(m.coherentVersion).toBeTruthy()
    expect(m.designContract.pageTypes).toEqual(['marketing', 'app', 'auth'])
    expect(Array.isArray(m.designContract.atmospheres)).toBe(true)
    expect(m.designContract.atmospheres.length).toBeGreaterThan(5)
    expect(m.designContract.atmospheres[0]).toHaveProperty('name')
    expect(m.designContract.atmospheres[0]).toHaveProperty('description')
    expect(m.designContract.constraintBundle.queryVia).toContain('coherent prompt --format json')
    expect(Array.isArray(m.components.shadcnAvailable)).toBe(true)
    expect(m.components.shadcnAvailable.length).toBeGreaterThan(0)
  })
})
