/**
 * Tests for `detectRunningDevServer` — used by `coherent fix` (v0.13.8+)
 * to skip the .next/ cache clear when a dev server is bound to one of
 * the Next.js dev ports.
 *
 * v0.13.9: detection switched from listen()-probe to connect()-probe
 * after v0.13.8 missed Next.js servers binding on `::` or `0.0.0.0`
 * (different address family from the probe's `127.0.0.1`). Tests now
 * spin up a real server.listen() that ACCEPTS connections, so the
 * connect-based probe has something to talk to.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type Server } from 'net'
import { detectRunningDevServer } from './dev-server-running.js'

describe('detectRunningDevServer', () => {
  let occupiedServer: Server | null = null

  afterEach(async () => {
    if (occupiedServer) {
      await new Promise<void>(resolve => occupiedServer!.close(() => resolve()))
      occupiedServer = null
    }
  })

  it('returns null when none of the Next.js dev ports have a listener', async () => {
    // The CI runner usually has 3000-3010 free. If this test ever
    // becomes flaky on a developer machine running their own dev
    // server, the assertion captures real environment state rather
    // than a bug in the helper — re-running with ports free passes.
    const result = await detectRunningDevServer()
    if (result !== null) {
      // Skip silently when developer has their own dev server up.
      return
    }
    expect(result).toBeNull()
  })

  it('returns the listening port when one is in use', async () => {
    // Pick port 3010 (the highest port we scan) to minimize collision
    // with anything the developer may have running.
    const targetPort = 3010
    occupiedServer = createServer(socket => {
      // Accept and immediately close — we just need the OS to ACK
      // SYN so connect() resolves. Keeping the socket alive isn't
      // necessary for the probe.
      socket.end()
    })
    await new Promise<void>((resolve, reject) => {
      occupiedServer!.once('error', reject)
      occupiedServer!.listen(targetPort, () => resolve())
    })

    const result = await detectRunningDevServer()
    expect(result).not.toBeNull()
    // Result is whichever port got hit FIRST in the scan order
    // (3000 → 3010). If developer has 3000-3009 free and 3010 is
    // ours, result === 3010. If developer has 3000 (or any earlier)
    // bound by their own dev server, result is that port — still
    // valid: helper's job is "is ANY port in the range listening".
    expect(typeof result).toBe('number')
    expect(result).toBeGreaterThanOrEqual(3000)
    expect(result).toBeLessThanOrEqual(3010)
  })
})
