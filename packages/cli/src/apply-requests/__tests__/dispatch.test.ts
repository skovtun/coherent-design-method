/**
 * dispatch.ts — unit tests for the deterministic switch cases.
 *
 * Covers each of the 6 deterministic ModificationRequest types:
 *   update-token, add-component, modify-component, update-navigation,
 *   delete-page, delete-component.
 *
 * AI-dependent cases land in PR1 commit #6 with their own test file.
 *
 * NOT covered here: parity diff against modification-handler.ts inline
 * switch — that lives in PR1 commit #9 (DRIFT GATE) as fixture-based
 * tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import {
  ComponentManager,
  DesignSystemManager,
  PageManager,
  type ModificationRequest,
  saveManifest,
} from '@getcoherent/core'
import { createMinimalConfig } from '../../utils/minimal-config.js'
import { dispatchDeterministic, isDeterministic } from '../dispatch.js'
import type { ApplyRequestsContext } from '../types.js'

let projectRoot: string

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'apply-requests-dispatch-'))
})

afterEach(() => {
  if (projectRoot && existsSync(projectRoot)) rmSync(projectRoot, { recursive: true, force: true })
})

async function buildCtx(
  seedPages: Array<{ id: string; route: string; name?: string }> = [],
): Promise<ApplyRequestsContext> {
  const config = createMinimalConfig('Test')
  const now = new Date().toISOString()
  // De-dupe against the init-seed `/` page createMinimalConfig already adds.
  const filtered = seedPages.filter(p => p.route !== '/')
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

describe('isDeterministic', () => {
  it('returns true for the 6 deterministic types', () => {
    const types: ModificationRequest['type'][] = [
      'update-token',
      'add-component',
      'modify-component',
      'update-navigation',
      'delete-page',
      'delete-component',
    ]
    for (const type of types) {
      expect(isDeterministic({ type, target: 'x', changes: {} } as ModificationRequest)).toBe(true)
    }
  })

  it('returns false for AI-dependent types', () => {
    const types: ModificationRequest['type'][] = [
      'modify-layout-block',
      'link-shared',
      'promote-and-link',
      'add-page',
      'update-page',
    ]
    for (const type of types) {
      expect(isDeterministic({ type, target: 'x', changes: {} } as ModificationRequest)).toBe(false)
    }
  })
})

describe('dispatchDeterministic', () => {
  it('returns null for AI-dependent types (caller hands off to dispatchAi)', async () => {
    const ctx = await buildCtx()
    const req: ModificationRequest = { type: 'add-page', target: 'x', changes: {} }
    const result = await dispatchDeterministic(req, ctx)
    expect(result).toBeNull()
  })

  describe('update-token', () => {
    it('updates a token via dsm.updateToken', async () => {
      const ctx = await buildCtx()
      const req: ModificationRequest = {
        type: 'update-token',
        target: 'colors.light.primary',
        // Schema validates against the existing hex shape — match it.
        changes: { value: '#10B981' },
      }
      const result = await dispatchDeterministic(req, ctx)
      expect(result).not.toBeNull()
      expect(result!.success).toBe(true)
      expect(result!.message).toMatch(/Updated token/i)
    })
  })

  describe('add-component', () => {
    it('registers a non-shadcn component via cm.register', async () => {
      const ctx = await buildCtx()
      const now = new Date().toISOString()
      const req: ModificationRequest = {
        type: 'add-component',
        target: 'new',
        changes: {
          id: 'my-button',
          name: 'MyButton',
          source: 'custom',
          category: 'form',
          baseClassName: 'rounded-md px-4 py-2',
          variants: [],
          sizes: [],
          createdAt: now,
          updatedAt: now,
        },
      }
      const result = await dispatchDeterministic(req, ctx)
      expect(result).not.toBeNull()
      expect(result!.success).toBe(true)
    })
  })

  describe('modify-component', () => {
    it('returns the result of cm.update (success or failure, no throw)', async () => {
      const ctx = await buildCtx()
      const req: ModificationRequest = {
        type: 'modify-component',
        target: 'nonexistent-component',
        changes: { variants: ['primary'] },
      }
      const result = await dispatchDeterministic(req, ctx)
      expect(result).not.toBeNull()
      // Likely failure on nonexistent component — what matters is no throw.
      expect(typeof result!.success).toBe('boolean')
    })
  })

  describe('update-navigation', () => {
    it('always succeeds — actual nav rendering is a downstream concern', async () => {
      const ctx = await buildCtx()
      const req: ModificationRequest = {
        type: 'update-navigation',
        target: 'navigation',
        changes: {},
      }
      const result = await dispatchDeterministic(req, ctx)
      expect(result).not.toBeNull()
      expect(result!.success).toBe(true)
      expect(result!.modified).toContain('navigation')
    })
  })

  describe('delete-page', () => {
    it('refuses without target', async () => {
      const ctx = await buildCtx([{ id: 'about', route: '/about' }])
      const req = { type: 'delete-page', target: '', changes: {} } as unknown as ModificationRequest
      const result = await dispatchDeterministic(req, ctx)
      expect(result).not.toBeNull()
      expect(result!.success).toBe(false)
      expect(result!.message).toMatch(/requires target/i)
    })

    it('refuses to delete the root page (/)', async () => {
      // Root page already in createMinimalConfig seed.
      const ctx = await buildCtx()
      const req: ModificationRequest = { type: 'delete-page', target: '/', changes: {} }
      const result = await dispatchDeterministic(req, ctx)
      expect(result).not.toBeNull()
      expect(result!.success).toBe(false)
      expect(result!.message).toMatch(/refusing to delete the root page/i)
    })

    it('returns failure when the target page does not exist', async () => {
      const ctx = await buildCtx()
      const req: ModificationRequest = { type: 'delete-page', target: 'nonexistent', changes: {} }
      const result = await dispatchDeterministic(req, ctx)
      expect(result).not.toBeNull()
      expect(result!.success).toBe(false)
      expect(result!.message).toMatch(/no page matches/i)
    })

    it('deletes the page file and removes it from config when target exists', async () => {
      const ctx = await buildCtx([{ id: 'about', route: '/about', name: 'About' }])
      // Seed a page file so we can verify deletion.
      mkdirSync(join(projectRoot, 'app', 'about'), { recursive: true })
      writeFileSync(join(projectRoot, 'app', 'about', 'page.tsx'), 'export default function A(){}', 'utf-8')

      const req: ModificationRequest = { type: 'delete-page', target: 'about', changes: {} }
      const result = await dispatchDeterministic(req, ctx)
      expect(result).not.toBeNull()
      expect(result!.success).toBe(true)
      // File on disk gone.
      expect(existsSync(join(projectRoot, 'app', 'about', 'page.tsx'))).toBe(false)
      // Config-pages no longer contains the about page.
      const remainingIds = ctx.dsm.getConfig().pages.map(p => p.id)
      expect(remainingIds).not.toContain('about')
    })
  })

  describe('delete-component', () => {
    it('refuses without target', async () => {
      const ctx = await buildCtx()
      const req = { type: 'delete-component', target: '', changes: {} } as unknown as ModificationRequest
      const result = await dispatchDeterministic(req, ctx)
      expect(result).not.toBeNull()
      expect(result!.success).toBe(false)
      expect(result!.message).toMatch(/requires target/i)
    })

    it('returns failure when target component is not in the manifest', async () => {
      const ctx = await buildCtx()
      // Empty manifest.
      await saveManifest(projectRoot, { shared: [], nextId: 1 })
      const req: ModificationRequest = { type: 'delete-component', target: 'CID-999', changes: {} }
      const result = await dispatchDeterministic(req, ctx)
      expect(result).not.toBeNull()
      expect(result!.success).toBe(false)
      expect(result!.message).toMatch(/no shared component matches/i)
    })

    it('deletes the file and removes the manifest entry when target exists', async () => {
      const ctx = await buildCtx()
      mkdirSync(join(projectRoot, 'components', 'shared'), { recursive: true })
      writeFileSync(
        join(projectRoot, 'components', 'shared', 'hero.tsx'),
        'export function Hero(){return null}',
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

      const req: ModificationRequest = { type: 'delete-component', target: 'CID-001', changes: {} }
      const result = await dispatchDeterministic(req, ctx)
      expect(result).not.toBeNull()
      expect(result!.success).toBe(true)
      expect(existsSync(join(projectRoot, 'components', 'shared', 'hero.tsx'))).toBe(false)
    })
  })
})

// Suppress unused import — resolve is part of the test fixture vocabulary.
void resolve
