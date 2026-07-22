# Quick Reference

A cheat sheet for Coherent CLI commands and workflows.

## Commands

```bash
coherent init                    # Create a new project
coherent init --skill-mode       # Set up for the Claude Code /coherent-chat rail (skips API-key setup)
coherent init --api-mode         # Force API-key setup (coherent chat rail); --both = optional, emit both CTAs
coherent chat "<message>"        # Generate/modify pages with AI (needs API key)
coherent chat "use @PricingTable + @CID-001 for ..."  # v0.18: pin shared components by name or CID via @-syntax
coherent chat --page "X" "..."   # Edit only page X
coherent chat --component "X" "..."  # Edit shared component X
coherent chat --dry-run "..."       # Preview changes without applying
coherent chat --atmosphere <name> "..."  # Use a named atmosphere preset (see --list-atmospheres)
coherent chat --list-atmospheres # Show all 10 atmosphere presets and exit
coherent prompt "<intent>"       # Emit constraints + intent (no API call — for Claude Code skill mode)
coherent prompt --list-atmospheres # Same list as chat, but for the skill-mode command
coherent auth set-key <key>      # Store API key in project .env (auto-detects provider)
coherent auth set-key <key> --provider anthropic|openai  # Force provider
coherent auth unset-key --provider anthropic|openai      # Remove API key for a provider
coherent memory show             # Inspect per-project memory: decisions + components + recent runs
coherent memory diff [ref]       # git diff decisions.md vs <ref> (default: HEAD)
coherent wiki adr create <slug>  # Scaffold a new ADR (next number + skeleton sections)
coherent components list         # Show all shared + UI components
coherent status                  # Show project stats (pages, components, tokens)
coherent preview                 # Start dev server (http://localhost:3000)
coherent check                   # Show quality issues (read-only)
coherent check --page <name>     # Scope the check to one page (or --shared / --pages / --json)
coherent fix                     # Auto-fix all issues (compact report)
coherent fix --verbose           # Auto-fix with per-file breakdown
coherent fix --dry-run           # Show what would be fixed without writing
coherent fix --journal           # Capture session YAML to .coherent/fix-sessions/ for later review
coherent journal list            # List captured fix sessions
coherent journal aggregate       # Rank validators by recurrence across all sessions
coherent journal prune           # Delete sessions older than --keep-days (default 30)
coherent journal prune --dry-run # Preview what would be deleted
coherent sync                    # Sync Design System after manual edits
coherent export                  # Export clean project for deployment
coherent export --keep-ds        # Keep the Design System viewer + config in the export
coherent export --no-build       # Skip `next build` in the output (--output <dir> sets destination)
coherent undo                    # Revert last coherent chat
coherent update                  # Apply platform updates to project
coherent rules                   # Show active design constraint rules
coherent prefs set design.style "editorial, high-contrast"  # Persistent design preference injected into EVERY chat run
coherent prefs set <key> <value> # Keys: design.style | design.density | design.avoid | design.notes
coherent prefs show              # Print current design preferences
coherent prefs clear [key]       # Clear all preferences, or just the named key
coherent ds regenerate           # Regenerate the Design System viewer pages (app/design-system/)
coherent migrate                 # Run version migrations
coherent baseline                # Structural regression check (fingerprints + compares pages)
coherent baseline --save         # Record new baseline without comparing
coherent report-issue --page X   # Pre-filled GitHub issue URL with project context
coherent extract <url>           # Tool 1 (v0.19.0 beta) — extract atmosphere from a live URL → DESIGN.md tokens
coherent extract <url> --json    # Print full JSON payload (default: human summary)
coherent extract <url> --out -   # Write JSON payload to stdout (file path also supported, .md → DESIGN.md)
coherent extract <url> --settle-ms 1500  # Extra wait after networkidle for late-firing animations (Lottie/fade-ins)
coherent extract <url> --semantic # Add LLM role inference + voice + density (needs ANTHROPIC_API_KEY)
coherent extract <url> --no-headless  # Show browser window (debugging)
coherent scan [dir]              # Tool 2 (B-1 beta) — Blade L1 grep extractor → B1-EVIDENCE.json
coherent scan [dir] --out file --adapter blade --json  # B-1 flags (json prints to stdout)
coherent cluster <evidence.json>          # Tool 2 (B-2 beta) — deterministic clustering → COHERENT-DESIGN.md (DRAFT); + DRIFT-REPORT.md when DESIGN.md found
coherent cluster <evidence.json> --llm --yes  # LLM labeling (opt-in, paid; --yes skips cost prompt, required in CI)
coherent cluster <evidence.json> --out path --design file --strict-llm --no-cache --eval expected.json  # full flag set
coherent import design <file>            # F14 (v0.21.0) — import an external DESIGN.md (Coherent extract or Google Stitch) → project tokens
coherent import design <file> --dry-run  # Preview the mapping/repair report; write nothing
coherent import design <file> --yes      # Apply without the confirmation prompt (required in CI)
coherent import design <file> --json     # Emit the mapping report as JSON
coherent export tokens                   # E3 (v0.22.0) — export tokens → design-tokens.json + css-variables.css + tailwind-v4.css
coherent export tokens --format css      # Single format: css | tailwind | json | dtcg
coherent export tokens --format dtcg     # W3C DTCG design-tokens.json (Figma / Style Dictionary / Tokens Studio interop)
coherent manifest                        # Machine-readable design contract for AI agents (JSON: tokens+atmospheres+components+CLI) → stdout
coherent manifest --out contract.json    # Write the manifest to a file
coherent export tokens --out ./tokens    # Output directory (default: .coherent/tokens)
coherent mcp                             # Start the MCP server (stdio) — exposes the design contract + validator to AI agents
```

## v0.24.0 — `coherent mcp` (MCP server, agent-contract P3)

Start a stdio [MCP](https://modelcontextprotocol.io) server so an AI agent (Cursor, Claude Code, Copilot, v0) gets a design-identity **contract** it can call, not a `--help` page it has to scrape. Thin wrapper over existing exports. Six SEP-986-named tools:

| Tool | What |
|---|---|
| `coherent_validate` ⭐ | Validate a TSX code blob against the constraint system (raw colors, semantic tokens, a11y). The generate→validate→fix loop. |
| `coherent_extract` | Extract design tokens from a **live URL** (headless Chromium; needs the `playwright` peer dep). |
| `coherent_constraints` | The tiered constraint bundle for an intent (same payload as `coherent prompt --format json`). |
| `coherent_manifest` | The static design contract (same as `coherent manifest`). |
| `coherent_apply_design` | Map an external DESIGN.md onto project tokens (dry-run by default; `apply=true` writes + backup). |
| `coherent_tokens` | Project tokens in W3C DTCG format. |

Register with an MCP client, e.g. Claude Code:

```bash
claude mcp add coherent -- coherent mcp
```

Project-scoped tools (`coherent_tokens`, `coherent_apply_design`) require running from a Coherent project directory and return a clean error otherwise.

## v0.22.0 — `coherent export tokens` (E3)

Export your design system to framework-ready files, from **one** normalized token model (`design-system.config.ts` → `tokens`). Same plumbing the gallery ships per page.

```bash
coherent export tokens                    # all three → .coherent/tokens/
coherent export tokens --format tailwind --out ./public/tokens
```

| File | What |
|---|---|
| `design-tokens.json` | canonical model (colors light/dark, typography, spacing, radius) |
| `css-variables.css` | framework-agnostic `:root` / `.dark` custom properties |
| `tailwind-v4.css` | `@import "tailwindcss"` + `@theme inline` + variables |

A **CI equivalence gate** locks the nine pure-passthrough color tokens (background, foreground, primary, secondary, muted, border, success, warning, error) to identical values across all three formats — the outputs cannot silently drift.

## v0.21.0 — `coherent import design` (F14, DESIGN.md as INPUT)

Parse an external DESIGN.md into a project's tokens. Two grammars: the Coherent extract (Atmosphere) format first, then Google Stitch / `awesome-design-md`. v1 imports **colors + font-family only** — spacing/radius/status colors/dark theme are kept unless the file explicitly carries them.

```bash
coherent import design ./stripe/DESIGN.md --dry-run   # preview
coherent import design ./stripe/DESIGN.md --yes       # apply (backup + diff)
```

Maps external names/roles to the Coherent vocabulary (`ink`→foreground, `canvas`→background, `hairline`→border, semantic hues → success/warning/error/info) and prints a full mapping/repair report: imported / mapped / repaired / kept / dropped per token, plus a before→after diff. Contrast is **accept-with-warning** — the imported palette is never mutated; failing WCAG pairs get a warning and a persistent `.coherent/import-recommendations.md` note. Frontmatter is read by a restricted safe-YAML parser (no anchors/aliases/tags/merge; depth + size caps). Writes are atomic with an automatic backup (`coherent undo` to revert).

## v0.19.0 — `coherent extract` (Tool 1, beta)

Extract atmosphere from any live URL. 3-tier hero detection (Tier 1 deterministic CSS, Tier 2 DOM-depth-weighted scoring, Tier 3 visible-text fallback) + token normalizer (OKLCH ΔE merge + px/ms canonicalization) + optional semantic LLM pass.

```bash
coherent extract https://stripe.com
coherent extract https://larevoltosa.es --settle-ms 1500
coherent extract https://figma.com --semantic --out design.md
```

SSRF-hardened (5 codex review iterations on PR #90: DNS resolve guard, redirect interception, IPv6 v4-mapped, subresource block, host-resolver-rules pin against DNS-rebind, IANA IPv4 special-range coverage). Honors robots.txt by default. Private IPs blocked at validation.

## v0.19.0 — F11 mutating-button click-guard

New validator rule `BUTTON_NO_DISABLED_ON_MUTATING` at error severity. Mutating buttons (async onClick OR `type="submit"` in a form-onSubmit page) MUST set `disabled={...}` to a pending flag. AI fix loop wires `disabled={isPending}` via `useTransition` or local state. Skip rules: `variant="link"`, `asChild`, `data-no-disable-needed`. Empirical driver: 2026-05-06 stratified n=3 benchmark found 0/171 instances across 3 generated apps — every form shipped without click-guard.

## v0.18.0 — DESIGN.md output

Every `coherent chat` writes a `DESIGN.md` in the project root summarizing the project's design system: atmosphere, color tokens (light + dark), typography, spacing, radius, voice, shared components, pages. Human-readable, GitHub-renderable, portable seed for other AI tools.

## v0.18.0 — @-syntax for shared components

In any `coherent chat` message, prefix a name with `@` to pin that shared component:

```bash
coherent chat "build pricing using @PricingTable + @TestimonialGrid"
coherent chat "regenerate landing with @CID-001 header"
```

Resolution: exact CID match (case-insensitive) → exact name match → fall back to keyword match with inline warning. Unresolved tokens print `⚠ @<name> did not match...`. Email addresses (`user@example.com`) are NOT extracted.

## Typical Workflow

```bash
# 1. Create project
mkdir my-app && cd my-app
coherent init

# 2. Generate pages
coherent chat "create a SaaS app with dashboard, settings, and pricing pages"

# 3. Preview
coherent preview

# 4. Edit in your editor (Cursor, VS Code, etc.)
# ... make changes to components, styles, logic ...

# 5. Sync Design System with your changes
coherent sync

# 6. Check quality
coherent check

# 7. Fix issues automatically
coherent fix

# 8. Export for deployment
coherent export
```

## Chat Examples

```bash
# Multi-page generation
coherent chat "create an e-commerce site with products, cart, and checkout"

# Single page
coherent chat "add a blog page with article cards and search"

# Modify existing pages
coherent chat "update the home page: make hero taller, add gradient text"

# Design tokens
coherent chat "change primary color to #6366f1 and use Inter font"

# Components
coherent chat "add a testimonial section to the home page"

# Scoped edits
coherent chat --page "Landing" "redesign the pricing section with toggle"
coherent chat --component "Header" "add notification bell with badge"

# Color scheme
coherent chat "change color scheme to indigo primary"
```

## Sync Options

```bash
coherent sync                # Full sync (tokens + components + patterns + pages)
coherent sync --tokens       # Extract CSS variables only
coherent sync --components   # Detect new components only
coherent sync --patterns     # Extract style patterns only
coherent sync --dry-run      # Preview changes without writing
```

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `COHERENT_REQUEST_TIMEOUT_MS` | `300000` | Per-LLM-call timeout. Raise for very large apps, set `0` to disable. LLM HTTP request is aborted via `AbortSignal` when exceeded. (Raised from 180s in v0.22.8 for Sonnet 5 adaptive thinking.) |
| `COHERENT_NO_CACHE` | unset | Set to `1` to disable prompt caching of the design-constraint preamble. Caching is on by default (v0.23.0) and cuts ~85K cached-token reads per multi-page run. |
| `COHERENT_PLAN_MODEL` | unset | **Experimental.** Model ID (e.g. `claude-haiku-4-5`) for the Phase 2 architecture-grouping call only — a cheaper/faster model for a low-creativity step. Page code + page planning stay on the main model. Verified functional (7/7 pages, 85/100) but not benchmarked for plan quality; enabling by default needs a supervised A/B. |
| `COHERENT_DEBUG` | unset | Set to `1` to log per-phase elapsed times, prompt-cache read/write tokens, and internal diagnostics. |
| `COHERENT_EXPERIMENTAL_PARALLEL_PHASES` | unset | Set to `1` to run Phase 3 (home page) and Phase 5 (shared components) concurrently. Saves ~20-30s per multi-page run; shared components use atmosphere-derived style hint instead of home-page context. |
| `ANTHROPIC_API_KEY` | — | Claude provider credentials. |
| `OPENAI_API_KEY` | — | OpenAI provider credentials. |

## Safety Rules

1. **Always commit before `coherent chat`** — so you can revert if needed
2. **Don't edit the same file in your editor and via CLI simultaneously**
3. **Run `coherent sync` after manual edits** — keeps Design System in sync
4. **Use `coherent undo`** to revert the last chat change
5. **Press Ctrl+C any time** — the CLI stops cleanly, releases the project lock, and exits 130

```bash
# Safe workflow
git add . && git commit -m "before adding feature"
coherent chat "add feature X"
git diff                         # review changes
git commit -m "added feature X"  # if happy
git reset --hard HEAD^           # if not
```

## Key Files

| File | Purpose |
|------|---------|
| `design-system.config.ts` | Single source of truth (pages, components, tokens) |
| `coherent.components.json` | Shared component registry (CID-001, CID-002...) |
| `.cursorrules` | AI context for Cursor editor |
| `CLAUDE.md` | AI context for Claude Code |
| `app/design-system/` | Design System viewer pages |
| `components/ui/` | shadcn/ui component library |

## When to Use CLI vs Editor

| Task | Use |
|------|-----|
| Create multiple pages at once | `coherent chat` |
| Change design tokens (colors, fonts) | `coherent chat` |
| Quick prototyping | `coherent chat` |
| Custom component logic | Editor |
| Pixel-perfect styling | Editor |
| Complex interactions | Editor |
| Fine-tuning existing pages | Editor |
