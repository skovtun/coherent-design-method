import { describe, it, expect } from 'vitest'
import { takeNavSnapshot, hasNavChanged } from './nav-snapshot.js'

describe('nav-snapshot', () => {
  it('detects no change when items are identical', () => {
    const items = [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Settings', href: '/settings' },
    ]
    const before = takeNavSnapshot(items)
    const after = takeNavSnapshot(items)
    expect(hasNavChanged(before, after)).toBe(false)
  })

  it('detects change when a page is added', () => {
    const before = takeNavSnapshot([{ label: 'Dashboard', href: '/dashboard' }])
    const after = takeNavSnapshot([
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Projects', href: '/projects' },
    ])
    expect(hasNavChanged(before, after)).toBe(true)
  })

  it('detects change when a page is removed', () => {
    const before = takeNavSnapshot([
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Projects', href: '/projects' },
    ])
    const after = takeNavSnapshot([{ label: 'Dashboard', href: '/dashboard' }])
    expect(hasNavChanged(before, after)).toBe(true)
  })

  it('detects change when a label is renamed', () => {
    const before = takeNavSnapshot([{ label: 'Dashboard', href: '/dashboard' }])
    const after = takeNavSnapshot([{ label: 'Home', href: '/dashboard' }])
    expect(hasNavChanged(before, after)).toBe(true)
  })

  it('handles undefined/empty items', () => {
    expect(hasNavChanged(takeNavSnapshot(undefined), takeNavSnapshot(undefined))).toBe(false)
    expect(hasNavChanged(takeNavSnapshot([]), takeNavSnapshot([]))).toBe(false)
    expect(hasNavChanged(takeNavSnapshot(undefined), takeNavSnapshot([{ label: 'A', href: '/a' }]))).toBe(true)
  })

  it('detects change when navigation type changes (header → sidebar)', () => {
    const items = [{ label: 'Dashboard', href: '/dashboard' }]
    const before = takeNavSnapshot(items, 'header')
    const after = takeNavSnapshot(items, 'sidebar')
    expect(hasNavChanged(before, after)).toBe(true)
  })

  it('detects no change when navigation type is the same', () => {
    const items = [{ label: 'Dashboard', href: '/dashboard' }]
    const before = takeNavSnapshot(items, 'sidebar')
    const after = takeNavSnapshot(items, 'sidebar')
    expect(hasNavChanged(before, after)).toBe(false)
  })
})
