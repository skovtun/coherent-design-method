import type { PricingContent, TemplateOptions } from './types.js'
import { D, collectIcons, resolveIcon } from './_shared.js'

export function pricingTemplate(content: PricingContent, options: TemplateOptions): string {
  const { title, description, tiers, faq } = content
  const { pageName } = options

  const icons = collectIcons(['Check'])
  const iconImport = `import { ${icons.join(', ')} } from 'lucide-react'`

  const tierCards = tiers
    .map(tier => {
      const features = tier.features
        .map(
          f =>
            `              <li className="flex items-center gap-2 ${D.body}">
                <${resolveIcon('Check')} className="h-4 w-4 text-emerald-400 shrink-0" />
                ${f}
              </li>`,
        )
        .join('\n')

      const highlighted = tier.highlighted ? ` ring-2 ring-primary` : ''

      const badgeHtml = tier.highlighted
        ? `\n            <Badge variant="outline" className="ml-2">Popular</Badge>`
        : ''

      return `        <div className="${D.card} p-6 flex flex-col${highlighted}">
          <div className="mb-4">
            <div className="flex items-center">
              <h3 className="${D.cardTitle}">${tier.name}</h3>${badgeHtml}
            </div>
            <div className="mt-4">
              <span className="text-3xl font-bold">${tier.price}</span>
              <span className="${D.muted}">${tier.period || '/month'}</span>
            </div>
            <p className="${D.muted} mt-2">${tier.description}</p>
          </div>
          <ul className="space-y-2 flex-1 mb-6">
${features}
          </ul>
          <Button className="w-full"${tier.highlighted ? '' : ' variant="outline"'}>${tier.cta}</Button>
        </div>`
    })
    .join('\n\n')

  let faqSection = ''
  if (faq && faq.length > 0) {
    const items = faq
      .map(
        q => `          <div className="space-y-2">
            <h3 className="${D.body} font-medium">${q.question}</h3>
            <p className="${D.muted}">${q.answer}</p>
          </div>`,
      )
      .join('\n')

    faqSection = `
      <section className="${D.sectionSpacing}">
        <h2 className="${D.sectionTitle} text-center mb-8">Frequently Asked Questions</h2>
        <div className="space-y-6 max-w-2xl mx-auto">
${items}
        </div>
      </section>`
  }

  return `import { Metadata } from 'next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
${iconImport}

export const metadata: Metadata = {
  title: '${title}',
  description: '${description}',
}

export default function ${pageName}() {
  return (
    <main>
      <section className="${D.sectionSpacing}">
        <div className="${D.sectionContainer}">
          <div className="text-center ${D.titleToContent}">
            <h1 className="${D.pageTitle}">${title}</h1>
            <p className="${D.muted} mt-4 max-w-2xl mx-auto">${description}</p>
          </div>
          <div className="${D.grid3}">
${tierCards}
          </div>
        </div>
      </section>
${faqSection}
    </main>
  )
}
`
}
