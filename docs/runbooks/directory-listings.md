# Directory listings

Where Coherent is listed, how each listing is updated, and the texts to paste into forms.
What ships in the repo: `plugins/coherent/` (Claude Code + Codex plugin, one skill),
`.claude-plugin/marketplace.json`, `.agents/plugins/marketplace.json`, `server.json`
(official MCP registry), `mcpName` in `packages/cli/package.json`.
`distribution.test.ts` keeps their versions equal to the CLI's: bump them with every release.

## Our MCP server is local

`coherent mcp --profile agent` runs over stdio inside the project (`npx`), after
`coherent init`. Catalogs that need a public HTTPS server or a Docker image do not fit:
Claude connectors directory, ChatGPT apps, Docker MCP Catalog. Smithery: check first.

## Listings

| Where | How | Who | Status |
|---|---|---|---|
| Official MCP registry | `mcp-publisher login github` (owner, once), then `mcp-publisher publish` from the repo root, after the version in `server.json` is on npm | owner login, then agent | |
| GitHub MCP Registry, PulseMCP | import from the official registry | automatic | |
| Claude Code plugin directory | form: claude.ai/directory/manage (or `/plugin` submit), repo URL, plugin path `plugins/coherent` | owner | |
| Codex plugins | platform.openai.com/plugins, "Skills only" | owner | |
| Cursor Marketplace | cursor.com/marketplace/publish (manual review, slow) | owner | |
| skills.sh, SkillsMP, Cult of Claude, claudemarketplaces.com | crawl public repos for `SKILL.md` | automatic | |
| Glama | indexes GitHub; claim the listing | owner | |
| mcp.so, mcpservers.org, MCP Market, mcp.directory | web forms | owner | |
| Agensi, ClaudeSkills.info, AgenticSkills, awesomeskill.ai | web forms (Agensi: free, non-exclusive) | owner | |
| awesome-mcp-servers, awesome-claude-code, awesome-codex-plugins | PR to someone else's repo: only after the owner's explicit yes | agent | |

Check each site's current terms right before submitting; blog posts about them disagree.

## Texts

**Name:** Coherent

**Tagline (≤ 80):** Governed, verified UI edits for your coding agent.

**Short (≤ 160):** Your agent designs the UI; Coherent scopes each edit, verifies it in a real browser (build, renders, pixel diff) and rolls back what fails. Next.js.

**Long:**
Frontier coding agents already write good UI. What they don't do is prove an edit stayed in its lane. Coherent is that layer for Next.js apps. Before a change, it tells the agent what the change touches (a code-derived graph of pages, layouts and shared components). During the change, it holds the agent to the declared files. After it, it verifies: type errors against a baseline, a production build, before/after renders on desktop and mobile in both themes, an exact pixel diff on routes that must not change, new browser and hydration errors, classes of design tokens that do not exist, and real names or emails leaking into the UI. The verdict is honest (`verified`, `partially_verified`, `failed` …), and a failed edit is rolled back, touching only its own files. Design-system IDs for every component, a generated `/design-system` page, and a standalone `design-check` script that keeps working without Coherent. Open source, MIT, no servers, no API key.

**Install:**
```
npx @getcoherent/cli init
```
Plugin: `/plugin marketplace add skovtun/coherent-design-method`, then `/plugin install coherent@coherent`.

**MCP server:** `npx @getcoherent/cli mcp --profile agent` (stdio). Tools: `coherent_inventory`, `coherent_begin_edit`, `coherent_verify_edit`, `coherent_rollback_edit`, `coherent_ds_sync`.

**Category:** Developer tools · Design systems · Testing / QA
**Tags:** design-system, nextjs, tailwind, shadcn, visual-regression, verification, mcp, claude-code, codex
**Links:** https://getcoherent.design · https://github.com/skovtun/coherent-design-method · https://www.npmjs.com/package/@getcoherent/cli
**License:** MIT · **Pricing:** free
**Icon:** `plugins/coherent/assets/icon.png` (1024×1024; the directory wants a square PNG/JPEG, 512–2048 px)
