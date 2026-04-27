/**
 * applyRequests entry — unit tests.
 *
 * Covers the per-request routing contract: deterministic types go through
 * dispatchDeterministic, AI-dependent types go through dispatchAi with
 * the applyMode gate enforced.
 *
 * NOT covered here: the dispatchDeterministic / dispatchAi internals
 * themselves — those have their own dedicated test files (dispatch.test
 * and dispatch-ai.test). Integration tests across multiple requests +
 * the parity gate against modification-handler.ts inline switch land in
 * PR1 commits #8 and #9.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ComponentManager, DesignSystemManager, PageManager, type ModificationRequest } from '@getcoherent/core'
import { createMinimalConfig } from '../../utils/minimal-config.js'
import { CoherentError } from '../../errors/CoherentError.js'
import { applyRequests } from '../index.js'
import type { ApplyRequestsContext } from '../types.js'

let projectRoot: string

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'apply-requests-entry-'))
})

afterEach(() => {
  if (projectRoot && existsSync(projectRoot)) rmSync(projectRoot, { recursive: true, force: true })
})

async function buildCtx(): Promise<ApplyRequestsContext> {
  const config = createMinimalConfig('Test')
  const configPath = join(projectRoot, 'design-system.config.ts')
  writeFileSync(configPath, `export const config = ${JSON.stringify(config, null, 2)} as const\n`)
  const dsm = new DesignSystemManager(configPath)
  await dsm.load()
  const cm = new ComponentManager(dsm.getConfig())
  const pm = new PageManager(dsm.getConfig(), cm)
  return { dsm, cm, pm, projectRoot }
}

describe('applyRequests', () => {
  it('returns empty array for empty input', async () => {
    const ctx = await buildCtx()
    const results = await applyRequests([], ctx, 'with-ai')
    expect(results).toEqual([])
  })

  it('routes a deterministic request through dispatchDeterministic', async () => {
    const ctx = await buildCtx()
    // update-navigation always succeeds — clean signal.
    const req: ModificationRequest = {
      type: 'update-navigation',
      target: 'navigation',
      changes: {},
    }
    const results = await applyRequests([req], ctx, 'with-ai')
    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(true)
    expect(results[0].modified).toContain('navigation')
  })

  it('processes multiple requests sequentially in order', async () => {
    const ctx = await buildCtx()
    const requests: ModificationRequest[] = [
      { type: 'update-navigation', target: 'nav', changes: {} },
      { type: 'update-token', target: 'colors.light.primary', changes: { value: '#10B981' } },
      { type: 'update-navigation', target: 'nav', changes: {} },
    ]
    const results = await applyRequests(requests, ctx, 'with-ai')
    expect(results).toHaveLength(3)
    // First and third are nav updates → success.
    expect(results[0].success).toBe(true)
    expect(results[2].success).toBe(true)
    // Middle is the token update.
    expect(results[1].message).toMatch(/Updated token|already set/i)
  })

  it("'no-new-ai' mode throws E007 for an AI-dependent request without pre-population", async () => {
    const ctx = await buildCtx()
    const req: ModificationRequest = {
      type: 'add-page',
      target: 'pricing',
      changes: { name: 'Pricing', route: '/pricing' },
    }
    await expect(applyRequests([req], ctx, 'no-new-ai')).rejects.toThrow(CoherentError)
  })

  it("'no-new-ai' mode allows a deterministic request to proceed (no gate)", async () => {
    const ctx = await buildCtx()
    const req: ModificationRequest = {
      type: 'update-navigation',
      target: 'nav',
      changes: {},
    }
    const results = await applyRequests([req], ctx, 'no-new-ai')
    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(true)
  })

  it('mixes deterministic and AI requests — deterministic succeeds, AI throws when un-pre-populated under no-new-ai', async () => {
    const ctx = await buildCtx()
    const requests: ModificationRequest[] = [
      // The deterministic request would succeed if reached, but the
      // sequential loop hits the AI request first and throws.
      // Test verifies fail-fast semantics.
      {
        type: 'add-page',
        target: 'pricing',
        changes: { name: 'Pricing', route: '/pricing' },
      },
      { type: 'update-navigation', target: 'nav', changes: {} },
    ]
    await expect(applyRequests(requests, ctx, 'no-new-ai')).rejects.toThrow(CoherentError)
  })

  it('deletes a page through the deterministic path (regression: full route through entry)', async () => {
    const ctx = await buildCtx()
    // Seed a page in config + on disk.
    const cfg = ctx.dsm.getConfig()
    const now = new Date().toISOString()
    cfg.pages.push({
      id: 'about',
      name: 'About',
      route: '/about',
      layout: 'centered',
      sections: [],
      title: 'About',
      description: '',
      requiresAuth: false,
      noIndex: false,
      createdAt: now,
      updatedAt: now,
    })
    ctx.dsm.updateConfig(cfg)
    mkdirSync(join(projectRoot, 'app', 'about'), { recursive: true })
    writeFileSync(join(projectRoot, 'app', 'about', 'page.tsx'), 'export default function A(){}', 'utf-8')

    const results = await applyRequests([{ type: 'delete-page', target: 'about', changes: {} }], ctx, 'with-ai')
    expect(results).toHaveLength(1)
    expect(results[0].success).toBe(true)
    expect(existsSync(join(projectRoot, 'app', 'about', 'page.tsx'))).toBe(false)
  })
})
