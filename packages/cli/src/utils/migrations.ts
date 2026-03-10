/**
 * Migrations Registry
 *
 * Each migration transforms a project config from one version to the next.
 * Migrations are applied sequentially when running `coherent update`.
 *
 * Add new migrations at the end of the array. Each migration runs only once
 * (skipped if project coherentVersion is already >= migration.to).
 */

export interface Migration {
  from: string
  to: string
  description: string
  migrate: (config: Record<string, unknown>) => Record<string, unknown>
}

export const MIGRATIONS: Migration[] = [
  // {
  //   from: '0.1.0',
  //   to: '0.2.0',
  //   description: 'Added autoScaffold field',
  //   migrate: (config) => {
  //     if (config.settings && typeof config.settings === 'object') {
  //       const settings = config.settings as Record<string, unknown>
  //       if (settings.autoScaffold === undefined) {
  //         settings.autoScaffold = false
  //       }
  //     }
  //     return config
  //   },
  // },
]

/**
 * Compare two semver strings. Returns:
 *  -1 if a < b
 *   0 if a === b
 *   1 if a > b
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na < nb) return -1
    if (na > nb) return 1
  }
  return 0
}

/**
 * Return migrations that need to run for a project at `projectVersion`
 * to reach `targetVersion`.
 */
export function getPendingMigrations(
  projectVersion: string,
  targetVersion: string
): Migration[] {
  return MIGRATIONS.filter(
    (m) =>
      compareSemver(m.to, projectVersion) > 0 &&
      compareSemver(m.to, targetVersion) <= 0
  )
}
