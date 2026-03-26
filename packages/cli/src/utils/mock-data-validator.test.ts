import { describe, it, expect } from 'vitest'
import { validateMockData, applyMockDataFixes } from './mock-data-validator.js'

describe('validateMockData', () => {
  it('detects new Date("2 hours ago")', () => {
    const code = `const x = new Date("2 hours ago")`
    const issues = validateMockData(code)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].fixable).toBe(true)
  })

  it('detects new Date(\'yesterday\')', () => {
    const code = `const x = new Date('yesterday')`
    const issues = validateMockData(code)
    expect(issues.length).toBeGreaterThan(0)
  })

  it('passes new Date("2024-06-15T10:30:00Z")', () => {
    const code = `const x = new Date("2024-06-15T10:30:00Z")`
    const issues = validateMockData(code)
    expect(issues.length).toBe(0)
  })

  it('passes new Date() with no args', () => {
    const code = `const x = new Date()`
    const issues = validateMockData(code)
    expect(issues.length).toBe(0)
  })

  it('passes Date.now()', () => {
    const code = `const x = Date.now()`
    const issues = validateMockData(code)
    expect(issues.length).toBe(0)
  })

  it('detects timestamp: "2 hours ago" in object', () => {
    const code = `const items = [{ timestamp: "2 hours ago", user: "John" }]`
    const issues = validateMockData(code)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].fixable).toBe(true)
  })

  it('detects createdAt: "yesterday"', () => {
    const code = `const data = { createdAt: "yesterday" }`
    const issues = validateMockData(code)
    expect(issues.length).toBeGreaterThan(0)
  })

  it('detects date: "last week"', () => {
    const code = `const items = [{ date: "last week" }]`
    const issues = validateMockData(code)
    expect(issues.length).toBeGreaterThan(0)
  })

  it('passes timestamp: "2024-01-15T10:30:00Z"', () => {
    const code = `const items = [{ timestamp: "2024-01-15T10:30:00Z" }]`
    const issues = validateMockData(code)
    expect(issues.length).toBe(0)
  })

  it('produces valid ISO replacement for invalid dates', () => {
    const code = `const x = new Date("2 hours ago")`
    const issues = validateMockData(code)
    expect(issues[0].replacement).toBeDefined()
    const replaced = code.slice(0, issues[0].replacement!.start) + issues[0].replacement!.text + code.slice(issues[0].replacement!.end)
    expect(replaced).toMatch(/new Date\("\d{4}-\d{2}-\d{2}T/)
  })
})

describe('applyMockDataFixes', () => {
  it('replaces all invalid dates', () => {
    const code = `const items = [{ timestamp: "2 hours ago" }, { date: "last week" }]`
    const issues = validateMockData(code)
    const fixed = applyMockDataFixes(code, issues)
    expect(fixed).not.toContain('2 hours ago')
    expect(fixed).not.toContain('last week')
    expect(fixed).toMatch(/\d{4}-\d{2}-\d{2}T/)
  })

  it('returns code unchanged when no issues', () => {
    const code = `const x = new Date("2024-06-15T10:30:00Z")`
    const fixed = applyMockDataFixes(code, [])
    expect(fixed).toBe(code)
  })
})
