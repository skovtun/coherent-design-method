import { describe, it, expect } from 'vitest'
import { shotName, sourceTypeErrors } from './verify.js'

describe('shotName', () => {
  it('keeps routes that slug alike apart', () => {
    expect(shotName('/foo-bar', 'desktop')).not.toBe(shotName('/foo/bar', 'desktop'))
    expect(shotName('/', 'mobile')).toMatch(/^root-[0-9a-f]{8}-mobile\.png$/)
  })
})

describe('sourceTypeErrors', () => {
  it('drops stale Next.js route types under .next/, keeps source errors', () => {
    const out = [
      ".next/types/validator.ts(302,39): error TS2307: Cannot find module '../../src/app/x/page.js'",
      ".next/dev/types/validator.ts(311,69): error TS2344: Type 'X' does not satisfy the constraint 'never'.",
      "src/app/page.tsx(3,5): error TS2322: Type 'string' is not assignable to type 'number'.",
      'Found 3 errors.',
    ].join('\n')
    expect(sourceTypeErrors(out)).toEqual([
      "src/app/page.tsx(3,5): error TS2322: Type 'string' is not assignable to type 'number'.",
    ])
  })
})
