import type { LandingContent, TemplateOptions } from './types.js'
import { D, collectIcons, resolveIcon } from './_shared.js'

export function landingTemplate(
  content: LandingContent,
  options: TemplateOptions
): string {
  const { title, description, hero, features, finalCta } = content
  const { pageName } = options

  const icons = collectIcons(features.map((f) => f.icon))
  const iconImport = `import { ${icons.join(', ')} } from 'lucide-react'`

  const featureCards = features
    .map((f) => {
      const icon = resolveIcon(f.icon) || icons[0]
      return `        <div className="${D.card} p-6">
          <div className="${D.featureIconWrap} mb-4">
            <${icon} className="${D.featureIcon}" />
          </div>
          <h3 className="${D.cardTitle} mb-2">${f.title}</h3>
          <p className="${D.muted}">${f.description}</p>
        </div>`
    })
    .join('\n\n')

  let ctaSection = ''
  if (finalCta) {
    ctaSection = `
      <section className="${D.sectionSpacing}">
        <div className="${D.card} p-8 md:p-14 text-center space-y-6">
          <h2 className="${D.sectionTitle}">${finalCta.headline}</h2>
          <p className="${D.muted} max-w-lg mx-auto">${finalCta.description}</p>
          <Button size="lg">${finalCta.buttonText}</Button>
        </div>
      </section>`
  }

  const secondaryBtn = hero.secondaryCta
    ? `\n          <Button variant="outline" size="lg">${hero.secondaryCta}</Button>`
    : ''

  return `import { Metadata } from 'next'
import { Button } from '@/components/ui/button'
${iconImport}

export const metadata: Metadata = {
  title: '${title}',
  description: '${description}',
}

export default function ${pageName}() {
  return (
    <main>
      <section className="${D.heroSection}">
        <div className="${D.heroContent}">
          <h1 className="${D.heroTitle}">${hero.headline}</h1>
          <p className="text-muted-foreground max-w-2xl text-base md:text-lg">${hero.subheadline}</p>
          <div className="flex items-center gap-4">
            <Button size="lg">${hero.primaryCta}</Button>${secondaryBtn}
          </div>
        </div>
      </section>

      <section className="${D.sectionSpacing}">
        <div className="${D.sectionContainer}">
          <div className="${D.grid3}">
${featureCards}
          </div>
        </div>
      </section>
${ctaSection}
    </main>
  )
}
`
}
