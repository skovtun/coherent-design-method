import type { SettingsContent, TemplateOptions } from './types.js'
import { D } from './_shared.js'

export function settingsTemplate(content: SettingsContent, options: TemplateOptions): string {
  const { title, description, sections } = content
  const { pageName } = options

  const normalSections = sections.filter(s => !/danger|delete|destruct/i.test(s.title))
  const dangerSections = sections.filter(s => /danger|delete|destruct/i.test(s.title))

  const renderField = (
    f: { name: string; label: string; type: string; value?: string; options?: string[] },
    desc?: string,
  ) => {
    if (f.type === 'toggle') {
      return `            <div className="flex items-center justify-between gap-4">
              <div className="${D.fieldGroup} flex-1 space-y-1">
                <Label htmlFor="${f.name}">${f.label}</Label>
                ${desc ? `<p className="${D.mutedXs}">${desc}</p>` : ''}
              </div>
              <Switch id="${f.name}" defaultChecked={${f.value === 'true'}} />
            </div>`
    }
    if (f.type === 'select' && f.options && f.options.length > 0) {
      const opts = f.options.map(o => `                <SelectItem value="${o}">${o}</SelectItem>`).join('\n')
      return `            <div className="${D.fieldGroup}">
              <Label htmlFor="${f.name}">${f.label}</Label>
              ${desc ? `<p className="${D.mutedXs}">${desc}</p>` : ''}
              <Select defaultValue="${f.value || f.options[0]}">
                <SelectTrigger id="${f.name}">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
${opts}
                </SelectContent>
              </Select>
            </div>`
    }
    return `            <div className="${D.fieldGroup}">
              <Label htmlFor="${f.name}">${f.label}</Label>
              ${desc ? `<p className="${D.mutedXs}">${desc}</p>` : ''}
              <Input id="${f.name}" type="${f.type === 'password' ? 'password' : f.type === 'select' ? 'text' : f.type}" defaultValue="${f.value || ''}" />
            </div>`
  }

  const sectionCards = normalSections
    .map(section => {
      const fieldElements = section.fields.map(f => renderField(f)).join('\n')
      return `      <div className="${D.card} p-6">
        <div className="mb-6">
          <h2 className="${D.cardTitle}">${section.title}</h2>
          <p className="${D.cardDesc} mt-1">${section.description}</p>
        </div>
        <div className="space-y-6">
${fieldElements}
        </div>
        <div className="mt-6 flex justify-end">
          <Button>Save Changes</Button>
        </div>
      </div>`
    })
    .join('\n\n')

  const dangerCards = dangerSections
    .map(section => {
      const fieldElements = section.fields.map(f => renderField(f)).join('\n')
      return `      <div className="${D.card} border-destructive/50 p-6">
        <div className="mb-6">
          <h2 className="${D.cardTitle} text-destructive">${section.title}</h2>
          <p className="${D.cardDesc} mt-1">${section.description}</p>
        </div>
        <div className="space-y-6">
${fieldElements}
        </div>
        <div className="mt-6 flex justify-end">
          <Button variant="destructive">Delete Account</Button>
        </div>
      </div>`
    })
    .join('\n\n')

  return `"use client"

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

export default function ${pageName}() {
  return (
    <main className="${D.pageWrapper}">
      <div>
        <h1 className="${D.pageTitle}">${title}</h1>
        <p className="${D.muted}">${description}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
${sectionCards}
      </div>
${dangerCards ? `\n      <div className="mt-8 space-y-6">\n${dangerCards}\n      </div>` : ''}
    </main>
  )
}
`
}
