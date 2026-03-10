# Layout Components (Layout Blocks)

> **Каноническая спецификация:** [Epic 2: Shared Components with ID](./epic-2-shared-components.md) — общая архитектура (манифест `coherent.components.json`, CID-XXX, `components/shared/`, детекция дублирования, promote/inline, DS viewer). Текущий документ описывает модель в конфиге дизайн-системы и её связь с Epic 2.

## Цель

Пользователь создаёт много страниц; на каждой повторяются блоки — шапка, футер, баннер. Такие объекты рассматриваются как **layout components** (в конфиге — **layout blocks**) с уникальными ID. Пользователь может обращаться к ним напрямую, например: *«Добавь в компонент id876 такую-то кнопку»* или *«в CID-001 добавь кнопку»*. После обновления блок меняется, и кнопка отображается на **всех страницах**, где используется этот блок.

## Модель данных

- **Layout block** — сущность в конфиге (`config.layoutBlocks`): уникальный `id` (kebab-case, например `lb-header-main` или `lb-876`), имя, роль (`header` | `footer` | `banner` | `sidebar` | `custom`), порядок и контент (секции как у страницы: компонент + пропсы).
- **Страница** — опциональное поле `layoutBlockIds: string[]`. Порядок в массиве = порядок отрисовки блоков вокруг контента страницы (например `["lb-header-main", "lb-footer-main"]`).

Типы: `packages/core/src/types/design-system.ts` — `LayoutBlockDefinition`, `LayoutBlockDefinitionSchema`, расширение `PageDefinition.layoutBlockIds`, `DesignSystemConfig.layoutBlocks`.

## Обращение по ID

- В конфиге блок идентифицируется по `id`, например `lb-header-main` или `lb-876`.
- Опциональное поле `numericId` (например `876`) позволяет обращаться к блоку в чате как «компонент id876»: парсер сопоставляет с блоком, у которого `numericId === 876` или `id === 'lb-876'`. Рекомендуется поддерживать оба варианта поиска.

## Поведение при изменении

- Типы модификаций: `add-layout-block`, `modify-layout-block` (`ModificationRequest` в `design-system.ts`).
- При запросе вида «добавь в компонент id876 кнопку X»:
  1. Определить, что цель — layout block (например `lb-876`).
  2. Сформировать `ModificationRequest` с `type: 'modify-layout-block'`, `target: 'lb-876'`, `changes: { ... }` (например добавление секции с кнопкой).
  3. Обновить конфиг (секции блока).
  4. Регенерировать **один** файл компонента этого layout block’а (см. ниже).
- Все страницы, у которых в `layoutBlockIds` есть `lb-876`, импортируют один и тот же сгенерированный компонент; после регенерации кнопка появляется везде без правок каждой страницы.

## Генерация (план)

- **Файлы**: для каждого layout block генерировать отдельный компонент, например `app/_layout-blocks/LayoutBlock_header_main.tsx` (или по id: `LayoutBlock_lb_876.tsx`), экспорт по имени.
- **Страница**: в шаблоне страницы при наличии `layoutBlockIds` добавлять импорты этих компонентов и рендер в нужном порядке: сначала блоки из `layoutBlockIds`, затем `<main>...</main>` (контент страницы).
- **Root layout**: глобальная навигация (AppNav) остаётся в корневом layout; layout blocks — именно общие «шапка/футер» страниц, которые могут отличаться от одной группы страниц к другой (или быть общими для всех).

## Чеклист реализации

- [x] Типы и схема: `LayoutBlockDefinition`, `layoutBlocks` в конфиге, `layoutBlockIds` в странице.
- [x] Расширение `ModificationRequest`: `add-layout-block`, `modify-layout-block`.
- [ ] Генератор: создание файлов в `_layout-blocks/` из `config.layoutBlocks`.
- [ ] PageGenerator: подставлять в шаблон страницы импорты и рендер блоков из `page.layoutBlockIds`.
- [ ] Chat/Modifier: разбор фраз типа «добавь в компонент id876 …» → определение layout block по id/numericId, вызов модификации и регенерация только затронутого layout block’а.

После выполнения оставшихся пунктов кнопка, добавленная в компонент id876, будет видна на всех страницах, где используется этот layout block.

---

## Связь с Epic 2 (Shared Components)

- **Epic 2** вводит манифест `coherent.components.json` и ID формата **CID-XXX**, файлы в `components/shared/`, типы `layout` | `section` | `widget`, детекцию дублирования и команду `coherent components`. См. [epic-2-shared-components.md](./epic-2-shared-components.md).
- **Layout blocks в конфиге** (`config.layoutBlocks`, `page.layoutBlockIds`) могут использоваться как источник структуры для генерации; сгенерированные layout-компоненты при реализации Epic 2 регистрируются в манифесте с CID. Обращение по «id876» (numericId) и по «CID-001» тогда оба ведут к одному и тому же компоненту.
- Типы манифеста для Story 2.1: `packages/core/src/types/shared-components-manifest.ts` — `SharedComponentsManifest`, `SharedComponentEntry`, `formatCid`, `parseCid`.
