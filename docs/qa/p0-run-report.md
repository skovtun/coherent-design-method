# P0.1 & P0.2 — Результаты прогона

**Дата:** 2026-01-26.  
**Скрипт:** `packages/cli/tests/p0-p0.1-p0.2.sh` (init → shared add PricingCard → chat "add pricing page" → grep → export → npm run build).

---

## Внесённые исправления (перед повторным прогоном)

1. **P0.1 (preventive reuse)**  
   - В `modifier.ts`: формулировка усилена до **MUST** — «You MUST import and use existing shared components… NEVER recreate inline what already exists as shared» + пример с PricingCard.  
   - В `chat.ts`: при `COHERENT_DEBUG=1` выводится debug log `sharedComponentsSummary` перед вызовом `parseModification` для add-page (чтобы убедиться, что CID-001 PricingCard в промпте).

2. **P0.2 (apostrophe in metadata)**  
   - В `chat.ts`: добавлена `sanitizeMetadataStrings(code)` — экранирование одинарных кавычек внутри значений `title:` и `description:` в metadata. Применяется к коду страницы перед записью на диск (add-page).

3. **P0.2 (lucide-react в export)**  
   - В `init.ts`: при `coherent init` (после create-next-app) в зависимости добавлен `lucide-react` — welcome-страница и типичные компоненты его используют.  
   - В `export.ts`: после копирования и strip экспорта выполняется сканирование кода в `app/` и `components/` на импорты; пакеты, которых нет в `package.json`, выводятся предупреждением: *"Warning: exported code imports packages not in package.json: …"*.

---

## Итог последнего прогона (после фиксов)

| Тест | Результат | Причина |
|------|-----------|--------|
| **P0.1** (preventive reuse — grep `import PricingCard`) | **FAIL** | Chat не выполнился: Claude API 529 (Overloaded). Поведение reuse не проверялось. |
| **P0.2** (export → `npm run build`) | **FAIL** | Сборка в export-out упала из‑за `Module not found: lucide-react` в `app/page.tsx`, а не из‑за апострофа в metadata. |

Повторный прогон нужен при стабильном API и при наличии `lucide-react` в зависимостях экспорта (или при странице без lucide), чтобы проверить именно фиксы P0.1 и P0.2.

---

## Итог исходного прогона (до фиксов)

| Тест | Результат | Причина |
|------|-----------|--------|
| **P0.1** (preventive reuse — grep `import PricingCard`) | **FAIL** | В `app/` нет импорта PricingCard. При наличии CID-001 (PricingCard) chat «add pricing page with 3 tiers» сгенерировал страницу с inline Card/Button/Badge, без использования shared компонента PricingCard. |
| **P0.2** (export → `npm run build`) | **FAIL** | Сборка в export-out падала из‑за синтаксической ошибки в AI-сгенерированном `app/pricing/page.tsx`: неэкранированный апостроф в `description: '...team's needs...'` (кавычка в `team's` обрывает строку). |

---

## Детали

### P0.1 — Preventive reuse (Story 2.11)

- Условие: заранее создан shared PricingCard (`components shared add PricingCard --type section`), затем `coherent chat "add pricing page with 3 tiers: starter, pro, enterprise"`.
- Ожидание: в сгенерированной странице есть `import { PricingCard } from '@/components/shared/pricing-card'` (или аналог).
- Факт (исходный прогон): `grep -r "import.*PricingCard\|from.*pricing-card" app/ --include="*.tsx"` не находил совпадений; страница строилась из базовых Card/Button/Badge. После фиксов прогон не дошёл до проверки из‑за 529.

### P0.2 — Export → build

- Export в `$TMP_PARENT/export-out` выполняется успешно.
- В export-out выполняется `npm run build` (next build).
- Исходная ошибка: в `export const metadata` в поле `description` строка с апострофом (`team's`) → синтаксическая ошибка. Добавлен post-processing `sanitizeMetadataStrings` перед записью page.
- В повторном прогоне сборка упала по другой причине: отсутствует зависимость `lucide-react` в экспорте (используется в `app/page.tsx`).

---

## Рекомендации

1. **P0.1:** Перезапустить прогон при стабильном API; при необходимости проверить с `COHERENT_DEBUG=1`, что в логе есть PricingCard в `sharedComponentsSummary`.
2. **P0.2:** Фикс lucide внесён (init добавляет `lucide-react`; export предупреждает о недостающих импортах). Перепрогонить P0.1 и P0.2 при стабильном API для подтверждения.
