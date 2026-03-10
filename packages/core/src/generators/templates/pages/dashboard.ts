import type { DashboardContent, TemplateOptions } from './types.js'
import { D, collectIcons, resolveIcon } from './_shared.js'

export function dashboardTemplate(
  content: DashboardContent,
  options: TemplateOptions
): string {
  const { title, description, stats, recentActivity } = content
  const { pageName } = options

  const icons = collectIcons(stats.map((s) => s.icon))
  const iconImport = `import { ${icons.join(', ')} } from 'lucide-react'`

  const statCards = stats
    .map((s) => {
      const icon = resolveIcon(s.icon) || icons[0]
      return `        <div className="${D.card} p-6">
          <div className="${D.statHeader}">
            <p className="${D.cardTitle}">${s.label}</p>
            <${icon} className="${D.icon}" />
          </div>
          <div className="mt-2">
            <div className="${D.metricValue}">${s.value}</div>
            ${s.change ? `<p className="${D.metricSub}">${s.change}</p>` : ''}
          </div>
        </div>`
    })
    .join('\n\n')

  let activitySection = ''
  if (recentActivity && recentActivity.length > 0) {
    const items = recentActivity
      .map(
        (a) => `            <div className="${D.listItem}">
              <div>
                <p className="${D.body} font-medium">${a.title}</p>
                <p className="${D.muted}">${a.description}</p>
              </div>
              <span className="${D.mutedXs} whitespace-nowrap ml-4">${a.time}</span>
            </div>`
      )
      .join('\n')

    activitySection = `
      <div className="${D.card} p-6">
        <h2 className="${D.cardTitle} mb-4">Recent Activity</h2>
        <p className="${D.mutedXs} mb-4">Latest updates and changes</p>
        <div className="space-y-0">
${items}
        </div>
      </div>`
  }

  return `import { Metadata } from 'next'
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

      <div className="${D.statsGrid}">
${statCards}
      </div>
${activitySection}
    </main>
  )
}
`
}
