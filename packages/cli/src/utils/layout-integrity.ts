/**
 * Layout Integrity Validator
 *
 * Cross-references the architecture plan against the rendered files to catch
 * "plan says X, files don't reflect X" drift. Runs at end of generation and
 * can be invoked by `coherent check` as a validator rule.
 */

import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

export interface LayoutIntegrityIssue {
  type: 'SIDEBAR_COMPONENT_MISSING' | 'APP_LAYOUT_NOT_WIRED' | 'HEADER_FOOTER_MISSING'
  severity: 'error' | 'warning'
  message: string
  file?: string
}

export interface ArchitecturePlanGroup {
  id: string
  layout: 'header' | 'sidebar' | 'both' | 'none'
  pages: string[]
}

export interface ArchitecturePlanSharedComponent {
  name: string
  description?: string
  props?: string
  usedBy?: string[]
  type?: string
  shadcnDeps?: string[]
}

export interface ArchitecturePlanShape {
  groups: ArchitecturePlanGroup[]
  sharedComponents?: ArchitecturePlanSharedComponent[]
}

/**
 * Check that plan-required layout elements actually exist in the filesystem.
 * Does NOT modify anything — returns a list of issues for the caller to
 * surface or fix.
 */
export function validateLayoutIntegrity(projectRoot: string, plan: ArchitecturePlanShape): LayoutIntegrityIssue[] {
  const issues: LayoutIntegrityIssue[] = []

  const needsSidebar = plan.groups.some(g => g.layout === 'sidebar' || g.layout === 'both')
  if (needsSidebar) {
    const sidebarComponentPath = resolve(projectRoot, 'components', 'shared', 'sidebar.tsx')
    if (!existsSync(sidebarComponentPath)) {
      issues.push({
        type: 'SIDEBAR_COMPONENT_MISSING',
        severity: 'error',
        message: 'Plan requires sidebar navigation but components/shared/sidebar.tsx does not exist',
        file: 'components/shared/sidebar.tsx',
      })
    }

    const appLayoutPath = resolve(projectRoot, 'app', '(app)', 'layout.tsx')
    if (existsSync(appLayoutPath)) {
      const content = readFileSync(appLayoutPath, 'utf-8')
      const hasSidebarProvider = /SidebarProvider/.test(content)
      const hasAppSidebarImport = /AppSidebar|from\s+['"]@\/components\/shared\/sidebar['"]/.test(content)
      if (!hasSidebarProvider || !hasAppSidebarImport) {
        issues.push({
          type: 'APP_LAYOUT_NOT_WIRED',
          severity: 'error',
          message:
            'Plan requires sidebar navigation but app/(app)/layout.tsx does not import AppSidebar or wrap in SidebarProvider — run `coherent fix`',
          file: 'app/(app)/layout.tsx',
        })
      }
    }
  }

  const needsHeader = plan.groups.some(g => g.layout === 'header' || g.layout === 'both')
  if (needsHeader) {
    const headerPath = resolve(projectRoot, 'components', 'shared', 'header.tsx')
    if (!existsSync(headerPath)) {
      issues.push({
        type: 'HEADER_FOOTER_MISSING',
        severity: 'warning',
        message: 'Plan has header-nav groups but components/shared/header.tsx does not exist',
        file: 'components/shared/header.tsx',
      })
    }
  }

  return issues
}

/**
 * Load the plan from .coherent/plan.json. Returns null if file missing or
 * malformed — the caller should skip validation in that case.
 */
export function loadPlanFromDisk(projectRoot: string): ArchitecturePlanShape | null {
  const planPath = resolve(projectRoot, '.coherent', 'plan.json')
  if (!existsSync(planPath)) return null
  try {
    const raw = readFileSync(planPath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.groups)) return null
    return parsed as ArchitecturePlanShape
  } catch {
    return null
  }
}
