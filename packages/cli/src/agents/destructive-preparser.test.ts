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
  it('matches "delete account page"', () => {
    const r = preParseDestructive('delete account page', cfg)
    expect(r).not.toBeNull()
    expect(r!.request.type).toBe('delete-page')
    expect(r!.request.target).toBe('account')
  })

  it('matches "remove the dashboard page"', () => {
    const r = preParseDestructive('remove the dashboard page', cfg)
    expect(r!.request.type).toBe('delete-page')
  })

  it('matches "get rid of accounts page"', () => {
    const r = preParseDestructive('get rid of accounts page', cfg)
    expect(r!.request.type).toBe('delete-page')
    expect(r!.request.target).toBe('accounts')
  })

  it('matches "drop the pricing page"', () => {
    const r = preParseDestructive('drop the pricing page', cfg)
    expect(r!.request.type).toBe('delete-page')
    expect(r!.request.target).toBe('pricing')
  })

  it('DOES NOT match "add a delete account page"', () => {
    expect(preParseDestructive('add a delete account page', cfg)).toBeNull()
  })

  it('DOES NOT match "create a page for deleting accounts"', () => {
    expect(preParseDestructive('create a page for deleting accounts', cfg)).toBeNull()
  })

  it('DOES NOT match "delete all transactions in the dashboard"', () => {
    // Data op, not page op.
    expect(preParseDestructive('delete all transactions in the dashboard', cfg)).toBeNull()
  })

  it('matches "delete StatCard component"', () => {
    const r = preParseDestructive('delete StatCard component', cfg)
    expect(r!.request.type).toBe('delete-component')
    expect(r!.request.target).toBe('StatCard')
  })

  it('matches "remove the Sidebar shared component"', () => {
    const r = preParseDestructive('remove the Sidebar shared component', cfg)
    expect(r!.request.type).toBe('delete-component')
    expect(r!.request.target).toBe('Sidebar')
  })

  it('fuzzy-matches page name', () => {
    const r = preParseDestructive('delete accounts page', cfg)
    // "accounts" matches /accounts directly
    expect(r!.request.type).toBe('delete-page')
    expect(r!.request.target).toBe('accounts')
  })

  it('returns raw target when no page matches', () => {
    const r = preParseDestructive('delete widgets page', cfg)
    expect(r!.request.type).toBe('delete-page')
    expect(r!.request.target).toBe('widgets')
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
