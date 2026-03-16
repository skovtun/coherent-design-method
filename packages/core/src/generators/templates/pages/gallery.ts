import type { GalleryContent, TemplateOptions } from './types.js'
import { D } from './_shared.js'

export function galleryTemplate(content: GalleryContent, options: TemplateOptions): string {
  const { title, description, images, categories } = content
  const { pageName } = options

  const categoryTabs =
    categories && categories.length > 0
      ? `      <div className="flex gap-2 flex-wrap mb-6">
        ${categories.map(c => `<Button key="${c}" variant="outline" size="sm">${c}</Button>`).join('\n        ')}
      </div>`
      : ''

  const imageCards = images
    .map(
      img => `      <div className="${D.card} overflow-hidden">
        <div className="aspect-square bg-muted relative">
          <img src="${img.src || '/placeholder.svg'}" alt="${img.alt.replace(/"/g, '\\"')}" className="object-cover w-full h-full" />
        </div>
        <div className="p-3">
          <p className="${D.cardTitle}">${(img.title || img.alt).replace(/"/g, '\\"')}</p>
        </div>
      </div>`,
    )
    .join('\n\n')

  return `import { Button } from '@/components/ui/button'

export default function ${pageName}() {
  return (
    <main className="${D.pageWrapper}">
      <div>
        <h1 className="${D.pageTitle}">${title}</h1>
        <p className="${D.muted}">${description}</p>
      </div>
${categoryTabs}
      <div className="grid gap-5 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
${imageCards}
      </div>
    </main>
  )
}
`
}
