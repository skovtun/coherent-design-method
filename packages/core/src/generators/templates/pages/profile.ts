import type { ProfileContent, TemplateOptions } from './types.js'
import { D } from './_shared.js'

export function profileTemplate(content: ProfileContent, options: TemplateOptions): string {
  const { title, description, name, email, fields, connectedAccounts, activity } = content
  const { pageName } = options

  const fieldRows = (fields || [])
    .map(
      f => `            <div className="${D.listItem}">
              <span className="${D.muted}">${f.label}</span>
              <span className="${D.body}">${f.value}</span>
            </div>`,
    )
    .join('\n')

  const connectedSection =
    connectedAccounts && connectedAccounts.length > 0
      ? `
      <div className="${D.card} p-6">
        <h2 className="${D.cardTitle} mb-1">Connected accounts</h2>
        <p className="${D.cardDesc} mb-4">Manage linked services</p>
        <div className="space-y-3">
          ${connectedAccounts.map(a => `          <div className="flex items-center justify-between"><span className="${D.body}">${a.name}</span><Button variant="outline" size="sm">${a.connected ? 'Disconnect' : 'Connect'}</Button></div>`).join('\n')}
        </div>
      </div>`
      : ''

  const activitySection =
    activity && activity.length > 0
      ? `
      <div className="${D.card} p-6">
        <h2 className="${D.cardTitle} mb-4">Recent activity</h2>
        <ul className="space-y-0">
          ${activity.map(a => `            <li className="${D.listItem}"><span className="${D.body}">${a.title}</span><span className="${D.mutedXs}">${a.time}</span></li>`).join('\n')}
        </ul>
      </div>`
      : ''

  return `import { Metadata } from 'next'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
        <div className="${D.card} p-6">
          <div className="flex items-center gap-4 mb-6">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-lg">${name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <h2 className="${D.cardTitle}">${name}</h2>
              <p className="${D.cardDesc}">${email}</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="${D.fieldGroup}">
              <Label>Name</Label>
              <Input defaultValue="${name}" />
            </div>
            <div className="${D.fieldGroup}">
              <Label>Email</Label>
              <Input type="email" defaultValue="${email}" />
            </div>
            <Button>Save changes</Button>
          </div>
        </div>
        <div className="${D.card} p-6">
          <h2 className="${D.cardTitle} mb-4">Details</h2>
          <div>
${fieldRows}
          </div>
        </div>
      </div>
${connectedSection}
${activitySection}
    </main>
  )
}
`
}
