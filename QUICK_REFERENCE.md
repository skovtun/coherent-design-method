# 🎯 Quick Reference: Coherent + Cursor

## Два способа работы (выбирайте по ситуации)

### 🔧 Способ 1: Cursor (детальная работа)

**Когда использовать:**
- Доработка компонентов
- Настройка стилей
- Сложная логика
- Тонкая настройка

**Как работать:**
```bash
coherent init
# В Cursor редактируете код напрямую
# Hot reload показывает изменения
```

**Что редактировать в Cursor:**
- `components/` - компоненты
- `app/*/page.tsx` - страницы
- `design-system.config.ts` - конфигурация
- `app/AppNav.tsx` - навигация (если нужно)
- `globals.css` - стили

---

### ⚡ Способ 2: CLI chat (быстрая генерация)

**Когда использовать:**
- Быстрое создание страниц
- Генерация компонентов
- Изменение токенов
- Batch операции

**Как работать:**
```bash
coherent init
coherent chat "add products page with grid layout"
coherent chat "add checkout flow: cart → shipping → payment"
coherent chat "change primary color to #667EEA"
```

**Что chat может делать:**
- Создавать страницы
- Генерировать компоненты
- Обновлять токены
- Модифицировать config
- Регенерировать layout/nav

---

## 🔥 Best Practice: Гибридный подход

```bash
# 1. Структура через CLI
coherent init
coherent chat "add e-commerce: products, cart, checkout"
git commit -m "Initial structure"

# 2. Детали в Cursor
# - ProductCard компонент
# - Стили каталога
# - Логика корзины

git commit -m "Implemented product catalog"

# 3. Новые фичи снова через CLI
coherent chat "add admin panel"
git commit -m "Admin scaffolding"

# 4. Доработка в Cursor
# - Dashboard widgets
# - Admin forms
```

---

## ⚠️ Правила безопасности

### При использовании CLI chat:

#### ✅ DO
```bash
# 1. Commit перед chat
git add .
git commit -m "Before adding feature X"

# 2. Используйте chat
coherent chat "add feature X"

# 3. Проверьте что изменилось
git diff

# 4. Если всё ок - commit
git commit -m "Added feature X"

# 5. Если что-то не так - откатите
git reset --hard HEAD^
```

#### ❌ DON'T
```bash
# НЕ делайте изменения в Cursor и chat одновременно
# Выберите один подход для конкретного файла

# Плохо:
# 1. Редактируете AppNav.tsx в Cursor
# 2. Запускаете coherent chat "add page"
# → chat перезапишет ваши правки в AppNav.tsx

# Хорошо:
# 1. Commit текущих изменений
# 2. Потом используйте chat
```

---

## 📋 Частые сценарии

### Сценарий 1: Создать новую страницу

**Через CLI:**
```bash
coherent chat "add pricing page with 3 tiers"
# → Создаст страницу, добавит в config, обновит nav
```

**Через Cursor:**
```
Вы в Cursor:
"Создай app/pricing/page.tsx с тремя ценовыми планами.
Добавь путь в design-system.config.ts в pages[].
Используй компоненты Card и Button из components/ui/."
```

---

### Сценарий 2: Создать кастомный компонент

**Через CLI:**
```bash
coherent chat "add ProductCard component with image, title, price, CTA"
# В Cursor дорабатываете детали
```

**Через Cursor:**
```
Вы в Cursor:
"Создай components/custom/ProductCard.tsx:
- Props: image, title, price, onAddToCart
- Варианты: compact, detailed
- Добавь в design-system.config.ts в components[]"
```

---

### Сценарий 3: Изменить токены

**Через CLI:**
```bash
coherent chat "change primary color to #FF6B6B and increase spacing by 2px"
# → Обновит config, страницы токенов
```

**Через Cursor:**
```
Вы в Cursor:
"В design-system.config.ts измени:
- tokens.colors.primary.500 на #FF6B6B
- tokens.spacing.md с 16px на 18px
Hot reload применит изменения везде"
```

---

### Сценарий 4: Доработать сгенерированный компонент

```bash
# 1. Генерация через CLI
coherent chat "add LoginForm component"
git commit -m "Generated LoginForm"

# 2. Доработка в Cursor
# → Добавляете валидацию
# → Настраиваете стили
# → Добавляете обработку ошибок

git commit -m "LoginForm complete"
```

---

## 🎯 Какой способ выбрать?

| Задача | Рекомендация |
|--------|-------------|
| Создать 5+ страниц одновременно | **CLI** |
| Настроить стили компонента | **Cursor** |
| Изменить цветовую схему | **CLI** или **Cursor** |
| Добавить сложную логику | **Cursor** |
| Быстрый прототип | **CLI** |
| Доработка деталей | **Cursor** |
| Batch операции | **CLI** |
| Тонкая настройка | **Cursor** |

---

## 🚀 Будущие возможности CLI

CLI команды готовы для:

### CI/CD Integration
```yaml
# .github/workflows/design-system.yml
- name: Sync design tokens
  run: coherent chat "sync tokens from Figma"

- name: Generate docs
  run: coherent chat "update component documentation"
```

### VS Code Extension
```
Ctrl+Shift+P → "Coherent: Add Component"
→ Вызывает coherent chat под капотом
```

### Team Scripts
```bash
#!/bin/bash
# scripts/add-feature.sh
coherent chat "add $1 feature with pages and components"
npm run test
git commit -m "Generated $1 feature"
```

---

## 💡 Tips для работы в Cursor

### При работе БЕЗ CLI:

```
Промпт для Cursor:

@CONTEXT.md

Создай страницу /dashboard:
1. app/dashboard/page.tsx
2. Используй компоненты из components/ui/
3. Добавь путь в design-system.config.ts → pages[]
4. AppNav автоматически подхватит новую страницу из config
5. Hot reload покажет изменения

Убедись что:
- Читаешь токены из config (цвета, spacing)
- Следуешь structure из других страниц
- Используешь существующие компоненты где возможно
```

### При работе С CLI:

```bash
# 1. Генерация
coherent chat "add dashboard with widgets"

# 2. Проверка в Cursor
# → Открываете сгенерированные файлы
# → Смотрите что создалось
# → Дорабатываете если нужно
```

---

## ✅ Чек-лист перед началом работы

- [ ] Прочитал CONTEXT.md
- [ ] Понял два способа работы (CLI vs Cursor)
- [ ] Настроил Git (для безопасных экспериментов)
- [ ] Протестировал `coherent init`
- [ ] Протестировал hot reload
- [ ] Выбрал подход для текущей задачи

---

## 🆘 Troubleshooting

**Проблема:** Chat перезаписал мои правки  
**Решение:** `git reset --hard HEAD^` и работайте в Cursor

**Проблема:** Hot reload не работает  
**Решение:** Перезапустите `npm run dev`

**Проблема:** Не знаю что выбрать - CLI или Cursor  
**Решение:** По умолчанию Cursor, CLI только для быстрой генерации

**Проблема:** Конфликт между chat и Cursor  
**Решение:** Выберите один подход для одного файла, делайте commit чаще

---

**Главное:** Оба способа валидны, выбирайте по ситуации! 🚀
