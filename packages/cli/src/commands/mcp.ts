/**
 * `coherent mcp` — start the Coherent MCP server over stdio (P3 of the
 * agent-contract strategy). A thin wrapper over Coherent's existing exports so
 * an AI agent (Cursor, Claude Code, Copilot, v0) gets a design-identity
 * CONTRACT it can call, not a `--help` page it has to scrape.
 *
 * Tools (SEP-986-named), ranked by how differentiated they are:
 *   - coherent_validate      ⭐ enforce the constraint system on a code blob.
 *                               The one tool none of the other design MCPs have.
 *   - coherent_extract          derive tokens from a LIVE URL (also unique).
 *   - coherent_constraints      the tiered constraint bundle for an intent.
 *   - coherent_manifest         the static design contract (tokens + atmospheres
 *                               + components + CLI self-description).
 *   - coherent_apply_design     map an external DESIGN.md onto the project tokens.
 *   - coherent_tokens           the project's tokens in W3C DTCG format.
 *
 * MCP stdio contract: the JSON-RPC frames own process.stdout. The SDK writes
 * frames via process.stdout.write directly, so we reroute console.log →
 * console.error defensively — any stray log from a wrapped function would
 * otherwise corrupt the protocol stream.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { CLI_VERSION, DesignSystemManager } from '@getcoherent/core'
import { validatePageQuality } from '../utils/quality-validator.js'
import { buildPromptPayload } from './prompt.js'
import { buildManifestDoc } from './manifest.js'
import { captureExtraction } from './extract.js'
import { buildDtcgTokens } from '../export-tokens/generate.js'
import { findConfig } from '../utils/find-config.js'
import { parseDesignMd } from '../import-design/parse.js'
import { adaptImport } from '../import-design/adapter.js'
import { buildPlan, applyPlan } from '../import-design/apply.js'
import { reportToJson } from '../import-design/report.js'

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

/** Structured success — pretty JSON so the model can read it, one text block. */
function ok(payload: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] }
}

/** Structured failure — a plain message the agent can act on. */
function fail(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

const PAGE_TYPE = z.enum(['marketing', 'app', 'auth'])

/** Single source for the not-in-project error so both project-scoped tools agree. */
const NOT_IN_PROJECT = 'Not inside a Coherent project — run this tool from a project directory.'

/**
 * Register all six Coherent tools on a server. Exported so tests can drive the
 * registration without a live stdio transport.
 */
export function registerCoherentTools(server: McpServer): void {
  // ── coherent_validate ⭐ — the differentiated tool ────────────────────────
  server.registerTool(
    'coherent_validate',
    {
      title: 'Validate UI against the constraint system',
      description:
        'Check a Next.js/React TSX code blob against Coherent design constraints (raw colors, semantic tokens, a11y, anti-patterns). Returns errors + warnings with line numbers. This is the enforcement loop: generate → validate → fix.',
      inputSchema: {
        code: z.string().describe('The TSX/JSX source to validate (a full page/component file).'),
        pageType: PAGE_TYPE.optional().describe('marketing | app | auth (affects some layout rules).'),
        validRoutes: z
          .array(z.string())
          .optional()
          .describe('Known project routes; internal links outside this set are flagged.'),
      },
    },
    async ({ code, pageType, validRoutes }): Promise<ToolResult> => {
      try {
        const issues = validatePageQuality(code, validRoutes, pageType)
        const errorCount = issues.filter(i => i.severity === 'error').length
        const warningCount = issues.filter(i => i.severity === 'warning').length
        const infoCount = issues.filter(i => i.severity === 'info').length
        return ok({
          passed: errorCount === 0,
          summary: `${errorCount} error(s), ${warningCount} warning(s), ${infoCount} info`,
          errorCount,
          warningCount,
          infoCount,
          issues,
        })
      } catch (err) {
        return fail(`Validation failed: ${(err as Error).message}`)
      }
    },
  )

  // ── coherent_constraints — the tiered bundle for an intent ────────────────
  server.registerTool(
    'coherent_constraints',
    {
      title: 'Fetch the design-constraint bundle for an intent',
      description:
        'Return the tiered Coherent constraint bundle (design-thinking, core, per-page-type quality, visual depth, interaction patterns, keyword-matched contextual rules + golden patterns) for a generation intent. Feed this to the model BEFORE it writes code.',
      inputSchema: {
        intent: z.string().describe('What you want to build, e.g. "a project-management dashboard".'),
        pageType: PAGE_TYPE.optional().describe('Force the page type; inferred from the intent when omitted.'),
        atmosphere: z
          .string()
          .optional()
          .describe('A named atmosphere preset (swiss-grid, obsidian-neon, …). Hard-overrides mood inference.'),
      },
    },
    async ({ intent, pageType, atmosphere }): Promise<ToolResult> => {
      try {
        return ok(buildPromptPayload(intent, { pageType, atmosphere }))
      } catch (err) {
        return fail((err as Error).message)
      }
    },
  )

  // ── coherent_manifest — the static design contract (P2) ───────────────────
  server.registerTool(
    'coherent_manifest',
    {
      title: 'Emit the machine-readable design contract',
      description:
        'Return the Coherent design-contract manifest: DTCG tokens (in-project), available atmospheres, page types, shadcn + shared components, and how to fetch the full constraint bundle. Run inside a project to include tokens + the shared registry.',
      inputSchema: {},
    },
    async (): Promise<ToolResult> => {
      try {
        return ok(await buildManifestDoc())
      } catch (err) {
        return fail(`Could not build manifest: ${(err as Error).message}`)
      }
    },
  )

  // ── coherent_tokens — the project's DTCG tokens ───────────────────────────
  server.registerTool(
    'coherent_tokens',
    {
      title: 'Export the project tokens (W3C DTCG)',
      description:
        "Return this project's design tokens in W3C DTCG (.tokens.json) format — consumable by Figma, Style Dictionary, Tokens Studio, and the wider DTCG ecosystem. Requires running inside a Coherent project.",
      inputSchema: {},
    },
    async (): Promise<ToolResult> => {
      const project = findConfig()
      if (!project) return fail(NOT_IN_PROJECT)
      try {
        const dsm = new DesignSystemManager(project.configPath)
        await dsm.load()
        return ok(JSON.parse(buildDtcgTokens(dsm.getConfig())))
      } catch (err) {
        return fail(`Could not export tokens: ${(err as Error).message}`)
      }
    },
  )

  // ── coherent_extract — tokens from a LIVE URL (unique, URL-native) ────────
  server.registerTool(
    'coherent_extract',
    {
      title: 'Extract design tokens from a live URL',
      description:
        'Capture a live URL with headless Chromium and extract its deterministic design tokens (colors, type scale, spacing, radius, shadows, motion) + hero. Optionally run a semantic LLM pass (needs ANTHROPIC_API_KEY). Private/loopback addresses are blocked (SSRF guard). Requires the optional `playwright` peer dependency.',
      inputSchema: {
        url: z.string().url().describe('http(s) URL to capture. Private IPs and loopback are refused.'),
        semantic: z
          .boolean()
          .optional()
          .describe('Run the semantic LLM pass (role inference + voice + density). Needs ANTHROPIC_API_KEY.'),
      },
    },
    async ({ url, semantic }): Promise<ToolResult> => {
      try {
        const payload = await captureExtraction(url, { semantic: semantic ?? false })
        return ok(payload)
      } catch (err) {
        return fail(`Extraction failed: ${(err as Error).message}`)
      }
    },
  )

  // ── coherent_apply_design — map an external DESIGN.md onto the project ─────
  server.registerTool(
    'coherent_apply_design',
    {
      title: 'Apply an external DESIGN.md to the project tokens',
      description:
        "Parse a DESIGN.md (a Coherent extract or a Google Stitch file) and map its palette + fonts onto this project's tokens. Defaults to a dry-run report; pass apply=true to write (a backup is created, revertible with `coherent undo`). Requires running inside a Coherent project.",
      inputSchema: {
        designMarkdown: z
          .string()
          .describe(
            'The full DESIGN.md content (not a path) — e.g. the output of coherent_extract serialized to DESIGN.md.',
          ),
        apply: z.boolean().optional().describe('Write the changes (default false = dry-run report only).'),
      },
    },
    async ({ designMarkdown, apply }): Promise<ToolResult> => {
      const project = findConfig()
      if (!project) return fail(NOT_IN_PROJECT)
      let raw
      try {
        raw = parseDesignMd(designMarkdown)
      } catch (err) {
        return fail(`Could not parse DESIGN.md: ${(err as Error).message}`)
      }
      const adapt = adaptImport(raw)
      // Mirror of import-design.ts's MIN_USABLE_FIELDS (= 1): at least one color
      // or font must map, else the DESIGN.md carried nothing we can apply.
      if (adapt.filledColors.size + adapt.filledFonts.size < 1) {
        return fail('Import produced no usable tokens — no color mapped to a Coherent slot and no font was found.')
      }
      try {
        const dsm = new DesignSystemManager(project.configPath)
        await dsm.load()
        const plan = buildPlan(dsm.getConfig(), adapt, project.root, raw.grammar)
        const report = JSON.parse(reportToJson(plan, 'DESIGN.md (inline)'))
        // `apply` is the affirmative write gate — the MCP analog of the CLI's
        // `--yes`. Default (false) is a dry-run report; only an explicit
        // apply=true mutates config (with a backup, revertible via `coherent undo`).
        if (apply !== true) {
          return ok({ mode: 'dry-run', changes: plan.changes.length, report })
        }
        if (plan.changes.length === 0) {
          return ok({ mode: 'applied', changes: 0, note: 'Config already matches the imported tokens.', report })
        }
        const outcome = await applyPlan(plan, project.root, project.configPath)
        return ok({ mode: 'applied', changes: plan.changes.length, backupPath: outcome.backupPath ?? null, report })
      } catch (err) {
        return fail(`Apply failed: ${(err as Error).message}`)
      }
    },
  )
}

export async function mcpCommand(): Promise<void> {
  // Defensive: keep the stdout channel clean for JSON-RPC frames. Any wrapped
  // function that logs would otherwise corrupt the protocol stream. In Node,
  // console.log/info/debug all write to process.stdout — reroute all three to
  // stderr (the SDK writes frames via process.stdout.write, so it's unaffected).
  const toStderr = (...args: unknown[]) => console.error(...args)
  console.log = toStderr
  console.info = toStderr
  console.debug = toStderr

  const server = new McpServer({ name: 'coherent', version: CLI_VERSION })
  registerCoherentTools(server)

  const transport = new StdioServerTransport()
  await server.connect(transport)
  // connect() keeps the process alive on stdin; nothing else to do.
}
