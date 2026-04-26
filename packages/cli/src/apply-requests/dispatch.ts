/**
 * Dispatch — the per-request switch both rails will share.
 *
 * **PR1 commit #5 scope (this commit):** port the 6 DETERMINISTIC cases
 * verbatim from `commands/chat/modification-handler.ts:applyModification`
 * into `dispatchDeterministic`. The 5 AI-dependent cases (`modify-layout-
 * block`, `link-shared`, `promote-and-link`, `add-page`, `update-page`)
 * land in PR1 commit #6 with the `applyMode` contract that gates `'no-
 * new-ai'` mode.
 *
 * Until commit #6, calling dispatch with an AI case returns `null` so
 * the caller (chat.ts inline switch, the only caller right now) keeps
 * its existing path. Migration of call sites happens in PR1 #7 along-
 * side the applyRequests entry wire.
 *
 * Behavioral parity is the win: every chalk.yellow / DEBUG console
 * write is preserved verbatim so a fixture-based diff test (PR1 #8-9)
 * can prove the extracted dispatch produces byte-identical output.
 *
 * Layer hygiene: imports core types / providers / utils only — no
 * back-edges into commands/chat/* (would re-create the layer cycle the
 * extraction is meant to break).
 */

import { resolve, dirname } from 'path'
import { mkdir, rm } from 'fs/promises'
import { existsSync } from 'fs'
import chalk from 'chalk'
import { loadManifest, saveManifest, type ComponentDefinition, type ModificationRequest } from '@getcoherent/core'
import { getComponentProvider } from '../providers/index.js'
import { writeFile } from '../utils/files.js'
import { applyManagerResult } from './managers.js'
import type { ApplyRequestsContext, ApplyResult } from './types.js'

/**
 * The 6 ModificationRequest types this commit covers — types the dispatch
 * can complete WITHOUT calling an AI provider. These are what `applyMode:
 * 'no-new-ai'` (skill rail) needs to work without ever escalating to a
 * model — they're pure config / fs operations.
 *
 * The 5 AI-dependent types land in PR1 commit #6 as `dispatchAi`.
 */
const DETERMINISTIC_TYPES = new Set<ModificationRequest['type']>([
  'update-token',
  'add-component',
  'modify-component',
  'update-navigation',
  'delete-page',
  'delete-component',
])

/**
 * True when `request.type` is handled by `dispatchDeterministic`.
 * Caller uses this to decide whether to hand off to dispatchAi (PR1 #6)
 * or stay deterministic.
 */
export function isDeterministic(request: ModificationRequest): boolean {
  return DETERMINISTIC_TYPES.has(request.type)
}

/**
 * Run a deterministic ModificationRequest. Returns `null` if the request
 * type is AI-dependent — caller should hand off to `dispatchAi` (PR1 #6)
 * in that case.
 *
 * Direct port of the 6 corresponding cases from
 * `commands/chat/modification-handler.ts:applyModification`. The original
 * cases will be deleted in PR1 commit #10 once both rails route through
 * the applyRequests entry.
 */
export async function dispatchDeterministic(
  request: ModificationRequest,
  ctx: ApplyRequestsContext,
): Promise<ApplyResult | null> {
  const { dsm, cm, pm, projectRoot } = ctx

  switch (request.type) {
    case 'update-token': {
      const path = request.target
      const value = (request.changes as { value: unknown }).value
      const result = await dsm.updateToken(path, value)
      return {
        success: result.success,
        message: result.message,
        modified: result.modified,
      }
    }

    case 'add-component': {
      const componentData = request.changes as ComponentDefinition

      const provider = getComponentProvider()
      if (componentData.source === 'shadcn' && provider.has(componentData.id)) {
        const result = await provider.installComponent(componentData.id, projectRoot)
        if (result.success && result.componentDef) {
          const mergedData: ComponentDefinition = {
            ...result.componentDef,
            variants:
              componentData.variants && componentData.variants.length > 0
                ? componentData.variants
                : result.componentDef.variants,
            sizes:
              componentData.sizes && componentData.sizes.length > 0 ? componentData.sizes : result.componentDef.sizes,
          }
          const regResult = await cm.register(mergedData)
          if (regResult.success) {
            applyManagerResult(dsm, cm, pm, regResult.config)
          }
          return {
            success: regResult.success,
            message: regResult.success ? `✨ Auto-installed ${componentData.name}` : regResult.message,
            modified: regResult.modified,
          }
        }
      }

      const result = await cm.register(componentData)
      if (result.success) {
        applyManagerResult(dsm, cm, pm, result.config)
      }
      return {
        success: result.success,
        message: result.message,
        modified: result.modified,
      }
    }

    case 'modify-component': {
      const componentId = request.target
      const changes = request.changes as Record<string, unknown> | undefined

      const result = await cm.update(componentId, changes ?? {})
      if (result.success) {
        applyManagerResult(dsm, cm, pm, result.config)
      }
      return {
        success: result.success,
        message: result.message,
        modified: result.modified,
      }
    }

    case 'update-navigation': {
      // The actual nav rendering happens in the post-apply layout regen
      // (chat.ts:1296-1304); this case is a marker so the request shows
      // up in the modified-files list and the spinner has something to
      // say. Behavioral parity with modification-handler.ts:1103.
      return {
        success: true,
        message: 'Navigation updated',
        modified: ['navigation'],
      }
    }

    case 'delete-page': {
      // PJ-009: remove a page — delete its file, drop from config.pages AND
      // navigation.items, regen shared Header/Sidebar so nav stops pointing
      // at a 404. Backups at chat-command level; `coherent undo` restores.
      const target = request.target
      if (!target) {
        return { success: false, message: 'delete-page requires target (page id/name/route)', modified: [] }
      }
      const config = dsm.getConfig()
      const pages = config.pages || []
      const page = pages.find(
        (p: { id: string; name?: string; route: string }) =>
          p.id === target ||
          p.name?.toLowerCase() === target.toLowerCase() ||
          p.route === target ||
          p.route === '/' + target.replace(/^\//, ''),
      )
      if (!page) {
        return {
          success: false,
          message: `delete-page: no page matches "${target}". Available: ${pages.map(p => p.id).join(', ')}`,
          modified: [],
        }
      }
      // Root page (/) is guarded — users almost never want this gone, and
      // having no root page breaks routing.
      if (page.route === '/') {
        return {
          success: false,
          message: `Refusing to delete the root page (/). If you really want this, edit design-system.config.ts manually.`,
          modified: [],
        }
      }
      const relRoute = page.route.replace(/^\//, '')
      const candidates = [
        resolve(projectRoot, 'app', relRoute, 'page.tsx'),
        resolve(projectRoot, 'app', '(app)', relRoute, 'page.tsx'),
        resolve(projectRoot, 'app', '(auth)', relRoute, 'page.tsx'),
      ]
      const filePath = candidates.find(existsSync)
      const modified: string[] = []
      if (filePath) {
        await rm(filePath, { force: true })
        try {
          await rm(dirname(filePath), { recursive: true, force: true })
        } catch {
          /* directory may still contain layout.tsx, etc. — leave alone */
        }
        modified.push(filePath)
      }

      const filteredPages = pages.filter(p => p.id !== page.id)
      const currentNav = (config as unknown as { navigation?: { type?: string; items?: Array<{ route: string }> } })
        .navigation
      const updatedNav =
        currentNav && currentNav.items
          ? { ...currentNav, items: currentNav.items.filter(it => it.route !== page.route) }
          : currentNav
      const updated = {
        ...config,
        pages: filteredPages,
        ...(updatedNav ? { navigation: updatedNav } : {}),
      }
      applyManagerResult(dsm, cm, pm, updated as Parameters<typeof applyManagerResult>[3])

      try {
        const { PageGenerator } = await import('@getcoherent/core')
        const generator = new PageGenerator(updated as ConstructorParameters<typeof PageGenerator>[0])
        const navType = updatedNav?.type || 'header'
        const sharedDir = resolve(projectRoot, 'components', 'shared')
        await mkdir(sharedDir, { recursive: true })
        if (navType === 'header' || navType === 'both') {
          const headerPath = resolve(sharedDir, 'header.tsx')
          if (existsSync(headerPath)) {
            await writeFile(headerPath, generator.generateSharedHeaderCode())
            modified.push(headerPath)
          }
        }
        if (navType === 'sidebar' || navType === 'both') {
          const sidebarPath = resolve(sharedDir, 'sidebar.tsx')
          if (existsSync(sidebarPath)) {
            await writeFile(sidebarPath, generator.generateSharedSidebarCode())
            modified.push(sidebarPath)
          }
        }
      } catch (err) {
        console.log(
          chalk.yellow(
            `  ⚠ Nav regen after delete-page failed: ${err instanceof Error ? err.message : String(err)}. Run \`coherent fix\` to clean stale nav links.`,
          ),
        )
      }

      return {
        success: true,
        message: `Deleted page "${page.name}" (${page.route}). Nav updated. Run \`coherent undo\` to restore.`,
        modified,
      }
    }

    case 'delete-component': {
      const target = request.target
      if (!target) {
        return { success: false, message: 'delete-component requires target (component id or name)', modified: [] }
      }
      const manifest = await loadManifest(projectRoot)
      const entry = manifest.shared.find(e => e.id === target || e.name.toLowerCase() === target.toLowerCase())
      if (!entry) {
        return {
          success: false,
          message: `delete-component: no shared component matches "${target}". Available: ${manifest.shared.map(e => `${e.id} (${e.name})`).join(', ')}`,
          modified: [],
        }
      }
      const filePath = resolve(projectRoot, entry.file)
      const modified: string[] = []
      if (existsSync(filePath)) {
        await rm(filePath, { force: true })
        modified.push(filePath)
      }
      const updatedManifest = {
        ...manifest,
        shared: manifest.shared.filter(e => e.id !== entry.id),
      }
      await saveManifest(projectRoot, updatedManifest)
      return {
        success: true,
        message: `Deleted shared component "${entry.name}" (${entry.id}). Pages importing it will break — regenerate them with \`coherent chat --page X "remove ${entry.name} usage"\`.`,
        modified,
      }
    }

    default:
      // AI-dependent type (modify-layout-block, link-shared, promote-and-
      // link, add-page, update-page). Caller hands off to dispatchAi
      // (PR1 #6).
      return null
  }
}
