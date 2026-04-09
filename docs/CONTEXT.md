# Coherent Design Method — контекст проекта

**Дата:** 2025-02-02  
**Назначение:** Краткий контекст для онбординга и продолжения разработки. Принятые архитектурные решения (модель после init, судьба chat, кастомные компоненты) — в `packages/docs/PROJECT.md` §7.1.

---

## 1. Структура файлов Design System

### 1.1. В репозитории (исходники генераторов)

```
packages/core/src/
├── generators/
│   ├── DesignSystemGenerator.ts    # Собирает карту файлов design-system
│   ├── ProjectScaffolder.ts        # Пишет файлы в проект, в т.ч. app/design-system/docs/*
│   └── templates/
│       ├── api/
│       │   └── design-system-config.ts   # GET /api/design-system/config
│       └── design-system/
│           ├── index.ts                   # реэкспорт шаблонов
│           ├── design-system-layout.ts   # layout /design-system (header, sidebar, breadcrumbs)
│           ├── design-system-home.ts      # устаревший статический home (не используется)
│           ├── component-dynamic.ts       # серверная обёртка для [id]
│           ├── component-showcase.ts      # устаревший статический showcase
│           └── (COMPONENT_DYNAMIC_PAGE, COMPONENT_SHOWCASE_CLIENT — в коде DesignSystemGenerator)
```

**DesignSystemGenerator** формирует только design-system часть; **ProjectScaffolder** дополнительно генерирует `app/design-system/docs/*` и `recommendations.md`.

### 1.2. В сгенерированном проекте (после `coherent init`)

```
<project-root>/
├── design-system.config.ts         # Единый конфиг (страницы, компоненты, токены)
├── recommendations.md              # UX-рекомендации (дополняется при chat)
│
├── app/
│   ├── layout.tsx                  # Корневой layout (AppNav скрыт на /design-system)
│   ├── AppNav.tsx                 # Клиентский nav + FAB "Design System"
│   ├── page.tsx                   # Главная приложения
│   ├── globals.css
│   │
│   ├── design-system/
│   │   ├── layout.tsx             # DS layout: header, breadcrumbs, условный sidebar
│   │   ├── page.tsx               # DS home (динамика: компоненты + токены из API)
│   │   ├── components/
│   │   │   └── [id]/
│   │   │       ├── page.tsx       # Серверная обёртка, читает config
│   │   │       └── ComponentShowcase.tsx  # Клиент: варианты/размеры, превью
│   │   └── tokens/
│   │       ├── page.tsx           # Токены: ссылки на colors, typography, spacing
│   │       ├── colors/page.tsx    # Цвета (light/dark), swatches
│   │       ├── typography/page.tsx
│   │       └── spacing/page.tsx
│   │
│   ├── docs/
│   │   ├── layout.tsx             # Шапка: Back to App, Design System, Documentation
│   │   ├── page.tsx               # Индекс: ссылка на Recommendations
│   │   └── recommendations/
│   │       └── page.tsx           # Читает recommendations.md, рендер через react-markdown
│   │
│   └── api/
│       └── design-system/
│           └── config/
│               └── route.ts       # GET → config (components, tokens)
│
├── components/                     # Сгенерированные UI-компоненты (Button, Input, …)
├── lib/utils.ts
└── package.json                    # next, react, tailwind, react-markdown, cva, clsx, …
```

**Маршруты:**

| Путь | Описание |
|------|----------|
| `/` | Главная приложения (app nav виден, FAB «Design System») |
| `/design-system` | Обзор DS: статистика, сетка компонентов, Quick Links |
| `/design-system/components/[id]` | Страница компонента: варианты, размеры, код |
| `/design-system/tokens` | Ссылки на colors, typography, spacing |
| `/design-system/tokens/colors` | Цвета light/dark, swatches |
| `/design-system/tokens/typography` | Шрифты, размеры, веса, line-height |
| `/design-system/tokens/spacing` | Шкала отступов и border-radius |
| `/design-system/docs` | Индекс документации (часть Design System) |
| `/design-system/docs/recommendations` | Содержимое `recommendations.md` (UX-рекомендации) |

---

## 2. Что уже реализовано

### CLI и ядро

- **init:** Discovery → config → scaffold (страницы, компоненты, layout, design-system страницы, **docs страницы**, `recommendations.md`).
- **chat:** (Опциональный workflow) Парсинг NL → `ModificationRequest[]` (+ опционально `uxRecommendations`) → применение через менеджеры → регенерация файлов (layout, AppNav, компоненты, страницы) → запись UX-рекомендаций в `recommendations.md` и вывод в консоль. **Альтернатива:** Можно работать напрямую в Cursor без использования chat (см. §7).
- **preview:** Запуск Next.js dev server.
- **export:** Production build, очистка кэша, конфиги для Vercel/Netlify.

### Design System viewer

- Динамический каталог компонентов и токенов (данные из `/api/design-system/config`).
- Sidebar на `/design-system/components/*`: группировка по категориям, toggle, активная ссылка.
- Breadcrumbs, sticky header, скрытие app nav на DS-путях, FAB «Design System» на app-страницах.
- Визуальные страницы токенов: Colors (light/dark), Typography, Spacing (включая radius), без вложенных template literals (`lines.push()`).

### Документация и рекомендации

- При init создаются `app/design-system/docs/layout.tsx`, `app/design-system/docs/page.tsx`, `app/design-system/docs/recommendations/page.tsx` и `recommendations.md`.
- Страница `/design-system/docs/recommendations` отображает содержимое `recommendations.md` (react-markdown).
- В ответе ИИ при chat может быть `uxRecommendations`; они дописываются в `recommendations.md` и дублируются в консоль.

### Навигация и конфиг

- AppNav может перегенерироваться при `coherent chat` (add-page и т.д.) — в nav попадают все страницы из config. **Альтернатива:** При работе в Cursor пользователь редактирует AppNav и config напрямую.
- Единый источник правды: `design-system.config.ts`; изменения применяются либо через chat (автоматически), либо через прямое редактирование в Cursor (вручную).

### Задачи (Project Tasks)

- Один документ задач: **`packages/docs/PROJECT_TASKS.md`** (объединённый список; старые PHASE_1_TASKS* удалены).

---

## 3. Текущие проблемы / задачи

### Не закрыто по видению

- **П.5 Документация:** Автоген по компонентам и токенам реализован: при init создаются `/design-system/docs/components`, `/design-system/docs/tokens`, `/design-system/docs/for-designers`; индекс `/design-system/docs` со ссылками на все разделы. Рекомендации по-прежнему в `/design-system/docs/recommendations`.
- **П.3 Свои компоненты:** Кастомные компоненты (header, footer, специфичные карточки/формы) добавляются через add-component; «глобальные правки» идут через токены и регенерацию — явного «единого места» для кастомных паттернов нет.

### Технические долги

- **Token pages:** Генерация через `lines.push()` — код размазан по методам в `DesignSystemGenerator.ts`; при расширении удобнее вынести шаблоны в отдельные модули.
- **Docs:** Контент `/design-system/docs` (кроме рекомендаций) не генерируется; нет автогена из config для «документации по компонентам/токенам».
- **A2UI (Task 1.17):** Экспорт словаря в формате для агентов не сделан.

### Качество

- Платформа должна стабильно работать (init → chat → preview → export); отдельного QA-флоу и DOGFOODING_TEST не предусмотрено, но ручная проверка сценариев желательна.

### Последние исправления (стабилизация)

- **next build:** В сгенерированном `package.json` скрипт `build` изменён с `next build --turbopack` на `next build` (флаг не поддерживается в production build). Источник: `packages/core/src/generators/ProjectScaffolder.ts`.
- **Standalone-проект:** Конфиг больше не импортирует `@getcoherent/core` — сгенерированный проект собирается без зависимости от монорепозитория. Правки: `packages/cli/src/commands/init.ts` (generateConfigFile), `packages/core/src/managers/DesignSystemManager.ts` (save).
- **Дублирование навигации в Documentation:** Шаблоны docs приведены к одному источнику навигации (только layout Design System). Для **уже созданных** проектов добавлена команда `coherent regenerate-docs` — перезаписывает `app/design-system/docs/*` актуальными шаблонами. Причина дублирования: при «Project already initialized» init не перезаписывал docs, поэтому старые layout (с шапкой) и страницы (с «← Documentation») оставались. См. TROUBLESHOOTING § Дублирование навигации.

---

## 4. Next steps (рекомендуемый порядок)

1. **Надёжность**  
   Протестировать оба workflow:
   - A) init → chat (add page, change tokens) → preview → export
   - B) init → правки в Cursor → hot reload → export
   - C) Гибридный: init → chat → Cursor → export
   
   Исправить найденные баги. Убедиться что hot reload работает корректно.

2. **Документация `/design-system/docs` (автоген)**  
   Генерировать при init (или отдельной командой) контент для разработчиков: UI/компоненты/токены (например, список компонентов с props, токены с значениями) и раздел для дизайнера (как пользоваться методологией, структура проекта).

3. **Пакет B (Design System UX)** — по желанию  
   Мини-превью компонента на карточках DS home, категории как badge, dark mode toggle в DS header.

4. **Task 1.17: A2UI Export**  
   Реализовать `coherent export --format=a2ui` и схему словаря для агентов.

5. **README / Getting started**  
   Установка, init, chat, примеры — в корне и в `packages/cli`.

6. **Дальше**  
   SPA (React Router), темы, плагины, командная работа.

---

## 5. Ключевые файлы для правок

| Задача | Файлы |
|--------|--------|
| Design System страницы/шаблоны | `packages/core/src/generators/DesignSystemGenerator.ts`, `templates/design-system/*` |
| Docs и рекомендации | `packages/core/src/generators/ProjectScaffolder.ts` (getDocs*), `app/design-system/docs/*` в сгенерированном проекте |
| Chat и UX-рекомендации | `packages/cli/src/commands/chat.ts`, `packages/cli/src/agents/modifier.ts` |
| Ответ ИИ (requests + uxRecommendations) | `packages/cli/src/utils/claude.ts`, `packages/cli/src/utils/openai-provider.ts` |
| Конфиг и типы | `packages/core/src/types/design-system.ts` |
| Регенерация layout/AppNav | `packages/cli/src/commands/chat.ts` (regenerateLayout), `packages/core/src/generators/PageGenerator.ts` |
| Регенерация docs (уже созданных проектов) | `coherent regenerate-docs` — перезаписывает `app/design-system/docs/*` без повторного init; см. TROUBLESHOOTING § Дублирование навигации. |

---

## 6. Документы проекта

| Файл | Назначение |
|------|------------|
| `CONTEXT.md` | Этот файл: контекст, структура DS, реализовано, проблемы, next steps |
| `QUICK_REFERENCE.md` | Краткая шпаргалка: два способа работы (Cursor / CLI), best practices, сценарии, troubleshooting |
| `packages/docs/PROJECT.md` | Видение, продукт, состояние, соответствие видению, следующие шаги, риски |
| `packages/docs/PROJECT_TASKS.md` | Единый список задач (Phase 1 и далее), acceptance criteria |
| `packages/docs/DOCS_AUTOGEN_DESIGN.md` | Дизайн автогена /docs: структура, данные, когда генерировать |
| `packages/docs/BMAD_GUIDE.md` | BMAD-методология и роли |
| `packages/cli/src/agents/design-constraints.ts` | Стандарт генерации UI: правила, токены, компоненты, анти-паттерны (single source of truth) |
| `EXAMPLES.md` | Эталонные примеры качества UI (few-shot reference) |
| `INTEGRATION-GUIDE.md` | Staged generation для сложных страниц (Analysis → Architecture → Implementation → Validation) |
| `.cursor/rules/ui-generation.mdc` | Правило Cursor: при генерации UI подключать три документа выше и CRITICAL-требования |

**Генерация UI (обязательно):** При генерации любых UI (страницы, компоненты, лейауты) — в Cursor или через `coherent chat` — нужно:
1. Правила генерации UI определены в **design-constraints.ts** (инжектируются автоматически).
2. Использовать **EXAMPLES.md** как референс качества.
3. Для сложных страниц применять поэтапную генерацию по **INTEGRATION-GUIDE.md**.

**CRITICAL:** Ноль плейсхолдеров (реальный контент); все состояния (loading/empty/error/success); у всех интерактивных элементов — hover и focus.

При продолжении разработки подключать контекст: `@CONTEXT.md`, `@packages/docs/PROJECT.md`, при необходимости `@packages/docs/PROJECT_TASKS.md`, `@QUICK_REFERENCE.md` (для пользовательских сценариев). При генерации UI правила инжектируются автоматически из `design-constraints.ts`; для ручной работы — `@EXAMPLES.md`, `@INTEGRATION-GUIDE.md`.

---

## 7. Workflow после init (два способа работы)

После `coherent init` пользователь может выбрать один из двух подходов (или комбинировать):

### 7.1. Через Cursor/IDE с AI (рекомендуется для детальной работы)

```bash
coherent init
# ↓
# Работа в Cursor: редактирование кода напрямую
# - Создание компонентов
# - Правка стилей
# - Добавление страниц
# ↓
# Next.js hot reload показывает изменения сразу
# ↓
coherent export  # Production build
```

**Плюсы:**
- Полный контроль над кодом
- Видите что меняете
- Hot reload для мгновенной обратной связи
- Используете привычные инструменты

**Когда использовать:** Детальная работа, тонкая настройка, сложная логика

---

### 7.2. Через `coherent chat` CLI (для быстрых генераций)

```bash
coherent init
# ↓
coherent chat "add dashboard page with charts"
# → Парсит команду
# → Генерирует/модифицирует файлы
# → Обновляет config
# → Регенерирует layout/nav если нужно
# ↓
# Опционально: доработка в Cursor
# ↓
coherent export
```

**Плюсы:**
- Быстрая генерация через NL команды
- Автоматическая синхронизация config/nav/layout
- Удобно для повторяющихся задач
- Готов для автоматизации (CI/CD, скрипты)

**Когда использовать:** Быстрые прототипы, генерация структуры, batch операции

---

### 7.3. Гибридный подход (best practice)

```bash
coherent init

# 1. Генерация структуры через CLI
coherent chat "add e-commerce pages: products, cart, checkout"
git commit -m "Generated e-commerce pages"

# 2. Детальная работа в Cursor
# - Доработка компонентов
# - Настройка стилей
# - Добавление логики

# 3. Быстрые добавления снова через CLI
coherent chat "add admin dashboard"
git commit -m "Added admin section"

# 4. Production
coherent export
```

---

### ⚠️ Важно при использовании `coherent chat`

**Команда `chat` может перезаписывать файлы!**

**Best practices:**

1. **Git commit перед каждым chat:**
   ```bash
   git commit -am "Before chat: current state"
   coherent chat "add feature Y"
   git diff  # Проверьте что изменилось
   ```

2. **Используйте chat для генерации, Cursor для доработки:**
   ```bash
   coherent chat "add product card component"
   # → Генерирует базовую структуру
   # В Cursor → дорабатываете детали
   ```

3. **Не редактируйте одни файлы в chat и Cursor одновременно:**
   - Chat модифицирует: `layout.tsx`, `AppNav.tsx`, `design-system.config.ts`
   - Cursor редактирует: компоненты, страницы, стили
   - Если нужно изменить layout → либо chat, либо Cursor, не оба сразу

4. **Проверяйте результат после chat:**
   ```bash
   coherent chat "..."
   npm run dev  # Убедитесь что всё работает
   git diff     # Проверьте изменения
   ```

---

### 🚀 Будущие интеграции CLI

CLI команды (`coherent chat`) подготовлены для:
- **CI/CD pipelines:** Автоматическая генерация компонентов при деплое
- **GitHub Actions:** Генерация документации, обновление DS
- **VS Code extensions:** Интеграция в редактор
- **Team workflows:** Стандартизация генерации компонентов
- **Batch operations:** Массовые изменения через скрипты

**Пример:**
```bash
# В CI/CD скрипте
coherent chat "sync design tokens from Figma"
coherent chat "generate component documentation"
coherent export --format=a2ui
```

Детали принятых архитектурных решений — в `packages/docs/PROJECT.md` §7.1.

---

## 8. Команда BMAD (когда кого подключать)

| Агент | Роль | Когда подключать |
|-------|------|-------------------|
| **@bmad-orchestrator** | Координация workflow, выбор агента, мульти-агентные сценарии | Неясно с чего начать; нужно собрать план или переключить роль. |
| **@pm** (Product Manager) | PRD, стратегия, приоритизация, roadmap | Формулировка видения, фичи, приоритеты продукта. |
| **@po** (Product Owner) | Бэклог, истории, acceptance criteria, спринт | Декомпозиция на истории, критерии приёмки, планирование итераций. |
| **@architect** | Архитектура, технологии, API, инфраструктура | Структура пакетов, контракты CLI/core, интеграции, рефакторинг генераторов. |
| **@dev** (Full Stack Developer) | Код, отладка, рефакторинг, практики разработки | Реализация задач из PROJECT_TASKS, правки в core/cli, баги. |
| **@ux-expert** | UI/UX, wireframes, прототипы, спецификации фронта | Дизайн DS viewer, UX рекомендаций, доступность, паттерны компонентов. |
| **@analyst** | Исследования, брифы, документирование существующего | Discovery-вопросы, документирование текущего состояния, brownfield. |
| **@sm** (Scrum Master) | Истории, эпики, ретро, agile-процессы | Формат историй, ретро, процесс. |
| **@qa** | Тест-архитектура, качество, ревью (advisory) | Критерии качества, риски регрессий, стратегия тестов — по запросу. |
| **@bmad-master** | Универсальный исполнитель задач | Разовые задачи без смены персоны. |

**Как вызвать:** в чате Cursor указать `@bmad-orchestrator` или `@dev`, `@architect` и т.д. Команды агентов начинаются с `*` (например `*help`, `*task`).

---

## 9. План дальнейших действий

### Фаза 1: Стабилизация (сейчас)

| # | Действие | Ответственный | Результат |
|---|----------|----------------|-----------|
| 1 | Прогнать workflow A: `init` → `chat` (add page, change tokens) → `preview` → `export`. Зафиксировать баги. | dev | Список багов/фиксов, при необходимости — правки в chat/regeneration. |
| 2 | Прогнать workflow B: `init` → правки в Cursor (страница, компонент, config) → hot reload → `export`. Убедиться, что навигация и DS viewer обновляются. | dev | Подтверждение что Cursor-only flow работает; при необходимости обновить CONTEXT/PROJECT. |
| 3 | (Опционально) Зафиксировать в PROJECT.md §7.1 итоговый выбор: оставляем chat как есть / переименовываем в ask / только Cursor. | pm / orchestrator | Обновлённый §7.1 и, при смене модели, правки в CONTEXT. |

### Фаза 2: Документация и полировка

| # | Действие | Ответственный | Результат |
|---|----------|----------------|-----------|
| 4 | Спроектировать автоген `/docs`: какие страницы (компоненты, токены, for-designers), откуда данные (config), когда генерировать (init / по команде). | architect + ux-expert | ✅ Дизайн: `packages/docs/DOCS_AUTOGEN_DESIGN.md`. |
| 5 | Реализовать автоген документации (минимум: список компонентов и токенов из config, вывод в `/docs`). | dev | ✅ Реализовано: при init создаются `/design-system/docs/components`, `/design-system/docs/tokens`, `/design-system/docs/for-designers`; данные из config. Документация — часть раздела Design System. |
| 6 | Обновить README и Getting started (корень + `packages/cli`): установка, init, оба workflow (Cursor / chat), примеры. | dev / pm | ✅ README, packages/cli/README.md, docs/getting-started.md обновлены. |

### Фаза 3: По приоритету

| # | Действие | Ответственный | Результат |
|---|----------|----------------|-----------|
| 7 | Task 1.17: реализовать `coherent export --format=a2ui` и схему словаря (см. PROJECT_TASKS.md). | dev + architect | Команда и формат A2UI. |
| 8 | (По желанию) Пакет B: мини-превью на карточках DS, badges категорий, dark mode в DS header. | dev + ux-expert | Улучшенный UX DS viewer. |
| 9 | Кастомные компоненты: явно описать в CONTEXT/PROJECT workflow (Cursor создаёт файл + запись в config); при необходимости добавить `coherent add-component` (только создание). | po + dev | Документированный flow, опционально — CLI helper. |

Сводка приоритетов: **1 → 2 → 3** (стабилизация), затем **4 → 5 → 6** (документация), далее **7, 8, 9** по возможностям. Для выполнения шагов подключать соответствующих агентов (например `*agent dev` для кода, `*agent architect` для дизайна автогена).

---

## 10. Чек-лист: workflow A и B (ручная проверка)

### Workflow A: init → chat → preview → export

- [ ] **A1.** В пустой папке: `coherent init`. Убедиться: созданы `design-system.config.ts`, `app/`, `components/`, docs, recommendations.md.
- [ ] **A2.** Установить API key (Anthropic или OpenAI) в `.env` в корне проекта.
- [ ] **A3.** `coherent chat "add pricing page with 3 tiers"`. Проверить: появилась страница (например `app/pricing/page.tsx`), запись в `design-system.config.ts` в `pages[]`, в AppNav есть ссылка на Pricing.
- [ ] **A4.** `coherent chat "change primary color to #667EEA"`. Проверить: в config обновились `tokens.colors`, изменения видны на `/design-system/tokens/colors`.
- [ ] **A5.** `npm run dev` (или `coherent preview`). Открыть `/`, `/pricing`, `/design-system`, `/design-system/docs/recommendations`. Всё открывается без ошибок.
- [ ] **A6.** `coherent export`. Успешный production build, созданы vercel.json / netlify.toml (или аналог).

### Workflow B: init → Cursor → hot reload → export

- [ ] **B1.** `coherent init` в новой папке, `npm install`, `npm run dev`.
- [ ] **B2.** В Cursor: добавить страницу вручную (например `app/dashboard/page.tsx`), добавить в `design-system.config.ts` в `pages[]` запись `{ path: '/dashboard', name: 'Dashboard' }`. Сохранить.
- [ ] **B3.** Hot reload: в браузере в навигации появилась ссылка Dashboard, `/dashboard` открывается.
- [ ] **B4.** В Cursor: создать компонент в `components/custom/` (например `StatsCard.tsx`), добавить его в config в `components` (base или custom). Сохранить.
- [ ] **B5.** Открыть `/design-system`: новый компонент отображается в каталоге (если структура config поддерживает).
- [ ] **B6.** `coherent export`. Production build успешен.

### Общее

- [ ] После любых правок config не должно быть `import ... from '@getcoherent/core'` в сгенерированном проекте (standalone).
- [ ] Скрипт `build` в package.json сгенерированного проекта: `next build` (без `--turbopack`).

---

## 11. После изменений в packages/*/src/

После любых изменений в `packages/core/src/` или `packages/cli/src/` обязательно пересобрать пакет — иначе `coherent init` и `coherent chat` будут использовать старый код из `dist/`.

1. `cd packages/core && pnpm run build`
2. `cd packages/cli && pnpm run build`
3. Только после этого тестировать `coherent init` / `coherent chat`.

Без пересборки в `dist/` остаётся устаревший код.
