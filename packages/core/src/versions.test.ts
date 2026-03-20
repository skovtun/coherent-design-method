import { describe, it, expect } from 'vitest'
import { CLI_VERSION } from './versions'

describe('CLI_VERSION', () => {
  it('matches the version in packages/core/package.json', async () => {
    const { readFileSync } = await import('fs')
    const { resolve } = await import('path')
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8'))
    expect(CLI_VERSION).toBe(pkg.version)
  })

  it('is a valid semver string', () => {
    expect(CLI_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('core and cli package versions are in sync', async () => {
    const { readFileSync } = await import('fs')
    const { resolve } = await import('path')
    const corePkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8'))
    const cliPkg = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'cli', 'package.json'), 'utf-8'))
    expect(corePkg.version).toBe(cliPkg.version)
  })
})
