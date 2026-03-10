# Provider Selection Flag

Coherent CLI теперь поддерживает явный выбор AI провайдера через флаг `--provider`.

## Использование

### Команда `init`

```bash
# Использовать OpenAI
coherent init --provider openai

# Использовать Claude
coherent init --provider claude

# Автоматическое обнаружение (по умолчанию)
coherent init
# или
coherent init --provider auto
```

### Команда `chat`

```bash
# Использовать OpenAI
coherent chat "make buttons blue" --provider openai

# Использовать Claude
coherent chat "add pricing page" --provider claude

# Автоматическое обнаружение (по умолчанию)
coherent chat "change primary color to green"
```

## Валидация

Если указан неверный провайдер, CLI покажет ошибку:

```bash
$ coherent init --provider invalid
❌ Invalid provider: invalid
Valid options: claude, openai, auto
```

## Обработка ошибок

### Если ключ отсутствует для указанного провайдера:

```bash
$ coherent init --provider openai
# (если OPENAI_API_KEY не установлен)
❌ OpenAI API key not found.
Please set OPENAI_API_KEY in your environment or .env file.

💡 Setup Instructions:
  1. Get your OpenAI API key from: https://platform.openai.com
  2. Create a .env file in the current directory:
     echo "OPENAI_API_KEY=your_key_here" > .env
  3. Or export it in your shell:
     export OPENAI_API_KEY=your_key_here

  Also ensure "openai" package is installed:
     npm install openai
```

## Приоритет провайдеров

1. **Явный выбор** (`--provider claude` или `--provider openai`) - имеет наивысший приоритет
2. **Автоматическое обнаружение** (`--provider auto` или без флага):
   - Проверяет `OPENAI_API_KEY` или `CURSOR_OPENAI_API_KEY` → OpenAI
   - Проверяет `ANTHROPIC_API_KEY` → Claude

## Примеры использования

### Пример 1: Принудительное использование OpenAI

```bash
# Даже если ANTHROPIC_API_KEY установлен, использовать OpenAI
coherent init --provider openai
```

### Пример 2: Принудительное использование Claude

```bash
# Даже если OPENAI_API_KEY установлен, использовать Claude
coherent chat "make buttons red" --provider claude
```

### Пример 3: Автоматический выбор

```bash
# Использует первый доступный провайдер
coherent init
```

## Технические детали

### Файлы, которые были изменены:

1. `packages/cli/src/index.ts` - добавлены опции `--provider`
2. `packages/cli/src/utils/ai-provider.ts` - обновлена функция `createAIProvider()`
3. `packages/cli/src/commands/init.ts` - добавлена валидация и передача провайдера
4. `packages/cli/src/commands/chat.ts` - добавлена валидация и передача провайдера
5. `packages/cli/src/agents/generator.ts` - добавлен параметр провайдера
6. `packages/cli/src/agents/modifier.ts` - добавлен параметр провайдера

### Сигнатуры функций:

```typescript
// init command
export async function initCommand(options: { provider?: string })

// chat command  
export async function chatCommand(message: string, options: { provider?: string })

// generator agent
export async function generateConfig(
  discovery: DiscoveryResult,
  provider: AIProvider = 'auto'
): Promise<DesignSystemConfig>

// modifier agent
export async function parseModification(
  message: string,
  context: ModificationContext,
  provider: AIProvider = 'auto'
): Promise<ModificationRequest[]>

// AI provider factory
export async function createAIProvider(
  preferredProvider: AIProvider = 'auto',
  config?: Omit<AIProviderConfig, 'provider'>
): Promise<AIProviderInterface>
```

## Acceptance Criteria

- ✅ `coherent init --provider openai` использует OpenAI
- ✅ `coherent init --provider claude` использует Claude
- ✅ `coherent init` (без флага) использует auto-detection
- ✅ Понятные ошибки если ключ отсутствует
- ✅ Валидация неправильных значений флага
