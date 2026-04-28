/**
 * Detect a running Next.js dev server by attempting to CONNECT to its
 * expected ports. If the connection succeeds, something is listening
 * — almost certainly `coherent preview` (Next.js dev server) given
 * Coherent's port conventions.
 *
 * Why this matters:
 *
 *   `coherent fix` clears `.next/` (build cache) as step 1. If a dev
 *   server is running, turbopack's in-memory bundler state still
 *   references files on disk — wiping `.next/` mid-run causes ENOENT
 *   spam in the server log AND the user's next page load returns 500
 *   Internal Server Error until manual restart.
 *
 * v0.13.8 implemented detection via `net.createServer().listen()` with
 * EADDRINUSE check. That FAILED in real dogfood: Next.js dev server
 * binds to `::` (IPv6 wildcard) or `0.0.0.0`, while the probe was
 * binding specifically to `127.0.0.1`. On macOS those are different
 * address families — no collision, probe succeeds, false negative.
 *
 * v0.13.9 switches to `net.connect()` — try to OPEN a TCP connection
 * to `localhost:<port>`. If the connection succeeds (or refuses
 * connection differently from "nothing listening"), something IS
 * listening. This works regardless of which address family the dev
 * server bound to — `localhost` resolves to both 127.0.0.1 and ::1,
 * Node.js tries them in order.
 *
 * Coverage: ports 3000-3010 (Next.js auto-increments when default is
 * busy — common for users running multiple Coherent projects). Bias
 * to false positives (skip clear unnecessarily) over false negatives
 * (clear while server is up). The cost of skipping when no server
 * runs is zero — turbopack rebuilds on next request anyway.
 */
import { createConnection } from 'net'

const NEXT_DEV_PORTS = [3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010]
const PROBE_TIMEOUT_MS = 300

async function isPortListening(port: number): Promise<boolean> {
  return new Promise(resolve => {
    let settled = false
    const settle = (value: boolean) => {
      if (settled) return
      settled = true
      sock.destroy()
      resolve(value)
    }
    const sock = createConnection({ port, host: 'localhost' })
    sock.once('connect', () => settle(true))
    sock.once('error', (err: NodeJS.ErrnoException) => {
      // ECONNREFUSED = nothing listening on that port. Anything else
      // (timeout, host unreachable, etc.) we conservatively treat as
      // "in use" since we couldn't verify empty.
      if (err.code === 'ECONNREFUSED') settle(false)
      else settle(true)
    })
    sock.setTimeout(PROBE_TIMEOUT_MS, () => {
      // Timeout means the connection neither connected nor refused
      // within the window. Most likely the kernel has the port open
      // but the listener is slow to accept — still indicates "in
      // use." False positive at worst.
      settle(true)
    })
  })
}

/**
 * Returns the first port in NEXT_DEV_PORTS that is listening, or null
 * if all are silent. The caller can use the port number for an
 * informative warning message.
 */
export async function detectRunningDevServer(): Promise<number | null> {
  for (const port of NEXT_DEV_PORTS) {
    if (await isPortListening(port)) return port
  }
  return null
}
