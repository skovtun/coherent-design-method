/**
 * nav-items helper — unit tests.
 *
 * Covers labelize edge cases and the append-only semantics that both
 * rails depend on (the API rail since v0.6.x, the skill rail's pages
 * applier from M15 forward).
 */
import { describe, it, expect } from 'vitest'
import type { NavigationItem } from '@getcoherent/core'
import { buildSidebarNavItems, labelizeRoute } from './nav-items.js'

describe('labelizeRoute', () => {
  it('returns "Home" for the root route', () => {
    expect(labelizeRoute('/')).toBe('Home')
  })

  it('TitleCases a single-segment route', () => {
    expect(labelizeRoute('/dashboard')).toBe('Dashboard')
  })

  it('handles kebab-case multi-word routes', () => {
    expect(labelizeRoute('/team-members')).toBe('Team Members')
  })

  it('handles nested routes', () => {
    expect(labelizeRoute('/admin/billing')).toBe('Admin Billing')
  })

  it('strips dynamic-route segments before labeling', () => {
    expect(labelizeRoute('/posts/[id]')).toBe('Posts')
    expect(labelizeRoute('/blog/[...slug]/edit')).toBe('Blog Edit')
  })
})

describe('buildSidebarNavItems', () => {
  it('returns the existing items unchanged when no new routes are passed', () => {
    const existing: NavigationItem[] = [{ label: 'Home', route: '/', requiresAuth: false, order: 0 }]
    const result = buildSidebarNavItems([], existing)
    expect(result).toEqual(existing)
  })

  it('appends a new entry per non-existing route', () => {
    const existing: NavigationItem[] = [{ label: 'Home', route: '/', requiresAuth: false, order: 0 }]
    const result = buildSidebarNavItems(['/dashboard', '/settings'], existing)
    expect(result.map(i => i.route)).toEqual(['/', '/dashboard', '/settings'])
    expect(result.find(i => i.route === '/dashboard')).toMatchObject({
      label: 'Dashboard',
      requiresAuth: true,
    })
  })

  it('preserves existing item shapes (does not re-add a route already present)', () => {
    // User manually relabeled "Dashboard" → "Overview". Re-running must
    // not add a second "/dashboard" entry, and must not overwrite the
    // user's label.
    const existing: NavigationItem[] = [
      { label: 'Home', route: '/', requiresAuth: false, order: 0 },
      { label: 'Overview', route: '/dashboard', requiresAuth: true, order: 1, icon: 'chart' },
    ]
    const result = buildSidebarNavItems(['/dashboard', '/settings'], existing)
    expect(result).toHaveLength(3)
    expect(result.find(i => i.route === '/dashboard')).toMatchObject({
      label: 'Overview',
      icon: 'chart',
    })
    expect(result.find(i => i.route === '/settings')).toMatchObject({ label: 'Settings' })
  })

  it('skips dynamic routes (`[id]`, `[...slug]`)', () => {
    const result = buildSidebarNavItems(['/posts', '/posts/[id]', '/blog/[...slug]/edit'], [])
    expect(result.map(i => i.route)).toEqual(['/posts'])
  })

  it('continues `order` after the highest existing order', () => {
    const existing: NavigationItem[] = [
      { label: 'A', route: '/a', requiresAuth: false, order: 5 },
      { label: 'B', route: '/b', requiresAuth: false, order: 10 },
    ]
    const result = buildSidebarNavItems(['/c', '/d'], existing)
    expect(result.find(i => i.route === '/c')?.order).toBe(11)
    expect(result.find(i => i.route === '/d')?.order).toBe(12)
  })

  it('treats undefined existingItems as empty list', () => {
    const result = buildSidebarNavItems(['/dashboard'], undefined)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ label: 'Dashboard', route: '/dashboard', order: 1 })
  })

  it('does not mutate inputs', () => {
    const existing: NavigationItem[] = [{ label: 'Home', route: '/', requiresAuth: false, order: 0 }]
    const routes = ['/dashboard']
    const before = JSON.stringify({ existing, routes })
    buildSidebarNavItems(routes, existing)
    expect(JSON.stringify({ existing, routes })).toBe(before)
  })
})
