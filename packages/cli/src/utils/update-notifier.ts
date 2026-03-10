import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import chalk from 'chalk'
import { CLI_VERSION } from '@getcoherent/core'

const PACKAGE_NAME = '@getcoherent/cli'
const CACHE_DIR = join(homedir(), '.coherent')
const CACHE_FILE = join(CACHE_DIR, 'update-check.json')
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface CacheData {
  latest: string
  checkedAt: number
}

function readCache(): CacheData | null {
  try {
    if (!existsSync(CACHE_FILE)) return null
    const raw = readFileSync(CACHE_FILE, 'utf-8')
    return JSON.parse(raw) as CacheData
  } catch {
    return null
  }
}

function writeCache(data: CacheData): void {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(CACHE_FILE, JSON.stringify(data), 'utf-8')
  } catch {
    // Non-critical — silently ignore
  }
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`, {
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const data = (await res.json()) as { version?: string }
    return data.version ?? null
  } catch {
    return null
  }
}

function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => v.split('.').map(Number)
  const [lMaj, lMin, lPatch] = parse(latest)
  const [cMaj, cMin, cPatch] = parse(current)
  if (lMaj !== cMaj) return lMaj > cMaj
  if (lMin !== cMin) return lMin > cMin
  return lPatch > cPatch
}

/**
 * Non-blocking check for CLI updates. Prints a notice if a newer version
 * is available on npm. Uses a 24-hour cache to avoid network calls on
 * every invocation. Never throws — all errors are silently ignored.
 */
export async function checkForUpdates(): Promise<void> {
  try {
    const cached = readCache()
    const now = Date.now()

    if (cached && now - cached.checkedAt < CHECK_INTERVAL_MS) {
      if (isNewer(cached.latest, CLI_VERSION)) {
        printUpdateNotice(cached.latest)
      }
      return
    }

    const latest = await fetchLatestVersion()
    if (!latest) return

    writeCache({ latest, checkedAt: now })

    if (isNewer(latest, CLI_VERSION)) {
      printUpdateNotice(latest)
    }
  } catch {
    // Never block CLI startup
  }
}

function printUpdateNotice(latest: string): void {
  console.log(
    chalk.yellow(`\n  ⬆  Update available: v${CLI_VERSION} → v${latest}`) +
    chalk.dim(`\n     Run: npm update -g ${PACKAGE_NAME}\n`)
  )
}
