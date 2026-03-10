import type { ChangelogContent, TemplateOptions } from './types.js'
import { D } from './_shared.js'

export function changelogTemplate(content: ChangelogContent, options: TemplateOptions): string {
  const { title, description, versions } = content
  const { pageName } = options

  const versionBlocks = versions
    .map(
      (v) => `      <div className="relative pl-6 border-l-2 border-border/20 pb-8 last:pb-0">
        <div className="absolute left-0 top-0 w-3 h-3 -translate-x-[7px] rounded-full bg-primary" />
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="${D.cardTitle}">${v.version}</span>
          <Badge variant="secondary">${v.date}</Badge>
          ${v.badge ? `<Badge variant="outline">${v.badge}</Badge>` : ''}
        </div>
        <ul className="space-y-1 ${D.muted}">
          ${v.entries.map((e) => `          <li><span className="font-medium">${e.type}:</span> ${e.text.replace(/</g, '&lt;')}</li>`).join('\n          ')}
        </ul>
      </div>`
    )
    .join('\n\n')

  return `import { Badge } from '@/components/ui/badge'

export default function ${pageName}() {
  return (
    <main className="${D.pageWrapper}">
      <div>
        <h1 className="${D.pageTitle}">${title}</h1>
        <p className="${D.muted}">${description}</p>
      </div>
      <div className="max-w-2xl mt-8">
${versionBlocks}
      </div>
    </main>
  )
}
`
}
