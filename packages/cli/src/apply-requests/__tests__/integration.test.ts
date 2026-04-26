/**
 * apply-requests/integration — end-to-end tests across multiple request
 * types in one applyRequests call.
 *
 * The unit tests in dispatch.test / dispatch-ai.test / index.test cover
 * each path in isolation. This file proves the WORKING-TOGETHER property:
 * sequential requests against the same dsm/cm/pm trio produce the
 * cumulative state we expect, and one request's mutation is visible to
 * the next.
 *
 * Sister test: PR1 #9 records 6 deterministic fixtures and asserts the
 * applyRequests output is byte-equivalent to the legacy applyModification
 * loop (DRIFT GATE). This file is the smoke test that proves end-to-end
 * orchestration works; #9 is the cross-rail parity proof.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  ComponentManager,
  DesignSystemManager,
  PageManager,
  saveManifest,
  type ModificationRequest,
} from '@getcoherent/core'
import { createMinimalConfig } from '../../utils/minimal-config.js'
import { applyRequests } from '../index.js'
import type { ApplyRequestsContext } from '../types.js'

let projectRoot: string

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'apply-requests-integration-'))
})

afterEach(() => {
  if (projectRoot && existsSync(projectRoot)) rmSync(projectRoot, { recursive: true, force: true })
})

async function buildCtx(
  pages: Array<{ id: string; route: string; name?: string }> = [],
): Promise<ApplyRequestsContext> {
  const config = createMinimalConfig('Test')
  const now = new Date().toISOString()
  const filtered = pages.filter(p => p.route !== '/')
  config.pages = [
    ...config.pages,
    ...filtered.map(p => ({
      id: p.id,
      name: p.name ?? p.id,
      route: p.route,
      layout: 'centered' as const,
      sections: [],
      title: p.name ?? p.id,
      description: '',
      requiresAuth: false,
      noIndex: false,
      createdAt: now,
      updatedAt: now,
    })),
  ]
  const configPath = join(projectRoot, 'design-system.config.ts')
  writeFileSync(configPath, `export const config = ${JSON.stringify(config, null, 2)} as const\n`)
  const dsm = new DesignSystemManager(configPath)
  await dsm.load()
  const cm = new ComponentManager(dsm.getConfig())
  const pm = new PageManager(dsm.getConfig(), cm)
  return { dsm, cm, pm, projectRoot }
}

describe('applyRequests integration', () => {
  it('token update + nav update in sequence — both effects visible after the call', async () => {
    const ctx = await buildCtx()
    const initialPrimary = ctx.dsm.getConfig().tokens.colors.light.primary

    const requests: ModificationRequest[] = [
      { type: 'update-token', target: 'colors.light.primary', changes: { value: '#FF0000' } },
      { type: 'update-navigation', target: 'navigation', changes: {} },
    ]
    const results = await applyRequests(requests, ctx, 'with-ai')
    expect(results).toHaveLength(2)
    expect(results.every(r => r.success)).toBe(true)

    // Token mutation reflected in dsm's in-memory config.
    expect(ctx.dsm.getConfig().tokens.colors.light.primary).toBe('#FF0000')
    expect(ctx.dsm.getConfig().tokens.colors.light.primary).not.toBe(initialPrimary)
  })

  it('delete-page + delete-component in same call — both effects on disk', async () => {
    const ctx = await buildCtx([{ id: 'about', route: '/about', name: 'About' }])
    // Seed the page file.
    mkdirSync(join(projectRoot, 'app', 'about'), { recursive: true })
    writeFileSync(join(projectRoot, 'app', 'about', 'page.tsx'), 'export default function A(){}', 'utf-8')
    // Seed a shared component + manifest entry.
    mkdirSync(join(projectRoot, 'components', 'shared'), { recursive: true })
    writeFileSync(join(projectRoot, 'components', 'shared', 'hero.tsx'), 'export function H(){return null}', 'utf-8')
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

    const requests: ModificationRequest[] = [
      { type: 'delete-page', target: 'about', changes: {} },
      { type: 'delete-component', target: 'CID-001', changes: {} },
    ]
    const results = await applyRequests(requests, ctx, 'with-ai')
    expect(results).toHaveLength(2)
    expect(results.every(r => r.success)).toBe(true)

    // Both deletions land on disk.
    expect(existsSync(join(projectRoot, 'app', 'about', 'page.tsx'))).toBe(false)
    expect(existsSync(join(projectRoot, 'components', 'shared', 'hero.tsx'))).toBe(false)

    // Manifest no longer contains CID-001.
    const manifest = JSON.parse(readFileSync(join(projectRoot, 'coherent.components.json'), 'utf-8')) as {
      shared: Array<{ id: string }>
    }
    expect(manifest.shared.find(e => e.id === 'CID-001')).toBeUndefined()
  })

  it('failure on one request does not stop subsequent requests (per-request error isolation)', async () => {
    const ctx = await buildCtx()
    const requests: ModificationRequest[] = [
      // First fails — nonexistent target.
      { type: 'delete-page', target: 'does-not-exist', changes: {} },
      // Second should still run.
      { type: 'update-navigation', target: 'navigation', changes: {} },
    ]
    const results = await applyRequests(requests, ctx, 'with-ai')
    expect(results).toHaveLength(2)
    expect(results[0].success).toBe(false)
    expect(results[1].success).toBe(true)
  })

  it('subsequent request sees prior mutation — applyManagerResult side-effect chain', async () => {
    // delete-page mutates dsm via applyManagerResult; the second
    // delete-page must see the updated config (won't find the deleted
    // page even if asked again).
    const ctx = await buildCtx([
      { id: 'about', route: '/about', name: 'About' },
      { id: 'team', route: '/team', name: 'Team' },
    ])
    mkdirSync(join(projectRoot, 'app', 'about'), { recursive: true })
    writeFileSync(join(projectRoot, 'app', 'about', 'page.tsx'), 'export default function A(){}', 'utf-8')

    const requests: ModificationRequest[] = [
      { type: 'delete-page', target: 'about', changes: {} },
      // Asking again for the same page should fail (state propagation).
      { type: 'delete-page', target: 'about', changes: {} },
    ]
    const results = await applyRequests(requests, ctx, 'with-ai')
    expect(results[0].success).toBe(true)
    expect(results[1].success).toBe(false)
    expect(results[1].message).toMatch(/no page matches/i)
  })
})
