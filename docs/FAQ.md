# FAQ

User-facing answers to recurring questions. Separate from `docs/wiki/` on purpose — this file is documentation, not wiki knowledge. Wiki entries are auto-retrieved into code-generation prompts; FAQ prose would pollute that context.

When a question here reveals a **structural** insight about the product (a recurring bug, a decision, a model quirk), promote it to the right wiki bucket (`PATTERNS_JOURNAL.md`, `ADR/`, `MODEL_PROFILE.md`). This file stays focused on user-level answers.

---

## Why does Coherent CLI need an API key? I already pay for Claude Code.

Short answer: **Anthropic's Terms of Service prohibit it.** Using your Claude Code OAuth token from an external tool (like Coherent CLI) is explicitly disallowed and could flag your account.

See: [Anthropic authentication docs](https://code.claude.com/docs/en/authentication) · [claude-code #6536](https://github.com/anthropics/claude-code/issues/6536).

**What to do instead:**

Two modes are supported:

| Mode | When to use | API key? | Command |
|------|-------------|----------|---------|
| **Standalone CLI** | Unattended runs (CI, cron), API-spend account. | ✅ Yes | `coherent chat "..."` |
| **Claude Code skill** | You have Free/Pro/Max subscription, driving from inside Claude Code. | ❌ No | `/coherent-chat` (in Claude Code) |

In skill mode, your Claude Code session does the generation on your subscription (fully within ToS). Coherent contributes design constraints + deterministic validation (`coherent check`, `coherent fix`). No API key needed on our side.

**Setup:**

```bash
# Existing project on an older version
coherent update

# New project
coherent init
```

Then in Claude Code: `/coherent-chat "build a CRM dashboard"`.

Shipped in v0.8.0 — see `docs/CHANGELOG.md` for the full writeup.

---

## How is Coherent different from v0 / bolt.new / tasteui.dev / lovable?

Most AI UI tools generate pages. Coherent generates **systems**.

- **v0 / lovable / bolt.new:** one prompt, one page. Each generation is independent. If you ask for five pages you get five different aesthetics, five button styles, five "Sign In" buttons that don't link anywhere.
- **tasteui.dev:** named design systems as markdown skill files your agent reads as reference. Same semantic-injection approach as v0, just with richer starting aesthetics. No validators. No registered shared components. No cross-page consistency contract.
- **Coherent:** structured constraint system that runs **before** the AI writes code, and a deterministic quality validator that runs **after**. Five pages share the same header, footer, palette, typography, semantic tokens, and component registry. Change one design token and all five pages update. Add one shared component and it's reusable by ID (`CID-042`) everywhere.

Mental model: v0 is "AI that generates pages"; Coherent is "AI that generates design systems and the pages that follow from them."

---

## I ran `coherent chat` and got `Shared component CID-042 already exists` — what now?

The component registry prevents accidental duplicate components. Your options:

1. **Reuse:** if the existing `CID-042` fits, your new page should import from `@/components/shared/<kebab-name>` instead of regenerating the same pattern inline. `coherent chat` usually does this automatically — if it didn't, run `coherent check --shared` to see what exists.
2. **Modify:** if you want the new one to replace the old, use `coherent chat --component <id-or-name> "your changes"`.
3. **Extract a variant:** if the use case is genuinely different, rename your new one with a distinct suffix (e.g., `PricingCard` vs `PricingCardCompact`) and regenerate.

See `coherent.components.json` in your project for the current registry.

---

## Can I use Coherent without Next.js?

Not yet. Coherent generates Next.js 15 App Router projects with shadcn/ui, Tailwind v4, and a specific layout/token structure. Porting the generator to another framework is possible but not on the current roadmap — let us know in [issues](https://github.com/skovtun/coherent-design-method/issues) if you'd use it.

The underlying constraint system (`packages/cli/src/agents/design-constraints.ts`) is framework-agnostic prose, so a future adapter could reuse it.

---

## Where does Coherent store the design decisions it makes about my project?

Three places inside your project:

- **`design-system.config.ts`** — the explicit config: tokens (colors, spacing, typography), declared components, page list. This is the shipped artifact users see.
- **`coherent.components.json`** — the component registry: each shared component with a stable `CID-NNN` ID, props interface, and which pages import it. This is what prevents duplicates.
- **`.coherent/wiki/decisions.md`** — per-project design memory. Stable facts like "primary is amber, not indigo, because the mood phrase said 'energetic'" that future `coherent chat` runs should respect for consistency.

Decisions are inspectable (`cat .coherent/wiki/decisions.md`). If memory is driving a choice you don't like, you can edit the file or delete the relevant line.

---

## How do I contribute?

Open a PR or issue: [github.com/skovtun/coherent-design-method](https://github.com/skovtun/coherent-design-method).

If you hit a generation bug, a `coherent fix --journal` run captures the session as structured YAML. Attach that alongside the issue and we have everything we need to reproduce.
