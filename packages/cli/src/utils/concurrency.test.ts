import { describe, it, expect } from 'vitest'
import { pMap } from './concurrency.js'

describe('pMap', () => {
  it('processes all items and preserves order', async () => {
    const items = [1, 2, 3, 4, 5]
    const results = await pMap(items, async x => x * 10)
    expect(results).toEqual([10, 20, 30, 40, 50])
  })

  it('passes index to mapper function', async () => {
    const items = ['a', 'b', 'c']
    const results = await pMap(items, async (_item, i) => i)
    expect(results).toEqual([0, 1, 2])
  })

  it('respects concurrency limit', async () => {
    let running = 0
    let maxRunning = 0

    const items = Array.from({ length: 10 }, (_, i) => i)
    await pMap(
      items,
      async () => {
        running++
        maxRunning = Math.max(maxRunning, running)
        await new Promise(r => setTimeout(r, 20))
        running--
      },
      3,
    )

    expect(maxRunning).toBeLessThanOrEqual(3)
    expect(maxRunning).toBeGreaterThan(1)
  })

  it('handles empty array', async () => {
    const results = await pMap([], async (x: number) => x * 2)
    expect(results).toEqual([])
  })

  it('handles concurrency greater than items', async () => {
    const items = [1, 2]
    const results = await pMap(items, async x => x + 1, 10)
    expect(results).toEqual([2, 3])
  })

  it('propagates errors from mapper', async () => {
    const items = [1, 2, 3]
    await expect(
      pMap(items, async x => {
        if (x === 2) throw new Error('boom')
        return x
      }),
    ).rejects.toThrow('boom')
  })

  it('defaults to concurrency of 3', async () => {
    let maxRunning = 0
    let running = 0

    await pMap(
      Array.from({ length: 9 }, (_, i) => i),
      async () => {
        running++
        maxRunning = Math.max(maxRunning, running)
        await new Promise(r => setTimeout(r, 30))
        running--
      },
    )

    expect(maxRunning).toBeLessThanOrEqual(3)
  })
})
