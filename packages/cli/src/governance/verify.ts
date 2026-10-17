/**
 * Post-edit verification: project typecheck + rendered-route screenshots.
 *
 * Affected routes should change; control routes (outside the impact set) must
 * render pixel-identical, which is the rendered proof that the edit stayed in
 * scope (the write-set guard proves it at the file level).
 */
import { execFileSync, spawn, type ChildProcess } from 'child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { createServer } from 'net'
import { join } from 'path'

export interface TypecheckResult {
  ok: boolean
  errors: string[]
}

const WIN = process.platform === 'win32'
/** node_modules/.bin entry; on Windows the runnable shim is the .cmd, which needs a shell. */
const bin = (root: string, name: string) => join(root, 'node_modules', '.bin', WIN ? `${name}.cmd` : name)

export function typecheck(root: string): TypecheckResult {
  const tsc = bin(root, 'tsc')
  try {
    execFileSync(
      existsSync(tsc) ? tsc : 'npx',
      existsSync(tsc)
        ? ['--noEmit', '--incremental', 'false', '-p', '.']
        : ['tsc', '--noEmit', '--incremental', 'false', '-p', '.'],
      {
        cwd: root,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: WIN,
      },
    )
    return { ok: true, errors: [] }
  } catch (e) {
    const out = String((e as { stdout?: string }).stdout ?? '') + String((e as { stderr?: string }).stderr ?? '')
    return { ok: false, errors: out.split('\n').filter(l => /error TS\d+/.test(l)) }
  }
}

/** `.coherent/preview-params.json`: { "/campaigns/[id]": "/campaigns/cmp_1" } for dynamic routes. */
export function loadPreviewParams(root: string): Record<string, string> {
  const p = join(root, '.coherent', 'preview-params.json')
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : {}
}

export function concreteUrl(route: string, params: Record<string, string>): string | null {
  if (params[route]) return params[route]
  return route.includes('[') ? null : route
}

export interface Shot {
  route: string
  viewport: 'desktop' | 'mobile'
  path: string
}

const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } } as const

const FREEZE_CSS = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}`

async function loadChromium() {
  const pw = await import('playwright')
  return pw.chromium
}

export async function captureRoutes(
  baseUrl: string,
  routes: { route: string; url: string }[],
  outDir: string,
): Promise<Shot[]> {
  mkdirSync(outDir, { recursive: true })
  const chromium = await loadChromium()
  const browser = await chromium.launch()
  const shots: Shot[] = []
  try {
    for (const vp of ['desktop', 'mobile'] as const) {
      const ctx = await browser.newContext({ viewport: VIEWPORTS[vp], reducedMotion: 'reduce' })
      for (const r of routes) {
        const page = await ctx.newPage()
        await page.goto(baseUrl + r.url, { waitUntil: 'networkidle', timeout: 90_000 })
        await page.addStyleTag({ content: FREEZE_CSS })
        await page.waitForTimeout(600)
        const path = join(outDir, `${r.route.replace(/[^a-z0-9]+/gi, '_') || 'root'}-${vp}.png`)
        await page.screenshot({ path, fullPage: true })
        shots.push({ route: r.route, viewport: vp, path })
        await page.close()
      }
      await ctx.close()
    }
  } finally {
    await browser.close()
  }
  return shots
}

/**
 * Fraction of pixels that differ for each pair (size mismatch counts as fully
 * different), in one browser. Exact comparison: renders come from deterministic
 * builds, and a noise threshold hid real token edits (#ffffff → #fafaf9 is 16 units total).
 */
export async function diffMany(pairs: [string, string][]): Promise<number[]> {
  if (!pairs.length) return []
  const chromium = await loadChromium()
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const toUrl = (p: string) => 'data:image/png;base64,' + readFileSync(p).toString('base64')
    const out: number[] = []
    for (const [a, b] of pairs) {
      // Runs in the browser; passed as a string because the CLI has no DOM lib types.
      const script = `(async () => {
        const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
        const [ia, ib] = await Promise.all([load(${JSON.stringify(toUrl(a))}), load(${JSON.stringify(toUrl(b))})])
        if (ia.width !== ib.width || ia.height !== ib.height) return 1
        const px = img => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
          const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height).data }
        const da = px(ia), db = px(ib)
        let diff = 0
        for (let i = 0; i < da.length; i += 4)
          if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) diff++
        return diff / (da.length / 4)
      })()`
      out.push((await page.evaluate(script)) as number)
    }
    return out
  } finally {
    await browser.close()
  }
}

export async function diffRatio(a: string, b: string): Promise<number> {
  return (await diffMany([[a, b]]))[0]
}

export interface PreviewServer {
  url: string
  stop(): Promise<void>
}

/** Thrown when the project does not build before the edit: verification is blocked, not failed by the edit. */
export class PreviewBuildError extends Error {}

/**
 * Stop `next start` and everything it spawned, and wait for it. Killing only
 * the npm/next shim leaves the real server orphaned (and on Windows the shim
 * is a .cmd whose child survives a plain kill).
 */
function stopTree(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.pid === undefined) return Promise.resolve()
  const pid = child.pid
  const exited = new Promise<void>(res => child.once('exit', () => res()))
  try {
    if (WIN) execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
    else process.kill(-pid, 'SIGTERM')
  } catch {
    child.kill('SIGKILL')
  }
  return Promise.race([exited, new Promise<void>(res => setTimeout(res, 5000))])
}

function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const srv = createServer()
    srv.once('error', rej)
    srv.listen(0, () => {
      const port = (srv.address() as { port: number }).port
      srv.close(() => res(port))
    })
  })
}

/**
 * Production build + `next start` on a free port, owned by this edit.
 *
 * A user's running `next dev` is not a trustworthy oracle: Turbopack kept
 * serving a stale globals.css after a second write to it (observed: token edit
 * written, old --primary still served minutes later). A fresh build is
 * deterministic, doubles as the "project still builds" check, and since
 * Next 16 keeps dev output in .next/dev it does not disturb a running dev server.
 */
export async function startPreview(root: string): Promise<PreviewServer> {
  const next = bin(root, 'next')
  if (!existsSync(next)) throw new Error('next is not installed in this project (node_modules/.bin/next missing)')
  // Turbopack's persistent build cache intermittently kept a CSS-only edit out
  // of the next build (observed: renders lagged exactly one globals.css edit
  // behind the source). A cold build of a 13-page app is ~6s; correctness wins.
  rmSync(join(root, '.next', 'cache'), { recursive: true, force: true })
  try {
    execFileSync(next, ['build'], {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      shell: WIN,
    })
  } catch (e) {
    const out = String((e as { stdout?: string }).stdout ?? '') + String((e as { stderr?: string }).stderr ?? '')
    throw new PreviewBuildError(`next build failed:\n${out.split('\n').slice(-25).join('\n')}`)
  }
  const port = await freePort()
  const child = spawn(next, ['start', '-p', String(port)], {
    cwd: root,
    stdio: 'ignore',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    // Own process group on POSIX so stopTree can signal the whole tree.
    detached: !WIN,
    shell: WIN,
  })
  const url = `http://localhost:${port}`
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(url, { redirect: 'manual' })
      if (r.status < 500) return { url, stop: () => stopTree(child) }
    } catch {
      /* not up yet */
    }
    await new Promise(r => setTimeout(r, 500))
  }
  await stopTree(child)
  throw new Error(`next start did not answer on ${url} within 30s`)
}

/** Screenshots for a tree state, cached by tree hash so chained edits reuse "after" as the next "before". */
export async function shotsForTree(
  root: string,
  treeKey: string,
  targets: { route: string; url: string }[],
): Promise<Shot[]> {
  const dir = join(root, '.coherent', 'shots', treeKey)
  const expected = targets.flatMap(t =>
    (['desktop', 'mobile'] as const).map(vp => ({
      route: t.route,
      viewport: vp,
      path: join(dir, `${t.route.replace(/[^a-z0-9]+/gi, '_') || 'root'}-${vp}.png`),
    })),
  )
  if (expected.every(s => existsSync(s.path))) return expected
  const server = await startPreview(root)
  try {
    return await captureRoutes(server.url, targets, dir)
  } finally {
    await server.stop()
  }
}
