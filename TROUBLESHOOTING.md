# Troubleshooting

Solutions to common issues you may encounter when using Coherent.

---

## Installation & Setup

### "command not found: coherent"

The CLI is not linked globally. Run:

```bash
cd coherent-design-method/packages/cli
pnpm link --global
```

Then verify: `coherent --version`

### "Not a Coherent project"

You're running a command in a directory without `design-system.config.ts`. Navigate to your project:

```bash
cd my-app
coherent preview
```

### "No API key found"

The `coherent chat` command requires an Anthropic API key. Set it:

```bash
# Option 1: .env file in your project
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# Option 2: Environment variable
export ANTHROPIC_API_KEY=sk-ant-...
```

Get a key at [console.anthropic.com](https://console.anthropic.com).

---

## AI Generation

### "AI response truncated (max_tokens reached)"

The AI tried to generate too much in a single call. This happens with complex multi-page requests.

**Solution:** Split your request into smaller pieces:

```bash
# Instead of this (too many pages at once):
coherent chat "create a massive app with 10 pages..."

# Do this:
coherent chat "create an app with home, about, and pricing pages"
coherent chat "add a dashboard page with stats"
coherent chat "add a settings page with profile form"
```

Coherent automatically splits 4+ pages into separate AI calls, but extremely complex prompts can still hit limits.

### "Failed to parse modification"

The AI returned invalid JSON. This occasionally happens with complex requests.

**Solution:** Try the same request again — AI responses vary. If it keeps failing, simplify your request:

```bash
# Too vague
coherent chat "make it better"

# More specific
coherent chat "add hover effects to all cards and increase section spacing"
```

### Pages look inconsistent across the site

When pages are generated in separate commands, they may not share the same visual style.

**Solution:**

```bash
# Option 1: Sync and regenerate
coherent sync    # captures current style patterns
coherent chat "update the pricing page to match the home page style"

# Option 2: Generate pages together
coherent chat "create home, about, and pricing pages"  # same style guaranteed
```

---

## Build & Preview

### "Module not found: @/components/ui/..."

A component is imported but doesn't exist. This can happen when AI references a component that wasn't installed.

**Solution:**

```bash
coherent fix     # auto-installs missing shadcn components
```

If the issue persists, install the specific component:

```bash
npx shadcn@latest add button    # replace 'button' with the missing component
```

### "Export ... doesn't exist in target module"

A component file exists but is missing sub-component exports (e.g., `TableBody`, `TabsList`).

**Solution:**

```bash
coherent fix     # regenerates component files with all exports
```

### Stale build cache errors

If you see strange Turbopack or webpack errors after changes:

```bash
rm -rf .next     # clear build cache
coherent preview # restart dev server
```

`coherent fix` also clears the build cache automatically.

### "Unexpected token" or syntax errors in generated pages

The AI occasionally produces code with syntax issues (unclosed strings, missing imports).

**Solution:**

```bash
coherent fix     # auto-fixes common syntax issues
```

If the fix doesn't resolve it, check the specific file mentioned in the error and fix manually.

---

## Design System

### Design System doesn't reflect my manual changes

After editing code in your editor, the Design System viewer shows outdated information.

**Solution:**

```bash
coherent sync    # updates DS from actual code
```

This extracts CSS variables, detects new components, captures style patterns, and regenerates the DS viewer.

### Shared components not showing in the viewer

Shared components must be registered in `coherent.components.json` to appear in the Design System.

```bash
coherent sync --components   # detects and registers unregistered components
coherent check               # shows unregistered components
```

### Two navigation bars visible

This happens when both the platform AppNav and a shared Header component exist.

**Solution:** AppNav auto-hides on user pages when a shared Header is registered. If it doesn't:

```bash
coherent fix     # reconciles component manifest
```

---

## Export & Deployment

### Export build fails

```bash
coherent export
```

If the build fails with ESLint or TypeScript errors, Coherent automatically patches `next.config.ts` to ignore them during export builds. If it still fails:

```bash
# Fix issues first
coherent fix

# Then export
coherent export
```

### "@/components" or "@/lib" warning during export

This warning is safe to ignore — these are local path aliases, not npm packages.

---

## Reverting Changes

### Want to undo the last `coherent chat`?

Coherent creates a backup before each generation:

```bash
coherent undo          # restore to state before last chat
coherent undo --list   # see available backups
```

---

## Still stuck?

1. Run `coherent check` for a full diagnostic report
2. Run `coherent fix` to auto-repair common issues
3. Clear build cache: `rm -rf .next`
4. [Open an issue](https://github.com/skovtun/coherent-design-method/issues) with the error message and steps to reproduce
