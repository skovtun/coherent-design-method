/**
 * Sidebar nav items — shared helper for both rails.
 *
 * Extracted from `commands/chat/split-generator.ts` so the skill rail's
 * pages applier can call the same logic the API rail does. Without this
 * shared call site, skill-mode chats land sidebar-nav projects with an
 * empty `<SidebarContent />` (config.navigation.items stays at its
 * minimal-config default of `[{label:'Home', route:'/'}]`), and the
 * generated dashboard renders a blank rail on the left.
 *
 * Behaviour mirrors the API rail's pre-existing logic verbatim:
 *
 *   - Append-only. Items already in `existingItems` (matched by route)
 *     stay. Re-running on a project where the user manually renamed
 *     "Dashboard" → "Overview" preserves the rename.
 *   - Dynamic-route segments (`/posts/[id]`) are skipped. They aren't
 *     navigable from a static sidebar.
 *   - `requiresAuth: true` on every appended item — sidebar-layout
 *     projects are app-shell projects, gated behind auth in practice.
 *   - `order` increments per appended item, starting after the highest
 *     existing order.
 *
 * Removals are NOT modeled. If the user deletes a page, its entry stays
 * in the sidebar until they edit `design-system.config.ts`. Same as the
 * pre-M15 API-rail behaviour — parity is the contract.
 */

import type { NavigationItem } from '@getcoherent/core'

/** Convert a Next.js route like `/transactions` or `/team-members` into
 *  a sidebar label. `/` becomes `Home`; dynamic segments are stripped
 *  before TitleCasing. */
export function labelizeRoute(route: string): string {
  if (route === '/') return 'Home'
  return route
    .replace(/^\//, '')
    .replace(/\[.+?\]/g, '')
    .replace(/[-/]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Build the post-chat `navigation.items` array.
 *
 * Returns a NEW array. Inputs are not mutated.
 *
 *   `routes` — every route the chat produced (or every registered page
 *              after the pages applier ran). Order matters: appended
 *              items inherit their relative order from this list.
 *
 *   `existingItems` — current `config.navigation.items`. Anything in here
 *                     is preserved, including the init-seeded
 *                     `{label:'Home', route:'/'}`.
 *
 * Routes that already have a matching `existingItems[].route` are not
 * re-added. Dynamic routes (`[id]`, `[...slug]`) are filtered.
 */
export function buildSidebarNavItems(
  routes: readonly string[],
  existingItems: readonly NavigationItem[] | undefined,
): NavigationItem[] {
  const existing = existingItems ?? []
  const existingRoutes = new Set(existing.map(i => i.route))
  const next: NavigationItem[] = [...existing]
  let order = next.reduce((max, item) => Math.max(max, item.order), 0)

  for (const route of routes) {
    if (!route || route.includes('[')) continue
    if (existingRoutes.has(route)) continue
    order += 1
    next.push({
      label: labelizeRoute(route),
      route,
      requiresAuth: true,
      order,
    })
    existingRoutes.add(route)
  }

  return next
}
