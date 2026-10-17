/**
 * Prompt-edit router: request → scoped plan → impact preview → guarded apply.
 *
 * The model chooses the scope (tokens / shared component / variant / page /
 * new component) from a code-derived inventory, but code enforces it: the
 * apply step may only write files the plan declared, so "touch zero unintended
 * files" is a guarantee, not a hope.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { impactOf, type Impact, type ProjectGraph } from './graph.js'

export type Completer = (system: string, user: string) => Promise<string>

export type EditScope = 'tokens' | 'component' | 'variant' | 'page' | 'new-component'

export interface EditPlan {
  scope: EditScope
  /** Existing files to modify. */
  modify: string[]
  /** New files to create. */
  create: string[]
  rationale: string
  /** Set when the request could reasonably mean a narrower or wider scope. */
  question?: string
}

export interface PlanWithImpact extends EditPlan {
  impact: Impact
}

const MAX_PROPS = 400

export function buildInventory(graph: ProjectGraph): string {
  const nodes = Object.values(graph.nodes)
  const styles = nodes
    .filter(n => n.kind === 'style')
    .map(n => {
      const vars = [...new Set(readFileSync(join(graph.root, n.id), 'utf-8').match(/--[a-z0-9-]+(?=\s*:)/gi) ?? [])]
      return `- ${n.id} (site-wide tokens; reaches ${impactOf(graph, n.id).routes.length} routes): ${vars.slice(0, 60).join(' ')}`
    })
  const comps = nodes
    .filter(n => n.kind === 'component')
    .map(n => {
      const imp = impactOf(graph, n.id)
      const ex = n.exports
        .map(e => (e.props ? `${e.name}(${e.props.replace(/\s+/g, ' ').slice(0, MAX_PROPS)})` : e.name))
        .join('; ')
      return `- ${n.id}${n.client ? ' [client]' : ''}\n    exports: ${ex}\n    routes (${imp.routes.length}): ${imp.routes.join(', ')}`
    })
  const ui = nodes
    .filter(n => n.kind === 'ui')
    .map(n => n.exports.map(e => e.name).join(', '))
    .filter(Boolean)
  const pages = nodes
    .filter(n => n.kind === 'page' || n.kind === 'layout')
    .map(
      n =>
        `- ${n.kind} ${n.route} → ${n.id}\n    uses: ${n.imports.filter(i => graph.nodes[i]?.kind === 'component').join(', ') || '(no shared components)'}`,
    )
  return [
    '## Tokens',
    ...styles,
    '## Shared components (code-derived; routes = every page whose render tree includes it)',
    ...comps,
    '## UI primitives available',
    ui.join(' | '),
    '## Pages and layouts',
    ...pages,
  ].join('\n')
}

const PLAN_SYSTEM = `You route UI edit requests in a Next.js + Tailwind + shadcn/ui project to the narrowest correct scope.

Scopes:
- "tokens": change design tokens in the stylesheet (colors, radius, fonts, shadows). Use when the request is about the overall look ("warmer", "rounder", "darker").
- "component": change one shared component file; every page that renders it changes. Use when the request is about that element everywhere, or does not restrict where.
- "variant": the request targets a shared component but restricts it to some pages ("only on X"). Add an opt-in prop (default = current behaviour) to the component AND set it on the named page(s). Other consumers must render exactly as before.
- "page": a change confined to one page's own markup (layout, copy, ordering of its sections).
- "new-component": a new block. FIRST check the inventory: if an existing component already fits the block's PURPOSE (not just its shape), reuse it via a "page" edit instead. Two components that look alike but mean different things (e.g. an AI review flag vs an AI creator suggestion) are NOT interchangeable.

Rules:
- List only files that must change. Every file you list will be rewritten; any file you do not list cannot be touched.
- Prefer changing a component over copying its markup into pages.
- If a component change needs data the component does not receive (e.g. a sparkline needs a series), either derive it inside the component from props it already has, or also list the consumer files that must pass it.
- New component files go next to existing shared components.
- If the request is ambiguous between a narrower and wider scope, pick the narrower one and put a one-sentence clarification in "question".

Reply with JSON only:
{"scope": "...", "modify": ["path"], "create": ["path"], "rationale": "one sentence", "question": "optional"}`

export function parsePlan(raw: string, graph: ProjectGraph): EditPlan {
  const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
  const p = JSON.parse(json) as Partial<EditPlan>
  const scopes: EditScope[] = ['tokens', 'component', 'variant', 'page', 'new-component']
  if (!p.scope || !scopes.includes(p.scope)) throw new Error(`Router returned unknown scope: ${String(p.scope)}`)
  const modify = [...new Set(p.modify ?? [])]
  const create = [...new Set(p.create ?? [])]
  const unknown = modify.filter(f => !graph.nodes[f])
  if (unknown.length) throw new Error(`Router planned edits to files that do not exist: ${unknown.join(', ')}`)
  const clash = create.filter(f => graph.nodes[f])
  if (clash.length) throw new Error(`Router planned to create files that already exist: ${clash.join(', ')}`)
  if (!modify.length && !create.length) throw new Error('Router produced an empty plan')
  return { scope: p.scope, modify, create, rationale: p.rationale ?? '', question: p.question || undefined }
}

export function withImpact(plan: EditPlan, graph: ProjectGraph): PlanWithImpact {
  const files = new Set<string>()
  const routes = new Set<string>()
  for (const f of plan.modify) {
    const i = impactOf(graph, f)
    i.files.forEach(x => files.add(x))
    i.routes.forEach(x => routes.add(x))
  }
  return { ...plan, impact: { files: [...files].sort(), routes: [...routes].sort() } }
}

export async function planEdit(request: string, graph: ProjectGraph, llm: Completer): Promise<PlanWithImpact> {
  const raw = await llm(PLAN_SYSTEM, `${buildInventory(graph)}\n\n## Request\n${request}`)
  return withImpact(parsePlan(raw, graph), graph)
}

export const APPLY_SYSTEM = `You implement one scoped UI edit in a Next.js + Tailwind + shadcn/ui project.

Output every file in the plan as a complete file, each in its own block:
<file path="relative/path.tsx">
...full file content...
</file>

Rules:
- Output exactly the planned files, no others. Do not output unchanged files.
- Keep existing exports and prop names working: other files call these components (call sites are shown).
- scope "component" or "tokens": the change must be VISIBLE on every consumer by default. Never hide it behind an opt-in prop or behind data no caller passes; if data is missing, derive it from existing props.
- scope "variant": the new behaviour is opt-in. New props are optional and their defaults reproduce the current rendering exactly; only the planned page sets them.
- Keep "use client" directives as they are unless the new code needs hooks.
- Use semantic Tailwind tokens (bg-primary, text-muted-foreground) and existing UI primitives; import paths must resolve.
- No explanations outside the file blocks.`

function callSites(graph: ProjectGraph, file: string): string {
  const names = graph.nodes[file].exports.map(e => e.name.replace(/^default\((.+)\)$/, '$1'))
  const out: string[] = []
  for (const imp of graph.importers[file] ?? []) {
    const lines = readFileSync(join(graph.root, imp), 'utf-8').split('\n')
    const hits = lines.filter(
      l => names.some(n => new RegExp(`<${n}\\b|\\b${n}\\(`).test(l)) && !/^\s*import\b/.test(l),
    )
    if (hits.length)
      out.push(
        `// ${imp}\n${hits
          .slice(0, 6)
          .map(l => l.trim())
          .join('\n')}`,
      )
  }
  return out.join('\n')
}

export function buildApplyPrompt(request: string, plan: EditPlan, graph: ProjectGraph): string {
  const parts = [
    `## Request\n${request}`,
    `## Plan\nscope: ${plan.scope}\nrationale: ${plan.rationale}\nmodify: ${plan.modify.join(', ') || '-'}\ncreate: ${plan.create.join(', ') || '-'}`,
  ]
  for (const f of plan.modify) {
    parts.push(`## Current ${f}\n\`\`\`\n${readFileSync(join(graph.root, f), 'utf-8')}\n\`\`\``)
    const sites = graph.nodes[f].kind === 'component' ? callSites(graph, f) : ''
    if (sites) parts.push(`## Call sites of ${f} (must keep working)\n${sites}`)
  }
  if (plan.create.length) {
    const sibling = Object.values(graph.nodes).find(n => n.kind === 'component')
    if (sibling)
      parts.push(
        `## Style reference for new components: ${sibling.id}\n\`\`\`\n${readFileSync(join(graph.root, sibling.id), 'utf-8')}\n\`\`\``,
      )
  }
  return parts.join('\n\n')
}

/** Parse <file path="..."> blocks and enforce the plan's write set. */
export function parseApplyOutput(raw: string, plan: EditPlan): Record<string, string> {
  const allowed = new Set([...plan.modify, ...plan.create])
  const files: Record<string, string> = {}
  for (const m of raw.matchAll(/<file path="([^"]+)">\n?([\s\S]*?)<\/file>/g)) {
    const path = m[1].trim()
    if (!allowed.has(path))
      throw new Error(`Edit tried to write ${path}, which is outside the plan (${[...allowed].join(', ')})`)
    files[path] = m[2]
      .replace(/^\s*```[a-z]*\n/, '')
      .replace(/\n```\s*$/, '')
      .replace(/\s*$/, '\n')
  }
  const missing = plan.create.filter(f => !(f in files))
  if (missing.length) throw new Error(`Edit did not produce planned new file(s): ${missing.join(', ')}`)
  if (!Object.keys(files).length) throw new Error('Edit produced no files')
  return files
}
