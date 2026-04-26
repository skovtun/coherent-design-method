/**
 * parse.ts — unit tests for the pre-dispatch normalization pipeline.
 *
 * Mirrors pre.test.ts / post.test.ts shape. Covers the three concerns
 * parseRequests centralizes: applyDefaults pass, PJ-009 destructive-
 * intent guard, and per-request normalization with coercion refusal.
 *
 * NOT covered here: the wired-together applyRequests entry that calls
 * parse → dispatch → post. That lives in integration.test.ts after PR1
 * commit #7.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { ModificationRequest } from '@getcoherent/core'
import { DesignSystemManager } from '@getcoherent/core'
import { createMinimalConfig } from '../../utils/minimal-config.js'
import { parseRequests } from '../parse.js'

let projectRoot: string

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'apply-requests-parse-'))
})

afterEach(() => {
  if (projectRoot && existsSync(projectRoot)) rmSync(projectRoot, { recursive: true, force: true })
})

async function buildConfig(routes: string[] = []) {
  const config = createMinimalConfig('Test')
  const now = new Date().toISOString()
  config.pages = routes.map((route, i) => ({
    id: `page-${i}`,
    name: `Page ${i}`,
    route,
    layout: 'centered' as const,
    sections: [],
    title: `Page ${i}`,
    description: '',
    requiresAuth: false,
    noIndex: false,
    createdAt: now,
    updatedAt: now,
  }))
  const configPath = join(projectRoot, 'design-system.config.ts')
  writeFileSync(configPath, `export const config = ${JSON.stringify(config, null, 2)} as const\n`)
  const dsm = new DesignSystemManager(configPath)
  await dsm.load()
  return dsm.getConfig()
}

describe('parseRequests', () => {
  it('returns empty result when given no requests', async () => {
    const config = await buildConfig()
    const result = parseRequests([], 'add a pricing page', config)
    expect(result.requests).toEqual([])
    expect(result.destructiveRefusal).toBeNull()
    expect(result.adjustments).toEqual([])
  })

  it('passes a normal add-page request through unchanged', async () => {
    const config = await buildConfig()
    const req: ModificationRequest = {
      type: 'add-page',
      target: 'pricing',
      changes: { name: 'Pricing', route: '/pricing', sections: [] },
    }
    const result = parseRequests([req], 'add a pricing page', config)
    expect(result.requests).toHaveLength(1)
    expect(result.requests[0].type).toBe('add-page')
    expect(result.destructiveRefusal).toBeNull()
  })

  describe('PJ-009 destructive-intent guard', () => {
    it('refuses when user message is destructive but no delete-* request emerged', async () => {
      const config = await buildConfig(['/about'])
      // User said "delete" — AI emitted update-page (the bug).
      const req: ModificationRequest = {
        type: 'update-page',
        target: 'about',
        changes: { description: 'updated' },
      }
      const result = parseRequests([req], 'delete the about page', config)
      expect(result.destructiveRefusal).not.toBeNull()
      expect(result.destructiveRefusal?.reason).toMatch(/destructive/i)
      expect(result.destructiveRefusal?.hint).toMatch(/delete <page-name> page/i)
    })

    it('does NOT refuse when the user phrasing is "add a delete account page" (PJ-009 false-positive guard)', async () => {
      const config = await buildConfig()
      const req: ModificationRequest = {
        type: 'add-page',
        target: 'delete-account',
        changes: { name: 'Delete Account', route: '/delete-account', sections: [] },
      }
      // CREATE_DESTRUCTIVE_FEATURE_RE in destructive-preparser.ts requires a
      // space after delete/remove (regex anchors on `\s+`), so the natural
      // "add a delete account page" phrasing is exempted while raw "delete X"
      // is not. Hyphenated "delete-account" would still trigger destructive
      // intent — this test pins the canonical safe phrasing.
      const result = parseRequests([req], 'add a delete account page', config)
      expect(result.destructiveRefusal).toBeNull()
      expect(result.requests).toHaveLength(1)
    })

    it('lets a real delete-page request through when user message is destructive', async () => {
      const config = await buildConfig(['/about'])
      const req: ModificationRequest = {
        type: 'delete-page',
        target: 'about',
        changes: {},
      }
      const result = parseRequests([req], 'delete the about page', config)
      expect(result.destructiveRefusal).toBeNull()
      expect(result.requests).toHaveLength(1)
      expect(result.requests[0].type).toBe('delete-page')
    })

    it('refuses per-request coercion add-page → update-page when user said delete', async () => {
      // Two-pass scenario: there IS a delete-page in the list (so list-level
      // guard passes), but a separate add-page silently coerces to update-page.
      // PJ-009 says: refuse the coercion individually, keep the delete.
      const config = await buildConfig(['/about', '/contact'])
      const requests: ModificationRequest[] = [
        { type: 'delete-page', target: 'about', changes: {} },
        // This one coerces — target /contact already exists so add → update.
        {
          type: 'add-page',
          target: 'contact',
          changes: { name: 'Contact', route: '/contact', sections: [] },
        },
      ]
      const result = parseRequests(requests, 'delete the about page and remove contact', config)
      expect(result.destructiveRefusal).toBeNull() // list-level guard satisfied by delete-page
      // delete-page survives, add-page → update-page coercion is refused.
      const types = result.requests.map(r => r.type)
      expect(types).toContain('delete-page')
      expect(types).not.toContain('update-page')
      // Adjustment record explains why.
      const refused = result.adjustments.find(a => a.kind === 'coerced-refused')
      expect(refused).toBeDefined()
    })
  })

  describe('per-request normalization', () => {
    it('drops a request that normalizeRequest rejects with an error', async () => {
      const config = await buildConfig() // no pages
      // update-page with a target that doesn't exist and no pageCode →
      // normalizeRequest returns { error: 'Page "X" not found...' }.
      const req: ModificationRequest = {
        type: 'update-page',
        target: 'nonexistent',
        changes: { description: 'updated' },
      }
      const result = parseRequests([req], 'tweak the nonexistent page', config)
      expect(result.requests).toHaveLength(0)
      const skipped = result.adjustments.find(a => a.kind === 'skipped')
      expect(skipped).toBeDefined()
      if (skipped?.kind === 'skipped') {
        expect(skipped.reason).toMatch(/not found/i)
      }
    })

    it('records type-adjusted when normalizeRequest changes the type but message is not destructive', async () => {
      const config = await buildConfig(['/pricing'])
      // add-page on existing route → normalizer coerces to update-page.
      const req: ModificationRequest = {
        type: 'add-page',
        target: 'pricing',
        changes: { name: 'Pricing', route: '/pricing', sections: [] },
      }
      const result = parseRequests([req], 'tweak the pricing page', config)
      // Coercion is allowed because user message is NOT destructive.
      expect(result.requests).toHaveLength(1)
      expect(result.requests[0].type).toBe('update-page')
      const adjusted = result.adjustments.find(a => a.kind === 'type-adjusted')
      expect(adjusted).toBeDefined()
      if (adjusted?.kind === 'type-adjusted') {
        expect(adjusted.from).toBe('add-page')
        expect(adjusted.to).toBe('update-page')
      }
    })
  })
})
