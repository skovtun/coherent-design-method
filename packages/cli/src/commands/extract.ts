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
import {
  buildExtractedDesignMarkdown,
  buildHostResolverRules,
  captureSnapshot,
  defaultSsrfGuard,
  extractDesignTokens,
  runSemanticInference,
  SemanticInferenceError,
  type SemanticLlmOutput,
  type SsrfGuardResult,
} from '@getcoherent/core'
import { createPlaywrightDriver } from '../url-extract/playwright-driver.js'
import { createAnthropicSemanticCall } from '../url-extract/anthropic-semantic-call.js'

export interface ExtractOptions {
  json?: boolean
  out?: string
  timeout?: string
  // Commander maps `--no-headless` to `opts.headless === false` (default true).
  // Field MUST be `headless`, not `noHeadless`, or the flag is dead code.
  headless?: boolean
  semantic?: boolean
}

/**
 * Stdout sink markers. `--out -` (raw, JSON default) plus explicit `.json` /
 * `.md` / `.markdown` variants so pipelines can pick the serialization
 * format. Case-insensitive — `-` and `-.MD` both route to stdout. The single
 * source of truth for both `extractCommand` and `shouldSkipUpdateCheck`
 * (banner suppression).
 */
const STDOUT_SINKS = new Set(['-', '-.json', '-.md', '-.markdown'])
export function isStdoutSink(value: string | undefined): boolean {
  if (!value) return false
  return STDOUT_SINKS.has(value.toLowerCase())
}

export async function extractCommand(url: string, opts: ExtractOptions = {}): Promise<void> {
  // Mutually exclusive output flags. `--json` writes JSON to stdout; `--out`
  // chooses a sink (file or `-`) and the file extension picks the format.
  // Combining them is ambiguous (`--json --out -.md` would silently emit MD)
  // — refuse early so scripts get a deterministic contract.
  if (opts.json && opts.out) {
    console.error(
      chalk.red('✗ --json and --out are mutually exclusive. Pick one (--out -.json for stdout JSON via --out).'),
    )
    process.exit(1)
  }

  // Pre-navigation SSRF gate. Async because hostnames must DNS-resolve and
  // every A/AAAA record is validated against the private-IP blocklist. The
  // resolved addresses also pin Chromium's resolver, closing the DNS-rebind
  // window between Node's lookup and the browser's.
  let validated: SsrfGuardResult
  try {
    validated = await defaultSsrfGuard(url)
  } catch (err) {
    console.error(chalk.red('✗ ' + (err as Error).message))
    process.exit(1)
  }

  const timeoutMs = opts.timeout ? parseInt(opts.timeout, 10) : undefined
  const hostResolverRules = buildHostResolverRules(validated.host, validated.addresses)

  const spinner = ora({ text: `Launching browser…`, color: 'cyan' }).start()
  let driver: Awaited<ReturnType<typeof createPlaywrightDriver>> | null = null
  try {
    driver = await createPlaywrightDriver({ headless: opts.headless ?? true, hostResolverRules })
    spinner.text = `Navigating to ${url}…`

    const snapshot = await captureSnapshot(url, driver, { timeoutMs })
    spinner.text = 'Extracting deterministic tokens…'

    const tokens = extractDesignTokens(snapshot.computedStyles, { mediaQueries: snapshot.mediaQueries })
    spinner.succeed(`Captured in ${snapshot.loadTimeMs}ms (mode: ${snapshot.mode})`)

    let semantic: SemanticLlmOutput | null = null
    if (opts.semantic) {
      const semSpinner = ora({ text: 'Running semantic inference (LLM)…', color: 'cyan' }).start()
      try {
        const llmCall = createAnthropicSemanticCall()
        semantic = await runSemanticInference(
          {
            url,
            copyText: snapshot.copyText,
            hero: snapshot.hero,
            metaDescription: snapshot.metaDescription,
            deterministic: tokens,
          },
          llmCall,
        )
        semSpinner.succeed(`Semantic pass: ${semantic.density} · ${semantic.voice.tone.slice(0, 3).join(', ')}`)
      } catch (err) {
        const msg =
          err instanceof SemanticInferenceError ? `LLM output invalid: ${err.message}` : (err as Error).message
        semSpinner.fail(`Semantic pass failed — continuing without (${msg})`)
        semantic = null
      }
    }

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
      semantic,
    }

    if (opts.out) {
      // .md / .markdown → DESIGN.md artifact; everything else → JSON dump.
      // `-` is the canonical stdout sink (JSON by default); `-.md` /
      // `-.markdown` / `-.json` pick the explicit format.
      const wantsMd = /\.(md|markdown)$/i.test(opts.out)
      const body = wantsMd
        ? buildExtractedDesignMarkdown({
            source: payload.source,
            hero: payload.hero,
            tokens: payload.tokens,
            semantic: payload.semantic
              ? {
                  summary: payload.semantic.summary,
                  voice: payload.semantic.voice,
                  density: payload.semantic.density,
                  colorRoles: payload.semantic.colorRoles,
                }
              : undefined,
          })
        : JSON.stringify(payload, null, 2)
      if (isStdoutSink(opts.out)) {
        // Bare write — no spinner / success line, so the artifact is the only
        // thing on stdout and `coherent extract <url> --out - | jq` works.
        // Single write of body+newline halves the broken-pipe error surface;
        // `EPIPE` (downstream `head`/`jq` closed early) is graceful exit, not
        // a crash.
        await writeStdoutEpipeSafe(body.endsWith('\n') ? body : body + '\n')
      } else {
        await writeFile(opts.out, body, 'utf-8')
        console.log(chalk.green(`✓ Wrote ${opts.out}${wantsMd ? ' (DESIGN.md)' : ' (JSON)'}`))
      }
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
  semantic?: SemanticLlmOutput | null
}): void {
  const { source, hero, tokens, semantic } = payload
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

  if (semantic) {
    console.log(chalk.bold('SEMANTIC') + chalk.dim('  (LLM)'))
    console.log(line('summary', semantic.summary))
    console.log(line('density', semantic.density))
    console.log(line('voice', semantic.voice.tone.join(', ')))
    for (const s of semantic.voice.samples.slice(0, 3)) {
      console.log(line(s.source, truncate(s.text, 70)))
    }
    if (semantic.colorRoles.length > 0) {
      console.log(
        line(
          'roles',
          semantic.colorRoles
            .slice(0, 6)
            .map(c => `${c.hex}=${c.role}`)
            .join('  '),
        ),
      )
    }
    console.log()
  } else {
    console.log(chalk.dim(`Note: pass --semantic to add LLM role inference + voice + density.`))
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

/**
 * Write a single payload to stdout, treating `EPIPE` as a graceful pipeline
 * close (downstream `head` / `jq` exited early). Awaits the drain callback
 * so very large bodies (`--semantic` payloads can be 50-100KB) do not race
 * the process exiting. Any other error propagates to the caller.
 */
function writeStdoutEpipeSafe(body: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      if (err.code === 'EPIPE') {
        // Downstream consumer closed first; that's a normal pipeline end.
        // Detach so we do not see the same error on the next tick.
        process.stdout.off('error', onError)
        resolve()
        return
      }
      reject(err)
    }
    process.stdout.on('error', onError)
    const ok = process.stdout.write(body, err => {
      process.stdout.off('error', onError)
      if (err) {
        if ((err as NodeJS.ErrnoException).code === 'EPIPE') resolve()
        else reject(err)
        return
      }
      resolve()
    })
    // If write returned false the kernel buffer is full; the callback above
    // will still fire once the buffer drains.
    if (!ok) {
      // No-op — Node guarantees the callback runs after the drain.
    }
  })
}
