# shadcn/ui Blocks: Design Patterns Analysis

## Для улучшения качества генерации в Coherent Design Method

**Status:** Complete (Story 1.1)  
**Author:** Product Owner  
**Date:** 2026-01-26  
**Used by:** Story 1.2 (Template System), Story 1.3 (AI Prompt Overhaul), Story 1.6 (Validator)

---

## 1. Почему shadcn/ui blocks выглядят хорошо

Проанализировав код dashboard-01, sidebar-*, login-*, signup-* блоков, я выделил конкретные паттерны, которые делают их профессиональными. Это не магия — это набор жёстких правил, которые можно закодировать.

---

## 2. Паттерны по категориям

### 2.1 Spacing System (Отступы)

**Правило: минимум значений, максимум последовательности.**

shadcn blocks используют очень ограниченный набор отступов:

| Контекст | Значение | Tailwind |
|----------|----------|----------|
| Gap между секциями страницы | 24px (md: 32px) | `gap-6 md:gap-8` |
| Gap внутри секции | 16px | `gap-4` |
| Gap между элементами в карточке | 8px | `gap-2` |
| Padding страницы (content area) | 16px (lg: 24px) | `p-4 lg:p-6` |
| Padding карточки | 24px (через CardHeader/CardContent) | Встроен в компонент |
| Padding мелких элементов | 8-12px | `p-2` или `px-3` |

**Ключевой инсайт:** shadcn НИКОГДА не использует произвольные значения для отступов. Только кратные 4px: 4, 8, 12, 16, 24, 32, 48. И на одной странице обычно используется 3-4 значения, не больше.

**Правило для Coherent:**
```
PAGE_PADDING = "px-4 lg:px-6"
SECTION_GAP = "gap-4 md:gap-6"
CARD_INTERNAL_GAP = "gap-2"
BETWEEN_SECTIONS = "gap-6 md:gap-8"
```

---

### 2.2 Typography Hierarchy (Типографика)

**Правило: максимум 4 уровня на странице.**

| Уровень | Использование | Tailwind |
|---------|--------------|----------|
| H1 (страница) | Заголовок страницы | `text-2xl font-bold tracking-tight` или `text-3xl` |
| H2 (секция/карточка) | Заголовок карточки/секции | `text-sm font-medium` (!) |
| Body | Основной текст | `text-sm` (14px — базовый размер!) |
| Muted | Подписи, метаданные | `text-sm text-muted-foreground` или `text-xs text-muted-foreground` |

**Ключевые инсайты:**

1. **Базовый размер текста — 14px (`text-sm`), НЕ 16px.** Это главное отличие shadcn от "обычного" веба. Вся типографика строится от `text-sm`.

2. **Заголовки карточек — `text-sm font-medium`, не `text-lg` или `text-xl`.** Иерархия создаётся через `font-medium` / `font-semibold` / `font-bold`, а не через размер.

3. **Большие числа (KPI, метрики) — единственное место, где используется крупный шрифт:** `text-2xl font-bold` или `text-3xl font-bold`.

4. **Muted текст используется повсеместно** для создания визуальной иерархии: `text-muted-foreground`.

**Правило для Coherent:**
```
CARD_TITLE = "text-sm font-medium"
CARD_DESCRIPTION = "text-sm text-muted-foreground"  (или text-xs)
METRIC_VALUE = "text-2xl font-bold"
METRIC_LABEL = "text-xs text-muted-foreground"
PAGE_TITLE = "text-2xl font-bold tracking-tight"
BODY = "text-sm"
```

---

### 2.3 Layout Patterns (Композиция)

**Правило: flexbox по умолчанию, grid для карточек.**

**Паттерн страницы с sidebar:**
```tsx
<SidebarProvider>
  <AppSidebar />
  <SidebarInset>
    <header className="flex h-16 shrink-0 items-center gap-2 border-b">
      {/* Header content */}
    </header>
    <div className="flex flex-1 flex-col gap-4 p-4">
      {/* Page content */}
    </div>
  </SidebarInset>
</SidebarProvider>
```

**Паттерн grid карточек (stats/KPI):**
```tsx
<div className="grid auto-rows-min gap-4 md:grid-cols-3">
  <Card />
  <Card />
  <Card />
</div>
```

**Паттерн центрированной страницы (login/signup):**
```tsx
<div className="flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
  <div className="w-full max-w-sm">
    {/* Form content */}
  </div>
</div>
```

**Паттерн two-column (login + image):**
```tsx
<div className="grid min-h-svh lg:grid-cols-2">
  <div className="flex flex-col gap-4 p-6 md:p-10">
    {/* Form side */}
  </div>
  <div className="bg-muted relative hidden lg:block">
    {/* Image side */}
  </div>
</div>
```

**Ключевые инсайты:**
- `min-h-svh` вместо `min-h-screen` — для мобильных
- `flex-1` для заполнения доступного пространства
- `shrink-0` для header, чтобы не сжимался
- `hidden lg:block` для адаптивности — не media queries, а просто скрытие
- Grid columns всегда `md:grid-cols-2`, `md:grid-cols-3`, `lg:grid-cols-4` — респонсивно

---

### 2.4 Color Usage (Цвета)

**Правило: только semantic tokens, никогда raw colors.**

shadcn blocks используют ТОЛЬКО эти цветовые классы:

| Токен | Использование |
|-------|--------------|
| `bg-background` | Основной фон страницы |
| `bg-muted` | Фон для secondary areas (sidebar, alt sections) |
| `bg-muted/50` | Placeholder / skeleton areas |
| `bg-card` | Фон карточек |
| `bg-primary` | Акцентные элементы (кнопки, badges) |
| `text-foreground` | Основной текст (обычно не указывается — default) |
| `text-muted-foreground` | Вторичный текст, подписи, иконки |
| `text-primary-foreground` | Текст на primary фоне |
| `border` | Границы (без указания цвета — берётся из темы) |

**Ключевые инсайты:**

1. **НИКАКИХ `text-gray-500`, `bg-blue-600` и т.д.** Всё через semantic tokens.

2. **`bg-muted/50`** — любимый приём для placeholder-областей и скелетонов.

3. **Иконки всегда `text-muted-foreground`** и маленькие (`size-4`, т.е. 16px).

4. **Borders — `border` без цвета** (цвет берётся из CSS variable). Часто `border-b` только снизу для headers.

**Правило для Coherent:**
```
НИКОГДА не использовать raw Tailwind colors (gray-500, blue-600)
ВСЕГДА semantic: bg-background, bg-muted, bg-card, bg-primary
ВСЕГДА для вторичного текста: text-muted-foreground
ИКОНКИ: text-muted-foreground + size-4
```

---

### 2.5 Component Composition (Компонентная структура)

**Правило: маленькие компоненты, плоская структура.**

**Паттерн stat card (dashboard KPI):**
```tsx
<Card>
  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
    <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
    <DollarSign className="size-4 text-muted-foreground" />
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold">$45,231.89</div>
    <p className="text-xs text-muted-foreground">+20.1% from last month</p>
  </CardContent>
</Card>
```

**Ключевые инсайты:**

1. **CardHeader всегда содержит `flex flex-row items-center justify-between`** — заголовок слева, иконка/action справа.

2. **`space-y-0 pb-2`** — убирает дефолтный vertical spacing и ставит маленький bottom padding. Это создаёт плотный, профессиональный вид.

3. **Метрика: `text-2xl font-bold` + подпись `text-xs text-muted-foreground`** — резкий контраст размеров создаёт иерархию.

4. **Нет вложенности карточка-в-карточке.** Максимум 2 уровня: Card > content.

---

### 2.6 Header Pattern (Шапка)

**Правило: фиксированная высота, border снизу, breadcrumbs.**

```tsx
<header className="flex h-16 shrink-0 items-center gap-2 border-b">
  <div className="flex items-center gap-2 px-4">
    <SidebarTrigger className="-ml-1" />
    <Separator orientation="vertical" className="mr-2 h-4" />
    <Breadcrumb>...</Breadcrumb>
  </div>
</header>
```

**Инсайты:**
- Высота header: всегда `h-16` (64px) или `h-12` (48px)
- Разделитель между trigger и breadcrumbs: `<Separator orientation="vertical" className="h-4" />`
- `-ml-1` на первом элементе для оптического выравнивания

---

### 2.7 Responsive Patterns (Адаптивность)

**Правило: mobile-first, 2-3 breakpoint'а максимум.**

| Breakpoint | Использование |
|------------|--------------|
| Default (mobile) | Одна колонка, `p-4`, `gap-4` |
| `md:` (768px) | 2-3 колонки, `md:p-6`, `md:gap-6` |
| `lg:` (1024px) | Sidebar visible, `lg:px-6`, `lg:grid-cols-4` |

**Инсайт:** shadcn почти никогда не использует `sm:` и `xl:`. Только `md:` и `lg:`.

---

### 2.8 Empty States & Placeholders

**Правило: `bg-muted/50 rounded-xl` с `aspect-video` или `min-h-[100vh]`.**

```tsx
<div className="bg-muted/50 aspect-video rounded-xl" />
<div className="bg-muted/50 min-h-[100vh] flex-1 rounded-xl md:min-h-min" />
```

Никаких "Lorem ipsum". Плейсхолдеры — это чистые формы.

---

## 3. Антипаттерны (Чего shadcn НИКОГДА не делает)

1. **Никогда не использует raw colors** (`text-gray-500`, `bg-blue-100`)
2. **Никогда не ставит большие заголовки в карточках** (max `text-sm font-medium`)
3. **Никогда не использует `text-base` (16px) как базовый** — всё на `text-sm` (14px)
4. **Никогда не вкладывает карточки в карточки**
5. **Никогда не использует `shadow-lg/xl` на карточках** — максимум `shadow-sm` или просто `border`
6. **Никогда не использует круглые аватарки большого размера** (max `size-8`)
7. **Никогда не использует `space-x-*` на верхнем уровне** — предпочитает `gap-*`
8. **Никогда не ставит padding больше 24px** на содержимое (максимум `p-6`)
9. **Никогда не использует `container mx-auto`** внутри app layout — только для landing pages
10. **Никогда не использует `font-sans` или другие font-family классы** — шрифт задаётся глобально

---

## 4. Правила генерации для Coherent

На основе анализа, вот конкретные constraints, которые нужно закодировать в генератор:

### 4.1 Обязательные правила (MUST)

```typescript
const GENERATION_RULES = {
  // Typography
  baseFontSize: "text-sm",           // 14px, НЕ text-base
  cardTitle: "text-sm font-medium",  // НЕ text-lg
  cardDescription: "text-sm text-muted-foreground",
  pageTitle: "text-2xl font-bold tracking-tight",
  metricValue: "text-2xl font-bold",
  metricSubtext: "text-xs text-muted-foreground",
  
  // Spacing
  pageContentPadding: "p-4 lg:p-6",
  sectionGap: "gap-4 md:gap-6",
  cardInternalGap: "gap-2",
  headerHeight: "h-16",             // или h-12 для compact
  
  // Colors — ONLY semantic tokens
  allowedBgColors: [
    "bg-background", "bg-muted", "bg-muted/50", 
    "bg-card", "bg-primary", "bg-secondary",
    "bg-destructive"
  ],
  allowedTextColors: [
    "text-foreground", "text-muted-foreground",
    "text-primary-foreground", "text-secondary-foreground",
    "text-destructive"
  ],
  // BANNED: bg-gray-*, bg-blue-*, text-gray-*, etc.
  
  // Layout
  gridColumns: "md:grid-cols-2 | md:grid-cols-3 | lg:grid-cols-4",
  fullHeightPage: "min-h-svh",
  centeredContent: "flex items-center justify-center",
  
  // Components
  iconSize: "size-4",
  iconColor: "text-muted-foreground",
  borderStyle: "border",            // без указания цвета
  roundedStyle: "rounded-xl",       // для контейнеров
  cardShadow: "shadow-sm",          // или никакой тени, только border
  
  // Responsive — ONLY these breakpoints
  breakpoints: ["md:", "lg:"],       // НИКОГДА sm: или xl:
}
```

### 4.2 Шаблоны страниц

```typescript
const PAGE_TEMPLATES = {
  // Dashboard с sidebar
  dashboardWithSidebar: `
    SidebarProvider > AppSidebar + SidebarInset > [
      header (h-16, border-b, breadcrumbs),
      content (flex-1 flex-col gap-4 p-4)
    ]
  `,
  
  // Centered form (login, signup)
  centeredForm: `
    div (min-h-svh flex items-center justify-center p-6 md:p-10) > [
      div (w-full max-w-sm) > Form
    ]
  `,
  
  // Two-column (form + image)
  twoColumnForm: `
    div (grid min-h-svh lg:grid-cols-2) > [
      div (flex flex-col gap-4 p-6 md:p-10) > Form,
      div (bg-muted hidden lg:block) > Image
    ]
  `,
  
  // Stats grid
  statsGrid: `
    div (grid gap-4 md:grid-cols-2 lg:grid-cols-4) > [
      StatCard * N
    ]
  `,
  
  // Content page
  contentPage: `
    div (flex flex-col gap-6 p-4 lg:p-6) > [
      PageHeader,
      MainContent,
      Table/List
    ]
  `
}
```

### 4.3 Пост-генерация валидация

```typescript
const VALIDATION_CHECKS = [
  // Запрещённые классы
  { rule: "NO_RAW_COLORS", pattern: /(bg|text|border)-(gray|blue|red|green|yellow|purple|pink|indigo|orange)-\d+/ },
  { rule: "NO_TEXT_BASE", pattern: /text-base(?!\s*:)/, message: "Use text-sm as base" },
  { rule: "NO_LARGE_CARD_TITLES", pattern: /CardTitle.*text-(lg|xl|2xl)/ },
  { rule: "NO_HEAVY_SHADOWS", pattern: /shadow-(md|lg|xl|2xl)/ },
  { rule: "NO_SM_BREAKPOINT", pattern: /\bsm:/ },
  { rule: "NO_XL_BREAKPOINT", pattern: /\bxl:/ },
  
  // Обязательные паттерны
  { rule: "HAS_SEMANTIC_COLORS", check: "Must use bg-background, bg-muted, text-muted-foreground" },
  { rule: "HAS_PROPER_GAPS", check: "Must use gap-* not space-*" },
  { rule: "HAS_RESPONSIVE_GRID", check: "Grid must have md: or lg: column variants" },
]
```

---

## 5. Рекомендация по внедрению

### Шаг 1: Prompt Engineering (быстрый эффект)
Добавить правила из секции 4.1 в system prompt для AI генератора. Это сразу улучшит качество на 50-60%.

### Шаг 2: Template Engine (средний эффект)
Создать 5-7 шаблонов страниц (секция 4.2). AI заполняет слоты в шаблоне вместо генерации layout с нуля.

### Шаг 3: Post-generation Validation (гарантия качества)
Прогонять сгенерированный код через валидатор (секция 4.3). Автоматически заменять нарушения — например, `text-gray-500` → `text-muted-foreground`.

### Шаг 4: Component Constraints
Зафиксировать структуру каждого компонента (как stat card в секции 2.5). AI не "придумывает" как выглядит карточка — он заполняет слоты в жёсткой структуре.

---

## 6. TL;DR — Три главных открытия

1. **`text-sm` (14px) — базовый размер текста, не 16px.** Это единственное изменение, которое больше всего влияет на "профессиональный" вид.

2. **Только semantic color tokens.** Ноль raw colors. `text-muted-foreground` — ваш лучший друг.

3. **Иерархия через weight, не через size.** `font-medium` vs `font-bold` создаёт разницу, не `text-sm` vs `text-xl`. Крупные размеры — только для KPI-метрик.
