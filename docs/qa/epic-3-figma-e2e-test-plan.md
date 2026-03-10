# Epic 3 — Figma Import E2E Test Plan (Stories 3.8–3.12)

Проверка пайплайна `coherent import figma` без автоматизации (ручной прогон при наличии Figma token).

**Требования:** `FIGMA_ACCESS_TOKEN` или `FIGMA_TOKEN` (Figma → Settings → Personal access tokens). Тестовый файл в Figma с хотя бы одной страницей (frame) и при желании компонентами/стилями.

---

## Setup

```bash
cd /tmp && rm -rf coherent-figma-e2e && mkdir coherent-figma-e2e && cd coherent-figma-e2e
export FIGMA_ACCESS_TOKEN=figd_xxx   # или FIGMA_TOKEN
# URL файла: https://www.figma.com/file/<FILE_KEY>/<name> или только FILE_KEY
```

---

## Test 1: Full import (3.8 → 3.12)

```bash
coherent import figma "https://www.figma.com/file/YOUR_FILE_KEY/YourFile" --token $FIGMA_ACCESS_TOKEN
```

**Expected:**
- [ ] `coherent.figma-import.json` создан (pages, components, colorStyles, textStyles, effectStyles)
- [ ] `app/globals.css` обновлён (CSS variables из токенов)
- [ ] `coherent.figma-component-map.json` создан (figmaId → base | shared)
- [ ] Для каждого Figma frame: `app/<route>/page.tsx` или `app/page.tsx` для Home
- [ ] Shared components: `components/shared/*.tsx` + запись в `coherent.components.json`
- [ ] `design-system.config.ts` создан или обновлён (tokens, pages, navigation)
- [ ] `app/layout.tsx` существует (минимальный или с Header/Footer при наличии layout-компонентов)
- [ ] Файлы DS viewer: `app/design-system/**`, `app/api/design-system/**`
- [ ] Финальный отчёт: статистика (pages, components base/shared, files written)

**Status:** _Не пройден_ / Pass

---

## Test 2: Dry run (3.12)

```bash
coherent import figma "YOUR_FILE_KEY" --token $FIGMA_ACCESS_TOKEN --dry-run
```

**Expected:**
- [ ] Ни один файл не записан на диск
- [ ] Вывод: «Dry run (no files written)», список файлов «that would be written», статистика

**Status:** _Не пройден_ / Pass

---

## Test 3: No pages (3.12)

```bash
coherent import figma "YOUR_FILE_KEY" --token $FIGMA_ACCESS_TOKEN --no-pages
```

**Expected:**
- [ ] Токены и globals.css записаны
- [ ] Компоненты нормализованы, shared созданы, component map записан
- [ ] Ни один `app/**/page.tsx` из фреймов не создан (Pages: 0 (skipped by --no-pages))
- [ ] design-system.config и DS viewer обновлены

**Status:** _Не пройден_ / Pass

---

## Test 4: Build after import

После успешного Test 1:

```bash
npm install --legacy-peer-deps
npm run build
# или: npx next build
```

**Expected:**
- [ ] Сборка Next.js проходит без ошибок
- [ ] Нет сломанных импортов (@/components/ui/*, @/components/shared/*)

**Status:** _Не пройден_ / Pass

---

## Test 5: Validate after import

```bash
coherent validate
```

**Expected:**
- [ ] Команда завершается (предупреждения по контенту допустимы)

**Status:** _Не пройден_ / Pass

---

## Сводка

| #  | Сценарий           | Stories | Зависимости   |
|----|--------------------|--------|---------------|
| 1  | Full import        | 3.8–3.12 | Figma token |
| 2  | Dry run            | 3.12   | Figma token |
| 3  | No pages           | 3.12   | Figma token |
| 4  | Build after import | —      | После Test 1 |
| 5  | Validate           | —      | После Test 1 |

**Примечание:** Unit-тесты (без токена) в `packages/core/src/figma/figma.test.ts` — 10 тестов на parser, token extractor, normalizer, page generator. Запуск: `pnpm test` из корня или `pnpm test` в `packages/core`.
