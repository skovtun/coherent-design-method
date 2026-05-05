import type { BrowserDriverFactory, PageLike } from '@getcoherent/core'

/**
 * Playwright adapter implementing the BrowserDriverFactory contract from
 * @getcoherent/core's url-extract module.
 *
 * Playwright is a peerDependency (optional). Dynamic import + clear hint
 * keeps `@getcoherent/cli` install lean for users who never run `extract`.
 */
export interface PlaywrightDriverOptions {
  headless?: boolean
  userAgent?: string
}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export async function createPlaywrightDriver(opts: PlaywrightDriverOptions = {}): Promise<BrowserDriverFactory> {
  let pw: typeof import('playwright')
  try {
    pw = await import('playwright')
  } catch {
    throw new Error(
      'PLAYWRIGHT_NOT_INSTALLED: `coherent extract` needs Playwright.\n' +
        '  Install it once with:\n' +
        '    npm install -g playwright\n' +
        '    npx playwright install chromium',
    )
  }
  const browser = await pw.chromium.launch({ headless: opts.headless ?? true })
  const context = await browser.newContext({
    userAgent: opts.userAgent ?? DEFAULT_USER_AGENT,
    viewport: { width: 1440, height: 900 },
  })
  return {
    async newPage(): Promise<PageLike> {
      const page = await context.newPage()
      // Adapter: Playwright's Page already matches PageLike exactly.
      return page as unknown as PageLike
    },
    async close(): Promise<void> {
      await context.close().catch(() => {})
      await browser.close().catch(() => {})
    },
  }
}
