import { describe, it, expect } from 'vitest'
import { MockProvider } from '../mock-provider.js'

describe('MockProvider', () => {
  it('returns a queued response in FIFO order', async () => {
    const p = new MockProvider().enqueue('first').enqueue('second')
    expect(await p.generate('a')).toBe('first')
    expect(await p.generate('b')).toBe('second')
  })

  it('matches string matchers before falling back to the queue', async () => {
    const p = new MockProvider().push('plan pages', 'planned').enqueue('queued')
    expect(await p.generate('please plan pages for the app')).toBe('planned')
    expect(await p.generate('anything else')).toBe('queued')
  })

  it('consumes each matcher once', async () => {
    const p = new MockProvider().push('plan', 'once').enqueue('fallback')
    expect(await p.generate('plan this')).toBe('once')
    expect(await p.generate('plan that')).toBe('fallback')
  })

  it('supports RegExp matchers', async () => {
    const p = new MockProvider().push(/anchor\s+page/i, 'anchor-response')
    expect(await p.generate('Please generate the Anchor Page')).toBe('anchor-response')
  })

  it('records calls with prompt + options for later assertions', async () => {
    const p = new MockProvider().enqueue('ok')
    await p.generate('hello', { model: 'claude-opus', maxTokens: 10 })
    expect(p.calls).toHaveLength(1)
    expect(p.calls[0].prompt).toBe('hello')
    expect(p.calls[0].options).toEqual({ model: 'claude-opus', maxTokens: 10 })
  })

  it('throws a descriptive error when no response is configured', async () => {
    const p = new MockProvider()
    await expect(p.generate('nope')).rejects.toThrow(/no response configured/)
  })

  it('reset() clears calls + queues + matchers', async () => {
    const p = new MockProvider().push('x', 'y').enqueue('z')
    await p.generate('x')
    p.reset()
    expect(p.calls).toEqual([])
    await expect(p.generate('x')).rejects.toThrow()
  })
})
