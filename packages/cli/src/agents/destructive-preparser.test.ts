import { describe, it, expect } from 'vitest'
import { preParseDestructive, messageHasDestructiveIntent } from './destructive-preparser.js'

const cfg = {
  pages: [
    { id: 'home', name: 'Home', route: '/' },
    { id: 'account', name: 'Account', route: '/account' },
    { id: 'dashboard', name: 'Dashboard', route: '/dashboard' },
    { id: 'accounts', name: 'Accounts', route: '/accounts' },
  ],
} as any

describe('preParseDestructive', () => {
  it('matches "delete account page" (single)', () => {
    const r = preParseDestructive('delete account page', cfg)
    expect(r).not.toBeNull()
    expect(r!.requests).toHaveLength(1)
    expect(r!.requests[0].type).toBe('delete-page')
    expect(r!.requests[0].target).toBe('account')
  })

  it('matches "remove the dashboard page"', () => {
    const r = preParseDestructive('remove the dashboard page', cfg)
    expect(r!.requests[0].type).toBe('delete-page')
  })

  it('matches "get rid of accounts page"', () => {
    const r = preParseDestructive('get rid of accounts page', cfg)
    expect(r!.requests[0].target).toBe('accounts')
  })

  it('matches compound "delete X page and Y page"', () => {
    // Add accounts to cfg to have two real pages
    const multiCfg = {
      pages: [...cfg.pages, { id: 'delete-account', name: 'Delete Account', route: '/settings/delete-account' }],
    } as any
    const r = preParseDestructive('delete the account page and the delete-account page', multiCfg)
    expect(r).not.toBeNull()
    expect(r!.requests).toHaveLength(2)
    expect(r!.requests.map(x => x.target).sort()).toEqual(['account', 'delete-account'])
  })

  it('matches compound with commas', () => {
    const r = preParseDestructive('delete account, dashboard page', cfg)
    expect(r).not.toBeNull()
    expect(r!.requests).toHaveLength(2)
  })

  it('returns null when compound has no resolvable targets (fallback to LLM)', () => {
    // "foo" and "bar" are not real pages — shouldn't emit a failing delete.
    expect(preParseDestructive('delete foo page and bar page', cfg)).toBeNull()
  })

  it('partial-resolves compound: keeps resolvable, skips unknown', () => {
    const r = preParseDestructive('delete account page and nonexistent page', cfg)
    expect(r).not.toBeNull()
    expect(r!.requests).toHaveLength(1)
    expect(r!.requests[0].target).toBe('account')
    expect(r!.reason).toContain('unresolved')
    expect(r!.reason).toContain('nonexistent')
  })

  it('DOES NOT match "add a delete account page" (feature creation)', () => {
    expect(preParseDestructive('add a delete account page', cfg)).toBeNull()
  })

  it('DOES NOT match "delete all transactions"', () => {
    expect(preParseDestructive('delete all transactions', cfg)).toBeNull()
  })

  it('matches "delete StatCard component"', () => {
    const r = preParseDestructive('delete StatCard component', cfg)
    expect(r!.requests[0].type).toBe('delete-component')
    expect(r!.requests[0].target).toBe('StatCard')
  })
})

describe('messageHasDestructiveIntent', () => {
  it('true for destructive verbs at message start', () => {
    expect(messageHasDestructiveIntent('delete account page')).toBe(true)
    expect(messageHasDestructiveIntent('remove the dashboard')).toBe(true)
  })

  it('false for create/add with destructive word in middle', () => {
    expect(messageHasDestructiveIntent('add a delete account page')).toBe(false)
    expect(messageHasDestructiveIntent('create a page for removing accounts')).toBe(false)
  })

  it('false for non-destructive message', () => {
    expect(messageHasDestructiveIntent('add a pricing page')).toBe(false)
    expect(messageHasDestructiveIntent('change button color to blue')).toBe(false)
  })
})
