import type { ModificationRequest, DesignSystemConfig, ComponentDefinition, PageDefinition } from '@getcoherent/core'

export const AUTH_FLOW_PATTERNS: Record<string, string[]> = {
  '/login': ['/register', '/forgot-password'],
  '/signin': ['/register', '/forgot-password'],
  '/signup': ['/login'],
  '/register': ['/login'],
  '/forgot-password': ['/login', '/reset-password'],
  '/reset-password': ['/login'],
}

export const PAGE_RELATIONSHIP_RULES: Array<{
  trigger: RegExp
  related: Array<{ id: string; name: string; route: string }>
}> = [
  {
    trigger: /\/(products|catalog|marketplace|listings|shop|store)\b/i,
    related: [{ id: 'product-detail', name: 'Product Detail', route: '/products/[id]' }],
  },
  {
    trigger: /\/(blog|news|articles|posts)\b/i,
    related: [{ id: 'article-detail', name: 'Article', route: '/blog/[slug]' }],
  },
  {
    trigger: /\/(campaigns|ads|ad-campaigns)\b/i,
    related: [{ id: 'campaign-detail', name: 'Campaign Detail', route: '/campaigns/[id]' }],
  },
  {
    trigger: /\/(dashboard|admin)\b/i,
    related: [{ id: 'settings', name: 'Settings', route: '/settings' }],
  },
  {
    trigger: /\/pricing\b/i,
    related: [{ id: 'checkout', name: 'Checkout', route: '/checkout' }],
  },
]

export function extractInternalLinks(code: string): string[] {
  const links = new Set<string>()
  const hrefRe = /href\s*=\s*["'](\/[a-z0-9/-]*)["']/gi
  let m: RegExpExecArray | null
  while ((m = hrefRe.exec(code)) !== null) {
    const route = m[1]
    if (route === '/' || route.startsWith('/design-system') || route.startsWith('/#') || route.startsWith('/api'))
      continue
    links.add(route)
  }
  return [...links]
}

export function inferRelatedPages(
  plannedPages: Array<{ name: string; id: string; route: string }>,
): Array<{ name: string; id: string; route: string }> {
  const plannedRoutes = new Set(plannedPages.map(p => p.route))
  const inferred: Array<{ name: string; id: string; route: string }> = []

  for (const { route } of plannedPages) {
    const authRelated = AUTH_FLOW_PATTERNS[route]
    if (authRelated) {
      for (const rel of authRelated) {
        if (!plannedRoutes.has(rel)) {
          const slug = rel.slice(1)
          const name = slug
            .split('-')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ')
          inferred.push({ id: slug, name, route: rel })
          plannedRoutes.add(rel)
        }
      }
    }

    for (const rule of PAGE_RELATIONSHIP_RULES) {
      if (rule.trigger.test(route)) {
        for (const rel of rule.related) {
          if (!plannedRoutes.has(rel.route)) {
            inferred.push(rel)
            plannedRoutes.add(rel.route)
          }
        }
      }
    }
  }

  return inferred
}

export function impliesFullWebsite(message: string): boolean {
  return /\b(create|build|make|design)\b.{0,80}\b(website|web\s*site|web\s*app|application|app|platform|portal|marketplace|site)\b/i.test(
    message,
  )
}

export function extractPageNamesFromMessage(message: string): Array<{ name: string; id: string; route: string }> {
  const pages: Array<{ name: string; id: string; route: string }> = []
  const known: Record<string, string> = {
    home: '/',
    landing: '/',
    dashboard: '/dashboard',
    about: '/about',
    'about us': '/about',
    contact: '/contact',
    contacts: '/contacts',
    pricing: '/pricing',
    settings: '/settings',
    account: '/account',
    'personal account': '/account',
    registration: '/registration',
    signup: '/signup',
    'sign up': '/signup',
    login: '/login',
    'sign in': '/login',
    catalogue: '/catalogue',
    catalog: '/catalog',
    blog: '/blog',
    portfolio: '/portfolio',
    features: '/features',
    services: '/services',
    faq: '/faq',
    team: '/team',
  }
  const lower = message.toLowerCase()
  for (const [key, route] of Object.entries(known)) {
    if (lower.includes(key)) {
      const name = key
        .split(' ')
        .map(w => w[0].toUpperCase() + w.slice(1))
        .join(' ')
      const id = route.slice(1) || 'home'
      if (!pages.some(p => p.route === route)) {
        pages.push({ name, id, route })
      }
    }
  }
  return pages
}

export function normalizeRequest(
  request: ModificationRequest,
  config: DesignSystemConfig,
): ModificationRequest | { error: string } {
  const changes = request.changes as Record<string, unknown> | undefined
  const VALID_TYPES: ModificationRequest['type'][] = [
    'update-token',
    'add-component',
    'modify-component',
    'add-layout-block',
    'modify-layout-block',
    'add-page',
    'update-page',
    'update-navigation',
    'link-shared',
    'promote-and-link',
  ]
  if (!VALID_TYPES.includes(request.type)) {
    return { error: `Unknown action "${request.type}". Valid: ${VALID_TYPES.join(', ')}` }
  }

  const findPage = (target: string) =>
    config.pages.find(
      p => p.id === target || p.route === target || p.name?.toLowerCase() === String(target).toLowerCase(),
    )

  switch (request.type) {
    case 'update-page': {
      const page = findPage(request.target)
      if (!page && changes?.pageCode) {
        const targetStr = String(request.target)
        const id = targetStr.replace(/^\//, '') || 'home'
        return {
          ...request,
          type: 'add-page',
          target: 'new',
          changes: {
            id,
            name: (changes.name as string) || id.charAt(0).toUpperCase() + id.slice(1) || 'Home',
            route: targetStr.startsWith('/') ? targetStr : `/${targetStr}`,
            ...changes,
          },
        }
      }
      if (!page) {
        const available = config.pages.map(p => `${p.name} (${p.route})`).join(', ')
        return { error: `Page "${request.target}" not found. Available: ${available || 'none'}` }
      }
      if (page.id !== request.target) {
        return { ...request, target: page.id }
      }
      break
    }

    case 'add-page': {
      if (!changes) break
      let route = (changes.route as string) || ''
      if (route && !route.startsWith('/')) route = `/${route}`
      if (route) changes.route = route

      const existingByRoute = config.pages.find(p => p.route === route)
      if (existingByRoute && route) {
        return {
          ...request,
          type: 'update-page',
          target: existingByRoute.id,
        }
      }

      if (!changes.id && changes.name) {
        changes.id = String(changes.name)
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '')
      }
      if (!changes.id && route) {
        changes.id = route.replace(/^\//, '') || 'home'
      }
      break
    }

    case 'modify-component': {
      const componentId = request.target
      const existingComp = config.components.find(c => c.id === componentId)

      if (!existingComp) {
        return {
          ...request,
          type: 'add-component',
          target: 'new',
        }
      }

      if (changes) {
        if (typeof changes.id === 'string' && changes.id !== componentId) {
          const targetExists = config.components.some(c => c.id === changes.id)
          if (!targetExists) {
            return { ...request, type: 'add-component', target: 'new' }
          }
          return {
            error: `Cannot change component "${componentId}" to "${changes.id}" — "${changes.id}" already exists.`,
          }
        }

        if (typeof changes.name === 'string') {
          const newName = changes.name.toLowerCase()
          const curName = existingComp.name.toLowerCase()
          const curId = componentId.toLowerCase()
          const nameOk = newName === curName || newName === curId || newName.includes(curId) || curId.includes(newName)
          if (!nameOk) {
            delete changes.name
          }
        }
      }
      break
    }

    case 'add-component': {
      if (changes) {
        const shadcn = changes.shadcnComponent as string | undefined
        const id = changes.id as string | undefined
        if (shadcn && id && id !== shadcn) {
          changes.id = shadcn
        }
      }
      break
    }

    case 'link-shared': {
      if (changes) {
        const page = findPage(request.target)
        if (!page) {
          const available = config.pages.map(p => `${p.name} (${p.route})`).join(', ')
          return { error: `Page "${request.target}" not found for link-shared. Available: ${available || 'none'}` }
        }
        if (page.id !== request.target) {
          return { ...request, target: page.id }
        }
      }
      break
    }

    case 'promote-and-link': {
      const sourcePage = findPage(request.target)
      if (!sourcePage) {
        const available = config.pages.map(p => `${p.name} (${p.route})`).join(', ')
        return {
          error: `Source page "${request.target}" not found for promote-and-link. Available: ${available || 'none'}`,
        }
      }
      if (sourcePage.id !== request.target) {
        return { ...request, target: sourcePage.id }
      }
      break
    }
  }

  return request
}

export function applyDefaults(request: ModificationRequest): ModificationRequest {
  if (request.type === 'add-page' && request.changes && typeof request.changes === 'object') {
    const changes = request.changes as Record<string, unknown>
    const now = new Date().toISOString()
    const name = (changes.name as string) || 'New Page'
    let id =
      (changes.id as string) ||
      name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
    if (!/^[a-z]/.test(id)) id = `page-${id}`
    const route = (changes.route as string) || `/${id}`
    const hasPageCode = typeof changes.pageCode === 'string' && changes.pageCode.trim() !== ''

    const base = {
      id,
      name,
      route: route.startsWith('/') ? route : `/${route}`,
      layout: (changes.layout as string) || 'centered',
      title: (changes.title as string) || name,
      description: (changes.description as string) || `${name} page`,
      createdAt: (changes.createdAt as string) || now,
      updatedAt: (changes.updatedAt as string) || now,
      requiresAuth: (changes.requiresAuth as boolean) ?? false,
      noIndex: (changes.noIndex as boolean) ?? false,
    }
    const sections = Array.isArray(changes.sections)
      ? (changes.sections as Record<string, unknown>[]).map((section, idx) => ({
          id: (section.id as string) || `section-${idx}`,
          name: (section.name as string) || `Section ${idx + 1}`,
          componentId: (section.componentId as string) || 'button',
          order: typeof section.order === 'number' ? section.order : idx,
          props: (section.props as Record<string, unknown>) || {},
        }))
      : []
    return {
      ...request,
      changes: {
        ...base,
        sections,
        ...(hasPageCode ? { pageCode: changes.pageCode as string, generatedWithPageCode: true } : {}),
        ...(changes.pageType ? { pageType: changes.pageType } : {}),
        ...(changes.structuredContent ? { structuredContent: changes.structuredContent } : {}),
      } as PageDefinition & { pageCode?: string; pageType?: string; structuredContent?: Record<string, unknown> },
    }
  }

  if (request.type === 'add-component' && request.changes && typeof request.changes === 'object') {
    const changes = request.changes as Record<string, unknown>
    const now = new Date().toISOString()
    const validSizeNames = ['xs', 'sm', 'md', 'lg', 'xl'] as const

    let normalizedVariants: Array<{ name: string; className: string }> = []
    if (Array.isArray(changes.variants)) {
      normalizedVariants = (changes.variants as unknown[]).map((v: unknown) => {
        if (typeof v === 'string') return { name: v, className: '' }
        if (v && typeof v === 'object' && 'name' in v) {
          return {
            name: (v as { name: string }).name,
            className: (v as { className?: string }).className ?? '',
          }
        }
        return { name: 'default', className: '' }
      })
    }

    let normalizedSizes: Array<{ name: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; className: string }> = []
    if (Array.isArray(changes.sizes)) {
      normalizedSizes = (changes.sizes as unknown[]).map((s: unknown) => {
        if (typeof s === 'string') {
          const name = validSizeNames.includes(s as (typeof validSizeNames)[number])
            ? (s as (typeof validSizeNames)[number])
            : 'md'
          return { name, className: '' }
        }
        if (s && typeof s === 'object' && 'name' in s) {
          const raw = (s as { name: string; className?: string }).name
          const name = validSizeNames.includes(raw as (typeof validSizeNames)[number])
            ? (raw as (typeof validSizeNames)[number])
            : 'md'
          return { name, className: (s as { className?: string }).className ?? '' }
        }
        return { name: 'md', className: '' }
      })
    }

    return {
      ...request,
      changes: {
        ...changes,
        variants: normalizedVariants,
        sizes: normalizedSizes,
        createdAt: now,
        updatedAt: now,
      } as ComponentDefinition,
    }
  }

  if (request.type === 'modify-component' && request.changes && typeof request.changes === 'object') {
    const changes = request.changes as Record<string, unknown>
    const validSizeNames = ['xs', 'sm', 'md', 'lg', 'xl'] as const

    let normalizedVariants: Array<{ name: string; className: string }> | undefined
    if (Array.isArray(changes.variants)) {
      normalizedVariants = (changes.variants as unknown[]).map((v: unknown) => {
        if (typeof v === 'string') return { name: v, className: '' }
        if (v && typeof v === 'object' && 'name' in v) {
          return {
            name: (v as { name: string }).name,
            className: (v as { className?: string }).className ?? '',
          }
        }
        return { name: 'default', className: '' }
      })
    }

    let normalizedSizes: Array<{ name: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; className: string }> | undefined
    if (Array.isArray(changes.sizes)) {
      normalizedSizes = (changes.sizes as unknown[]).map((s: unknown) => {
        if (typeof s === 'string') {
          const name = validSizeNames.includes(s as (typeof validSizeNames)[number])
            ? (s as (typeof validSizeNames)[number])
            : 'md'
          return { name, className: '' }
        }
        if (s && typeof s === 'object' && 'name' in s) {
          const raw = (s as { name: string; className?: string }).name
          const name = validSizeNames.includes(raw as (typeof validSizeNames)[number])
            ? (raw as (typeof validSizeNames)[number])
            : 'md'
          return { name, className: (s as { className?: string }).className ?? '' }
        }
        return { name: 'md', className: '' }
      })
    }

    return {
      ...request,
      changes: {
        ...changes,
        ...(normalizedVariants !== undefined && { variants: normalizedVariants }),
        ...(normalizedSizes !== undefined && { sizes: normalizedSizes }),
      },
    }
  }

  return request
}
