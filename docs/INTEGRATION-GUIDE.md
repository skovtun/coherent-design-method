# BMAD Integration Guide

## Архитектура генерации UI

### Проблема текущего подхода

```
User Request → LLM → Output
```

Результат: скелеты с заглушками, потому что модель пытается сделать всё за один проход.

### Решение: Staged Generation Pipeline

```
User Request 
    ↓
┌─────────────────────────────────────────┐
│ Stage 1: ANALYSIS                       │
│ - Parse user intent                     │
│ - Identify page type (dashboard/form/   │
│   table/settings/etc.)                  │
│ - List required components              │
│ - Define data structures                │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Stage 2: ARCHITECTURE                   │
│ - Select layout template                │
│ - Plan component hierarchy              │
│ - Define state requirements             │
│ - Generate sample data                  │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Stage 3: IMPLEMENTATION                 │
│ - Generate full code                    │
│ - Apply design tokens                   │
│ - Implement all states                  │
│ - Add interactions                      │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ Stage 4: VALIDATION                     │
│ - Check for placeholders                │
│ - Verify all states exist               │
│ - Ensure accessibility                  │
│ - Confirm responsive design             │
└─────────────────────────────────────────┘
    ↓
Final Output
```

---

## Implementation Option 1: Single Prompt with Structured Output

Самый простой вариант — улучшенный системный промпт с явными инструкциями.

```javascript
const systemPrompt = fs.readFileSync('bmad-ui-system-prompt.md', 'utf-8');

async function generateUI(userRequest) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514", // или claude-3-5-sonnet
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{
      role: "user",
      content: `
Create a production-ready UI for the following request:

${userRequest}

Requirements:
1. Full implementation with all states (loading, empty, error, success)
2. Real content - no placeholders
3. All interactive elements have hover/focus states
4. Responsive design
5. Proper accessibility

Start by briefly describing your design approach, then provide the complete code.
      `
    }]
  });
  
  return response.content[0].text;
}
```

**Pros:** Простая интеграция, минимальные изменения
**Cons:** Качество зависит от сложности запроса, может быть inconsistent

---

## Implementation Option 2: Staged Generation (Recommended)

Более надёжный подход с разделением на этапы.

```javascript
const systemPrompt = fs.readFileSync('bmad-ui-system-prompt.md', 'utf-8');

async function generateUI(userRequest) {
  // Stage 1: Analysis
  const analysis = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    messages: [{
      role: "user",
      content: `
Analyze this UI request and respond in JSON format:

Request: "${userRequest}"

Provide:
{
  "pageType": "dashboard|settings|form|table|landing|detail",
  "components": ["list of required components"],
  "dataStructures": ["list of data entities needed"],
  "states": ["list of UI states to implement"],
  "layoutTemplate": "dashboard|settings|list|form|custom",
  "designNotes": "brief aesthetic direction"
}
      `
    }]
  });
  
  const spec = JSON.parse(analysis.content[0].text);
  
  // Stage 2: Data Generation
  const sampleData = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: `
Generate realistic sample data for these entities:
${JSON.stringify(spec.dataStructures)}

Context: ${userRequest}

Provide as JavaScript objects that can be used directly in React components.
Include enough variety (3-5 items per list).
      `
    }]
  });
  
  // Stage 3: Implementation
  const implementation = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{
      role: "user",
      content: `
Create a complete React implementation based on this specification:

Page Type: ${spec.pageType}
Layout: ${spec.layoutTemplate}
Components: ${spec.components.join(', ')}
Design Notes: ${spec.designNotes}

Sample Data:
${sampleData.content[0].text}

States to implement: ${spec.states.join(', ')}

Generate production-ready code with:
- All specified states
- The provided sample data
- Hover/focus effects on all interactive elements
- Responsive design
- Proper TypeScript types (if applicable)
      `
    }]
  });
  
  return implementation.content[0].text;
}
```

**Pros:** Более consistent качество, лучше обрабатывает сложные запросы
**Cons:** 3 API call вместо 1, больше latency

---

## Implementation Option 3: Template-Based Generation

Лучший баланс качества и скорости — использование готовых шаблонов.

### 1. Создай библиотеку базовых компонентов

```
/templates
  /components
    Button.jsx
    Card.jsx
    Input.jsx
    Select.jsx
    Table.jsx
    StatCard.jsx
    EmptyState.jsx
    LoadingState.jsx
    ErrorState.jsx
    Avatar.jsx
    Badge.jsx
    Modal.jsx
    Dropdown.jsx
    
  /layouts
    DashboardLayout.jsx
    SettingsLayout.jsx
    FormLayout.jsx
    TableLayout.jsx
    
  /pages
    DashboardTemplate.jsx
    SettingsTemplate.jsx
    TableTemplate.jsx
    FormTemplate.jsx
```

### 2. Использование в промпте

```javascript
const templates = loadTemplates('./templates');

async function generateUI(userRequest) {
  // Determine which template to use
  const templateSelection = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [{
      role: "user",
      content: `
Which template best fits this request?

Request: "${userRequest}"

Available templates:
- DashboardTemplate: Stats cards, charts, recent activity
- SettingsTemplate: Sidebar nav, form sections
- TableTemplate: Data table with filters, pagination
- FormTemplate: Multi-step or single forms

Respond with just the template name.
      `
    }]
  });
  
  const templateName = templateSelection.content[0].text.trim();
  const baseTemplate = templates[templateName];
  
  // Generate customized version
  const customized = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{
      role: "user",
      content: `
Customize this template for the following request:

Request: "${userRequest}"

Base Template:
\`\`\`jsx
${baseTemplate}
\`\`\`

Modify the template to:
1. Match the specific use case
2. Use appropriate content and data
3. Add any additional components needed
4. Keep all existing states and interactions

Output the complete customized code.
      `
    }]
  });
  
  return customized.content[0].text;
}
```

**Pros:** Consistent quality, faster generation, реиспользование кода
**Cons:** Требует создания и поддержки библиотеки шаблонов

---

## Recommended Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BMAD Platform                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   User       │ →  │   Intent     │ →  │   Template   │      │
│  │   Request    │    │   Analyzer   │    │   Selector   │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                   ↓             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  Template Library                         │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │  │
│  │  │Dashboard│ │Settings │ │ Table   │ │  Form   │        │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                   ↓             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Data       │ →  │   Code       │ →  │   Quality    │      │
│  │   Generator  │    │   Generator  │    │   Validator  │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                   ↓             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  Component Library                        │  │
│  │  Button, Card, Input, Table, Modal, EmptyState, etc.     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                   ↓             │
│                           Final Output                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quality Validation

Добавь пост-обработку для проверки качества:

```javascript
function validateOutput(code) {
  const issues = [];
  
  // Check for placeholders
  const placeholderPatterns = [
    /Card content/i,
    /Lorem ipsum/i,
    /Your .* here/i,
    /\[.*\]/g, // [placeholder]
    /TODO/i,
    /FIXME/i,
  ];
  
  placeholderPatterns.forEach(pattern => {
    if (pattern.test(code)) {
      issues.push(`Found placeholder pattern: ${pattern}`);
    }
  });
  
  // Check for required states
  const requiredPatterns = [
    /loading|isLoading|skeleton/i,
    /error|isError|Error/,
    /empty|isEmpty|EmptyState/i,
  ];
  
  requiredPatterns.forEach(pattern => {
    if (!pattern.test(code)) {
      issues.push(`Missing state handling: ${pattern}`);
    }
  });
  
  // Check for hover states
  if (!code.includes('hover:')) {
    issues.push('No hover states found');
  }
  
  // Check for focus states
  if (!code.includes('focus:')) {
    issues.push('No focus states found');
  }
  
  return {
    isValid: issues.length === 0,
    issues
  };
}

// If validation fails, regenerate with specific instructions
async function generateWithRetry(userRequest) {
  let attempts = 0;
  const maxAttempts = 2;
  
  while (attempts < maxAttempts) {
    const output = await generateUI(userRequest);
    const validation = validateOutput(output);
    
    if (validation.isValid) {
      return output;
    }
    
    // Retry with specific fixes
    const fixPrompt = `
Previous output had these issues:
${validation.issues.join('\n')}

Please regenerate and fix these specific problems.
    `;
    
    userRequest = fixPrompt + '\n\nOriginal request: ' + userRequest;
    attempts++;
  }
  
  return output; // Return last attempt even if imperfect
}
```

---

## File Structure

```
bmad/
├── prompts/
│   ├── system-prompt.md          # Main system prompt
│   └── few-shot-examples.md      # Reference examples
│
├── templates/
│   ├── components/
│   │   ├── Button.jsx
│   │   ├── Card.jsx
│   │   ├── Input.jsx
│   │   ├── Table.jsx
│   │   ├── StatCard.jsx
│   │   ├── EmptyState.jsx
│   │   ├── LoadingState.jsx
│   │   └── ...
│   │
│   ├── layouts/
│   │   ├── DashboardLayout.jsx
│   │   ├── SettingsLayout.jsx
│   │   ├── FormLayout.jsx
│   │   └── TableLayout.jsx
│   │
│   └── pages/
│       ├── DashboardTemplate.jsx
│       ├── SettingsTemplate.jsx
│       ├── TableTemplate.jsx
│       └── FormTemplate.jsx
│
├── lib/
│   ├── generator.js              # Main generation logic
│   ├── validator.js              # Quality validation
│   └── templates.js              # Template loading
│
└── index.js                      # Entry point
```

---

## Quick Start Checklist

1. **[ ] Добавь system prompt** — `bmad-ui-system-prompt.md`

2. **[ ] Выбери стратегию генерации:**
   - Simple: Single prompt (быстро, менее consistent)
   - Staged: Multi-step (надёжнее, медленнее)
   - Template-based: Best balance (требует setup)

3. **[ ] Создай базовые компоненты** — хотя бы Button, Card, Input, Table, EmptyState

4. **[ ] Добавь валидацию** — проверка на placeholders и missing states

5. **[ ] Тестируй на типичных запросах:**
   - "Create a dashboard for [X]"
   - "Create settings page with [sections]"
   - "Create a table for managing [entities]"
   - "Create a form for [action]"

---

## Metrics to Track

1. **Placeholder rate** — % outputs with placeholder text
2. **State completeness** — % components with all states
3. **Regeneration rate** — % requests requiring retry
4. **User satisfaction** — qualitative feedback

Target: <5% placeholder rate, >90% state completeness
