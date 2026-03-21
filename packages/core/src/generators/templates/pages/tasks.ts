import type { TasksContent, TemplateOptions } from './types.js'
import { D } from './_shared.js'

export function tasksTemplate(content: TasksContent, options: TemplateOptions): string {
  const { title, description, tasks } = content
  const { pageName } = options

  const taskList =
    tasks && tasks.length > 0
      ? tasks
      : [
          { title: 'Design landing page', status: 'In Progress', assignee: 'Sarah', priority: 'High' },
          { title: 'Set up CI/CD pipeline', status: 'Done', assignee: 'Marcus', priority: 'Medium' },
          { title: 'Write API documentation', status: 'To Do', assignee: 'Elena', priority: 'Low' },
          { title: 'Fix login redirect bug', status: 'In Progress', assignee: 'James', priority: 'High' },
          { title: 'Update dependencies', status: 'To Do', assignee: 'Marcus', priority: 'Medium' },
        ]

  const statusColor: Record<string, string> = {
    Done: 'bg-emerald-500/10 text-emerald-500',
    'In Progress': 'bg-blue-500/10 text-blue-500',
    'To Do': 'bg-zinc-500/10 text-zinc-400',
  }

  const priorityColor: Record<string, string> = {
    High: 'bg-red-500/10 text-red-500',
    Medium: 'bg-yellow-500/10 text-yellow-500',
    Low: 'bg-zinc-500/10 text-zinc-400',
  }

  const rows = taskList
    .map(
      (t: any) => `            <div className="${D.listItem}">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[t.status] || statusColor['To Do']}">${t.status}</span>
                <span className="${D.body} font-medium">${t.title}</span>
              </div>
              <div className="flex items-center gap-3">
                ${t.priority ? `<span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${priorityColor[t.priority] || priorityColor['Medium']}">${t.priority}</span>` : ''}
                ${t.assignee ? `<span className="${D.mutedXs}">${t.assignee}</span>` : ''}
              </div>
            </div>`,
    )
    .join('\n')

  return `"use client"

import { useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

export default function ${pageName}() {
  const [search, setSearch] = useState('')

  return (
    <main className="${D.pageWrapper}">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="${D.pageTitle}">${title}</h1>
          <p className="${D.muted}">${description}</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 ${D.icon} -translate-y-1/2" />
        <Input
          placeholder="Search tasks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="${D.card} divide-y">
${rows}
      </div>
    </main>
  )
}
`
}
