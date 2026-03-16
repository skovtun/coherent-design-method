import type { ListingContent, TemplateOptions } from './types.js'
import { D, collectIcons, resolveIcon } from './_shared.js'

export function listingTemplate(content: ListingContent, options: TemplateOptions): string {
  const { title, description, items, filters, columns } = content
  const { pageName } = options

  const isClient = !!(filters && filters.length > 0)

  const icons = collectIcons(items.map(i => i.icon))
  const iconImport = `import { ${icons.join(', ')} } from 'lucide-react'`

  const gridCols = columns === 2 ? D.grid2 : columns === 4 ? 'grid gap-5 md:grid-cols-2 lg:grid-cols-4' : D.grid3

  const itemCards = items
    .map(item => {
      const icon = resolveIcon(item.icon) || icons[0]
      const badgeHtml = item.badge ? `\n              <Badge variant="secondary">${item.badge}</Badge>` : ''
      return `          <div className="${D.card} p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="${D.cardTitle}">${item.title}</h3>${badgeHtml}
            </div>
            <div className="flex items-start gap-3">
              <div className="${D.featureIconWrap} shrink-0">
                <${icon} className="${D.featureIcon}" />
              </div>
              <p className="${D.muted}">${item.description}</p>
            </div>
          </div>`
    })
    .join('\n\n')

  let filterSection = ''
  if (filters && filters.length > 0) {
    filterSection = `
      <div className="flex gap-2 flex-wrap">
        {${JSON.stringify(filters)}.map((f) => (
          <button
            key={f}
            onClick={() => setActiveFilter(activeFilter === f ? null : f)}
            className={\`inline-flex items-center rounded-full px-3 py-1 ${D.body} transition-colors \${
              activeFilter === f
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }\`}
          >
            {f}
          </button>
        ))}
      </div>
`
  }

  if (isClient) {
    return `"use client"

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
${iconImport}

export default function ${pageName}() {
  const [activeFilter, setActiveFilter] = useState<string | null>(null)

  return (
    <main className="${D.pageWrapper}">
      <div>
        <h1 className="${D.pageTitle}">${title}</h1>
        <p className="${D.muted}">${description}</p>
      </div>
${filterSection}
      <div className="${gridCols}">
${itemCards}
      </div>
    </main>
  )
}
`
  }

  return `import { Metadata } from 'next'
import { Badge } from '@/components/ui/badge'
${iconImport}

export const metadata: Metadata = {
  title: '${title}',
  description: '${description}',
}

export default function ${pageName}() {
  return (
    <main className="${D.pageWrapper}">
      <div>
        <h1 className="${D.pageTitle}">${title}</h1>
        <p className="${D.muted}">${description}</p>
      </div>

      <div className="${gridCols}">
${itemCards}
      </div>
    </main>
  )
}
`
}
