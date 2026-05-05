import type { BrowserDriverFactory, NavigationResponse, PageLike } from '@getcoherent/core'

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
      return wrapPage(page)
    },
    async close(): Promise<void> {
      await context.close().catch(() => {})
      await browser.close().catch(() => {})
    },
  }
}

/**
 * Build an explicit PageLike wrapper. We can no longer use a structural cast
 * because PageLike now carries `interceptMainFrameRequests`, which Playwright
 * does not expose — we synthesize it from `page.route` here.
 */
function wrapPage(page: import('playwright').Page): PageLike {
  return {
    goto: (url, opts) => page.goto(url, opts) as unknown as Promise<NavigationResponse | null>,
    evaluate: ((fn: unknown, arg?: unknown) =>
      arg === undefined
        ? page.evaluate(fn as never)
        : page.evaluate(fn as never, arg as never)) as PageLike['evaluate'],
    content: () => page.content(),
    screenshot: opts => page.screenshot(opts) as Promise<Buffer>,
    title: () => page.title(),
    url: () => page.url(),
    waitForTimeout: ms => page.waitForTimeout(ms),
    close: () => page.close(),
    async interceptRequests(handler) {
      // Guards EVERY request: main-frame navigation + subresources. A public
      // page can embed <img src="http://169.254.169.254/..."> to probe the
      // internal network — subresource SSRF coverage closes that hole.
      await page.route('**/*', async (route, request) => {
        const isNavigation = request.isNavigationRequest() && request.frame() === page.mainFrame()
        let allow = false
        try {
          allow = await handler(request.url(), isNavigation)
        } catch {
          allow = false
        }
        if (allow) {
          await route.continue().catch(() => {})
        } else {
          await route.abort().catch(() => {})
        }
      })
    },
  }
}
