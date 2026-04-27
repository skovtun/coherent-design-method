/**
 * post.ts — unit tests for the post-apply pipeline helpers.
 *
 * Mirrors `pre.test.ts` shape. Each helper is small + focused; the
 * win is centralization (both rails will share the same code via
 * applyRequests in PR1 #7), not optimization.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { saveManifest } from '@getcoherent/core'
import { saveHashes } from '../../utils/file-hashes.js'
import { createPostApplyBackup, syncManifestMetadata, updateFileHashes } from '../post.js'

let projectRoot: string

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'apply-requests-post-'))
})

afterEach(() => {
  if (projectRoot && existsSync(projectRoot)) rmSync(projectRoot, { recursive: true, force: true })
})

describe('updateFileHashes', () => {
  it('returns existing hashes unchanged when no shared dir exists', async () => {
    const stored = { 'app/something.tsx': 'old-hash' }
    const updated = await updateFileHashes(projectRoot, stored)
    // No layout.tsx, no shared dir → updated = stored.
    expect(updated).toEqual(stored)
  })

  it('hashes app/layout.tsx when it exists', async () => {
    mkdirSync(join(projectRoot, 'app'), { recursive: true })
    writeFileSync(join(projectRoot, 'app', 'layout.tsx'), 'export default function L(){}', 'utf-8')
    const updated = await updateFileHashes(projectRoot, {})
    expect(updated['app/layout.tsx']).toBeDefined()
    expect(updated['app/layout.tsx']).toMatch(/^[0-9a-f]{64}$/) // sha256 hex
  })

  it('hashes every .tsx in components/shared/', async () => {
    mkdirSync(join(projectRoot, 'components', 'shared'), { recursive: true })
    writeFileSync(join(projectRoot, 'components', 'shared', 'header.tsx'), 'export function Header(){}', 'utf-8')
    writeFileSync(join(projectRoot, 'components', 'shared', 'footer.tsx'), 'export function Footer(){}', 'utf-8')
    // README.md and other non-tsx files must be skipped.
    writeFileSync(join(projectRoot, 'components', 'shared', 'README.md'), '# notes', 'utf-8')

    const updated = await updateFileHashes(projectRoot, {})
    expect(Object.keys(updated).sort()).toEqual(['components/shared/footer.tsx', 'components/shared/header.tsx'])
  })

  it('persists the updated map to disk so next run sees it', async () => {
    mkdirSync(join(projectRoot, 'components', 'shared'), { recursive: true })
    writeFileSync(join(projectRoot, 'components', 'shared', 'header.tsx'), 'export function Header(){}', 'utf-8')
    await updateFileHashes(projectRoot, {})
    // File-hashes file written under .coherent/.
    expect(existsSync(join(projectRoot, '.coherent', 'file-hashes.json'))).toBe(true)
  })

  it('preserves entries from storedHashes for files no longer present', async () => {
    // Pre-existing hash for a file that doesn't exist anymore — keep it.
    // (Defensive: hash registry is additive across runs; we don't
    // garbage-collect stale entries here. Doing so risks losing
    // intentional manual-edit-protection on temporarily-missing files.)
    const stored = { 'components/shared/old-component.tsx': 'old-hash-abc' }
    const updated = await updateFileHashes(projectRoot, stored)
    expect(updated['components/shared/old-component.tsx']).toBe('old-hash-abc')
  })

  it('never throws on internal failures (best-effort contract)', async () => {
    const fakeRoot = join(projectRoot, 'does-not-exist')
    await expect(updateFileHashes(fakeRoot, {})).resolves.toBeDefined()
  })
})

describe('syncManifestMetadata', () => {
  it('returns { changed: false } when no manifest exists', async () => {
    const result = await syncManifestMetadata(projectRoot, [])
    // Best-effort — missing manifest is not an error condition.
    expect(result.changed).toBe(false)
  })

  it('refreshes dependencies for shared components from live source', async () => {
    // Seed manifest + matching component file with a real ui import so
    // extractDependencies has something to find.
    mkdirSync(join(projectRoot, 'components', 'shared'), { recursive: true })
    writeFileSync(
      join(projectRoot, 'components', 'shared', 'hero.tsx'),
      `import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
export function Hero(){ return <Button>X</Button> }`,
      'utf-8',
    )
    await saveManifest(projectRoot, {
      shared: [
        {
          id: 'CID-001',
          name: 'Hero',
          type: 'section',
          file: 'components/shared/hero.tsx',
          usedIn: [],
          createdAt: new Date().toISOString(),
          dependencies: [], // empty — sync should populate
        },
      ],
      nextId: 2,
    })

    const result = await syncManifestMetadata(projectRoot, [])
    // The dependencies array length grew (was 0, now ≥ 1 from the
    // ui imports). Don't pin exact extractor output — that's the
    // extractor's contract, not post.ts's.
    expect(result.changed).toBe(true)
    expect(result.manifest?.shared[0].dependencies?.length ?? 0).toBeGreaterThan(0)
  })

  it('appends a page to component.usedIn when the page imports the component', async () => {
    mkdirSync(join(projectRoot, 'components', 'shared'), { recursive: true })
    writeFileSync(
      join(projectRoot, 'components', 'shared', 'hero.tsx'),
      'export function Hero(){ return null }',
      'utf-8',
    )
    mkdirSync(join(projectRoot, 'app', 'about'), { recursive: true })
    writeFileSync(
      join(projectRoot, 'app', 'about', 'page.tsx'),
      `import { Hero } from '@/components/shared/hero'
export default function About(){ return <Hero /> }`,
      'utf-8',
    )
    await saveManifest(projectRoot, {
      shared: [
        {
          id: 'CID-001',
          name: 'Hero',
          type: 'section',
          file: 'components/shared/hero.tsx',
          usedIn: [], // empty — sync should append about page
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
      ],
      nextId: 2,
    })

    const result = await syncManifestMetadata(projectRoot, ['app/about/page.tsx'])
    expect(result.changed).toBe(true)
    expect(result.manifest?.shared[0].usedIn).toContain('app/about/page.tsx')
  })

  it('is idempotent — re-running on a synced manifest returns changed=false', async () => {
    mkdirSync(join(projectRoot, 'components', 'shared'), { recursive: true })
    writeFileSync(
      join(projectRoot, 'components', 'shared', 'hero.tsx'),
      'export function Hero(){ return null }',
      'utf-8',
    )
    await saveManifest(projectRoot, {
      shared: [
        {
          id: 'CID-001',
          name: 'Hero',
          type: 'section',
          file: 'components/shared/hero.tsx',
          usedIn: [],
          createdAt: new Date().toISOString(),
          dependencies: [],
        },
      ],
      nextId: 2,
    })
    // First run synchronizes — second is a no-op.
    await syncManifestMetadata(projectRoot, [])
    const second = await syncManifestMetadata(projectRoot, [])
    expect(second.changed).toBe(false)
  })

  it('never throws on missing/corrupt manifest (best-effort)', async () => {
    // Write a corrupt manifest.
    writeFileSync(join(projectRoot, 'coherent.components.json'), '{ this is not json', 'utf-8')
    const result = await syncManifestMetadata(projectRoot, [])
    expect(result.changed).toBe(false)
  })
})

describe('createPostApplyBackup', () => {
  it('never throws — best-effort contract matches pre-apply backup', () => {
    expect(() => createPostApplyBackup(projectRoot)).not.toThrow()
  })

  it('returns string path or null on missing project root', () => {
    const fakeRoot = join(projectRoot, 'does-not-exist')
    const result = createPostApplyBackup(fakeRoot)
    expect(result === null || typeof result === 'string').toBe(true)
  })
})

// Suppress unused import warning — saveHashes is part of the test
// fixture vocabulary even when not directly called this run.
void saveHashes
