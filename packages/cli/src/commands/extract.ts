/**
 * Extract Command — Tool 1 v1
 *
 * `coherent extract <url>` — captures atmosphere from a live URL via headless
 * Chromium, runs deterministic extractor, prints summary or JSON.
 *
 * v0.19.0 bootstrap: deterministic-only output. Semantic LLM pass + DESIGN.md
 * serializer extension land in subsequent commits per the Tool 1 design doc.
 */

import chalk from 'chalk'
import { writeFile } from 'fs/promises'
import ora from 'ora'
import { buildExtractedDesignMarkdown, captureSnapshot, defaultSsrfGuard, extractDesignTokens } from '@getcoherent/core'
import { createPlaywrightDriver } from '../url-extract/playwright-driver.js'

export interface ExtractOptions {
  json?: boolean
  out?: string
  timeout?: string
  // Commander maps `--no-headless` to `opts.headless === false` (default true).
  // Field MUST be `headless`, not `noHeadless`, or the flag is dead code.
  headless?: boolean
}

export async function extractCommand(url: string, opts: ExtractOptions = {}): Promise<void> {
  // Pre-navigation SSRF gate. Surfaces the rejection before browser launch
  // (cheaper than waiting on Playwright bootstrap to fail). Async because
  // hostnames must DNS-resolve and every A/AAAA record is validated against
  // the private-IP blocklist.
  try {
    await defaultSsrfGuard(url)
  } catch (err) {
    console.error(chalk.red('✗ ' + (err as Error).message))
    process.exit(1)
  }

  const timeoutMs = opts.timeout ? parseInt(opts.timeout, 10) : undefined

  const spinner = ora({ text: `Launching browser…`, color: 'cyan' }).start()
  let driver: Awaited<ReturnType<typeof createPlaywrightDriver>> | null = null
  try {
    driver = await createPlaywrightDriver({ headless: opts.headless ?? true })
    spinner.text = `Navigating to ${url}…`

    const snapshot = await captureSnapshot(url, driver, { timeoutMs })
    spinner.text = 'Extracting deterministic tokens…'

    const tokens = extractDesignTokens(snapshot.computedStyles, { mediaQueries: snapshot.mediaQueries })
    spinner.succeed(`Captured in ${snapshot.loadTimeMs}ms (mode: ${snapshot.mode})`)

    const payload = {
      source: {
        url,
        finalUrl: snapshot.finalUrl,
        capturedAt: snapshot.capturedAt,
        mode: snapshot.mode,
        title: snapshot.title,
        loadTimeMs: snapshot.loadTimeMs,
      },
      hero: snapshot.hero,
      tokens,
    }

    if (opts.out) {
      // .md / .markdown → DESIGN.md artifact; everything else → JSON dump.
      const wantsMd = /\.(md|markdown)$/i.test(opts.out)
      const body = wantsMd
        ? buildExtractedDesignMarkdown({ source: payload.source, hero: payload.hero, tokens: payload.tokens })
        : JSON.stringify(payload, null, 2)
      await writeFile(opts.out, body, 'utf-8')
      console.log(chalk.green(`✓ Wrote ${opts.out}${wantsMd ? ' (DESIGN.md)' : ' (JSON)'}`))
    } else if (opts.json) {
      console.log(JSON.stringify(payload, null, 2))
    } else {
      printSummary(payload)
    }
  } catch (err) {
    spinner.fail((err as Error).message)
    process.exitCode = 1
  } finally {
    if (driver) await driver.close().catch(() => {})
  }
}

function printSummary(payload: {
  source: { url: string; finalUrl: string; mode: string; title: string; loadTimeMs: number }
  hero: { text: string | null; source: string; fontSize: number | null }
  tokens: ReturnType<typeof extractDesignTokens>
}): void {
  const { source, hero, tokens } = payload
  const line = (label: string, value: string) => `  ${chalk.dim(label.padEnd(14))} ${value}`

  console.log()
  console.log(chalk.bold(`ATMOSPHERE: ${source.url}`))
  console.log(chalk.dim(`Captured ${source.loadTimeMs}ms · mode: ${source.mode} · final: ${source.finalUrl}`))
  console.log()

  console.log(chalk.bold('HERO'))
  console.log(line('source', `${hero.source}${hero.fontSize ? ` (${hero.fontSize}px)` : ''}`))
  if (hero.text) console.log(line('text', truncate(hero.text, 80)))
  console.log()

  console.log(chalk.bold('COLORS') + chalk.dim(`  (${tokens.colors.length})`))
  for (const c of tokens.colors.slice(0, 8)) {
    console.log(line(c.role || '—', `${c.hex}  ${chalk.dim(c.usage || '')}`))
  }
  console.log()

  console.log(chalk.bold('TYPOGRAPHY'))
  for (const f of tokens.typography.families.slice(0, 3)) {
    console.log(line('family', f.family))
  }
  for (const s of tokens.typography.scale) {
    console.log(line(s.role, `${s.fontSize}${s.fontWeight ? ` w${s.fontWeight}` : ''}`))
  }
  console.log()

  if (tokens.spacing.length > 0) {
    console.log(chalk.bold('SPACING') + chalk.dim(`  scale`))
    console.log('  ' + tokens.spacing.map(s => `${s.px}px`).join(', '))
    console.log()
  }
  if (tokens.radius.length > 0) {
    console.log(chalk.bold('RADIUS') + chalk.dim(`  scale`))
    console.log('  ' + tokens.radius.map(r => `${r.px}px`).join(', '))
    console.log()
  }
  if (tokens.shadows.length > 0) {
    console.log(chalk.bold('SHADOWS') + chalk.dim(`  (${tokens.shadows.length})`))
    for (const s of tokens.shadows.slice(0, 4)) {
      console.log(line('—', truncate(s.value, 70)))
    }
    console.log()
  }
  if (tokens.motion.tokens.length > 0) {
    console.log(chalk.bold('MOTION') + chalk.dim(`  (${tokens.motion.tokens.length})`))
    for (const m of tokens.motion.tokens.slice(0, 4)) {
      console.log(line('—', `${m.duration}  ${m.easing}`))
    }
    console.log()
  }
  if (tokens.gradients.length > 0) {
    console.log(chalk.bold('GRADIENTS') + chalk.dim(`  (${tokens.gradients.length})`))
    for (const g of tokens.gradients.slice(0, 4)) {
      console.log(line(g.kind, truncate(g.raw, 70)))
    }
    console.log()
  }
  if (tokens.patterns.length > 0) {
    console.log(chalk.bold('PATTERNS') + chalk.dim(`  (${tokens.patterns.length})`))
    for (const p of tokens.patterns.slice(0, 4)) {
      console.log(line(p.kind, truncate(p.raw, 70)))
    }
    console.log()
  }
  if (tokens.breakpoints.values.length > 0) {
    console.log(chalk.bold('BREAKPOINTS') + chalk.dim(`  ${tokens.breakpoints.strategy}`))
    console.log('  ' + tokens.breakpoints.values.map(b => `${b.name}:${b.px}px`).join(', '))
    console.log()
  }

  console.log(chalk.dim(`Note: semantic LLM pass + DESIGN.md serializer land in next commits.`))
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
