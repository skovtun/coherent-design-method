/**
 * Post-apply pipeline helpers — pure functions both rails will run AFTER
 * the dispatch switch finishes mutating project state.
 *
 * Post-stack work the API rail does inline today (chat.ts:1338-1358 hash
 * registry update, 1360-1415 manifest auto-sync, 1430 final backup) is
 * the symmetric counterpart to pre.ts. Skill rail today does most of
 * this via `phase-engine/appliers.ts` but each applier built its own
 * variant — codex audit (2026-04-25) called out the manifest-sync drift
 * specifically.
 *
 * **PR1 commit #3 scope (this commit):** create the helpers + tests.
 * chat.ts and applier call sites stay UNCHANGED — post.ts is a co-
 * located library at this commit. Migration of call sites lands in
 * PR1 commit #7 alongside the applyRequests entry wire.
 *
 * Same single-implementation-shared-by-both-rails philosophy as pre.ts:
 * the win is in centralization, not in micro-optimizing individual
 * call paths.
 */

import { existsSync, readdirSync, readFileSync } from 'fs'
import { relative, resolve } from 'path'
import { loadManifest, saveManifest, updateEntry, type SharedComponentsManifest } from '@getcoherent/core'
import { computeFileHash, saveHashes } from '../utils/file-hashes.js'
import { createBackup } from '../utils/backup.js'
import { extractDependencies, extractPropsInterface, extractUsageExample } from '../utils/component-extractor.js'

/**
 * Re-hash every file the project tracks for manual-edit protection +
 * persist the new map. Wraps `chat.ts:1338-1358` end-to-end.
 *
 * The hash registry's contract: any file whose on-disk SHA-256 differs
 * from the stored value is "manually edited"; downstream
 * `regenerateLayout` / `regenerateFiles` must skip it. Updating the
 * hashes after a successful apply means the project's just-written
 * files are recorded as "Coherent-managed" and won't trip the check on
 * the next run (until the user actually edits them).
 *
 * Best-effort: failures (FS errors, unreadable files) are silently
 * swallowed. Hash registry is a defensive layer — if it can't write,
 * the next apply just behaves as if nothing was Coherent-managed (more
 * conservative, never destructive).
 */
export async function updateFileHashes(
  projectRoot: string,
  storedHashes: Record<string, string>,
): Promise<Record<string, string>> {
  try {
    const updated = { ...storedHashes }
    const sharedDir = resolve(projectRoot, 'components', 'shared')
    const layoutFile = resolve(projectRoot, 'app', 'layout.tsx')
    const filesToHash: string[] = [layoutFile]
    if (existsSync(sharedDir)) {
      for (const f of readdirSync(sharedDir)) {
        if (f.endsWith('.tsx')) filesToHash.push(resolve(sharedDir, f))
      }
    }
    for (const filePath of filesToHash) {
      if (existsSync(filePath)) {
        const rel = relative(projectRoot, filePath)
        updated[rel] = await computeFileHash(filePath)
      }
    }
    await saveHashes(projectRoot, updated)
    return updated
  } catch {
    return storedHashes
  }
}

/**
 * Manifest auto-sync. Wraps `chat.ts:1360-1415`. For each shared
 * component whose source file exists, refresh `propsInterface` and
 * `dependencies` from the live source. For each modified page file,
 * scan for shared-component imports and update each component's
 * `usedIn` array.
 *
 * `modifiedFiles` is the union of files written this run — same set
 * `chat.ts:1304-1309` builds from `applyResults[].modified +
 * preflightInstalledIds + scaffoldedPages`.
 *
 * Best-effort: a corrupt manifest, missing file, or extractor failure
 * is non-fatal — the manifest just doesn't get updated for that entry,
 * and `coherent fix` can re-run the sync later.
 */
export async function syncManifestMetadata(
  projectRoot: string,
  modifiedFiles: readonly string[],
): Promise<{ changed: boolean; manifest: SharedComponentsManifest | null }> {
  try {
    let manifest = await loadManifest(projectRoot)
    let changed = false

    // Pass 1 — refresh per-entry metadata from current source.
    for (const entry of manifest.shared) {
      const fullPath = resolve(projectRoot, entry.file)
      if (!existsSync(fullPath)) continue
      const code = readFileSync(fullPath, 'utf-8')
      const props = extractPropsInterface(code)
      const deps = extractDependencies(code)
      if ((props && props !== entry.propsInterface) || deps.length !== (entry.dependencies?.length ?? 0)) {
        manifest = updateEntry(manifest, entry.id, {
          propsInterface: props ?? entry.propsInterface,
          dependencies: deps,
        })
        changed = true
      }
    }

    // Pass 2 — for each modified page file, scan for shared imports
    // and append to each component's usedIn list (idempotent).
    const pageFiles = modifiedFiles.filter(f => f.startsWith('app/') && f.endsWith('page.tsx'))
    for (const pageFile of pageFiles) {
      const fullPath = resolve(projectRoot, pageFile)
      if (!existsSync(fullPath)) continue
      const pageCode = readFileSync(fullPath, 'utf-8')

      for (const entry of manifest.shared) {
        const isUsed =
          pageCode.includes(`from '@/components/shared/`) &&
          (pageCode.includes(`{ ${entry.name} }`) || pageCode.includes(`{ ${entry.name},`))
        if (isUsed && !entry.usedIn.includes(pageFile)) {
          manifest = updateEntry(manifest, entry.id, {
            usedIn: [...entry.usedIn, pageFile],
          })
          changed = true

          if (!entry.usageExample) {
            const usage = extractUsageExample(pageCode, entry.name)
            if (usage) {
              manifest = updateEntry(manifest, entry.id, { usageExample: usage })
            }
          }
        }
      }
    }

    if (changed) {
      await saveManifest(projectRoot, manifest)
    }
    return { changed, manifest }
  } catch {
    return { changed: false, manifest: null }
  }
}

/**
 * Post-apply snapshot. Wraps `chat.ts:1430` (final `createBackup`
 * call). Same best-effort contract as `createPreApplyBackup` — never
 * throws, returns `null` on failure. Caller wraps with a user-visible
 * log if appropriate (`logBackupCreated` lives in `utils/backup.ts`
 * and stays a separate concern).
 *
 * Why pre + post backups: pre-snapshot lets `coherent undo` revert
 * mid-flight failures (CLI crashed before save); post-snapshot lets
 * `coherent undo` revert a successful run the user changed their mind
 * on. Two different recovery scenarios.
 */
export function createPostApplyBackup(projectRoot: string): string | null {
  try {
    return createBackup(projectRoot)
  } catch {
    return null
  }
}
