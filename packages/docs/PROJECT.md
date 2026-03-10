# Coherent Design Method — глобальная документация проекта

**Последнее обновление:** 2025-02-02

---

## 0. Видение продукта (источник правды)

**Идея:** Пользователь работает в Cursor и просит сгенерировать интерфейс. Вместе с приложением генерируются **документация (с рекомендациями)** и **сторибук**, доступные по ссылкам (`/design-system`, `/design-system/docs`). Документация входит в раздел Design System (без навигации приложения). Пользователь смотрит на всё это; если хочет изменить/дополнить — возвращается в Cursor и пишет запрос; ИИ вносит изменения везде, где нужно.

**Желаемый итог:**

1. **Многостраничные интерфейсы с переиспользуемыми компонентами** — да.
2. **Без ограничений по компонентам** — все доступны и работают корректно.
3. **Свои компоненты** (уникальный header, footer, карточка, форма) — переиспользование на страницах, глобальные правки, изменение стилей.
4. **Сторибук** — все компоненты, стили, состояния + глобальные стили (цвета, шрифты, отступы); визуально видны код и стейты. **Правки только через чат в редакторе (Cursor/VSCode и т.п.)** → конфиг → регенерация; редактирование прямо в `/design-system` с записью в конфиг не требуется.
5. **Проектная документация** — формируется и доступна: автоген по UI/компонентам/токенам для разработчиков + рекомендации по улучшению UX для дизайнера.
6. **Рекомендации по оптимизации UX/UI** — отдельный документ/страница (например `/docs/recommendations`). Когда пользователь генерирует интерфейс, ИИ при возможности подсказывает, что можно улучшить/оптимизировать.
7. **Breakpoints** — дизайн одинаково хорошо на всех размерах экранов.

**Терминология:** В коде «сторибук» реализован как **Design System viewer** на `/design-system` (только просмотр). Документация — маршрут `/design-system/docs` (часть Design System; автоген + рекомендации).

Соответствие этого видения текущей реализации см. в разделе **2. Текущее состояние** и в таблице ниже (раздел 2.1).

---

## 1. Что это за продукт

**Coherent** — AI-powered CLI для генерации и изменения фронтенд-интерфейсов на основе единого design system config.

- **init** — создаёт Next.js проект с design system из ответов discovery (цвета, шрифты, стиль). После init основная работа идёт в Cursor: пользователь меняет код и конфиг через чат с ИИ; изменения видны по hot reload.
- **chat** — опционально: парсит NL, меняет конфиг и регенерирует файлы. Рекомендуемая модель: либо не полагаться на chat после init (вся правка в Cursor), либо в будущем переделать в **ask** (только советы и запись в `recommendations.md`, без модификации кода).
- **preview** — запускает dev server.
- **export** — собирает production build и опции для деплоя; планируется `--format=a2ui` для экспорта словаря компонентов.

Конфиг живёт в `design-system.config.ts` (страницы, компоненты, токены). Менеджеры и генераторы работают с этим конфигом. **Важно:** после init CLI не должен затирать пользовательские правки; команды по возможности только создают новые файлы или явно документируют поведение при регенерации.

---

## 2. Текущее состояние

### Phase 1 (MVP) — по сути завершён

| Блок | Статус | Заметки |
|------|--------|--------|
| 1.1–1.2 Monorepo, CLI | ✅ | pnpm, Commander, init/chat/preview/export |
| 1.3–1.5 Core types, Discovery, Claude API | ✅ | Zod, DiscoveryResult, config из discovery |
| 1.6 Config Generator | ✅ | design-system.config.ts из discovery |
| 1.7–1.9 Managers | ✅ | DesignSystemManager, ComponentManager, PageManager, sync nav |
| 1.10–1.12 Generators, Scaffolding | ✅ | ComponentGenerator, PageGenerator, ProjectScaffolder, Tailwind из токенов |
| 1.13–1.14 Modifier Agent, Chat | ✅ | NL → ModificationRequest, применение + регенерация файлов |
| 1.15–1.16 Preview, Export | ✅ | dev server, production build, vercel/netlify |

### Дополнительно сделано (вне нумерации Phase 1)

- **Design System viewer (dev-only):**
  - Динамические страницы `/design-system`, `/design-system/components/[id]`, API `/api/design-system/config`.
  - Sidebar на `/design-system/components/*` с группировкой по категориям, toggle, sticky header.
  - Breadcrumbs, скрытие app nav на DS-роутах, FAB «Design System» на app-страницах.
- **Token pages:** Colors, Typography, Spacing — визуальные страницы с данными из API (`lines.push()` без проблем с template literals).
- **AppNav:** регенерация при chat (add-page и др.), чтобы в nav попадали все страницы (в т.ч. Contact).
- **UX DS:** Overview в header, активное состояние nav, кликабельные stat-карточки и Quick Links (Typography, Spacing), hover + стрелка на карточках компонентов.

### 2.1. Соответствие видению (п. 1–7)

| # | Пункт видения | Статус | Комментарий |
|---|----------------|--------|--------------|
| 1 | Многостраничные интерфейсы, переиспользуемые компоненты | ✅ | Страницы и секции из config, компоненты из registry, nav sync. |
| 2 | Нет ограничений по компонентам | ✅ | shadcn auto-install, pre-flight, расширенный набор компонентов. |
| 3 | Свои компоненты (header, footer, карточка, форма), глобальные правки | ⚠️ Частично | add-component (shadcn + custom), использование на страницах есть; глобальные правки через токены/конфиг. «Единая точка правки» — конфиг + регенерация. |
| 4 | Сторибук: компоненты, стили, состояния; правки только через чат в редакторе | ✅ | Design System viewer на `/design-system`: каталог, токены, варианты/размеры. Редактирование в браузере не требуется — только Cursor (chat) → конфиг → регенерация. |
| 5 | Проектная документация (автоген UI/компоненты/токены + рекомендации для дизайнера) | ✅ | При init создаются `/design-system/docs` (индекс), components, tokens, for-designers, recommendations; документация — часть Design System; компоненты и токены читаются из config. |
| 6 | Рекомендации по UX/UI — отдельный документ/страница | ✅ | Страница `/design-system/docs/recommendations` отображает `recommendations.md`; при chat ИИ может дописывать туда блоки и выводить в консоль. |
| 7 | Breakpoints, адаптивность | ✅ | Tailwind, responsive-классы в генераторах; breakpoints из токенов/конфига. |

**Качество:** Платформа должна работать как часы, без косяков. QA-флоу и отдельный план тестирования не входят в приоритет.

### Ещё не сделано по Phase 1

- **Task 1.17: Export A2UI Vocabulary** — экспорт словаря компонентов в формате, удобном для агентов (A2UI). Статус: Pending.

---

## 3. Структура репозитория

```
coherent-design-method/
├── packages/
│   ├── cli/          # coherent init | chat | preview | export
│   ├── core/         # types, managers, generators, templates
│   └── docs/         # PROJECT_TASKS.md, PROJECT.md, BMAD_GUIDE.md
└── ...
```

Ключевые места:

- Конфиг и типы: `packages/core/src/types/design-system.ts`
- Chat flow и регенерация: `packages/cli/src/commands/chat.ts` (regenerateLayout + AppNav)
- Генерация layout/nav: `packages/core/src/generators/PageGenerator.ts` (generateLayout, generateAppNav)
- Design System страницы: `packages/core/src/generators/DesignSystemGenerator.ts`, `templates/design-system/`

---

## 4. Дальнейшие шаги (рекомендуемый порядок)

### Ближайшие (стабилизация и полировка)

1. **Надёжность и модель работы**  
   Зафиксировать модель после init (см. п. 7.1): one-time scaffolder или helper-команды; судьбу `coherent chat` (удалить / переделать в ask). Платформа должна работать без косяков: ручная проверка init → (Cursor или chat) → preview → export и исправление багов.

2. **Документация `/design-system/docs`** ✅  
   - Реализовано: при init создаются `app/design-system/docs/` (индекс, components, tokens, for-designers, recommendations). Документация — часть раздела Design System (без навигации приложения). Компоненты и токены отображаются из config; for-designers — статический контент.  
   - **Дизайн и реализация:** `packages/docs/DOCS_AUTOGEN_DESIGN.md`.

3. **Рекомендации по UX/UI — `/design-system/docs/recommendations`** ✅  
   - Реализовано: при init создаются `app/design-system/docs/` (layout, index, страница рекомендаций) и `recommendations.md` в корне. Страница `/design-system/docs/recommendations` отображает содержимое `recommendations.md`. При chat, если ИИ возвращает `uxRecommendations`, они дописываются в файл и выводятся в консоль; просмотр — по ссылке `/design-system/docs/recommendations`.

4. **Пакет B (Design System UX)** — по желанию  
   Мини-превью компонента на карточках DS home, категории как badge, dark mode toggle в DS header.

### Средний приоритет

5. **Task 1.17: A2UI Export**  
   `coherent export --format=a2ui` — задел под агентов.

6. **README / Getting started**  
   Установка, init, chat, примеры — в корне и в `packages/cli`.

### Дальше (Phase 2+)

- SPA (React Router), темы, плагины, командная работа.

---

## 5. Как продолжать разработку здесь (Cursor)

- В начале диалога подключать контекст: `@packages/docs/PROJECT.md`, при необходимости `@packages/docs/PROJECT_TASKS.md`.
- Крупные задачи фиксировать в PROJECT.md (раздел «Дальнейшие шаги») и в PROJECT_TASKS.md.
- После значимых изменений обновлять «Последнее обновление» и соответствующие статусы в PROJECT.md.

---

## 6. Ссылки на документы

| Документ | Назначение |
|----------|------------|
| `packages/docs/PROJECT.md` | Глобальная документация (этот файл): продукт, видение, состояние, решения, следующие шаги |
| `packages/docs/PROJECT_TASKS.md` | Единый список задач проекта (Phase 1 и далее), acceptance criteria, примеры кода |
| `packages/docs/DOCS_AUTOGEN_DESIGN.md` | Дизайн автогенерации раздела /docs (компоненты, токены, for-designers) |
| `CONTEXT.md` | Контекст для Cursor: структура DS, что реализовано, ключевые файлы, next steps |
| `packages/docs/BMAD_GUIDE.md` | BMAD-методология и роли |
| `UI-SYSTEM-PROMPT.md` | Стандарт генерации UI: правила, токены, компоненты, анти-паттерны |
| `EXAMPLES.md` | Эталонные примеры качества UI (few-shot) |
| `INTEGRATION-GUIDE.md` | Staged generation для сложных страниц |

---

## 7. Принятые решения по видению

- **Генерация UI:** При генерации любых UI (страницы, компоненты, лейауты) — в Cursor или через chat — обязательно: следовать **UI-SYSTEM-PROMPT.md**, использовать **EXAMPLES.md** как референс, для сложных страниц применять поэтапную генерацию по **INTEGRATION-GUIDE.md**. CRITICAL: нулевые плейсхолдеры; все состояния (loading/empty/error/success); у интерактивных элементов — hover и focus. Правило Cursor: `.cursor/rules/ui-generation.mdc`.
- **Правки интерфейса:** Только через чат в редакторе (Cursor, VSCode и т.п.) → конфиг → регенерация. Редактирование прямо в `/design-system` с записью в конфиг не требуется.
- **Документация `/design-system/docs`:** Автоген по UI/компонентам/токенам для разработчиков + рекомендации по улучшению UX для дизайнера; документация входит в раздел Design System.
- **Рекомендации по UX/UI:** Страница `/design-system/docs/recommendations`. При генерации интерфейса ИИ, если видит возможности улучшения, подсказывает дизайнеру, что можно оптимизировать.
- **QA и план тестирования:** Не в приоритете; платформа должна работать стабильно без отдельного QA-флоу и без DOGFOODING_TEST.md.

### 7.1. Рекомендуемые архитектурные решения (модель работы)

На основе проработки рисков и конфликта «CLI vs Cursor» приняты следующие рекомендации (при финальном выборе — зафиксировать в этом разделе):

| Вопрос | Рекомендация | Альтернативы |
|--------|--------------|--------------|
| **Модель после init** | **One-time scaffolder (A):** после `coherent init` вся работа в Cursor; CLI для изменений не обязателен. | B: добавить helper-команды `add-component`, `add-page` (только создание, без перезаписи). |
| **Команда `coherent chat`** | Удалить или переделать в **ask**: только советы + запись в `recommendations.md`, без модификации файлов. Текущая реализация chat конфликтует с правками в Cursor. | Оставить как есть только при явном документировании workflow и merge-стратегии. |
| **Кастомные компоненты** | Создаются в Cursor: пользователь просит ИИ создать компонент и добавить в `design-system.config.ts`; единый контекст — CONTEXT.md / PROJECT.md. | CLI `coherent add-component` — опционально для шаблона. |
| **Генерация документации** | При init — базовая структура `/design-system/docs`. При изменении config — страницы читают config при запросе. | Только при init; контент динамический из config. |
| **Шаблоны страниц (token pages)** | Оставить генерацию через `lines.push()` в DesignSystemGenerator; рефакторить на .template только при росте числа страниц. | Вынести в отдельные .template файлы при необходимости. |

**Workflow по умолчанию:** `coherent init` → работа в Cursor (`@CONTEXT.md`, `@PROJECT.md`) → hot reload → `coherent export`.

---

## 8. Технические риски

- **Генерация `/design-system/docs` и рекомендаций:** Страницы создаются при init; контент компонентов/токенов — из config при запросе. Контекст для UX-рекомендаций ИИ — текущий конфиг (скриншоты не в первой версии).

---

## 9. Внешние skills (UI/UX)

Рассматривались ссылки на skills (skills.sh, skillsmp.com). В репозитории уже есть свои skills в `packages/cli/src/skills/`: `ui-ux-principles.md`, `accessibility.md`, `responsive-design.md`, `design-tokens.md`, `component-patterns.md` — они подмешиваются в промпт modifier. Внешние skills можно: (1) просмотреть вручную и выборочно перенести полезное в эти файлы; (2) подключать как дополнительный контекст при запросах, если формат совместим. Рекомендация: держать один набор skills в репо и периодически обогащать его из внешних источников, а не жёстко зависеть от внешних URL.
