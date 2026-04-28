/**
 * Detect a running Next.js dev server by trying to bind to its expected
 * ports. If `net.createServer().listen(port)` fails with EADDRINUSE,
 * something is bound there — almost certainly `coherent preview`
 * (Next.js dev server) given Coherent's port conventions.
 *
 * Why this matters:
 *
 *   `coherent fix` clears `.next/` (build cache) as step 1. If a dev
 *   server is running, turbopack's in-memory bundler state still
 *   references files on disk — wiping `.next/` mid-run causes ENOENT
 *   spam in the server log AND the user's next page load returns 500
 *   Internal Server Error until manual restart.
 *
 *   Dogfood reproduced this twice in a row (v0.13.5 + v0.13.7 both),
 *   so this is not a fluke. v0.13.8 makes `coherent fix` skip the
 *   cache clear when it detects an active server.
 *
 * Coverage: ports 3000-3010 (Next.js auto-increments when default is
 * busy — common for users running multiple Coherent projects). Bias
 * to false positives (skip clear unnecessarily) over false negatives
 * (clear while server is up). The cost of skipping when no server
 * runs is zero — turbopack rebuilds on next request anyway.
 */
import { createServer } from 'net'

const NEXT_DEV_PORTS = [3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010]

async function isPortBound(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const tester = createServer()
    tester.once('error', (err: NodeJS.ErrnoException) => {
      // EADDRINUSE = port bound. Any other error (EACCES, etc.) we
      // also conservatively treat as "in use" since we can't verify
      // empty.
      if (err.code === 'EADDRINUSE') resolve(true)
      else resolve(true)
    })
    tester.once('listening', () => {
      tester.close(() => resolve(false))
    })
    try {
      tester.listen(port, '127.0.0.1')
    } catch {
      resolve(true)
    }
  })
}

/**
 * Returns the first port in NEXT_DEV_PORTS that is bound, or null if
 * all are free. The caller can use the port number for an informative
 * warning message.
 */
export async function detectRunningDevServer(): Promise<number | null> {
  for (const port of NEXT_DEV_PORTS) {
    if (await isPortBound(port)) return port
  }
  return null
}
