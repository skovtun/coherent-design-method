import type { TeamContent, TemplateOptions } from './types.js'
import { D } from './_shared.js'

export function teamTemplate(content: TeamContent, options: TemplateOptions): string {
  const { title, description, members } = content
  const { pageName } = options

  const memberList = (
    members && members.length > 0
      ? members
      : [
          { name: 'Sarah Chen', role: 'CEO & Founder', email: 'sarah@example.com' },
          { name: 'Marcus Kim', role: 'CTO', email: 'marcus@example.com' },
          { name: 'Elena Rodriguez', role: 'Head of Design', email: 'elena@example.com' },
          { name: 'James Park', role: 'Lead Engineer', email: 'james@example.com' },
        ]
  )
    .map(
      (m: any) => `        <div key="${m.name}" className="${D.card} p-6">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted ${D.cardTitle}">
              ${m.name
                .split(' ')
                .map((n: string) => n[0])
                .join('')}
            </div>
            <div className="space-y-1">
              <h3 className="${D.cardTitle}">${m.name}</h3>
              <p className="${D.cardDesc}">${m.role}</p>
            </div>
          </div>
        </div>`,
    )
    .join('\n')

  return `import { Metadata } from 'next'

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
${memberList}
      </div>
    </main>
  )
}
`
}
