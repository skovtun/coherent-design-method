/**
 * Agent mode: governance as MCP tools (`coherent mcp --profile agent`).
 *
 * The host agent designs and writes code with its own tools; Coherent supplies
 * what it lacks: a code-derived inventory, the impact of a declared write set,
 * a transaction, and verification that is the real enforcement boundary
 * (hooks only accelerate it — Bash, subagents and IDE writes bypass them).
 *
 * No authoring tools here on purpose (ADR-0011): the constraint bundle and the
 * legacy registry made generated apps worse, so the agent never sees them.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resolve } from 'path'
import { z } from 'zod'
import { CLI_VERSION } from '@getcoherent/core'
import { buildDesignSystem, freeIds } from './design-system.js'
import { buildGraph } from './graph.js'
import { buildInventory } from './router.js'
import {
  beginEdit,
  changedOutsideCoherent,
  dsSync,
  loadSession,
  rollbackEdit,
  verifyEdit,
  type EditSession,
} from './session.js'
import { openTransaction } from './transaction.js'

export const AGENT_PROTOCOL = 1

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean }
const ok = (payload: unknown): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] })
const fail = (message: string): ToolResult => ({ content: [{ type: 'text', text: message }], isError: true })

/** Claude Code hands stdio servers the project root; other clients start us in it. */
export const projectRoot = (root?: string) => resolve(root ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd())

const ROOT = z
  .string()
  .optional()
  .describe('Absolute project root. Defaults to the project this server was started for.')

const SCOPE = z
  .enum(['tokens', 'component', 'variant', 'page', 'new-component', 'design-system'])
  .describe(
    'tokens: design tokens in the stylesheet. component: one shared component, every consumer changes. ' +
      'variant: an opt-in prop on a shared component, set only on some pages; other consumers must render identically. ' +
      'page: one page only. new-component: a new shared block (check the inventory for one with the same PURPOSE first). ' +
      'design-system: only component previews (<name>.preview.tsx next to a component) for the /design-system viewer.',
  )

async function hasBrowser(): Promise<boolean> {
  try {
    const pw = await import('playwright')
    return !!pw.chromium.executablePath()
  } catch {
    return false
  }
}

function summary(s: EditSession) {
  return {
    txId: s.txId,
    request: s.request,
    scope: s.scope,
    writeSet: { modify: s.modify, create: s.create },
    affectedRoutes: [
      ...new Set([...s.impact.routes, ...s.targets.filter(t => t.expected === 'change').map(t => t.route)]),
    ],
    impactedFiles: s.impact.files,
    renderedRoutes: s.targets.map(
      t => `${t.route} (${t.expected === 'same' ? 'must not change' : 'expected to change'})`,
    ),
    unverifiedRoutes: s.unverifiedRoutes,
    preexistingTypeErrors: s.baselineTypeErrors.length,
    visualSkipped: s.visualSkipped,
  }
}

const guard =
  <A>(fn: (a: A) => Promise<ToolResult>) =>
  async (a: A): Promise<ToolResult> => {
    try {
      return await fn(a)
    } catch (e) {
      return fail(String((e as Error).message))
    }
  }

export function registerGovernanceTools(server: McpServer): void {
  server.registerTool(
    'coherent_inventory',
    {
      title: 'Project inventory and edit state',
      description:
        'Call first. Returns the code-derived inventory (design tokens, shared components with props and the routes that render them, UI primitives, pages), any open edit, and server capabilities. Use it to decide whether a change belongs in tokens, an existing component, a variant, or one page, and to reuse a component by PURPOSE, not by shape.',
      inputSchema: { root: ROOT },
    },
    guard(async ({ root }) => {
      const r = projectRoot(root)
      const open = openTransaction(r)
      return ok({
        protocol: AGENT_PROTOCOL,
        coherentVersion: CLI_VERSION,
        root: r,
        capabilities: { renderedVerification: await hasBrowser() },
        openEdit: open ? summary(loadSession(r, open.id)) : null,
        changedOutsideCoherent: (() => {
          const d = changedOutsideCoherent(r)
          return d?.files.length
            ? {
                ...d,
                note: 'These files changed since the last verified edit without Coherent. Tell the user; offer to verify them (begin an edit declaring them, then verify) before building on them.',
              }
            : null
        })(),
        inventory: buildInventory(buildGraph(r)),
        designSystem: (() => {
          const ds = buildDesignSystem(buildGraph(r))
          return {
            page: ds.page ? ds.route : null,
            nextId: ds.nextId,
            duplicates: ds.duplicates,
            components: ds.components.map(c => ({
              id: c.id ?? null,
              name: c.name,
              kind: c.kind,
              file: c.file,
              routes: c.routes,
            })),
            tokens: ds.tokens.map(t => ({ name: t.name, category: t.category, value: t.value, dark: t.dark ?? null })),
            note: ds.page
              ? 'Address components by ID (CID-007) or exact name, tokens by --name, via coherent_begin_edit target.'
              : 'No design-system page yet. Run coherent_ds_sync once the app has its components to give them IDs and generate /design-system.',
          }
        })(),
      })
    }),
  )

  // No `visual` switch here on purpose: an agent once restarted an edit with
  // rendered checks turned off rather than wait for them (2026-10-17). Opting
  // out is a human decision (CLI --no-visual); a missing browser degrades on its own.
  server.registerTool(
    'coherent_begin_edit',
    {
      title: 'Declare an edit',
      description:
        'Declare the files you will change BEFORE writing any of them. Returns the impact (every route that renders those files, transitively) and opens a transaction; writes to undeclared files fail verification. Takes a "before" render of affected routes (may take ~30-60s on a cold project). Need another file mid-edit? Call again with amend=<txId> and only the extra files.',
      inputSchema: {
        root: ROOT,
        request: z.string().describe("The user's request, verbatim."),
        scope: SCOPE,
        modify: z.array(z.string()).default([]).describe('Existing files you will change (project-relative).'),
        create: z.array(z.string()).default([]).describe('New files you will create (project-relative).'),
        amend: z.string().optional().describe('txId of the open edit to add files to.'),
        target: z
          .string()
          .optional()
          .describe(
            'What the user addressed: a component ID (CID-007), an exact component name (@KpiCard), or a token (--radius). Its file is added to modify, and the scope must fit it.',
          ),
      },
    },
    guard(async a => {
      const r = projectRoot(a.root)
      const s = await beginEdit(r, {
        request: a.request,
        scope: a.scope,
        modify: a.modify,
        create: a.create,
        amend: a.amend,
        target: a.target,
        log: m => console.error(m),
      })
      const ds = buildDesignSystem(buildGraph(r))
      const newComponentFiles = s.create.filter(f => /(^|\/)components\/.*\.(tsx|jsx)$/.test(f))
      return ok({
        ...summary(s),
        ...(ds.page && newComponentFiles.length
          ? {
              idsForNewComponents: freeIds(ds, 5),
              idNote: 'Put `/** @coherent-id CID-NNN */` above each new exported component, using these IDs in order.',
            }
          : {}),
        next: 'Write only the declared files, then call coherent_verify_edit with level "fast"; when it is clean, level "final".',
      })
    }),
  )

  server.registerTool(
    'coherent_ds_sync',
    {
      title: 'Sync the design system',
      description:
        'Give every component an ID (a `@coherent-id CID-NNN` comment) and write the /design-system page that lists every token and component with its ID and the pages that use it. Opens an edit that Coherent writes itself; then call coherent_verify_edit level "final" (every page must render exactly as before). Run it after the first build of an app, or when the user asks for the design system. Later edits keep the page current on their own.',
      inputSchema: { root: ROOT },
    },
    guard(async a => {
      const r = await dsSync(projectRoot(a.root), { log: m => console.error(m) })
      if (!r.session)
        return ok({
          inSync: true,
          page: r.page,
          next: 'Nothing to do: every component has an ID and the page is current.',
        })
      return ok({
        ...summary(r.session),
        assigned: r.assigned,
        page: r.page,
        withoutPreview: r.withoutPreview,
        next: 'Coherent wrote the files. Call coherent_verify_edit with level "final". Then write previews for the components listed in withoutPreview: one coherent_begin_edit with scope "design-system" creating <name>.preview.tsx files (default export, realistic data).',
      })
    }),
  )

  server.registerTool(
    'coherent_verify_edit',
    {
      title: 'Verify the open edit',
      description:
        'fast (seconds): files changed outside the declared set, new TypeScript errors, real names/emails written into the UI. Use while iterating. final (~30-90s): fast checks + production build + renders of affected routes and controls; affected routes must change, controls must be pixel-identical. A final pass commits the edit; a failed final leaves it open to fix and re-verify, or roll back. Report the verdict to the user as returned: only "verified" means fully verified.',
      inputSchema: {
        root: ROOT,
        level: z.enum(['fast', 'final']),
        txId: z.string().optional().describe('Defaults to the open edit.'),
      },
    },
    guard(async a => {
      const r = await verifyEdit(projectRoot(a.root), { txId: a.txId, level: a.level, log: m => console.error(m) })
      const next =
        a.level === 'fast'
          ? r.ok
            ? 'Clean so far. Call coherent_verify_edit with level "final".'
            : 'Fix the problems (only in declared files, or amend), then verify again.'
          : r.ok
            ? `Committed as ${r.verdict}. Undo with coherent_rollback_edit.`
            : 'Still open. Fix and verify "final" again, or coherent_rollback_edit to restore the project.'
      return ok({ ...r, next })
    }),
  )

  server.registerTool(
    'coherent_rollback_edit',
    {
      title: 'Roll back an edit',
      description:
        "Restore the files an edit owns, byte-for-byte: the open edit's declared files, or a committed edit's recorded changes. Files the user changed elsewhere are left alone. Refuses when a committed edit's files changed since (pass force only if the user agrees to discard that).",
      inputSchema: {
        root: ROOT,
        txId: z.string().optional().describe('Defaults to the open edit, else the last committed one.'),
        force: z.boolean().optional(),
      },
    },
    guard(async a => ok(rollbackEdit(projectRoot(a.root), { txId: a.txId, force: a.force }))),
  )
}
