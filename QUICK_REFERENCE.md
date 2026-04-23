# Quick Reference

A cheat sheet for Coherent CLI commands and workflows.

## Commands

```bash
coherent init                    # Create a new project
coherent chat "<message>"        # Generate/modify pages with AI
coherent chat --page "X" "..."   # Edit only page X
coherent chat --component "X" "..."  # Edit shared component X
coherent chat --dry-run "..."       # Preview changes without applying
coherent chat --atmosphere <name> "..."  # Use a named atmosphere preset (see --list-atmospheres)
coherent chat --list-atmospheres # Show all 10 atmosphere presets and exit
coherent wiki adr create <slug>  # Scaffold a new ADR (next number + skeleton sections)
coherent components list         # Show all shared + UI components
coherent status                  # Show project stats (pages, components, tokens)
coherent preview                 # Start dev server (http://localhost:3000)
coherent check                   # Show quality issues (read-only)
coherent fix                     # Auto-fix all issues (compact report)
coherent fix --verbose           # Auto-fix with per-file breakdown
coherent fix --journal           # Capture session YAML to .coherent/fix-sessions/ for later review
coherent journal list            # List captured fix sessions
coherent journal aggregate       # Rank validators by recurrence across all sessions
coherent journal prune           # Delete sessions older than --keep-days (default 30)
coherent journal prune --dry-run # Preview what would be deleted
coherent sync                    # Sync Design System after manual edits
coherent export                  # Export clean project for deployment
coherent undo                    # Revert last coherent chat
coherent update                  # Apply platform updates to project
coherent rules                   # Show active design constraint rules
coherent migrate                 # Run version migrations
coherent baseline                # Structural regression check (fingerprints + compares pages)
coherent baseline --save         # Record new baseline without comparing
coherent report-issue --page X   # Pre-filled GitHub issue URL with project context
```

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
| `COHERENT_REQUEST_TIMEOUT_MS` | `180000` | Per-LLM-call timeout. Raise for very large apps, set `0` to disable. LLM HTTP request is aborted via `AbortSignal` when exceeded. |
| `COHERENT_DEBUG` | unset | Set to `1` to log per-phase elapsed times and internal diagnostics. |
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
