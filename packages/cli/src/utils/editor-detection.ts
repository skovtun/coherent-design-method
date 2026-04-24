import { existsSync } from 'fs'
import { join } from 'path'

/**
 * Editors/IDEs whose presence (via a config directory at the project root)
 * changes what `coherent init` installs.
 *
 * In v0.9.0 only `claude-code` has a real skill-mode adapter (`/coherent-generate`).
 * The others are detected so we can log a "v2 target" hint without dropping
 * them silently — also keeps the detection contract stable for when those
 * adapters land.
 */
export type DetectedEditor = 'claude-code' | 'cursor' | 'continue' | 'windsurf'

interface EditorMarker {
  editor: DetectedEditor
  marker: string
}

const MARKERS: ReadonlyArray<EditorMarker> = [
  { editor: 'claude-code', marker: '.claude' },
  { editor: 'cursor', marker: '.cursor' },
  { editor: 'continue', marker: '.continue' },
  { editor: 'windsurf', marker: '.windsurf' },
]

export interface EditorDetectionResult {
  /** Editors detected in the project. Empty if none present. */
  detected: DetectedEditor[]
  /** Editors for which v0.9.0 actually installs an adapter. */
  withAdapter: DetectedEditor[]
  /** Detected editors without v0.9.0 adapter support — surface to the user as v2 target. */
  v2Target: DetectedEditor[]
}

/** Only `claude-code` gets a skill adapter in v0.9.0. */
const V1_ADAPTERS: ReadonlySet<DetectedEditor> = new Set(['claude-code'])

/**
 * Scan `projectRoot` for editor marker directories.
 *
 * Detection is presence-only: no config parsing. If a user has an empty
 * `.cursor/` directory left over from experimenting, we still flag it. Cheap,
 * correct, and consistent with how every adapter on every editor is going to
 * work.
 */
export function detectEditors(projectRoot: string): EditorDetectionResult {
  const detected: DetectedEditor[] = []
  for (const { editor, marker } of MARKERS) {
    if (existsSync(join(projectRoot, marker))) {
      detected.push(editor)
    }
  }
  const withAdapter = detected.filter(e => V1_ADAPTERS.has(e))
  const v2Target = detected.filter(e => !V1_ADAPTERS.has(e))
  return { detected, withAdapter, v2Target }
}

/** Human-readable label for logging. */
export function editorLabel(editor: DetectedEditor): string {
  switch (editor) {
    case 'claude-code':
      return 'Claude Code'
    case 'cursor':
      return 'Cursor'
    case 'continue':
      return 'Continue'
    case 'windsurf':
      return 'Windsurf'
  }
}
