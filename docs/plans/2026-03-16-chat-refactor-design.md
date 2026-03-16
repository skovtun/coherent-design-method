# chat.ts Refactor — Design Document

**Goal:** Decompose the 3,473-line `chat.ts` monolith into 9 focused modules for testability and readability.

**Approach:** Modular decomposition by responsibility (Approach A), guided by the actual call graph.

## File Structure

```
packages/cli/src/commands/
  chat.ts                      ← thin orchestrator (~300 lines), exports chatCommand
  chat/
    request-parser.ts          ← request parsing and normalization
    split-generator.ts         ← 4-phase page generation strategy
    jsx-extractor.ts           ← JSX block extraction helpers
    layout-extractor.ts        ← extract and share layout components
    modification-handler.ts    ← applyModification (dispatch by request.type)
    code-generator.ts          ← regenerateComponent/Page/Layout/Files + validateAndFixGeneratedCode
    reporting.ts               ← print reports, showPreview, getChangeDescription
    interactive.ts             ← REPL mode (interactiveChat)
    utils.ts                   ← routeToFsPath, deduplicatePages, loadConfig, requireProject, etc.
```

## Module Responsibilities

### chat.ts (orchestrator)
- `chatCommand` function — main entry point
- Imports and coordinates all modules
- Handles top-level try/catch, backup, recent changes

### chat/request-parser.ts
- `extractInternalLinks(code)` — find internal hrefs in page code
- `inferRelatedPages(planned)` — deterministic related page inference
- `impliesFullWebsite(message)` — detect full-site intent
- `extractPageNamesFromMessage(message)` — parse page names from natural language
- `normalizeRequest(request, config)` — normalize AI output into valid request
- `applyDefaults(request)` — fill missing fields with sensible defaults
- Constants: `AUTH_FLOW_PATTERNS`, `PAGE_RELATIONSHIP_RULES`

### chat/split-generator.ts
- `splitGeneratePages(...)` — 4-phase strategy (Plan → Home → Extract Patterns → Generate)
- `buildExistingPagesContext(config)` — build context string for AI
- `extractStyleContext(pageCode)` — extract style patterns from code

### chat/jsx-extractor.ts
- `extractBalancedTag(source, tagName)` — extract JSX tag with balanced braces
- `extractRelevantImports(fullSource, jsxBlock)` — find imports used by a block
- `extractStateHooks(fullSource, jsxBlock)` — find state hooks used by a block
- `addActiveNavToHeader(code)` — inject active nav logic into header component

### chat/layout-extractor.ts
- `extractAndShareLayoutComponents(projectRoot, generatedPageFiles)` — extract header/footer from pages into shared components

### chat/modification-handler.ts
- `applyModification(request, dsm, cm, pm, projectRoot, aiProvider?, originalMessage?)` — the main modification dispatcher
- Internal handlers per request.type (add-page, update-page, add-component, update-component, update-tokens, etc.)

### chat/code-generator.ts
- `regenerateComponent(id, config, projectRoot)`
- `regeneratePage(pageId, config, projectRoot)`
- `regenerateLayout(config, projectRoot)`
- `regenerateFiles(modified, config, projectRoot)`
- `validateAndFixGeneratedCode(projectRoot, code, opts)`
- `ensureComponentsInstalled(componentIds, cm, dsm, pm, projectRoot)`

### chat/reporting.ts
- `printPostGenerationReport(opts)` — detailed generation report
- `printSharedComponentReport(opts)` — shared component operation report
- `printLinkSharedReport(opts)` — link shared component report
- `printPromoteAndLinkReport(opts)` — promote and link report
- `showPreview(requests, results, config)` — summary preview
- `getChangeDescription(request, config)` — human-readable change description
- `extractImportsFrom(code, fromPath)` — helper for import analysis in reports

### chat/interactive.ts
- `interactiveChat(options)` — REPL mode with readline

### chat/utils.ts
- `routeToFsPath(projectRoot, route, isAuth)` — route to filesystem path
- `routeToRelPath(route, isAuth)` — route to relative path
- `deduplicatePages(pages)` — deduplicate page list
- `extractComponentIdsFromCode(code)` — find component IDs in code
- `warnInlineDuplicates(...)` — warn about inline duplicates of shared components
- `loadConfig(configPath)` — load and validate config
- `requireProject()` — find config or exit
- `resolveTargetFlags(...)` — resolve --component/--page/--token flags

## Dependency Flow

```
chat.ts (orchestrator)
├── chat/utils.ts (requireProject, loadConfig, resolveTargetFlags)
├── chat/request-parser.ts (normalizeRequest, applyDefaults, extractInternalLinks)
├── chat/split-generator.ts (splitGeneratePages)
│   └── chat/request-parser.ts (extractPageNamesFromMessage, inferRelatedPages)
├── chat/modification-handler.ts (applyModification)
│   ├── chat/code-generator.ts (regenerateComponent, validateAndFixGeneratedCode)
│   ├── chat/reporting.ts (printPostGenerationReport, printSharedComponentReport)
│   └── chat/utils.ts (routeToFsPath, extractComponentIdsFromCode)
├── chat/layout-extractor.ts (extractAndShareLayoutComponents)
│   └── chat/jsx-extractor.ts (extractBalancedTag, extractRelevantImports)
├── chat/code-generator.ts (regenerateFiles)
├── chat/reporting.ts (showPreview, getChangeDescription)
└── chat/interactive.ts (interactiveChat)
```

## Constraints

- All existing exports from chat.ts must remain (chatCommand)
- No behavioral changes — pure structural refactor
- Tests must pass before and after
- Each module must be independently importable and testable
