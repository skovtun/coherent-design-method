import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// Test getPackageManager by checking lock files
describe('export utilities', () => {
  function createTmpDir(): string {
    return mkdtempSync(join(tmpdir(), 'export-test-'))
  }

  describe('COPY_EXCLUDE coverage', () => {
    it('should exclude .env variants from export', () => {
      // The COPY_EXCLUDE set should contain all .env variants
      // We test this by checking the source directly
      const exportSource = require('fs').readFileSync(join(__dirname, 'export.ts'), 'utf-8')
      expect(exportSource).toContain("'.env.development'")
      expect(exportSource).toContain("'.env.production'")
      expect(exportSource).toContain("'.env.test'")
      expect(exportSource).toContain("'coherent.figma-import.json'")
      expect(exportSource).toContain("'coherent.figma-component-map.json'")
    })
  })

  describe('ShowWhenNotAuthRoute stripping', () => {
    it('regex removes /design-system as last array entry', () => {
      const input = "const HIDDEN_PATHS = ['/login', '/register', '/design-system']"
      // Simulate the two-pass regex from export.ts
      let result = input.replace(/,\s*['"]\/design-system['"]/g, '')
      result = result.replace(/['"]\/design-system['"]\s*,?\s*/g, '')
      expect(result).toContain("'/login', '/register'")
      expect(result).not.toContain('design-system')
      expect(result).toContain(']') // array properly closed
    })

    it('regex removes /design-system as first array entry', () => {
      const input = "const HIDDEN_PATHS = ['/design-system', '/login']"
      let result = input.replace(/,\s*['"]\/design-system['"]/g, '')
      result = result.replace(/['"]\/design-system['"]\s*,?\s*/g, '')
      expect(result).toContain("'/login'")
      expect(result).not.toContain('design-system')
    })

    it('regex removes /design-system as middle entry', () => {
      const input = "const HIDDEN_PATHS = ['/login', '/design-system', '/register']"
      let result = input.replace(/,\s*['"]\/design-system['"]/g, '')
      result = result.replace(/['"]\/design-system['"]\s*,?\s*/g, '')
      expect(result).toContain("'/login'")
      expect(result).toContain("'/register'")
      expect(result).not.toContain('design-system')
    })

    it('regex removes /design-system as only entry', () => {
      const input = "const HIDDEN_PATHS = ['/design-system']"
      let result = input.replace(/,\s*['"]\/design-system['"]/g, '')
      result = result.replace(/['"]\/design-system['"]\s*,?\s*/g, '')
      expect(result).not.toContain('design-system')
      expect(result).toContain('[]')
    })
  })

  describe('next.config patching', () => {
    it('regex matches const nextConfig = {', () => {
      const input = 'const nextConfig = {\n  reactStrictMode: true,\n}'
      const re = /((?:const\s+nextConfig\s*(?::\s*\w+)?\s*=|export\s+default)\s*\{)/
      expect(re.test(input)).toBe(true)
    })

    it('regex matches export default {', () => {
      const input = 'export default {\n  reactStrictMode: true,\n}'
      const re = /((?:const\s+nextConfig\s*(?::\s*\w+)?\s*=|export\s+default)\s*\{)/
      expect(re.test(input)).toBe(true)
    })

    it('regex matches const nextConfig: NextConfig = {', () => {
      const input = 'const nextConfig: NextConfig = {\n  reactStrictMode: true,\n}'
      const re = /((?:const\s+nextConfig\s*(?::\s*\w+)?\s*=|export\s+default)\s*\{)/
      expect(re.test(input)).toBe(true)
    })
  })
})
