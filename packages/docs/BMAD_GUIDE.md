# BMAD Guide for Coherent CLI Development

## Overview

This guide explains how to use BMAD (Breakthrough Method for Agile AI-Driven Development) to implement Coherent CLI. BMAD provides structured workflows and specialized AI agents for systematic development.

---

## Quick Start

### 1. Setup BMAD in Cursor

BMAD is already configured in this project. You can use agents via:

- **Cursor:** `@agent-name` (e.g., `@dev`, `@sm`)
- **Commands:** Start with `*` (e.g., `*help`, `*status`)

### 2. Available Agents

For Coherent CLI development, use:

- **`@sm`** (Scrum Master) - Creates stories from tasks
- **`@dev`** (Developer) - Implements code
- **`@qa`** (QA) - Tests and reviews
- **`@architect`** - Architecture decisions (if needed)

### 3. Workflow

```
1. Read PROJECT_TASKS.md
2. @sm creates story from task
3. @dev implements story
4. @qa reviews code
5. Repeat for next task
```

---

## Using BMAD with Coherent

### Reference Documents in Prompts

Always reference relevant docs:

```
@packages/docs/PROJECT_TASKS.md
@docs/architecture-doc.md
@docs/project-setup.md

Implement Task 1.2: CLI Boilerplate
```

### Task Implementation Pattern

**Step 1: Read Task**
```
@packages/docs/PROJECT_TASKS.md

What is Task 1.2? What are the acceptance criteria?
```

**Step 2: Create Story (SM Agent)**
```
@sm

Create story from Task 1.2: CLI Boilerplate
Reference: packages/docs/PROJECT_TASKS.md
```

**Step 3: Implement (Dev Agent)**
```
@dev

Implement story for Task 1.2
Follow acceptance criteria from PROJECT_TASKS.md
Use Commander.js as specified in project-setup.md
```

**Step 4: Review (QA Agent)**
```
@qa

Review implementation of Task 1.2
Check against acceptance criteria
```

---

## BMAD Commands

### Help
```
*help
```
Shows all available commands and agents

### Status
```
*status
```
Shows current context and progress

### Agent Switching
```
@dev
@sm
@qa
```
Switch to different agent

### Story Creation (SM)
```
*create
```
SM agent creates next story from tasks

### Story Implementation (Dev)
```
*develop-story
```
Dev agent implements current story

---

## Development Workflow

### Starting a New Task

1. **Read task from PROJECT_TASKS.md**
   ```
   @packages/docs/PROJECT_TASKS.md
   
   Show me Task 1.2 details
   ```

2. **Create story (SM agent)**
   ```
   @sm
   *create
   ```
   SM will create story from Task 1.2

3. **Review story**
   - Check acceptance criteria
   - Verify dependencies
   - Approve story

4. **Implement (Dev agent)**
   ```
   @dev
   *develop-story
   ```
   Dev will implement story step by step

5. **Test**
   ```bash
   pnpm typecheck
   pnpm test
   ```

6. **Review (QA agent)**
   ```
   @qa
   *review-qa
   ```
   QA reviews code quality

7. **Mark complete**
   - Update task status in PROJECT_TASKS.md
   - Commit changes
   - Move to next task

---

## Best Practices

### 1. Always Reference Docs

**Good:**
```
@packages/docs/PROJECT_TASKS.md
@docs/architecture-doc.md

Implement Task 1.2 following the architecture
```

**Bad:**
```
Implement CLI boilerplate
```
(No context, agent doesn't know requirements)

### 2. One Task at a Time

**Good:**
- Complete Task 1.2 fully
- Test it works
- Then move to Task 1.3

**Bad:**
- Start Task 1.2
- Jump to Task 1.3
- Leave both incomplete

### 3. Use Correct Agent

**Good:**
- `@sm` for story creation
- `@dev` for implementation
- `@qa` for review

**Bad:**
- Using `@sm` to write code
- Using `@dev` to create stories

### 4. Test After Each Task

**Good:**
```bash
# After Task 1.2
pnpm build
pnpm typecheck
node dist/index.js --help
```

**Bad:**
- Skip testing
- Accumulate broken code
- Fix everything at the end

### 5. Update Documentation

After completing a task:
- Update PROJECT_TASKS.md status
- Add notes if needed
- Document any deviations

---

## Common Patterns

### Pattern 1: Implementing a Command

```
@packages/docs/PROJECT_TASKS.md

Task 1.2: CLI Boilerplate

@dev
Implement init command using Commander.js
Reference: packages/docs/project-setup.md for tech stack
```

### Pattern 2: Adding a New Manager

```
@docs/architecture-doc.md

DesignSystemManager specification

@dev
Implement DesignSystemManager class
Use types from packages/core/src/types/design-system.ts
Follow architecture from architecture-doc.md
```

### Pattern 3: Fixing an Issue

```
@docs/architecture-doc.md

Current issue: Config validation fails

@dev
Fix config validation in DesignSystemManager
Check schema.ts for Zod schemas
```

---

## Troubleshooting

### Issue: Agent doesn't understand task

**Solution:**
- Reference PROJECT_TASKS.md explicitly
- Copy acceptance criteria
- Show relevant architecture sections

### Issue: Code doesn't match architecture

**Solution:**
- Re-read architecture-doc.md
- Show agent the specific section
- Ask for clarification

### Issue: Tests failing

**Solution:**
- Show error message
- Reference test requirements
- Ask @qa agent for help

### Issue: Dependencies missing

**Solution:**
- Check project-setup.md for tech stack
- Install missing packages
- Update package.json

---

## Task Dependencies

Tasks must be completed in order:

```
Task 1.1 (Setup) ✅
  ↓
Task 1.2 (CLI Boilerplate) 🚧
  ↓
Task 1.3 (Core Types)
  ↓
Task 1.4 (Discovery Agent)
  ↓
Task 1.5 (Claude API)
  ↓
... and so on
```

**Don't skip tasks!** Each builds on the previous.

---

## File Locations

### Documentation
- `packages/docs/PROJECT_TASKS.md` - Task list
- `docs/architecture-doc.md` - Architecture
- `docs/project-setup.md` - Tech stack
- `packages/docs/BMAD_GUIDE.md` - This file

### Source Code
- `packages/cli/src/` - CLI implementation
- `packages/core/src/` - Core engine

### Types
- `packages/core/src/types/design-system.ts` - All types

---

## Example: Complete Task Flow

### Task 1.2: CLI Boilerplate

**Step 1: Read task**
```
@packages/docs/PROJECT_TASKS.md

What is Task 1.2? Show acceptance criteria.
```

**Step 2: Create story**
```
@sm

Create story from Task 1.2
Acceptance criteria:
- CLI can be run: coherent --help
- Shows available commands
- Uses Commander.js
- Uses Chalk for colors
- Uses Ora for spinners
```

**Step 3: Implement**
```
@dev

Implement Task 1.2: CLI Boilerplate
- Install commander, chalk, ora
- Update src/index.ts with Commander.js
- Add commands: init, chat, preview, export
- Add colored output with Chalk
- Add loading spinners with Ora
```

**Step 4: Test**
```bash
cd packages/cli
pnpm install
pnpm build
node dist/index.js --help
```

**Step 5: Review**
```
@qa

Review Task 1.2 implementation
Check:
- All acceptance criteria met
- Code follows project-setup.md
- No TypeScript errors
```

**Step 6: Mark complete**
- Update PROJECT_TASKS.md: Task 1.2 ✅
- Commit: `feat(cli): add CLI boilerplate with Commander.js`
- Move to Task 1.3

---

## Tips

1. **Start new chat for each task** - Keeps context clean
2. **Reference docs explicitly** - Use `@` syntax
3. **Test incrementally** - Don't wait until end
4. **Ask questions** - If unclear, ask for clarification
5. **Follow acceptance criteria** - Don't add extra features

---

## Getting Help

- **BMAD docs:** `.bmad-core/` folder
- **Project docs:** `packages/docs/`
- **Architecture:** `docs/architecture-doc.md`
- **Tasks:** `packages/docs/PROJECT_TASKS.md`

---

**Remember:** BMAD is a tool to help you work systematically. The key is:
1. Read the task
2. Understand requirements
3. Implement step by step
4. Test and verify
5. Move to next task

**Good luck building Coherent CLI!** 🚀

---

**Last Updated:** 2025-01-26  
**For:** Coherent CLI Development Team
