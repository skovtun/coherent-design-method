import type { BlogContent, TemplateOptions } from './types.js'
import { D } from './_shared.js'

export function blogTemplate(content: BlogContent, options: TemplateOptions): string {
  const { title, description, posts } = content
  const { pageName } = options

  const cards = posts
    .map(
      (p) => `      <div className="${D.card} p-6 hover:border-border/30 transition-colors">
        <h3 className="${D.cardTitle} mb-1">${p.title}</h3>
        <p className="${D.mutedXs} mb-3">${p.date} · ${p.author}</p>
        <p className="${D.muted} line-clamp-3">${p.excerpt}</p>
        <div className="mt-4">
          <Button variant="outline" size="sm">Read more</Button>
        </div>
      </div>`
    )
    .join('\n\n')

  return `import { Metadata } from 'next'
import { Button } from '@/components/ui/button'

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
      <div className="${D.grid2}">
${cards}
      </div>
    </main>
  )
}
`
}
