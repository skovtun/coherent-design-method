# Backlog / тикеты

Тикеты, выявленные в ходе тестирования или ревью. Не блокируют закрытие эпика, но фиксируются для последующей реализации.

---

## Resolved

### ~~[Next.js] Deprecated next@15.0.3~~
**Status:** RESOLVED — upgraded to 15.2.4 in `versions.ts`, `init.ts`, `eslint-config-next`.

### ~~[Validator] False positives on `<button` in comments/strings~~
**Status:** RESOLVED — `isInsideCommentOrString()` + multi-line `/* */` tracking in `checkLines()`.

### ~~[Generator] Components without className have no styles~~
**Status:** RESOLVED — fallback styles for both shadcn and custom paths via `getFallbackBaseClassName()`.

### ~~[Shared] Name collision on bulk page generation~~
**Status:** RESOLVED — `resolveUniqueName()` in `SharedComponentGenerator`, deduplicates with numeric suffix.

### ~~[Reliability] No rollback on crash mid-write~~
**Status:** RESOLVED — atomic writes (write-to-temp-then-rename) + `batchWriteFiles()` with backup/restore.

### ~~[Reliability] Race condition on parallel `coherent chat`~~
**Status:** RESOLVED — `.coherent.lock` file lock with stale detection and PID check.

### ~~[Auth] Route group for auth pages~~
**Status:** RESOLVED — `ensureAuthRouteGroup()` creates `app/(auth)/layout.tsx` and `ShowWhenNotAuthRoute` guard. Auto-scaffold now also checks `app/(auth)/` before creating auth pages.

### ~~[Self-healing] Pipeline audit~~
**Status:** RESOLVED — input type guard, command injection prevention (SAFE_PKG_NAME regex), readdir error handling, NODE_BUILTINS expanded with `async_hooks`, `diagnostics_channel`, `test`.

### ~~[Export] Pipeline audit~~
**Status:** RESOLVED — `ensureReadmeDeploySection` wrapped in try/catch, `countPages` readdir protected.

### ~~[Figma] Import pipeline audit~~
**Status:** RESOLVED — 429 retry with Retry-After, safeJson parsing, extractFileKey supports `/design/` URLs, null guards in parser for styles/components, non-FRAME fallback fix, urlOrKey validation in CLI.

---

## Open

### [Testing] E2E тесты для auto-scaffold

**Описание:** E2E тест: `coherent init` → `coherent chat "add login page"` → проверка что signup и forgot-password авто-созданы.

**Приоритет:** Medium — новая фича, нужен ручной прогон.

### [Config] Migration для существующих проектов

**Описание:** Проекты, инициализированные до добавления `autoScaffold`, не имеют этого поля в конфиге. Zod `.default(false)` обрабатывает parsing, но стоит добавить явную миграцию при загрузке конфига.

**Приоритет:** Low — Zod уже покрывает, но migration даст чистые конфиги.

### [Figma] FILL style — placeholder colors

**Описание:** Parser ставит `{ r: 0, g: 0, b: 0, a: 1 }` для всех FILL стилей. Реальные цвета требуют `/styles` API или разбора fill node. `FigmaTokenExtractor.isRealColor()` уже фильтрует чёрные плейсхолдеры.

**Приоритет:** Low — не блокирует, цвета из конфига перекрывают.
