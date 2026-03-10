/**
 * Auth route group (backlog: hide Header/Footer on login/signup pages).
 * Ensures app/(auth)/layout.tsx exists and root layout hides Header/Footer on auth routes.
 */

import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'

const AUTH_LAYOUT = `export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-svh bg-muted">
      {children}
    </div>
  )
}
`

const SHOW_WHEN_NOT_AUTH = `'use client'

import { usePathname } from 'next/navigation'

const HIDDEN_PATHS = ['/login', '/signin', '/sign-up', '/signup', '/register', '/forgot-password', '/reset-password', '/design-system']

export default function ShowWhenNotAuthRoute({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  if (pathname && HIDDEN_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return null
  }
  return <>{children}</>
}
`

export async function ensureAuthRouteGroup(projectRoot: string): Promise<void> {
  const authLayoutPath = join(projectRoot, 'app', '(auth)', 'layout.tsx')
  const guardPath = join(projectRoot, 'app', 'ShowWhenNotAuthRoute.tsx')
  const rootLayoutPath = join(projectRoot, 'app', 'layout.tsx')

  if (!existsSync(authLayoutPath)) {
    const { mkdir } = await import('fs/promises')
    await mkdir(join(projectRoot, 'app', '(auth)'), { recursive: true })
    await writeFile(authLayoutPath, AUTH_LAYOUT, 'utf-8')
  }

  if (!existsSync(guardPath)) {
    await writeFile(guardPath, SHOW_WHEN_NOT_AUTH, 'utf-8')
  }

  let layoutContent: string
  try {
    layoutContent = await readFile(rootLayoutPath, 'utf-8')
  } catch {
    return
  }

  if (layoutContent.includes('ShowWhenNotAuthRoute')) return

  if (!layoutContent.includes("from './ShowWhenNotAuthRoute'") && !layoutContent.includes('from "./ShowWhenNotAuthRoute"')) {
    const lastImport = layoutContent.match(/(\nimport\s+[^;]+;\s*)+/g)
    const insertAfter = lastImport ? layoutContent.indexOf(lastImport[lastImport.length - 1]) + lastImport[lastImport.length - 1].length : 0
    layoutContent =
      layoutContent.slice(0, insertAfter) +
      "\nimport ShowWhenNotAuthRoute from './ShowWhenNotAuthRoute'"
      + layoutContent.slice(insertAfter)
  }

  const wrapComponent = (tag: string): void => {
    if (!layoutContent.includes(`<${tag}`)) return
    const regex = new RegExp(`(\\s*)(<${tag}[^>]*\\/>)`, 'g')
    layoutContent = layoutContent.replace(regex, '$1<ShowWhenNotAuthRoute>\n$1  $2\n$1</ShowWhenNotAuthRoute>')
  }

  wrapComponent('Header')
  wrapComponent('Footer')

  await writeFile(rootLayoutPath, layoutContent, 'utf-8')
}
