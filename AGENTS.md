# AGENTS.md — Coherent Design Method

> How AI agents should work with this codebase.

## Project Structure

```
packages/
  cli/          # @getcoherent/cli — CLI tool (coherent init/chat/preview/export)
  core/         # @getcoherent/core — Generators, types, managers
docs/           # Case studies, documentation
.bmad-core/     # BMAD agent templates and checklists
.cursor/rules/  # Cursor AI rules (BMAD agents, UI generation)
```

## Development Workflow

### Before coding
1. Write a failing test (RED)
2. Implement the fix (GREEN)  
3. Refactor if needed (REFACTOR)
4. Run `pnpm test` — must be all green before commit

### Commands
```bash
pnpm build          # Build all packages
pnpm test           # Run all tests (vitest)
pnpm lint           # ESLint
pnpm typecheck      # TypeScript strict check
```

### Testing
- Tests live next to source: `foo.ts` → `foo.test.ts`
- Framework: vitest
- Every bug fix MUST have a regression test
- Run tests before every commit

### CI Pipeline
Build → Lint → Typecheck → Test (all must pass)

## Architecture Decisions

### Packages
- **core**: Pure logic — generators, schemas, managers. No side effects, no I/O prompts.
- **cli**: User-facing — commands, AI providers, file I/O, spinners.

### Key patterns
- **Zod schemas** validate all AI-generated data with `.transform()` for auto-correction
- **`autoFixCode()`** post-processes generated TSX to fix common AI mistakes
- **Shared components** are extracted from pages and registered in `design-system.config.ts`
- **Backups** are created after every `coherent chat` in `.coherent/backups/`

### Error handling rules
- Every CLI command must have a top-level try/catch
- Never swallow errors silently (no empty `catch {}`)
- Use `ora` spinners — always `.fail()` or `.warn()` on error (never leave running)
- API rate limits: `maxRetries: 1` to fail fast

### Common AI generation bugs to guard against
- `&lt;` / `&gt;` / `&amp;` HTML entities in JavaScript code
- Non-existent lucide-react icon names (validate against package exports)
- Routes without leading `/` (auto-fix in Zod schema)
- Dynamic routes `[id]` in navigation links (filter out)
- Missing `"use client"` when hooks are used

## BMAD Agents (optional)

Use `@architect` before major features. Use `@qa` for quality reviews.
See `.cursor/rules/bmad/` for available agents.
