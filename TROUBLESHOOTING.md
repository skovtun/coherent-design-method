# Troubleshooting Guide

Документация ошибок и их решений при разработке и использовании Coherent Design Method.

---

## Build Errors

### Error: `Property 'strategies' is missing in type '{ enabled: false; }'`

**Файл:** `packages/core/src/types/design-system.ts:620`

**Проблема:**
```typescript
features: {
  authentication: { enabled: false },  // ❌ Missing 'strategies' property
  // ...
}
```

**Причина:**
- В Zod схеме `FeaturesSchema` поле `authentication.strategies` имеет `.default([])`, но это не делает поле опциональным в TypeScript типе
- TypeScript строгий режим требует наличие всех полей, даже если они имеют default значения в Zod
- При создании объекта `{ enabled: false }` TypeScript видит, что тип требует также `strategies` и `provider`

**Решение:**
```typescript
features: {
  authentication: { enabled: false, strategies: [] },
  payments: { enabled: false },
  analytics: { enabled: false },
  database: { enabled: false },
  stateManagement: { enabled: false, provider: 'zustand' },
},
```

**Примечание:** Несмотря на то, что Zod имеет `.default()` значения, TypeScript требует явного указания полей при создании объектов. Это связано с тем, что TypeScript типы выводятся из Zod схемы, и default значения не делают поля опциональными в TypeScript типе.

**Дата исправления:** 2025-01-26

---

### Error: `Property 'provider' is missing in type '{ enabled: false; }'`

**Файл:** `packages/core/src/types/design-system.ts:624`

**Проблема:**
```typescript
features: {
  stateManagement: { enabled: false },  // ❌ Missing 'provider' property
}
```

**Причина:**
- Аналогично предыдущей ошибке, поле `stateManagement.provider` имеет `.default('zustand')` в Zod схеме
- TypeScript требует явного указания поля при создании объекта

**Решение:**
```typescript
stateManagement: { enabled: false, provider: 'zustand' },
```

**Дата исправления:** 2025-01-26

---

### Error: BuildError в браузере (localhost) — `React is not defined` / `React.ReactNode`

**Симптомы:**
- В браузере при открытии приложения показывается "Build Error"
- В консоли/стеке: `BuildError`, `renderWithHooks`, `updateFunctionComponent`

**Причина:**
- В `app/layout.tsx` используется тип `React.ReactNode` в пропсе `children`, но `React` не импортирован
- В Next.js 13+ с новым JSX transform импорт `React` для JSX не добавляется автоматически, поэтому идентификатор `React` в типах не определён

**Решение:**
- Использовать именованный тип из `react` вместо `React.ReactNode`:

```tsx
// Было:
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {

// Стало:
import type { ReactNode } from 'react'
// ...
export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
```

- Генераторы (PageGenerator, PageManager) обновлены: в layout выводится `import type { ReactNode } from 'react'` и тип `children: ReactNode`
- В уже созданном проекте: вручную добавить в `app/layout.tsx` строку `import type { ReactNode } from 'react'` и заменить `React.ReactNode` на `ReactNode`

**Дата исправления:** 2026-01-26

---

### Error: BuildError в браузере — интерфейс ButtonProps с `className?: string` в extends

**Симптомы:**
- BuildError при открытии приложения в браузере
- В `components/button.tsx` интерфейс объявлен как `extends A, B, className?: string {}`

**Причина:**
- В TypeScript в списке `extends` могут быть только типы/интерфейсы. Свойство `className?: string` должно быть в теле интерфейса `{ }`, а не в `extends`.

**Решение:**
```tsx
// Было (неверно):
export interface ButtonProps
  extends VariantProps<...>, React.ButtonHTMLAttributes<...>,
    className?: string {}

// Стало:
export interface ButtonProps
  extends VariantProps<...>, React.ButtonHTMLAttributes<...> {
  className?: string
}
```

- В `ComponentGenerator.ts` исправлена генерация: опциональные поля (className, aria-*) выводятся в теле интерфейса, а не в списке extends.

**Дата исправления:** 2026-01-29

---

### Error: `Argument of type 'string' is not assignable to parameter of type '"xs"'...`

**Файл:** `packages/core/src/managers/ComponentManager.ts:476`

**Проблема:**
```typescript
const existingSizeNames = existing.sizes.map(s => s.name)
const hasAllSizes = requested.requiredSizes.every(s =>
  existingSizeNames.includes(s)  // ❌ Type error: string vs literal type
)
```

**Причина:**
- `ComponentSize.name` имеет тип `'xs' | 'sm' | 'md' | 'lg' | 'xl'` (literal union)
- `requiredSizes` имеет тип `string[]` (generic string array)
- TypeScript строгий режим требует точного соответствия типов

**Решение:**
```typescript
const existingSizeNames = existing.sizes.map(s => s.name)
// Type guard: check if string is a valid ComponentSize name
const isValidSize = (s: string): s is 'xs' | 'sm' | 'md' | 'lg' | 'xl' => {
  return ['xs', 'sm', 'md', 'lg', 'xl'].includes(s as 'xs' | 'sm' | 'md' | 'lg' | 'xl')
}
const hasAllSizes = requested.requiredSizes.every(s =>
  isValidSize(s) && existingSizeNames.includes(s)
)
```

**Примечание:** Использован type guard для безопасной проверки типов вместо прямого type assertion.

**Дата исправления:** 2025-01-26

---

### Error: `'requested.name' is possibly 'undefined'`

**Файл:** `packages/core/src/managers/ComponentManager.ts:514`

**Проблема:**
```typescript
if (requested.name) {
  const nameMatch = candidates.find(
    c => c.name.toLowerCase() === requested.name.toLowerCase()  // ❌ Possibly undefined
  )
}
```

**Причина:**
- TypeScript strict mode требует проверки на `undefined`
- Даже после проверки `if (requested.name)`, TypeScript не всегда сужает тип внутри callback

**Решение:**
```typescript
if (requested.name) {
  const requestedName = requested.name.toLowerCase()
  const nameMatch = candidates.find(
    c => c.name.toLowerCase() === requestedName
  )
  if (nameMatch) {
    return nameMatch
  }
}
```

**Дата исправления:** 2025-01-26

---

## Runtime Errors

### Error: `Module not found: Can't resolve '@coherent/core'`

**Проблема:**
При запуске CLI команды возникает ошибка, что модуль `@coherent/core` не найден.

**Причина:**
- Пакет `@coherent/core` не собран
- Workspace dependencies не установлены
- Неправильная конфигурация pnpm workspace

**Решение:**
```bash
# 1. Установить зависимости
cd /Users/sergeipro/coherent-design-method
pnpm install

# 2. Собрать core пакет
cd packages/core
pnpm build

# 3. Собрать CLI пакет
cd ../cli
pnpm build

# 4. Проверить что dist/ созданы
ls packages/core/dist/
ls packages/cli/dist/
```

**Дата:** 2025-01-26

---

### Error: `Module not found: Can't resolve 'lucide-react'` (страница Services и др.)

**Проблема:**
При открытии страницы (например Services) Next.js выдаёт ошибку сборки: не найден модуль `lucide-react`.

**Причина:**
Страница сгенерирована с импортом иконок из `lucide-react`, но пакет не установлен в проекте или отсутствует в `node_modules`.

**Решение:**

Важно: команды нужно выполнять **в той же папке, откуда вы запускаете `pnpm dev`** (там, где лежат `app/`, `package.json` и `design-system.config.ts`). Если приложение в подпапке (например `.tmp-e2e`), перейдите в неё: `cd .tmp-e2e`.

```bash
cd .tmp-e2e   # если приложение там
coherent fix
```

Либо вручную:

```bash
pnpm add lucide-react
# или
npm install lucide-react
```

После установки **перезапустите** dev-сервер (Ctrl+C и снова `pnpm dev`).

Подробный разбор типичных причин, почему ошибка не исчезает: [docs/LUCIDE_REACT_DEBUG.md](docs/LUCIDE_REACT_DEBUG.md).

**Дата:** 2025-01-26

---

### Error: `SyntaxError: Invalid or unexpected token` при запуске `coherent`

**Файл:** `packages/cli/dist/index.js:2`

**Проблема:**
```bash
$ coherent init
file:///Users/.../packages/cli/dist/index.js:2
#!/usr/bin/env node
^

SyntaxError: Invalid or unexpected token
```

**Причина:**
- В ESM модулях (`"type": "module"` в package.json) Node.js не может обработать shebang в начале файла
- Когда файл загружается как ESM модуль, Node.js пытается его парсить как JavaScript, и shebang вызывает синтаксическую ошибку
- Shebang работает только в CommonJS модулях или при прямом запуске файла через `node file.js`

**Решение:**
Использовать wrapper скрипт для ESM модулей:

1. **Создать wrapper скрипт:**
```bash
# packages/cli/bin/coherent
#!/usr/bin/env node
import('../dist/index.js')
```

2. **Обновить bin entry в package.json:**
```json
{
  "bin": {
    "coherent": "./bin/coherent"
  },
  "files": [
    "dist",
    "bin",
    "README.md"
  ]
}
```

3. **Убрать shebang из исходного файла:**
```typescript
// packages/cli/src/index.ts
// Убрать строку: #!/usr/bin/env node
// Load environment variables from .env file
import { config } from 'dotenv'
```

4. **Убрать banner из tsup.config.ts:**
```typescript
// packages/cli/tsup.config.ts
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  shims: true,
  // Shebang removed for ESM modules
  // Using wrapper script instead
})
```

5. **Установить права на wrapper скрипт:**
```bash
# Если вы находитесь в packages/cli:
chmod +x bin/coherent

# Или из корня проекта:
chmod +x packages/cli/bin/coherent
```

6. **Пересобрать и перелинковать:**
```bash
cd packages/cli
pnpm build
pnpm link --global
```

**Важно:** Убедитесь, что вы находитесь в правильной директории при выполнении команды `chmod`. Если вы в `packages/cli`, используйте `bin/coherent`. Если в корне проекта, используйте `packages/cli/bin/coherent`.

**Примечание:** Для ESM модулей (`"type": "module"`) Node.js не может обработать shebang в начале файла при загрузке как модуль. Wrapper скрипт решает эту проблему, позволяя использовать shebang в отдельном файле, который затем импортирует ESM модуль.

**Дата исправления:** 2025-01-26

---

### Error: `Permission denied` при запуске `coherent`

**Проблема:**
```bash
$ coherent init
zsh: permission denied: coherent
```

**Причина:**
- Исполняемый файл не имеет прав на выполнение
- Проблема с bin entry в package.json

**Решение:**
```bash
# 1. Пересобрать пакет
cd packages/cli
pnpm build

# 2. Перелинковать (если используете pnpm link)
pnpm link --global

# 3. Проверить bin entry в package.json
# Должно быть:
"bin": {
  "coherent": "./dist/index.js"
}

# 4. Если проблема остается, установить права вручную
chmod +x packages/cli/dist/index.js
```

**Дата:** 2025-01-26

---

## TypeScript Errors

### Error: `Cannot find module '@coherent/core'` в IDE

**Проблема:**
IDE показывает ошибки импорта, хотя код компилируется.

**Причина:**
- TypeScript не видит workspace dependencies
- Неправильная конфигурация `tsconfig.json`

**Решение:**
```json
// packages/cli/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@coherent/core": ["../core/src"]
    }
  }
}
```

**Дата:** 2025-01-26

---

## CLI Errors

### Error: `No API key found` / `API key required`

**Проблема:**
```bash
$ coherent chat "make buttons blue"

❌ No API key found

To use Coherent, you need an AI provider API key.

┌─ Quick Setup ─────────────────────────────────────┐
│                                                    │
│  Option 1: Claude (Anthropic)                     │
│  Get key: https://console.anthropic.com/          │
│                                                    │
│  Copy and run this command:                       │
│  ┌──────────────────────────────────────────────┐ │
│  │ echo "ANTHROPIC_API_KEY=sk-..." > .env       │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  Option 2: OpenAI (ChatGPT)                       │
│  Get key: https://platform.openai.com/            │
│                                                    │
│  Copy and run this command:                       │
│  ┌──────────────────────────────────────────────┐ │
│  │ echo "OPENAI_API_KEY=sk-..." > .env          │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  Then run: coherent init                          │
│                                                    │
└────────────────────────────────────────────────────┘

Note: If using Cursor, your CURSOR_OPENAI_API_KEY
will be detected automatically.
```

**Причина:**
- Coherent использует AI провайдеры (Claude или OpenAI) для генерации кода
- Команды `coherent chat` требуют API ключ
- Команда `coherent init` НЕ требует API ключ (создает базовый проект)

**Решение:**

1. **Выберите провайдера:**
   - **Claude**: [console.anthropic.com](https://console.anthropic.com)
   - **OpenAI**: [platform.openai.com](https://platform.openai.com)

2. **Настроить ключ:**
   ```bash
   # Claude
   echo "ANTHROPIC_API_KEY=your_key_here" > .env
   
   # Или OpenAI
   echo "OPENAI_API_KEY=your_key_here" > .env
   ```

3. **Автоматическое обнаружение:**
   - Если используете Cursor, `CURSOR_OPENAI_API_KEY` будет обнаружен автоматически
   - Coherent проверяет ключи в порядке: OpenAI → Claude

**Важно:**
- API ключ нужен только для команд `coherent chat` (модификация через AI)
- Команда `coherent init` работает без API ключа
- Каждый пользователь должен иметь свой ключ
- Ключ не передается третьим лицам

**Дата:** 2025-01-26

---

### Проблема: `coherent init` показывает интерактивные вопросы (Discovery Agent)

**Проблема:**
```bash
$ coherent init
🎨 Coherent Design Method – Project Discovery
Let's understand your project requirements...
? What are you building? (Use arrow keys)
> SaaS Application
  Landing Page
  Dashboard
  ...
```

**Причина:**
- Используется старая версия CLI, собранная до упрощения `coherent init`
- CLI не был пересобран после удаления Discovery Agent
- Кэш терминала или Node.js содержит старую версию

**Решение:**

1. **Пересобрать CLI:**
   ```bash
   cd packages/cli
   pnpm build
   ```

2. **Перелинковать глобально (если используете `pnpm link`):**
   ```bash
   cd packages/cli
   pnpm link --global
   ```

3. **Перезапустить терминал:**
   - Закройте и откройте терминал заново
   - Это очистит кэш Node.js

4. **Проверить версию:**
   ```bash
   coherent --version
   which coherent
   ```

**Ожидаемое поведение:**
```bash
$ coherent init

🎨 Initializing Coherent project...

✔ Design system created
✔ Project structure created

✅ Project initialized successfully!

📦 Next steps:
   1. npm install
   2. coherent preview
   3. coherent chat "add dashboard page"
```

**Важно:**
- `coherent init` больше НЕ задает вопросы
- Проект создается автоматически с минимальной конфигурацией
- Кастомизация происходит через `coherent chat` после инициализации

**Дата:** 2025-01-26

---

### Error: `Project not initialized` при `coherent chat`

**Проблема:**
```bash
$ coherent chat "make buttons blue"
Error: Design system config not found
```

**Решение:**
```bash
# 1. Убедиться что находитесь в директории проекта
cd /path/to/your/project

# 2. Проверить наличие config файла
ls design-system.config.ts

# 3. Если файла нет, инициализировать проект
coherent init
```

**Дата:** 2025-01-26

---

### Error: `Failed to parse modification: Unterminated string in JSON`

**Проблема:**
```bash
$ coherent chat "create me an API portal with dashboard, account, settings pages..."
✖ Chat command failed
Failed to parse modification: Unterminated string in JSON at position 14170 (line 378 column 327)
```

**Причина:** Ответ модели слишком большой или содержит невалидный JSON (обрыв строки, неэкранированные кавычки/переносы внутри строк). Часто при запросе «создать много страниц и секций за раз».

**Решение:**
1. Разбейте запрос на несколько команд (рекомендуется):
   ```bash
   coherent chat "add dashboard page with stats and recent activity"
   coherent chat "add account page"
   coherent chat "add settings page"
   ```
2. В коде увеличен лимит токенов ответа (16384) и добавлены инструкции по валидному JSON; обновите CLI (`pnpm build` в монорепо и переустановите/перелинкуйте `coherent`).

**Дата:** 2025-02-02

---

## Code Generation Errors

### Error: `Invalid config file format` при загрузке

**Проблема:**
```typescript
Error: Invalid config file format. Expected: export const config = { ... }
```

**Причина:**
- Файл `design-system.config.ts` поврежден или изменен вручную
- Неправильный формат экспорта

**Решение:**
```typescript
// Правильный формат:
export const config: DesignSystemConfig = {
  // ... config object
} as const

// НЕПРАВИЛЬНО:
const config = { ... }
export default config
```

**Дата:** 2025-01-26

---

## Development Errors

### Error: `pnpm: command not found`

**Проблема:**
```bash
$ pnpm install
zsh: command not found: pnpm
```

**Решение:**
```bash
# Установить pnpm глобально
npm install -g pnpm

# Или использовать npm вместо pnpm
npm install
```

**Дата:** 2025-01-26

---

### Error: `tsup: command not found`

**Проблема:**
При сборке пакетов возникает ошибка, что `tsup` не найден.

**Решение:**
```bash
# 1. Установить зависимости
pnpm install

# 2. Проверить что tsup в devDependencies
# package.json должен содержать:
"devDependencies": {
  "tsup": "^8.0.1"
}

# 3. Использовать pnpm для запуска скриптов
pnpm build  # вместо npm run build
```

**Дата:** 2025-01-26

---

## Known Issues

### Issue: Конфликт имен в ProjectScaffolder

**Файл:** `packages/core/src/generators/ProjectScaffolder.ts`

**Проблема:**
Импорт `writeFile` из `fs/promises` конфликтует с методом `writeFile()` класса.

**Решение:**
```typescript
// Переименовать импорт
import { writeFile as fsWriteFile, mkdir } from 'fs/promises'

// Использовать fsWriteFile в методе
await fsWriteFile(fullPath, content, 'utf-8')
```

**Дата исправления:** 2025-01-26

---

### Issue: Хардкод appType в ProjectScaffolder

**Файл:** `packages/core/src/generators/ProjectScaffolder.ts`

**Проблема:**
Методы `generatePages()` и `generateRootLayout()` использовали хардкод `'multi-page'` вместо значения из config.

**Решение:**
```typescript
// Было:
const code = await this.pageGenerator.generate(page, 'multi-page')

// Стало:
const appType = this.config.settings.appType || 'multi-page'
const code = await this.pageGenerator.generate(page, appType)
```

**Дата исправления:** 2025-01-26

---

## UI / Design System

### Дублирование навигации на странице Documentation

**Симптомы:** На `/design-system/docs` и внутренних страницах (Components, Tokens и т.д.) видно:
- Вторую навигационную строку «← Back to App Design System Documentation» под основной шапкой DS;
- Ссылку «← Documentation» над контентом.

**Почему так вышло (корневая причина):**

1. **Исправления вносились только в генератор** (шаблоны в `packages/core`): убрали шапку из docs layout, убрали «← Documentation» со страниц. Новые проекты после `coherent init` получают правильные файлы.

2. **Уже созданные проекты не обновлялись:** при повторном запуске `coherent init` в том же проекте команда сразу выходит с «Project already initialized» и **не перезаписывает** `app/design-system/docs/*`. Поэтому в проекте оставались старые `layout.tsx` (с шапкой) и старые `page.tsx` (со ссылкой «← Documentation»).

3. За несколько итераций правились только шаблоны; способа **применить эти правки к существующему проекту** не было.

**Решение (одна команда):**

В корне вашего Coherent-проекта выполните:

```bash
coherent regenerate-docs
```

Команда перезаписывает `app/design-system/docs/` актуальными шаблонами (layout без шапки, страницы без «← Documentation», индекс без дублирующего заголовка). После этого дублирование навигации исчезает.

**Альтернатива вручную:** заменить содержимое `app/design-system/docs/layout.tsx` и всех `app/design-system/docs/**/page.tsx` на версии из текущего генератора (см. `packages/core/src/generators/ProjectScaffolder.ts`, методы `getDocsLayoutContent`, `getDocsIndexContent`, `getDocs*PageContent`).

---

## Best Practices для предотвращения ошибок

1. **Всегда проверяйте типы перед использованием:**
   ```typescript
   if (value) {
     const safeValue = value  // Type narrowing
     // Использовать safeValue
   }
   ```

2. **Используйте type assertions только когда необходимо:**
   ```typescript
   // Хорошо: с проверкой
   if (validSizes.includes(size as ComponentSizeName)) {
     // ...
   }
   
   // Плохо: без проверки
   const size = value as ComponentSizeName
   ```

3. **Проверяйте undefined для optional полей:**
   ```typescript
   // Хорошо
   if (requested.name) {
     const name = requested.name  // Type narrowed
   }
   
   // Плохо
   requested.name.toLowerCase()  // Possibly undefined
   ```

4. **Используйте правильные типы из схем:**
   ```typescript
   // Хорошо: использовать типы из Zod схем
   import type { ComponentSize } from '../types/design-system.js'
   
   // Плохо: определять типы вручную
   type Size = 'xs' | 'sm' | 'md'
   ```

---

## Как добавить новую ошибку в этот документ

1. **Формат записи:**
   ```markdown
   ### Error: [Краткое описание]
   
   **Файл:** `path/to/file.ts:line`
   
   **Проблема:**
   ```typescript
   // Код с ошибкой
   ```
   
   **Причина:**
   Объяснение почему возникает ошибка
   
   **Решение:**
   ```typescript
   // Исправленный код
   ```
   
   **Дата исправления:** YYYY-MM-DD
   ```

2. **Категории:**
   - Build Errors
   - Runtime Errors
   - TypeScript Errors
   - CLI Errors
   - Code Generation Errors
   - Development Errors
   - Known Issues

3. **Обновлять после каждого исправления:**
   - Добавлять новую запись
   - Обновлять дату
   - Указывать файл и строку

---

---

### Error: `SyntaxError: Unexpected token, expected "(" (51:12)` в `app/globals.css`

**Сначала проверьте:** если проект создан **старой версией CLI** (до исправлений CSS/Tailwind), проблема часто решается без правки конфигов. PostCSS config в актуальном CLI уже правильный.

**Решение для старых проектов — пересоздать с новой версией CLI:**
```bash
# Удалить старый проект
rm -rf my-project

# Пересобрать и перелинковать CLI
cd coherent-design-method/packages/cli
pnpm build
pnpm link --global

# Создать новый проект
mkdir coherent-test && cd coherent-test
coherent init
npm run dev
```
После этого сборка должна проходить без ошибок. Ниже — техническое описание для случаев, когда пересоздание невозможно.

---

**Проблема (технически):**
```bash
SyntaxError: Unexpected token, expected "(" (51:12)
./app/globals.css.webpack[javascript/auto]!=!./node_modules/next/dist/build/webpack/loaders/css-loader/src/index.js...
```

**Причина:**
- Tailwind при загрузке конфига использует **jiti/sucrase** для TypeScript-файлов. В некоторых контекстах (Next.js build) в `loadConfig()` попадает путь к **CSS-файлу** вместо конфига, и Sucrase пытается парсить CSS как JavaScript → ошибка на строке 51.
- Дополнительно: большие блоки `:root`/`.dark` в `globals.css` увеличивают размер файла; мы вынесли переменные в layout.

**Решение (обходной путь, внедрён в CLI):**

1. **Минимальный `globals.css`:** в файле остаются только директивы `@tailwind` и базовые правила (`* { border-color }`, `body { background, color }`). Блоки с переменными темы (`:root`, `.dark`) в `globals.css` больше не генерируются.

2. **Переменные темы в layout:** токены дизайн-системы выводятся в `app/layout.tsx` через inline-стиль:
   ```tsx
   <head>
     <style dangerouslySetInnerHTML={{ __html: `:root { ... } .dark { ... }` }} />
   </head>
   ```
   Так стили не проходят через проблемный CSS-пайплайн при сборке.

3. **Автофикс для существующих проектов:**
   ```bash
   coherent preview   # или coherent chat "…"
   ```
   При необходимости `fixGlobalsCss()` перезаписывает `globals.css` в минимальный вид и добавляет блок `<head><style>...</style></head>` в `app/layout.tsx`, если его ещё нет.

**Проверка после исправления:**
```bash
# globals.css должен быть коротким (без :root / .dark)
cat app/globals.css

# layout.tsx должен содержать dangerouslySetInnerHTML с переменными
grep -A1 dangerouslySetInnerHTML app/layout.tsx
```

4. **Конфиг Tailwind в формате CommonJS (`tailwind.config.cjs`):** генератор создаёт `tailwind.config.cjs` вместо `.ts`. Тогда Tailwind подгружает конфиг через `require()` и **не вызывает jiti/sucrase** — ошибка 51:12 исчезает. В `postcss.config.mjs` явно указан путь: `tailwindcss: { config: path.resolve(__dirname, 'tailwind.config.cjs') }`.

**Технические детали:**
- `ProjectScaffolder` генерирует `tailwind.config.cjs` через `TailwindConfigGenerator.generateCjs()` и в PostCSS указывает на него.
- `ProjectScaffolder.generateGlobalsCss()` генерирует только минимальный CSS; переменные темы — в layout через `buildCssVariables()`.
- Для уже созданных проектов: переименуйте/пересоздайте конфиг в `tailwind.config.cjs` (формат `module.exports = { ... }`) и в `postcss.config.mjs` укажите `config: path.resolve(__dirname, 'tailwind.config.cjs')`.

**Дата исправления:** 2025-01-26, обновлено 2025-01-28

---

---

### Error: `ENOENT: no such file or directory, uv_cwd` при запуске команд

**Проблема:**
```bash
Error: ENOENT: no such file or directory, uv_cwd
    at process.wrappedCwd [as cwd]
    at Object.configDotenv
```

**Причина:**
- Текущая рабочая директория была удалена или стала недоступна
- CLI пытается загрузить `.env` файл используя `dotenv.config()`, который вызывает `process.cwd()`
- Если директория была удалена, `process.cwd()` выбрасывает ошибку `ENOENT`

**Решение:**
Исправлено в CLI версии 0.1.0:
- Добавлена обработка ошибок в `dotenv.config()` - игнорируются ошибки `ENOENT` и `ENOTDIR`
- Улучшена функция `findConfig()` для безопасной обработки недоступных директорий

**Что делать:**
1. Убедитесь, что вы находитесь в существующей директории:
   ```bash
   pwd  # Проверьте текущую директорию
   ```

2. Если директория была удалена, перейдите в другую:
   ```bash
   cd ~
   mkdir my-project && cd my-project
   coherent init  # Создайте новый проект
   ```

3. Если проблема сохраняется, откройте новый терминал

**Дополнительно:** В команде `coherent init` добавлена проверка доступности текущей директории в начале выполнения. Если директория недоступна, выводится понятное сообщение с инструкцией вместо ошибки записи файла.

**Дата исправления:** 2025-01-28

---

**Последнее обновление:** 2025-01-28
