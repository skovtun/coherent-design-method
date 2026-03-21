import type { TaskDetailContent, TemplateOptions } from './types.js'
import { D } from './_shared.js'

export function taskDetailTemplate(content: TaskDetailContent, options: TemplateOptions): string {
  const { title, description } = content
  const { pageName } = options

  return `"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function ${pageName}() {
  const [status, setStatus] = useState('In Progress')

  return (
    <main className="${D.pageWrapper}">
      <div className="flex items-center gap-2">
        <Link href="/tasks">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="${D.icon}" />
          </Button>
        </Link>
        <div>
          <h1 className="${D.pageTitle}">${title}</h1>
          <p className="${D.muted}">${description}</p>
        </div>
      </div>

      <div className="${D.grid2}">
        <Card>
          <CardHeader>
            <CardTitle className="${D.cardTitle}">Details</CardTitle>
          </CardHeader>
          <CardContent className="${D.formGap}">
            <div className="${D.fieldGroup}">
              <span className="${D.mutedXs}">Status</span>
              <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-500">{status}</span>
            </div>
            <div className="${D.fieldGroup}">
              <span className="${D.mutedXs}">Priority</span>
              <span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500">High</span>
            </div>
            <div className="${D.fieldGroup}">
              <span className="${D.mutedXs}">Assignee</span>
              <span className="${D.body}">Sarah Chen</span>
            </div>
            <div className="${D.fieldGroup}">
              <span className="${D.mutedXs}">Due Date</span>
              <span className="${D.body}">Jan 15, 2025</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="${D.cardTitle}">Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="${D.listItem}">
                <span className="${D.body}">Task created</span>
                <span className="${D.mutedXs}">2 days ago</span>
              </div>
              <div className="${D.listItem}">
                <span className="${D.body}">Status changed to In Progress</span>
                <span className="${D.mutedXs}">1 day ago</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
`
}
