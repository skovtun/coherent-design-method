# Дизайн автогенерации раздела документации (`/design-system/docs`)

**Цель:** заполнить раздел Documentation контентом для разработчиков (компоненты, токены) и дизайнеров (методология, структура проекта), без ручного копирования из config.

**Статус:** реализовано (шаг 5). При `coherent init` создаются маршруты и страницы; контент components/tokens читается из config при рендере.

---

## 1. Текущее состояние

- **При init** создаются:
  - `app/design-system/docs/layout.tsx` — минимальный layout (только обёртка, без своей шапки; навигация — из родительского design-system layout)
  - `app/design-system/docs/page.tsx` — индекс без дублирования заголовка «Documentation»: описание и карточки Components, Tokens, For designers, UX/UI Recommendations
  - `app/design-system/docs/recommendations/page.tsx` — рендер `recommendations.md` (react-markdown)
- **Контент по компонентам и токенам** не генерируется; отдельного раздела для дизайнеров нет.

---

## 2. Целевая структура (часть Design System)

```
/design-system/docs
├── (index)              # Обзор: ссылки на Components, Tokens, For designers, Recommendations
├── components/          # Список компонентов из config
│   └── page.tsx         # Либо одна страница со списком, либо [id]/page.tsx на компонент
├── tokens/              # Справочник токенов
│   └── page.tsx         # Colors, typography, spacing (значения из config)
├── for-designers/       # Методология и структура (статический контент)
│   └── page.tsx         # Как пользоваться Coherent, структура проекта, workflow
└── recommendations/    # Уже есть
```

---

## 3. Источник данных

- **Единый источник:** `design-system.config.ts` (при сборке/запуске доступен через импорт в app или через существующий API).
- **API:** уже есть `GET /api/design-system/config` — возвращает `config` (components, tokens, pages). Страницы `/docs` могут использовать тот же API (fetch на клиенте или вызов на сервере), чтобы не дублировать логику.

**Рекомендация:** страницы `/docs/components` и `/docs/tokens` делаем **динамическими**: читают данные из API (или напрямую из config на сервере) и рендерят список/таблицы. Отдельная генерация .md файлов не обязательна для первого этапа.

---

## 4. Содержимое страниц

### 4.1. Обновлённый индекс `/docs` (app/docs/page.tsx)

- Заголовок: Documentation.
- Карточки/ссылки:
  1. **Components** → `/docs/components` — перечень компонентов из config (id, category, опционально description).
  2. **Tokens** → `/docs/tokens` — цвета, типографика, отступы (значения из config).
  3. **For designers** → `/docs/for-designers` — как пользоваться методологией, структура проекта, Cursor vs CLI.
  4. **UX/UI Recommendations** → `/docs/recommendations` (как сейчас).

### 4.2. `/docs/components`

- **Данные:** `config.components` (массив или объект с группами base/custom — в зависимости от текущей схемы).
- **Отображение:** таблица или список: имя, категория, описание (если есть). Опционально ссылка на страницу компонента в Design System viewer: `/design-system/components/[id]`.
- **Реализация:** одна страница (Server Component или Client с fetch), читает из API или из импорта config.

### 4.3. `/docs/tokens`

- **Данные:** `config.tokens` (colors, typography, spacing).
- **Отображение:** секции Colors, Typography, Spacing с значениями (например, таблица или карточки). Можно переиспользовать визуальный стиль страниц `/design-system/tokens/*`, но в упрощённом «документационном» виде.
- **Реализация:** одна страница, данные из API или config.

### 4.4. `/docs/for-designers`

- **Контент:** статический (или один markdown-файл в проекте, рендер как recommendations).
- **Темы:** назначение Coherent, два способа работы (Cursor / CLI), структура папок, где что править (config, компоненты, страницы), ссылка на QUICK_REFERENCE и CONTEXT при разработке в репо.
- **Реализация:** либо захардкоженный JSX, либо `for-designers.md` в корне проекта + страница по аналогии с recommendations.

---

## 5. Когда генерировать / обновлять

| Подход | Когда | Плюсы | Минусы |
|--------|--------|--------|--------|
| **Только при init** | Создаём страницы и маршруты при `coherent init`; контент всегда динамический (читают config/API). | Один раз настроили — контент актуален при любых изменениях config. | Нужно реализовать страницы components/tokens/for-designers. |
| **При init + при chat** | Init создаёт структуру; при изменении config (chat) регенерировать статические .md. | Можно отдавать статический markdown. | Сложнее: регенерация при каждом chat, риск рассинхрона. |
| **По команде** | `coherent docs` регенерирует только статические части (если появятся .md). | Явное действие пользователя. | Нужно помнить запускать команду. |

**Рекомендация для первого этапа:** только при init. Все страницы `/docs` (кроме for-designers и recommendations) строятся на данных из config через API или прямой импорт; при изменении config через Cursor или chat контент обновляется автоматически без регенерации файлов.

---

## 6. Место в коде

- **ProjectScaffolder** (`packages/core/src/generators/ProjectScaffolder.ts`):
  - Расширить `generateDocsPages()`: создавать `app/docs/components/page.tsx`, `app/docs/tokens/page.tsx`, `app/docs/for-designers/page.tsx`.
  - Обновить `getDocsIndexContent()`: добавить ссылки на Components, Tokens, For designers.
- **Шаблоны:** по аналогии с `getDocsLayoutContent()` и `getDocsRecommendationsPageContent()` — методы типа `getDocsComponentsPageContent()`, `getDocsTokensPageContent()`, `getDocsForDesignersPageContent()` (контент может быть шаблоном с подстановкой или статическим текстом).
- **for-designers:** контент можно взять из QUICK_REFERENCE.md и CONTEXT.md (кратко) или задать отдельным markdown в репозитории шаблонов, который копируется в проект при init.

---

## 7. Критерии готовности (минимум для шага 5)

- [x] При `coherent init` создаются маршруты: `/design-system/docs`, `/design-system/docs/components`, `/design-system/docs/tokens`, `/design-system/docs/for-designers`, `/design-system/docs/recommendations`. Документация — часть раздела Design System (без навигации приложения).
- [x] Индекс `/design-system/docs` содержит ссылки на все перечисленные подразделы.
- [x] `/design-system/docs/components` отображает список компонентов из config (импорт config в Server Component).
- [x] `/design-system/docs/tokens` отображает цвета, типографику, отступы, radius из config.
- [x] `/design-system/docs/for-designers` содержит краткий статический контент (методология, структура, workflow).
- [x] После изменений в `design-system.config.ts` компоненты и токены в `/design-system/docs` отображают актуальные данные (страницы читают config при каждом запросе). Дополнение дизайн-системы (новые компоненты, страницы, токены) через `coherent chat` или правки в Cursor сразу отражается в документации и в Design System viewer при обновлении страницы; перезапуск `regenerate-docs` не нужен для данных.

---

## 8. Ссылки

- CONTEXT.md §4 (Next steps), §9 (План), §10 (Чек-лист).
- PROJECT.md §4 (Документация `/docs`).
- Реализация docs: `packages/core/src/generators/ProjectScaffolder.ts` — `generateDocsPages()`, `getDocs*Content()`.
