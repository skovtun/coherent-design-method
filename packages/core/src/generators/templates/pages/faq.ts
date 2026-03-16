import type { FaqContent, TemplateOptions } from './types.js'
import { D } from './_shared.js'

export function faqTemplate(content: FaqContent, options: TemplateOptions): string {
  const { title, description, items, categories } = content
  const { pageName } = options

  const categoryTabs =
    categories && categories.length > 0
      ? `      <div className="flex gap-2 flex-wrap mb-6">
        ${categories.map(c => `<Button key="${c}" variant="outline" size="sm">${c}</Button>`).join('\n        ')}
      </div>`
      : ''

  const accordionItems = items
    .map(
      item => `      <details className="${D.card} px-5 py-4 group">
        <summary className="${D.cardTitle} cursor-pointer list-none flex items-center justify-between">
          ${item.question.replace(/</g, '&lt;')}
          <span className="text-muted-foreground text-xs transition-transform group-open:rotate-180">▼</span>
        </summary>
        <p className="${D.muted} mt-3 pl-0">${item.answer.replace(/</g, '&lt;')}</p>
      </details>`,
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
      <div className="space-y-3 max-w-3xl">
${accordionItems}
      </div>
    </main>
  )
}
`
}
