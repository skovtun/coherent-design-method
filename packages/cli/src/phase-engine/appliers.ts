/**
 * Session-end appliers — read session artifacts, mutate project state.
 *
 * `coherent session end` runs these after every phase has written its output
 * to the session dir. Codex review flagged that the skill-mode `session end`
 * reached the lifecycle function without any appliers, so a "successful"
 * run only cleaned up the session dir — generated config-delta / components
 * / pages were never applied to the project.
 *
 * Three appliers cover the v0.9.0 skill-mode scope:
 *
 *   - `createConfigDeltaApplier()` — reads `config-delta.json`, opens the
 *     project's DesignSystemManager, applies the delta (name,
 *     navigationType), saves. No-op when the delta is absent.
 *
 *   - `createComponentsApplier()` — reads `components-generated.json`,
 *     calls `generateSharedComponent` per entry to write
 *     `components/shared/<kebab>.tsx` and update
 *     `coherent.components.json`. No-op when no components were produced.
 *
 *   - `createPagesApplier()` — lists `page-<id>.json` artifacts, extracts
 *     the AI-generated page code, writes it to the right route-group path
 *     under `app/`, registers the page in the DSM. No-op for empty
 *     artifacts. Skips the chat rail's richer post-processing
 *     (component-install, auto-fix, link-map) — users run `coherent fix`
 *     afterward if they need it. A future chat.ts facade refactor (R3
 *     closure) will unify the two paths.
 *
 * Appliers run in order: config-delta first (so components/pages see the
 * updated config), components next (so pages can import them), pages last.
 */

import { dirname, resolve } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { DesignSystemManager, generateSharedComponent } from '@getcoherent/core'
import type { ModificationRequest, PageDefinition } from '@getcoherent/core'
import type { ArtifactApplier, ArtifactApplierContext } from './session-lifecycle.js'
import type { ConfigDelta } from './phases/plan.js'
import type { ComponentsArtifact } from './phases/components.js'
import type { PageArtifact } from './phases/page.js'
import { routeToFsPath } from '../commands/chat/utils.js'

const CONFIG_DELTA_ARTIFACT = 'config-delta.json'
const COMPONENTS_GENERATED_ARTIFACT = 'components-generated.json'

/**
 * Apply `config-delta.json` to the project's design-system.config.ts.
 * Today: name, navigationType. Future phases may extend the delta — apply
 * additively, never subtractively.
 */
export function createConfigDeltaApplier(): ArtifactApplier {
  return {
    name: 'config-delta',
    async apply(ctx: ArtifactApplierContext): Promise<string[]> {
      const raw = await ctx.store.readArtifact(ctx.uuid, CONFIG_DELTA_ARTIFACT)
      if (raw === null) return []

      const delta = JSON.parse(raw) as ConfigDelta
      const configPath = resolve(ctx.projectRoot, 'design-system.config.ts')
      const dsm = new DesignSystemManager(configPath)
      await dsm.load()
      const config = dsm.getConfig()

      const changes: string[] = []

      if (typeof delta.name === 'string' && delta.name !== config.name) {
        const next = { ...config, name: delta.name, updatedAt: new Date().toISOString() }
        dsm.updateConfig(next)
        changes.push(`name: ${JSON.stringify(config.name)} → ${JSON.stringify(delta.name)}`)
      }

      if (delta.navigationType && config.navigation && delta.navigationType !== config.navigation.type) {
        const next = {
          ...dsm.getConfig(),
          navigation: { ...config.navigation, type: delta.navigationType },
          updatedAt: new Date().toISOString(),
        }
        dsm.updateConfig(next)
        changes.push(
          `navigation.type: ${JSON.stringify(config.navigation.type)} → ${JSON.stringify(delta.navigationType)}`,
        )
      }

      if (changes.length > 0) {
        await dsm.save()
      }
      return changes
    },
  }
}

/**
 * Apply `components-generated.json` by writing each entry to
 * `components/shared/<kebab>.tsx` and registering it in the manifest.
 */
export function createComponentsApplier(): ArtifactApplier {
  return {
    name: 'components',
    async apply(ctx: ArtifactApplierContext): Promise<string[]> {
      const raw = await ctx.store.readArtifact(ctx.uuid, COMPONENTS_GENERATED_ARTIFACT)
      if (raw === null) return []

      const artifact = JSON.parse(raw) as ComponentsArtifact
      if (!Array.isArray(artifact.components) || artifact.components.length === 0) return []

      const written: string[] = []
      for (const component of artifact.components) {
        if (!component.code || !component.name) continue
        const result = await generateSharedComponent(ctx.projectRoot, {
          name: component.name,
          type: 'section',
          code: component.code,
          source: 'generated',
        })
        written.push(`${result.name} → ${result.file}`)
      }
      return written
    },
  }
}

/**
 * Apply every `page-<id>.json` artifact: write the generated pageCode to
 * the route's filesystem path and register the page in DSM.
 *
 * Routing rules delegate to `routeToFsPath` — same logic the chat rail
 * uses, so `/login` lands under `app/(auth)/`, `/pricing` under `app/`,
 * and app-like routes under `app/(app)/`. Pages with no pageCode in the
 * artifact (model returned nothing usable) are skipped with a warning
 * entry in the applied list so the user sees which pages need a
 * regenerate.
 */
export function createPagesApplier(): ArtifactApplier {
  return {
    name: 'pages',
    async apply(ctx: ArtifactApplierContext): Promise<string[]> {
      const artifacts = await ctx.store.listArtifacts(ctx.uuid)
      const pageFiles = artifacts.filter(a => /^page-[^/]+\.json$/.test(a))
      if (pageFiles.length === 0) return []

      const configPath = resolve(ctx.projectRoot, 'design-system.config.ts')
      const dsm = new DesignSystemManager(configPath)
      await dsm.load()

      const results: string[] = []
      for (const file of pageFiles) {
        const raw = await ctx.store.readArtifact(ctx.uuid, file)
        if (raw === null) continue
        const page = JSON.parse(raw) as PageArtifact
        if (!page.request) {
          results.push(`skipped ${page.id} (no AI request)`)
          continue
        }
        const changes = (page.request as ModificationRequest).changes as Record<string, unknown>
        const pageCode = typeof changes.pageCode === 'string' ? changes.pageCode.trim() : ''
        if (!pageCode) {
          results.push(`skipped ${page.id} (empty pageCode)`)
          continue
        }

        const fsPath = routeToFsPath(ctx.projectRoot, page.route, page.pageType === 'auth')
        await mkdir(dirname(fsPath), { recursive: true })
        await writeFile(fsPath, pageCode, 'utf-8')

        // Register the page in DSM so downstream commands (coherent status,
        // coherent check, Design System viewer) see it. Idempotent: if the
        // page already exists with this id/route, mutate the existing entry;
        // else append. Validation happens via DSM.updateConfig's zod check.
        const config = dsm.getConfig()
        const existingIdx = config.pages.findIndex((p: PageDefinition) => p.id === page.id || p.route === page.route)
        const now = new Date().toISOString()
        const existing = existingIdx >= 0 ? config.pages[existingIdx] : null
        const pageDef: PageDefinition = {
          id: page.id,
          name: page.name,
          route: page.route,
          layout: existing?.layout ?? 'centered',
          sections: [],
          generatedWithPageCode: true,
          pageAnalysis: existing?.pageAnalysis ?? { sections: [], componentUsage: {}, layoutPattern: 'unknown' },
          title: existing?.title ?? page.name,
          description: existing?.description ?? '',
          requiresAuth: existing?.requiresAuth ?? page.pageType === 'app',
          noIndex: existing?.noIndex ?? false,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        }
        const nextPages =
          existingIdx >= 0
            ? [...config.pages.slice(0, existingIdx), pageDef, ...config.pages.slice(existingIdx + 1)]
            : [...config.pages, pageDef]
        dsm.updateConfig({ ...config, pages: nextPages, updatedAt: now })

        results.push(`${page.name} (${page.route}) → ${fsPath.replace(ctx.projectRoot + '/', '')}`)
      }

      if (results.some(r => !r.startsWith('skipped'))) {
        await dsm.save()
      }

      return results
    },
  }
}

/**
 * The default applier set for `coherent session end` — ordered so later
 * appliers see the effects of earlier ones (config-delta before components
 * before pages).
 */
export function defaultAppliers(): ArtifactApplier[] {
  return [createConfigDeltaApplier(), createComponentsApplier(), createPagesApplier()]
}
