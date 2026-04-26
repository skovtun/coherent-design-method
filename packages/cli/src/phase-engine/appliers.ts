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
import { existsSync } from 'fs'
import { ComponentManager, DesignSystemManager, PageManager, generateSharedComponent } from '@getcoherent/core'
import type { DesignSystemConfig, ModificationRequest, PageDefinition } from '@getcoherent/core'
import type { ArtifactApplier, ArtifactApplierContext } from './session-lifecycle.js'
import type { ConfigDelta } from './phases/plan.js'
import type { ComponentsArtifact } from './phases/components.js'
import type { PageArtifact } from './phases/page.js'
import { routeToFsPath } from '../commands/chat/utils.js'
import { autoFixCode, type AutoFixContext } from '../utils/quality-validator.js'
import { fixGlobalsCss } from '../utils/fix-globals-css.js'
import { pickPrimaryRoute, replaceWelcomeWithPrimary, type PageLite } from '../utils/welcome-replacement.js'
import { takeNavSnapshot, hasNavChanged } from '../utils/nav-snapshot.js'
import { buildSidebarNavItems } from '../utils/nav-items.js'
import { createBackup } from '../utils/backup.js'
import { applyRequests } from '../apply-requests/index.js'

const CONFIG_DELTA_ARTIFACT = 'config-delta.json'
const COMPONENTS_GENERATED_ARTIFACT = 'components-generated.json'
const MODIFICATION_REQUESTS_ARTIFACT = 'modification-requests.json'

/**
 * v0.11.3 — modification applier. Single switch over `request.type`,
 * intentionally mirroring API rail's `applyModification` in
 * `commands/chat/modification-handler.ts`.
 *
 * **Why this exists.** Codex consult (2026-04-25) audited the gap between
 * the two rails after the v0.11.0/v0.11.1 multi-turn nav-items bug
 * recurred via a different request type. Of the ~12 ModificationRequest
 * types the API rail handles, only `add-page` had real coverage in the
 * skill rail (via the per-page phase factory + pages applier). Every
 * other type — `delete-page`, `delete-component`, `update-token`,
 * `add-component`, `modify-component`, plus the AI-dependent
 * `update-page`/`modify-layout-block`/`link-shared`/`promote-and-link`
 * types — silently fell off the floor at `phases/plan.ts:152` where
 * `derivePageNames` filtered to add-page only and the rest was lost.
 *
 * **What this fixes.** Five no-AI types that can be resolved
 * deterministically at session-end with no provider involved:
 *
 *   - `delete-page`        — remove from DSM + nav.items, delete `.tsx`,
 *                            mirrors `modification-handler.ts:1111`.
 *   - `delete-component`   — remove from manifest, delete shared file,
 *                            mirrors `modification-handler.ts:1213`.
 *   - `update-token`       — `dsm.updateToken(path, value)`,
 *                            mirrors `modification-handler.ts:468`.
 *   - `add-component`      — `cm.register(componentDef)`,
 *                            mirrors `modification-handler.ts:479`.
 *   - `modify-component`   — `cm.update(id, changes)`,
 *                            mirrors `modification-handler.ts:518`.
 *
 * **The guard.** The applier collects every request in the artifact and
 * partitions by type. AI-dependent or unknown types (`update-page`,
 * `modify-layout-block`, `link-shared`, `promote-and-link`,
 * `add-layout-block`, anything else) are NOT silently no-op'd — the
 * applier throws with a clear "skill rail does not yet support these
 * types; use `coherent chat` instead" message BEFORE the pages applier
 * runs. This kills the v0.11.2 silent-partial-apply bug class: when
 * the planner emits `[delete-page X, link-shared Y]`, the user gets a
 * surfaced error instead of "X deleted, Y silently dropped".
 *
 * **Where it sits.** Position 2 in `defaultAppliers()`, BEFORE
 * `createComponentsApplier` and `createPagesApplier`. Rationale:
 *  - Deletes happen first so the rename pattern
 *    `[delete-page transactions, add-page activity]` ends with only
 *    Activity, never both pages and never neither.
 *  - The guard fires before AI-generated pages land on disk, so a
 *    half-applied session is impossible.
 *  - `update-token` lands before pages so `coherent fix --globals`
 *    (which the layout applier triggers downstream) sees the new token
 *    values when regenerating CSS.
 *
 * **Backups.** If any destructive request is in the queue
 * (`delete-page`/`delete-component`), the applier calls `createBackup`
 * once at the start, mirroring the pre-apply backup the API rail makes
 * at `chat.ts:915`. Backups land under `.coherent/backups/<timestamp>/`
 * and `coherent undo` restores them.
 *
 * **What this does NOT do** (deferred to M16, see codex audit F-list):
 *  - AI-dependent types (`update-page`, `modify-layout-block`,
 *    `link-shared`, `promote-and-link`) — those need new skill phases.
 *  - Manual-edit hash protection on `regenerateLayout` (codex F #5).
 *  - Destructive pre-parser parity (codex F #1).
 *  - Full `add-page` post-processing parity (component install, TS
 *    fix-loop, pageAnalysis, duplicate audit — codex F #3).
 *  - `update-navigation` item-level reorder (codex audit P2 gap).
 */
export function createModificationApplier(): ArtifactApplier {
  return {
    name: 'modification',
    async apply(ctx: ArtifactApplierContext): Promise<string[]> {
      const raw = await ctx.store.readArtifact(ctx.uuid, MODIFICATION_REQUESTS_ARTIFACT)
      if (raw === null) return []

      let parsed: { requests?: ModificationRequest[] }
      try {
        parsed = JSON.parse(raw) as { requests?: ModificationRequest[] }
      } catch {
        // Malformed artifact — treat as empty, don't crash session-end.
        return []
      }
      const requests = Array.isArray(parsed.requests) ? parsed.requests : []
      if (requests.length === 0) return []

      // Partition: types we handle here, types deferred to other appliers
      // (add-page → pages applier; update-navigation → config-delta + nav
      // population in pages applier), and types we cannot handle at all.
      const handled: ModificationRequest[] = []
      const deferred: ModificationRequest[] = []
      const unsupported: ModificationRequest[] = []
      for (const req of requests) {
        const t = req?.type
        if (
          t === 'delete-page' ||
          t === 'delete-component' ||
          t === 'update-token' ||
          t === 'add-component' ||
          t === 'modify-component'
        ) {
          handled.push(req)
        } else if (t === 'add-page' || t === 'update-navigation') {
          deferred.push(req)
        } else {
          unsupported.push(req)
        }
      }

      // Guard — reject the whole session before any apply when the planner
      // emitted a type we can't safely process. Mirrors the v0.7.5
      // destructive-op design philosophy: never silently drop, always
      // surface. Pulled to the top because we want the error to fire
      // before backups are made (no point backing up if nothing's about
      // to land) and before pages applier writes generated TSX.
      if (unsupported.length > 0) {
        const summary = unsupported.map(r => `${r.type}${r.target ? ` "${r.target}"` : ''}`).join(', ')
        throw new Error(
          `skill rail does not yet support these request types: ${summary}. ` +
            `Use \`coherent chat\` (API rail) for these operations, or split the request to remove them. ` +
            `(See codex audit M16 follow-up — these need new skill phases.)`,
        )
      }

      if (handled.length === 0) {
        // Only deferred types in the queue — let the downstream appliers
        // handle them. Nothing to do here.
        return []
      }

      // Backup BEFORE any destructive op. Idempotent across this applier
      // run (we only call it once even if multiple destructives are in
      // the queue). Best-effort — failure is logged but doesn't block
      // because some test/CI environments restrict file ops outside the
      // session dir.
      const hasDestructive = handled.some(r => r.type === 'delete-page' || r.type === 'delete-component')
      if (hasDestructive) {
        try {
          createBackup(ctx.projectRoot)
        } catch {
          /* best-effort, see doc-block */
        }
      }

      // Open the project's DSM/CM/PM trio. We re-instantiate per applier
      // to avoid leaking state across appliers; each applier loads from
      // the on-disk config so it sees the cumulative effect of upstream
      // appliers.
      const configPath = resolve(ctx.projectRoot, 'design-system.config.ts')
      const dsm = new DesignSystemManager(configPath)
      await dsm.load()
      const cm = new ComponentManager(dsm.getConfig())
      const pm = new PageManager(dsm.getConfig())

      // PR1 #10 — delegate to the shared apply-requests entry. Both rails
      // now route deterministic types through the SAME dispatchDeterministic
      // (verbatim port from modification-handler.ts), eliminating the parity
      // drift this whole extraction was scoped to address. Skill-mode runs
      // 'no-new-ai' — the gate is a no-op for deterministic types but
      // throws E007 if a future phase mistakenly emits an AI-dependent
      // request through this applier.
      const applyResults = await applyRequests(handled, { dsm, cm, pm, projectRoot: ctx.projectRoot }, 'no-new-ai')
      const messages = applyResults.map(r => r.message)
      const anySuccess = applyResults.some(r => r.success)

      // dsm.save() persists token mutations + page deletions to
      // design-system.config.ts. Idempotent on no-op runs. The previous
      // implementation tracked dsmDirty per case; the simpler heuristic
      // "save if anything succeeded" produces the same on-disk result and
      // matches the API rail's behavior (chat.ts always saves at the end
      // of an apply batch).
      if (anySuccess) {
        await dsm.save()
      }

      return messages
    },
  }
}

// PR1 #10: applyDeletePage, applyDeleteComponent, and applyManagerResult
// formerly lived here as skill-rail-private duplicates of API rail logic.
// They were the canonical example of the parity drift this whole extraction
// was scoped to fix. The shared apply-requests/dispatch.ts now owns the
// single implementation; both rails route through it.

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
 * Runs `autoFixCode` on each component's source (codex R3 P2 #9) so
 * known-broken patterns (raw Tailwind colors, missing "use client",
 * HTML entities in JSX) get repaired before the file lands on disk.
 *
 * Missing-package install (e.g. lucide-react pulled in by a generated
 * icon usage) is still deferred to `coherent fix` — the chat rail's
 * `ensureComponentsInstalled` path is scope creep for this P2; the
 * auto-fix pass is the minimum parity bar.
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
        // Same autoFix pass the chat rail runs on shared components via
        // `validateAndFixGeneratedCode` + the auto-install flow in
        // `applyModification`. `AutoFixContext` is empty here because
        // components don't have a route context; the fix rules that
        // matter (raw-color rewrite, string escaping, icon class repair)
        // don't need one.
        const { code: fixedCode, fixes } = await autoFixCode(component.code)
        const result = await generateSharedComponent(ctx.projectRoot, {
          name: component.name,
          type: 'section',
          code: fixedCode,
          source: 'generated',
        })
        const suffix = fixes.length > 0 ? ` (+${fixes.length} auto-fix)` : ''
        written.push(`${result.name} → ${result.file}${suffix}`)
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

      // Collect all pages first so the autoFix step can see the full known-
      // routes list when resolving link hrefs. Same ordering as before, just
      // an explicit pre-pass.
      const pagesQueue: Array<{ page: PageArtifact; pageCode: string }> = []
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
        pagesQueue.push({ page, pageCode })
      }

      const knownRoutes = pagesQueue.map(p => p.page.route)

      for (const { page, pageCode } of pagesQueue) {
        // Codex R2 P2: run the same auto-fix pass chat rail uses so skill-
        // generated pages don't ship with known-broken patterns (missing
        // "use client" on client-only pages, invalid lucide-react icon
        // renders, HTML entities in JSX, raw-color classnames, etc.). Same
        // `autoFixCode` function as modification-handler — parity is
        // literal, not mimicked.
        const autoFixCtx: AutoFixContext = { currentRoute: page.route, knownRoutes }
        const { code: fixedCode, fixes } = await autoFixCode(pageCode, autoFixCtx)

        const fsPath = routeToFsPath(ctx.projectRoot, page.route, page.pageType === 'auth')
        await mkdir(dirname(fsPath), { recursive: true })
        await writeFile(fsPath, fixedCode, 'utf-8')

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

        const suffix = fixes.length > 0 ? ` (+${fixes.length} auto-fix)` : ''
        results.push(`${page.name} (${page.route}) → ${fsPath.replace(ctx.projectRoot + '/', '')}${suffix}`)
      }

      // Sidebar nav-items population — parity with API rail
      // (`commands/chat/split-generator.ts:580`). Without this step
      // sidebar-nav projects render an empty `<SidebarContent />` because
      // the init-seeded `navigation.items` only carries `{label:'Home',
      // route:'/'}` and the skill-rail pipeline never appends the
      // generated routes. Append-only (preserves manual edits), gated on
      // `navigation.type ∈ {sidebar, both}` so header-nav projects don't
      // accumulate sidebar-only entries they wouldn't otherwise have.
      //
      // CRITICAL (v0.11.1 hotfix, codex consult diagnosis): source routes
      // from `finalConfig.pages` (ALL registered pages), NOT from the
      // current session's `pagesQueue`. Multi-turn projects must accumulate
      // — chat #2's session has only the new page artifact, but config.pages
      // already contains chat #1's routes. Filtering by pagesQueue meant
      // each subsequent chat saw nav.items as "init-seed [Home]" plus only
      // the just-added route, dropping all prior chats' sidebar entries.
      // `buildSidebarNavItems` is idempotent + append-only, so feeding it
      // the full registered set is safe and self-heals projects that lost
      // items in v0.11.0 — they recover on next chat.
      //
      // `requiresAuth: true` is the existing on-disk proxy for "app page":
      // `pageDef.requiresAuth = existing?.requiresAuth ?? page.pageType === 'app'`
      // (see PageDefinition build above). App pages get true; marketing,
      // auth, and the init-seeded Home all get false. Filtering on
      // `requiresAuth` therefore mirrors the prior `pageType === 'app'`
      // intent without re-importing `inferPageTypeFromRoute`.
      const finalConfig = dsm.getConfig()
      const navType = finalConfig.navigation?.type
      if (finalConfig.navigation && (navType === 'sidebar' || navType === 'both')) {
        const registeredAppRoutes = finalConfig.pages
          .filter(page => page.requiresAuth && page.route && page.route !== '/')
          .map(page => page.route)
        const before = finalConfig.navigation.items?.length ?? 0
        const nextItems = buildSidebarNavItems(registeredAppRoutes, finalConfig.navigation.items)
        if (nextItems.length !== before) {
          dsm.updateConfig({
            ...finalConfig,
            navigation: { ...finalConfig.navigation, items: nextItems },
            updatedAt: new Date().toISOString(),
          })
          const added = nextItems.length - before
          results.push(`navigation.items: +${added} sidebar ${added === 1 ? 'entry' : 'entries'}`)
        }
      }

      if (results.some(r => !r.startsWith('skipped'))) {
        await dsm.save()
      }

      return results
    },
  }
}

/**
 * Read every `page-<id>.json` artifact and return the lightweight projection
 * the welcome-replacement helper needs. Pages with no usable pageCode are
 * dropped — those didn't actually land on disk and shouldn't be considered
 * "primary route" candidates.
 */
async function readGeneratedPagesFromArtifacts(ctx: ArtifactApplierContext): Promise<PageLite[]> {
  const artifacts = await ctx.store.listArtifacts(ctx.uuid)
  const pageFiles = artifacts.filter(a => /^page-[^/]+\.json$/.test(a))
  const pages: PageLite[] = []
  for (const file of pageFiles) {
    const raw = await ctx.store.readArtifact(ctx.uuid, file)
    if (!raw) continue
    try {
      const page = JSON.parse(raw) as PageArtifact
      if (!page.request) continue
      const changes = (page.request as ModificationRequest).changes as Record<string, unknown>
      const pageCode = typeof changes.pageCode === 'string' ? changes.pageCode.trim() : ''
      if (!pageCode) continue
      pages.push({ route: page.route, pageType: page.pageType })
    } catch {
      // malformed page artifact — skip, don't break replacement
    }
  }
  return pages
}

/**
 * Replace the welcome scaffold at `app/page.tsx` (or `(public)/page.tsx`)
 * with a `redirect()` to the primary generated route — but only when:
 *
 *   1. `settings.homePagePlaceholder` is still `true` (init flag intact),
 *   2. the generated batch produced at least one non-`/` non-auth page,
 *   3. the file on disk is still the literal Coherent scaffold (marker
 *      or signature match), so user edits are never trampled.
 *
 * After replacement, flips `homePagePlaceholder` to `false` so subsequent
 * runs don't re-fire and chat-rail's existing flip code becomes a no-op.
 *
 * The primary-route source is the session's `page-<id>.json` artifacts —
 * the *generated* pages, not `dsm.config.pages`. Codex P1 #1: feeding
 * `dsm.config.pages` would always pick the seeded `/` Home (set by
 * `minimal-config.ts`) and silently no-op the replacement.
 *
 * Runs AFTER `createPagesApplier` (so generated pages are on disk) and
 * BEFORE `createLayoutApplier` (so when sidebar nav moves `app/page.tsx`
 * into `(public)/page.tsx`, it moves the redirect, not the scaffold).
 */
export function createReplaceWelcomeApplier(): ArtifactApplier {
  return {
    name: 'replace-welcome',
    async apply(ctx: ArtifactApplierContext): Promise<string[]> {
      const configPath = resolve(ctx.projectRoot, 'design-system.config.ts')
      const dsm = new DesignSystemManager(configPath)
      await dsm.load()
      const config = dsm.getConfig()

      if (!config.settings.homePagePlaceholder) {
        return []
      }

      const generated = await readGeneratedPagesFromArtifacts(ctx)
      const primary = pickPrimaryRoute(generated)
      if (!primary) {
        return []
      }

      const result = replaceWelcomeWithPrimary({ projectRoot: ctx.projectRoot, primaryRoute: primary })
      if (!result.replaced) {
        // Either user already edited app/page.tsx (`not-scaffold`) or the
        // file is missing entirely (`no-root-page`). Either way, leave the
        // placeholder flag alone — the flip-on-success contract below
        // depends on us actually having replaced something.
        return []
      }

      // Flip the placeholder flag so chat.ts's inline flip block becomes a
      // no-op next run, and so subsequent invocations of this applier
      // short-circuit on the first guard.
      const next: DesignSystemConfig = {
        ...config,
        settings: { ...config.settings, homePagePlaceholder: false },
        updatedAt: new Date().toISOString(),
      }
      dsm.updateConfig(next)
      await dsm.save()

      return [`${result.path} → redirect(${JSON.stringify(primary)})`]
    },
  }
}

/**
 * Regenerate Header / Footer / Sidebar / route-group layouts so the project
 * matches the post-applier `navigation` shape. Skill rail used to skip this
 * entirely — Header/Footer of the welcome scaffold survived first chat,
 * leaving "Coherent" header on top of generated pages. M15 surfaces this
 * applier in the default chain so both rails redraw layouts the same way.
 *
 * `navChanged` is computed from the snapshotted pre-run config
 * (`config-snapshot.json` written by `sessionStart`) compared against the
 * current `dsm.getConfig()`. When the placeholder flag was just flipped by
 * `createReplaceWelcomeApplier`, we also force `navChanged: true` so the
 * sidebar-nav route-group machinery (which only fires on nav-change) runs
 * on the very first chat too.
 *
 * Importing `regenerateLayout` from `commands/chat/code-generator.ts`
 * crosses the phase-engine ⇄ command-layer boundary — codex P2 #3 flagged
 * this as a layer leak but accepted it for M15 to avoid scope creep. The
 * underlying chat-rail call site (`code-generator.ts:502`) does the same
 * thing, so this is parity, not a new violation.
 */
export function createLayoutApplier(): ArtifactApplier {
  return {
    name: 'layout',
    async apply(ctx: ArtifactApplierContext): Promise<string[]> {
      const configPath = resolve(ctx.projectRoot, 'design-system.config.ts')
      const dsm = new DesignSystemManager(configPath)
      await dsm.load()
      const config = dsm.getConfig()

      if (!config.navigation?.enabled) {
        return []
      }

      const navAfter = takeNavSnapshot(
        config.navigation.items?.map(i => ({ label: i.label, href: i.route || `/${i.label.toLowerCase()}` })),
        config.navigation.type,
      )

      // Diff against the pre-run snapshot — best-effort. If snapshot can't
      // be parsed (legacy session, malformed file), we fall back to
      // `navChanged=true` so the layout still gets regenerated; over-
      // regeneration is safe (idempotent), under-regeneration leaves the
      // welcome scaffold's chrome on the page.
      let navChanged = true
      const snapRaw = await ctx.store.readArtifact(ctx.uuid, 'config-snapshot.json')
      if (snapRaw) {
        try {
          // The snapshot is the raw .ts file (a TypeScript module export),
          // not JSON, so we can't JSON.parse it. Instead we sniff the two
          // bits we need (`type:` from navigation, and the items array)
          // with regexes — same level of robustness chat-rail's pre-flight
          // takes. If the regexes miss, we keep navChanged=true.
          const navTypeMatch = snapRaw.match(/navigation\s*:\s*\{[\s\S]*?type\s*:\s*['"]([^'"]+)['"]/)
          const navTypeBefore = navTypeMatch?.[1]
          const navBefore = takeNavSnapshot(
            config.navigation.items?.map(i => ({ label: i.label, href: i.route || `/${i.label.toLowerCase()}` })),
            navTypeBefore,
          )
          // First chat: the snapshot's `homePagePlaceholder: true` is the
          // honest signal that the welcome scaffold was active. In that
          // case force navChanged=true regardless of nav-snapshot diff,
          // because layout files (Header/Footer/Sidebar) need to redraw
          // even when nav.type didn't technically change.
          const wasPlaceholder = /homePagePlaceholder\s*:\s*true/.test(snapRaw)
          navChanged = wasPlaceholder || hasNavChanged(navBefore, navAfter)
        } catch {
          navChanged = true
        }
      }

      // Lazy import — keeps the phase-engine module tree from depending on
      // the command layer at module load time. Same trick chat.ts uses for
      // `validateReuse` and friends.
      const { regenerateLayout } = await import('../commands/chat/code-generator.js')
      await regenerateLayout(config, ctx.projectRoot, { navChanged })

      return [`navChanged=${navChanged}`]
    },
  }
}

/**
 * Resync `app/globals.css` against the current design-system config. Idempotent:
 * `fixGlobalsCss` is a no-op when globals.css already matches (or the file
 * doesn't exist). Runs after pages so any config-delta changes earlier in the
 * chain are reflected in the emitted CSS tokens.
 */
export function createFixGlobalsCssApplier(): ArtifactApplier {
  return {
    name: 'fix-globals-css',
    async apply(ctx: ArtifactApplierContext): Promise<string[]> {
      const configPath = resolve(ctx.projectRoot, 'design-system.config.ts')
      const dsm = new DesignSystemManager(configPath)
      await dsm.load()
      try {
        fixGlobalsCss(ctx.projectRoot, dsm.getConfig())
      } catch {
        // Best-effort: a stale or unparseable globals.css shouldn't fail the session.
        return []
      }
      return ['globals.css resynced']
    },
  }
}

/**
 * The default applier set for `coherent session end` — ordered so later
 * appliers see the effects of earlier ones:
 *
 *   1. config-delta — name / navigation type land first so subsequent
 *      appliers see the post-delta config.
 *   2. modification — v0.11.3 — process every non-AI request type from the
 *      planner (delete-page, delete-component, update-token, add-component,
 *      modify-component) AND hard-fail on AI-dependent / unknown types
 *      BEFORE any pages land. Mirrors API rail's `applyModification` switch.
 *      Runs BEFORE pages so the rename pattern
 *      `[delete-page X, add-page Y]` ends with only Y, never both.
 *   3. components — shared components on disk before pages can import them.
 *   4. pages — generated add-page artifacts land in `app/.../page.tsx`.
 *   5. replace-welcome — if the init scaffold survived the chat, replace
 *      `app/page.tsx` with a redirect to the primary generated route.
 *      Runs BEFORE layout so the redirect (not the scaffold) is what
 *      sidebar-nav's route-group movement picks up.
 *   6. layout — Header/Footer/Sidebar redrawn for the post-delta nav.
 *      Runs AFTER replace-welcome so when sidebar nav moves
 *      `app/page.tsx` → `app/(public)/page.tsx` it carries the redirect.
 *   7. fix-globals-css — token resync; idempotent so order doesn't matter
 *      relative to layout, but kept last by convention.
 */
export function defaultAppliers(): ArtifactApplier[] {
  return [
    createConfigDeltaApplier(),
    createModificationApplier(),
    createComponentsApplier(),
    createPagesApplier(),
    createReplaceWelcomeApplier(),
    createLayoutApplier(),
    createFixGlobalsCssApplier(),
  ]
}
