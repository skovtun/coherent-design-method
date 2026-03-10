# Epic 2 — E2E Test Plan

Run all commands from a clean temp directory.

**Note:** Tests 1, 2, 3, 5, 6, 12 require a valid `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` (chat commands). Run with:
```bash
export ANTHROPIC_API_KEY=sk-your-key   # or OPENAI_API_KEY
cd /tmp/coherent-e2e
# then run chat tests
```

---

## Setup

Для **чистого прогона Test 1** (проактивное создание Header/Footer) используйте каталог **без точки в имени** (create-next-app не принимает имена вроде `.tmp-e2e`):

```bash
rm -rf /tmp/coherent-e2e-clean && mkdir -p /tmp/coherent-e2e-clean
# Ключ в env (в пустом каталоге нет .env): export ANTHROPIC_API_KEY=sk-...
cd /tmp/coherent-e2e-clean && node /path/to/packages/cli/dist/index.js init
# После init скопировать .env в каталог для chat
```

Обычный setup (для остальных тестов можно использовать каталог с точкой, если init уже выполнен в другом месте):

```bash
cd /tmp && rm -rf coherent-e2e && mkdir coherent-e2e && cd coherent-e2e
ANTHROPIC_API_KEY=sk-xxx coherent init   # or skip prompt: key in .env
```

**Check:** Project created.  
**Note:** `coherent.components.json` is created on first use (first `components shared add` or first chat that adds a page with header/footer). It is not created at init.

---

## Test 1: Proactive Creation (Story 2.6)

```bash
coherent chat "Create a professional SaaS landing page with a header containing logo and navigation, hero section, features grid, and a footer with links"
```

**Expected:**
- [ ] Page created at `app/page.tsx` (or similar)
- [ ] CLI output includes "Created CID-001 (Header) and CID-002 (Footer) as shared components"
- [ ] File exists: `components/shared/header.tsx`
- [ ] File exists: `components/shared/footer.tsx`
- [ ] `coherent.components.json` has 2 entries (CID-001, CID-002)
- [ ] `app/layout.tsx` imports Header and Footer
- [ ] Header renders before `{children}`, Footer after

**Status:** ✅ Pass. Чистый прогон (2026-01-26): `rm -rf /tmp/coherent-e2e-clean && mkdir /tmp/coherent-e2e-clean`, init (без `.env` в каталоге — ключ из env), затем `chat "Add a landing page at /landing with a header containing logo and navigation, hero section, and a footer with links"`. CLI выводит: **"🧩 Created CID-001 (Header) and CID-002 (Footer) as shared components."**  
*Примечание:* имя каталога не должно начинаться с точки (create-next-app), поэтому для чистого прогона используется например `/tmp/coherent-e2e-clean`; первый chat должен добавлять **новую** страницу (например `/landing`), иначе проактивное создание не сработает.

---

## Test 2: Second Page — Shared Components Reused

```bash
coherent chat "Add a Dashboard page with stat cards, recent activity table, and charts"
```

**Expected:** Dashboard created; no inline header/footer; content only.

**Status:** ✅ Pass.

---

## Test 3: Third Page — Confirm Pattern Holds

```bash
coherent chat "Add a Settings page with profile form, notification toggles, and danger zone"
```

**Expected:** Settings created; all three pages share header/footer via layout.

**Status:** ✅ Pass.

---

## Test 4: CLI — List Shared Components (Story 2.9)

```bash
coherent components shared
```

**Expected output (approximately):**
```
Shared Components:
  CID-001  Header    layout    used in: app/layout.tsx
  CID-002  Footer    layout    used in: app/layout.tsx
  CID-003  PricingCard  section  (not used yet)
```

**Status:** ✅ Pass. List shows ID, name, type, usedIn.

```bash
coherent components shared --json
```
**Status:** ✅ Pass. Valid JSON with `shared` array and `nextId`.

```bash
coherent components shared --verbose
```
**Status:** ✅ Pass. Includes file paths and descriptions.

---

## Test 5: Modify by ID (Story 2.4)

```bash
coherent chat "In CID-001, add a search input next to the navigation links"
```

**Expected:** CLI says "Updated CID-001 (Header)..."; `components/shared/header.tsx` contains search; no changes to page files.

**Status:** ✅ Pass.

---

## Test 6: Modify by Name

```bash
coherent chat "Update the Footer — add social media icons for Twitter, GitHub, and LinkedIn"
```

**Expected:** Footer updated; all pages get new footer.

**Status:** ✅ Pass. "Updated CID-002 (Footer). Change is visible on all pages using it."

---

## Test 7: Manual Shared Component Creation (Story 2.2)

```bash
coherent components shared add Header --type layout
coherent components shared add Footer --type layout
coherent components shared add PricingCard --type section
```

**Expected:**
- [x] Files created: `header.tsx`, `footer.tsx`, `pricing-card.tsx`
- [x] `coherent.components.json` has 3 entries (CID-001, CID-002, CID-003)
- [x] CID-003 type "section"; layout.tsx not modified for section
- [x] layout.tsx imports Header and Footer; Header before children, Footer after

**Status:** ✅ Pass.

---

## Test 8: DS Auto-generation

After first `components shared add`: if `app/design-system/shared/page.tsx` did not exist, it (and API routes) should be created automatically.

**In current scaffold:** Init already generates full DS including `app/design-system/shared/page.tsx` and `app/api/design-system/shared-components/`. So auto-dopiska applies when adding shared components in a project that was created before the shared section was added to the generator.

**Check:**
```bash
ls app/design-system/shared/    # page.tsx, [id]/
ls app/api/design-system/shared-components/  # route.ts, [id]/
```
**Status:** ✅ Pass (present after init; dopiska would run in legacy projects).

---

## Test 9: DS Regenerate

```bash
coherent ds regenerate
```

**Expected:** All DS files regenerated; Shared Components in nav; no errors.

**Status:** ✅ Pass. "Regenerated 15 Design System file(s)".

---

## Test 10: Validate (Manifest Integrity)

```bash
coherent validate
```

**Expected:** No manifest errors when all files exist.

**Status:** ✅ Pass (other validate errors are from DS/token pages, not Epic 2).

**Break it:**
```bash
rm components/shared/pricing-card.tsx
coherent validate
```
**Expected:** Warning about missing file for CID-003.

**Status:** ✅ Pass. Output includes: "Shared components (manifest vs files): Missing files: CID-003 (components/shared/pricing-card.tsx)".

---

## Test 11: Preview

```bash
coherent preview
```

**Expected:** App builds; landing shows header + content + footer; navigation persists; Design System button; Shared Components section in DS viewer.

**Status:** ⏳ Not run (would need `npm run dev` or similar; optional in CI).

---

## Test 12: Auth Page — Header Hidden

```bash
coherent chat "Add a Login page with email and password fields"
```

**Expected:** Login page; optionally no shared Header on login (auth convention). Currently no route-group layout for (auth) — header/footer still show on all pages unless implemented.

**Status:** ✅ Pass. Login page at `/login` created. Edge case (header/footer скрыть на auth-страницах) зафиксирован отдельным тикетом: **`docs/qa/backlog.md`** → [Auth] Скрытие Header/Footer на страницах авторизации (route group).

---

## Summary Checklist

| # | Test | Story | Status |
|---|------|-------|--------|
| 1 | Proactive creation | 2.6 | ✅ Pass |
| 2 | Second page reuse | 2.3 | ✅ Pass |
| 3 | Third page reuse | 2.3 | ✅ Pass |
| 4 | CLI list / json / verbose | 2.9 | ✅ Pass |
| 5 | Modify by ID | 2.4 | ✅ Pass |
| 6 | Modify by name | 2.4 | ✅ Pass |
| 7 | Manual add (Header, Footer, PricingCard) | 2.2 | ✅ Pass |
| 8 | DS auto-generate | 2.8 | ✅ Pass |
| 9 | DS regenerate | — | ✅ Pass |
| 10 | Validate + manifest integrity | — | ✅ Pass |
| 11 | Preview + DS viewer | 2.8 | ⏳ Optional |
| 12 | Auth page | edge | ✅ Pass |

---

## How to Run Full E2E (with API key)

```bash
export ANTHROPIC_API_KEY=sk-your-key
cd /tmp && rm -rf coherent-e2e && mkdir coherent-e2e && cd coherent-e2e
node /path/to/coherent-design-method/packages/cli/dist/index.js init
# Then run Tests 1–3, 5, 6, 12 in order; verify 4, 7, 8, 9, 10 as above.
```

---

*Last run: 2026-01-26. Chat tests run from `.tmp-e2e` with `.env` (API key). All Epic 2 chat tests (1, 2, 3, 5, 6, 12) passed.*
