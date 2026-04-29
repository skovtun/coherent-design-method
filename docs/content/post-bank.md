# Coherent — Post Bank

Generated 2026-04-29. ~30 outlines drawn from PATTERNS_JOURNAL, MODEL_PROFILE, CHANGELOG, ADRs, IDEAS_BACKLOG.

Voice reminder: builder-to-builder. Concrete file paths, line numbers, before/after, real numbers. Skeptic-grade evidence, no AI hype.

---

## PATTERNS_JOURNAL — 12 posts

---

### Post #1 — Three borders around one card

**Hook (first sentence):** AI gave me a card. Inside that card was another card. Inside that card was another card. All three had borders and shadows.
**Source:** PJ-001
**Format:** before/after screenshot post
**Length estimate:** short
**Audience hook:** designers — the "card-in-card" smell is the visual signature of careless AI output
**Outline:**
- Show the screenshot: three nested `border + rounded + shadow-sm` containers from `~/test-app` Budget Progress
- Why it happens: AI sees a parent Card, still wraps children in another border+shadow div
- The wording-only rule "one card per section" wasn't enough — we had to ban any element with `border + rounded + shadow-sm` class trio
- Shipped: v0.6.99 anti-pattern in CORE_CONSTRAINTS with BAD/GOOD examples
**Suggested CTA:** "What's your worst nested-card screenshot?"
**Why this works:** Card-in-card is universally recognizable, scrollable image grabs the eye, the "rule wording wasn't enough" twist is a real lesson.

---

### Post #2 — "Chart visualization would go here"

**Hook (first sentence):** AI rendered "Chart visualization would go here" — as actual text, on the dashboard, in production.
**Source:** PJ-002
**Format:** thread of 4
**Length estimate:** thread
**Audience hook:** AI builders, frontend devs — placeholder text leaking through is the #1 "AI is fake" tell
**Outline:**
- Setup: dashboard generated, looks fine at glance, then you read it: "Category breakdown chart would go here"
- Root cause: no chart library guidance in constraints. AI fell back to placeholder English
- v0.6.99 fix: shadcn Chart + recharts golden pattern, chart-1..5 CSS vars, fixed h-[200/300/400]
- Plus two validators: `CHART_PLACEHOLDER` regex + `CHART_EMPTY_BOX` for empty `<div className="h-[X] bg-muted"/>`
- v0.7.17 autofix: animated 7-bar skeleton fallback when prevention fails
**Suggested CTA:** Link to RULES_DATA_DISPLAY in source
**Why this works:** Anyone shipping AI UIs has hit a placeholder leak — the screenshot proves it's everyone's bug, not just yours.

---

### Post #3 — `--$59.99` and the double-sign disease

**Hook (first sentence):** Recent Transactions showed `--$59.99` for an expense and `++$4,850.00` for income. Both signs. Twice.
**Source:** PJ-003
**Format:** single post
**Length estimate:** short
**Audience hook:** frontend devs, anyone who's ever Intl.NumberFormat'd at 2am
**Outline:**
- Concrete code that broke it: `{amount < 0 ? '-' : '+'}$\{Math.abs(amount).toFixed(2)}` — but `amount` already had its sign
- Why AI does this: it reaches for the safer-looking explicit prefix, doesn't trust `Intl.NumberFormat`
- DOUBLE_SIGN validator: regex on `\?\s*['"][+\-]['"]\s*:\s*['"][+\-]['"]`
- v0.7.10-11: tiered to error when `Math.abs` detected nearby + autofix for simple cases (~60% coverage)
**Suggested CTA:** "Use `Intl.NumberFormat({ signDisplay: 'always' })`. That's the line."
**Why this works:** The `--$59.99` is darkly funny and instantly readable. Specific bug, specific regex, specific fix.

---

### Post #4 — 5 column headers, 2 columns of data

**Hook (first sentence):** AI generated a transactions table with 5 column headers — Overview, Account, Category, Amount, Date — and only filled in Overview and Amount. The other three columns: blank.
**Source:** PJ-004
**Format:** before/after screenshot post
**Length estimate:** medium
**Audience hook:** anyone who's ever debugged off-by-one in long JSX
**Outline:**
- Setup: AI wrote `<TableHead>` list and `<TableCell>` list independently. No structural guarantee they stayed in sync
- Caught with `TABLE_COLUMN_MISMATCH` validator (counts heads vs first body row cells)
- Real fix in v0.7.0: structural rule — define `columns: ColumnDef[]` once, map over it for header AND body
- That makes the bug impossible by construction
**Suggested CTA:** "Constraint by construction beats validation by regex. Every time."
**Why this works:** The "headers don't match cells" bug is universal across data-heavy AI output. Shows the difference between detection and structural prevention.

---

### Post #5 — `--page accounts` regenerated 16 unrelated pages

**Hook (first sentence):** I ran `coherent chat --page accounts "fix the table"`. It regenerated 16 pages, including /reports and /investments. Took 5+ minutes. Did not touch the accounts page.
**Source:** PJ-005
**Format:** thread of 3
**Length estimate:** medium
**Audience hook:** tooling enthusiasts, CLI builders — fuzzy matching gone wrong
**Outline:**
- Compound bug: "accounts" (plural) didn't match "/account" (singular). Fall-through cascaded to full pipeline
- Root cause: `resolveTargetFlags` returned null → free-text path → RESPONSE_TRUNCATED → fell through to `splitGeneratePages` → architecture replan
- Fix v0.6.99: `resolvePageByFuzzyMatch` (plural↔singular, prefix, route-segment fallback)
- Fix v0.7.0: `--page X` skip-archplan guard. Print clear error instead of cascading
- Lesson: silent fall-through in CLI tools is worse than failing loud
**Suggested CTA:** "Fail loudly. Especially in tools that touch the filesystem."
**Why this works:** "Tool regenerated everything when I asked it to fix one thing" is a familiar AI-tool failure mode that resonates immediately.

---

### Post #6 — Three filter-bar bugs in 48 hours

**Hook (first sentence):** Same AI, same prompt template, three different filter bars in two days — each broken in a different way.
**Source:** PJ-006 (drove ADR-0001)
**Format:** thread of 5
**Length estimate:** thread
**Audience hook:** designers — this is the moment "rules" break and golden patterns are born
**Outline:**
- Bug 6a: duplicate "All Categories" Select + "Categories" Button, uneven heights
- Bug 6b: search input 70% width, search icon BELOW the input as a sibling, filter funnel clipped off-screen
- Word-based rule "flex-wrap items-center gap-3" gave AI too much latitude. Each detail (search icon absolute, pl-9, h-10) was stated once but not enforced
- Fix v0.6.100: 3 validators (`FILTER_DUPLICATE`, `FILTER_HEIGHT_MISMATCH`, `SEARCH_ICON_MISPLACED`)
- Real fix v0.7.0: golden pattern `templates/patterns/filter-bar.tsx` injected verbatim when "filter" keyword matches. Drove ADR-0001
- Insight: rule of arbitrary specificity gets interpreted loosely. Patterns get copied
**Suggested CTA:** Link to ADR-0001
**Why this works:** "Same prompt, three different bugs in two days" is the punchline that motivated the whole golden-patterns architectural shift. Strong narrative arc.

---

### Post #7 — Stat cards that don't match across pages

**Hook (first sentence):** /reports had plain icons and inline trend text. /investments had blue-tinted square icons and Badge pills for trends. Same app, same page type, two different stat cards.
**Source:** PJ-007
**Format:** before/after screenshot post
**Length estimate:** medium
**Audience hook:** designers, design system builders — cross-page consistency is hard
**Outline:**
- Visual evidence: side-by-side screenshot of the two stat-card variants
- Root cause: `plan.sharedComponents.StatCard.usedBy` didn't include `/reports`. Phase 6 generator freelanced a fresh design
- Deeper issue: `coherent check` validates pages individually. No cross-page consistency view
- Fix v0.7.21: `INCONSISTENT_CARD` cross-page validator — clusters stat-card signatures, warns minority variants
- Open work: plan-side prevention (auto-extend `usedBy`) deferred — validator catches drift, plan still permits it
**Suggested CTA:** "How do you handle cross-page consistency in your design system?"
**Why this works:** Designers immediately recognize the "inconsistency tax" of generated UIs. Concrete fix + open question.

---

### Post #8 — A modal that ate the whole 2400px screen

**Hook (first sentence):** AI rendered a Create Budget dialog edge-to-edge across a 2400px screen. Title centered on full width, content squashed left 20%, ocean of empty space right.
**Source:** PJ-008
**Format:** before/after screenshot post
**Length estimate:** short
**Audience hook:** frontend devs, anyone who's ever forgotten `max-w-md`
**Outline:**
- The screenshot — full-width modal looks comically wrong on widescreen
- Root cause: `<DialogContent>` with no `max-w` class, OR custom `<div className="fixed inset-0">` overlay without shadcn defaults
- Fix v0.7.1: golden pattern `templates/patterns/dialog.tsx` + OVERLAYS section in CORE
- Validators: `DIALOG_FULL_WIDTH`, `DIALOG_CUSTOM_OVERLAY`
**Suggested CTA:** "Show me your AI's worst modal."
**Why this works:** Visceral screenshot. Universal "I forgot max-w" feeling. Quick post.

---

### Post #9 — "Delete account page" created a delete-account feature page

**Hook (first sentence):** I typed `coherent chat "delete account page"`. It created a /settings/delete-account page — Dialog, Danger Zone, type-to-confirm, the works. The Account page I wanted deleted? Still there.
**Source:** PJ-009 (drove ADR-0003)
**Format:** thread of 5
**Length estimate:** thread
**Audience hook:** AI builders, anyone who's seen LLMs misinterpret intent
**Outline:**
- The bug is funny but the lesson is hard: schema affordances drive interpretation
- AI read "delete account page" as feature spec, not operation, because the `ModificationRequest` schema only had add-page/update-page — no delete-page existed
- Without a delete-page schema affordance, the only valid interpretation was "build a delete-account feature"
- Fix took 6 patches: v0.7.5 schema + handler, v0.7.7 destructive pre-parser, v0.7.8 synonym expansion (drop/trash/erase), v0.7.9-10 nav cleanup
- Plus: dry-run by default, `--force` to confirm, `.coherent/backups/` undo
- Lesson: when LLM interpretation is ambiguous, the schema decides. Add the affordance you want it to use
**Suggested CTA:** Link to ADR-0003
**Why this works:** Most relatable LLM bug ever — "you did the opposite of what I asked." Pivot to architectural insight about schema affordances.

---

### Post #10 — DS tokens page lied about the brand color

**Hook (first sentence):** Our landing site shipped a /design-system/tokens/colors page showing blue+purple+orange. The actual brand is green. The DS page contradicted the live UI.
**Source:** PJ-010
**Format:** thread of 4
**Length estimate:** thread
**Audience hook:** design-system builders — the silent drift between config and live CSS
**Outline:**
- Setup: `design-system.config.ts` is a JSON snapshot from scaffold time. DS tokens API serves the snapshot
- Users customize brand by editing CSS vars in `globals.css`/`layout.tsx` (the recommended pattern). No sync back to config
- Result: DS tokens page shows scaffold defaults; rest of UI uses real CSS vars. Public landing site contradicted itself
- Fix this project: rewrote /tokens/colors/page.tsx to read live `document.styleSheets` `:root` + `.dark` rules. Config snapshot becomes fallback
- Platform fix proposed (M13): scaffolded DS pages should read live CSS vars by default. Config shrinks to metadata
**Suggested CTA:** Link to PJ-010 entry on getcoherent.design
**Why this works:** Design-system maintainers have all hit token drift. The DS page contradicting itself is a punchy concrete instance.

---

### Post #11 — `coherent` extensionless bin failed every npm install -g on Node 18+

**Hook (first sentence):** `npm install -g @getcoherent/cli` succeeded. Then `coherent init` crashed with `ERR_UNKNOWN_FILE_EXTENSION`. The first command in our Getting Started flow.
**Source:** PJ-011
**Format:** thread of 4
**Length estimate:** medium
**Audience hook:** devs, package authors — the ESM extensionless-bin trap
**Outline:**
- Concrete error: `TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension "" for /usr/local/lib/node_modules/@getcoherent/cli/bin/coherent`
- Why: `package.json` had `"type": "module"` + `"bin": "./bin/coherent"` (no extension). Node ESM refuses extensionless files
- Why dev never caught it: `pnpm link` symlinks tolerate extensionless files. Only fresh `npm install -g` exposes the bug
- Fix v0.7.28: rename `bin/coherent` → `bin/coherent.js`, point bin field at the renamed file, add `"engines": { "node": ">=18" }`
- Test gap: no `npm pack → npm install -g <tgz>` smoke test on a clean Node image. Adding it as a release-gate would have caught this pre-publish
**Suggested CTA:** "If you ship an ESM CLI, add a clean-image install smoke test to your release workflow."
**Why this works:** Brutal first-impression bug. Specific error code that other ESM authors will Ctrl+F for. Actionable test-gap takeaway.

---

### Post #12 — `<Button>` as a row wrapper inherits 36px CVA defaults

**Hook (first sentence):** Notifications page: every list item collapsed into a 36px row. Avatar + multi-line title + timestamp piled on top of each other. Looked broken. Class names looked fine.
**Source:** PJ-012
**Format:** thread of 5
**Length estimate:** thread
**Audience hook:** frontend devs, shadcn users — CVA-defaults invisibility
**Outline:**
- Two failure modes, same root cause: notifications page rows + calendar page cells, both as `<Button>`
- AI grabs `<Button>` for "clickable wrapper" — gets keyboard + focus + hover for free
- shadcn's Button CVA bakes `inline-flex items-center justify-center gap-2 whitespace-nowrap h-9`. Adding `min-h-[92px]` does NOT override CVA
- The broken classes are NOT in the page source. They come from the imported component. AI literally cannot see them
- Fix v0.14.4: BUTTON AS CONTAINER section in CORE + 2 validators (BUTTON_AS_ROW_NO_HEIGHT_OVERRIDE, BUTTON_AS_CELL_NO_VERTICAL_LAYOUT) + conservative auto-fix for the cell case
- Subtle: regression test pinned the case where `cellClasses` is a const array assigned to className — tag-only scan misses it. Fixed by scanning the whole `.map()` block scope
**Suggested CTA:** "Use SidebarMenuButton/TabsTrigger for nav. If you must use Button as a wrapper, override `h-auto flex-col items-start min-w-0 whitespace-normal` explicitly."
**Why this works:** Shadcn users will all recognize the CVA-invisibility trap. Multi-step bug + multi-layer fix shows real production debugging.

---

## MODEL_PROFILE — 5 posts

---

### Post #13 — Claude wraps everything in a `<div>` twice

**Hook (first sentence):** Give Claude any layout instruction. It will wrap your content in a `<div>`. Then it will wrap THAT in another `<div>` "for alignment".
**Source:** MODEL_PROFILE — Consistent biases
**Format:** single post
**Length estimate:** short
**Audience hook:** AI builders, frontend devs
**Outline:**
- The bias is so consistent we had to add explicit "no nested bordered containers" rules
- It's not random — it's pattern completion at temperature, not spec execution
- Concrete consequence: card-in-card-in-card (PJ-001)
- The rule we shipped: ban any element with `border + rounded + shadow-sm` class trio
**Suggested CTA:** "Other Claude biases you've measured?"
**Why this works:** Specific, observable, repeatable bias. Direct counter-rule in production.

---

### Post #14 — Why every AI filter bar has weird gaps

**Hook (first sentence):** Claude's natural impulse for "put these in a row" is `justify-between`. That's why every AI-generated filter bar has scattered controls with huge empty space between them.
**Source:** MODEL_PROFILE — favours `justify-between` for filter bars
**Format:** before/after screenshot post
**Length estimate:** short
**Audience hook:** designers
**Outline:**
- The `justify-between` instinct: search input on the left, "Filters" button stranded on the right with 600px of empty space between them
- Right answer: `flex-wrap items-center gap-3` — controls cluster with consistent spacing
- We had to specify this explicitly in the golden pattern. Otherwise AI defaults
- Adjacent bias: it places icons as JSX siblings, not absolute children. Same pattern
**Suggested CTA:** "What's your filter bar pattern?"
**Why this works:** Designers see this in every AI-generated dashboard. Naming the bias makes it un-see-able.

---

### Post #15 — AI mixes form-control heights even when it knows better

**Hook (first sentence):** Default Input is h-10. Default Button is h-10. Default SelectTrigger is h-10. Yet Claude will set heights on some, leave others default, and produce visual mismatch.
**Source:** MODEL_PROFILE — Mixes heights on form controls
**Format:** single post
**Length estimate:** short
**Audience hook:** designers, form-builders
**Outline:**
- Same control library, same default heights — STILL produces visual mismatch
- Why: model freelances some, leaves others. No global "all controls match" enforcement at temperature
- Coherent fix: always specify h-10 on every control in the golden pattern, even when redundant
- Redundancy beats uniformity-by-implication
**Suggested CTA:** none, just observation
**Why this works:** Counter-intuitive — even when defaults agree, output disagrees. Observable.

---

### Post #16 — Claude truncates at exactly 16,384 tokens of TSX

**Hook (first sentence):** ~300 lines of generated TSX is the wall. At `max_tokens=16384`, Claude cuts off mid-JSX. Symptom: `Unterminated string` and a half-rendered page.
**Source:** MODEL_PROFILE — Truncates on long pages
**Format:** thread of 3
**Length estimate:** medium
**Audience hook:** AI builders, anyone shipping LLM-generated code
**Outline:**
- The number is real. 16,384 output tokens. ~300 lines of TSX
- Symptom layer 1: `Unterminated string` JSX parse error
- Symptom layer 2: silent cascade — chat falls through to full-project regen (see PJ-005)
- Mitigation: `--page X` now fails fast with guidance instead of cascading. Surgical edits cap blast radius
- Bigger lesson: response-time is proportional to OUTPUT tokens, not input. 1k out ~ 8s, 16k out ~ 90s. Plan accordingly
**Suggested CTA:** "What's your truncation strategy?"
**Why this works:** Concrete numbers. Truncation is the most universal LLM bug; few people post the exact threshold.

---

### Post #17 — "Improve" is the most dangerous word in AI prompts

**Hook (first sentence):** Ask Claude to "fix the table". It will fix the table, then redesign the header, then add an empty state, then tweak the badge variants you didn't ask about.
**Source:** MODEL_PROFILE — "Claude will often improve an instruction"
**Format:** thread of 3
**Length estimate:** medium
**Audience hook:** AI builders, prompt engineers
**Outline:**
- This is the #1 reason AI-edited code drifts. Asked to fix one thing, model "improves" everything in scope
- Mitigation v0.7.2: `editPageCode()` minimal-diff path. Feeds only the relevant section + instruction. Returns patched section. Merges back
- Mitigation v0.7.20: surgical `--page X` edits with section-only context
- Lesson: full-page regen = blast radius is the whole file. Surgical = blast radius is the section
- Bonus quirk: Claude struggles with diff instructions. "Add date range to the filter" often replaces the whole filter. "End state" descriptions work better than "transformation" descriptions
**Suggested CTA:** "Describe the end state, not the transformation."
**Why this works:** Resonates instantly with anyone who's edited code via LLM. Practical mitigation pattern.

---

## CHANGELOG — 6 posts

---

### Post #18 — v0.14.0: when AI code passes lint, tests, AND CI — and is still visually broken

**Hook (first sentence):** The Notifications page passed every CI gate. Lint clean. Tests green. Build succeeded. And every list item rendered as a solid blue block of unreadable text.
**Source:** CHANGELOG v0.14.0 (Visual Sanity Layer v1)
**Format:** thread of 5
**Length estimate:** thread
**Audience hook:** AI builders, anyone shipping AI-generated UI to users
**Outline:**
- Two reproducible bugs from 2026-04-27/28 dogfood: notifications page bg-primary on parents, calendar page half-blue with "+2 more" misplaced
- Both passed every existing gate. The gap: code-correctness validation ≠ user-perceived quality
- v0.14.0 closes the gap with belt + suspenders: 5 new CORE rules + 3 deterministic validators
- Validators: STUCK_ON_SELECTION (every list item ends up looking selected), CALENDAR_OVER_SELECTED (4+ unconditional bg-primary in 60-line window), CELL_OVERFLOW_NO_CONTAIN (event arrays never use truncate/line-clamp)
- Codex pre-impl gate caught the framing: "rules first, validators later" was insufficient because the failure already escaped compile/lint. Probabilistic prevention alone wasn't enough
**Suggested CTA:** "What's your visual-quality gate?"
**Why this works:** "Passes every gate, still broken" is the most universal AI-shipping pain. Multi-layer fix shows real engineering.

---

### Post #19 — Three patches in 24 hours to catch the actual #1 visual bug

**Hook (first sentence):** v0.14.0 shipped 3 new validators and was silent on the very pages I wrote them for. v0.14.1 caught it. v0.14.2 added the autofix. v0.14.3 fixed the false positive. v0.14.4 caught the OTHER pattern.
**Source:** CHANGELOG v0.14.1 → v0.14.4
**Format:** thread of 6
**Length estimate:** thread
**Audience hook:** tooling enthusiasts, anyone running adversarial dogfood
**Outline:**
- v0.14.0 STUCK_ON_SELECTION searched for literal `bg-primary` strings in className. Found nothing — because bg came from the variant DEFAULT (invisible to text matching)
- v0.14.1: BUTTON_NO_VARIANT_IN_MAP. Flag `<Button>` inside `.map()` without explicit `variant=` prop. Severity error (low false-positive risk)
- v0.14.2: autofix. Inserts `variant="ghost"` automatically. Why ghost: 80% of mapped Button usage is list rows / cell wrappers
- v0.14.3: false positive in landing/page.tsx — regex was unbounded `[\s\S]*?<Button`. Fixed with bounded lookahead `(?=</Button>|</li>|</div>|\)\s*[},])`
- v0.14.4: OTHER pattern (CVA height defaults). Two more validators. Saw PJ-012
- Iterative ship: 4 patches, ~1675 → ~1691 tests, real-page verification each time
**Suggested CTA:** "Adversarial dogfood after every release. Bugs hide in the gap between fixture and reality."
**Why this works:** Honest "I shipped, missed the actual bug, iterated" arc. Real patch-by-patch evidence. Strong takeaway about dogfood discipline.

---

### Post #20 — v0.13.0: when CoherentError survives cross-package boundaries

**Hook (first sentence):** Pre-v0.13.0, `isCoherentError()` claimed to be a "structural marker". The implementation was `instanceof CoherentError`. That works in tests. It does not work across npm dependency hoisting.
**Source:** CHANGELOG v0.13.0
**Format:** thread of 4
**Length estimate:** medium
**Audience hook:** TypeScript devs, monorepo authors
**Outline:**
- The bug shape: typed error thrown from `@getcoherent/core`, caught in `@getcoherent/cli`. After dual-install or dependency hoist, `instanceof` returns false. Error is treated as generic. `.fix` and `.docsUrl` lost
- v0.13.0 fix: actual structural check (`name === 'CoherentError'` + code matches `/^COHERENT_E\d{3}$/` + fix is string + docsUrl is string)
- Wired CoherentError surfacing at 4 boundary sites: top-level CLI, chat command, _phase outer catch, applier wrapper
- Plus: centralized `renderCliError(err, {debug, isTty})` helper
- Plus: publish.yml dist-tag detection (`-rc.N` publishes to `next` instead of `latest`)
- The adversarial subagent caught 7 issues codex missed, including this one
**Suggested CTA:** "If you have typed errors crossing package boundaries — your `instanceof` works in tests AND fails in production. Test with dual-install."
**Why this works:** Technical depth. The instanceof-vs-structural distinction is a trap most TS authors haven't hit yet. Practical, specific, actionable.

---

### Post #21 — v0.12.0: killing parity drift structurally instead of patch-by-patch

**Hook (first sentence):** v0.11.0 → v0.11.5 was 6 hotfixes in 24 hours. Every one patched a different symptom of the same architectural drift between two rails.
**Source:** CHANGELOG v0.12.0
**Format:** thread of 5
**Length estimate:** thread
**Audience hook:** architects, anyone running parallel implementations
**Outline:**
- Two rails: API rail (`coherent chat`) and skill rail (`/coherent-chat` via Claude Code). Both apply `ModificationRequest` types
- Drift class: skill rail handled SUBSET. delete-page silently dropped, AI-dependent requests went nowhere
- v0.12.0 structural fix: `apply-requests/` shared module owns dispatch contract for both rails
- 6 deterministic types route through `dispatchDeterministic`. 5 AI-dependent types route through `dispatchAi` with `applyMode: 'with-ai' | 'no-new-ai'` enforcement
- Skill rail's no-AI mode now THROWS `COHERENT_E007` on un-pre-populated AI requests instead of silently dropping
- Fixtures pin behavior. Parity-gate test catches future drift. ~2700 LoC of shared module replaces ~110 lines of skill-private duplicates
**Suggested CTA:** "Parity by duplication is branding, not substance."
**Why this works:** "6 hotfixes patching the same drift" is a universal architectural lesson. Concrete drift-class kill is rare to see articulated.

---

### Post #22 — v0.13.8: `coherent fix` killed the dev server every time

**Hook (first sentence):** `/coherent-chat` ran `coherent fix` as its post-apply step. The next request to localhost:3000 returned 500. Every time.
**Source:** CHANGELOG v0.13.8 → v0.13.9
**Format:** thread of 4
**Length estimate:** medium
**Audience hook:** Next.js devs, anyone running dev servers behind tools
**Outline:**
- Root cause: `coherent fix` step 1 unconditionally `rmSync('.next/', {recursive: true, force: true})`. Turbopack's in-memory state still pointed at on-disk files. Cache wipe broke the running preview
- v0.13.8 fix: dev-server detection. Bind probe on ports 3000-3010 with `net.createServer().listen()`. EADDRINUSE → skip cache clear
- v0.13.9: detection didn't work. Next.js dev server binds to `::` (IPv6 wildcard) or `0.0.0.0`, different address family from `127.0.0.1` probe. False negative
- v0.13.9 real fix: switch to `net.connect()` probe. localhost resolves to both 127.0.0.1 and ::1, Node tries them in order. 300ms timeout
- Lesson: bind-probe and connect-probe are NOT the same. Connect-probe is the right tool for "is something listening here?"
**Suggested CTA:** "Connect-probe, not bind-probe. Different IP families, different result."
**Why this works:** Dev-server-port-detection is universal. The address-family gotcha is genuinely subtle. Two-patch arc shows real debugging.

---

### Post #23 — v0.13.10: an autofix that wrote invalid TSX to user files

**Hook (first sentence):** `coherent fix` step 7 corrupted JSX. Before: `<Button size="icon" onClick={() => stepMonth(-1)}>`. After: `<Button size="icon" onClick={() = className="..." > stepMonth(-1)}>`. Invalid TSX. Written to user files.
**Source:** CHANGELOG v0.13.10
**Format:** thread of 3
**Length estimate:** medium
**Audience hook:** anyone who's ever written a regex-based code mod
**Outline:**
- The regex `<...size="icon"[^>]*>` stops at the FIRST `>` — including the `>` inside `() =>`
- className insertion landed inside the arrow body. Wrote invalid TSX to user files. User caught it via manual edit
- v0.13.10 mitigation: brace/paren balance check on the captured `attrs` slice. If `{`/`}` or `(`/`)` are unbalanced, regex truncated mid-expression — fix bails (returns element untouched)
- Validator still flags the issue; user can fix manually. Better than corrupted output
- Tests pin the corruption pattern + bail behavior
**Suggested CTA:** "If your code mod uses regex on JSX, balance-check before you write."
**Why this works:** Visceral "corrupted user files" headline. Specific failure mode. Specific mitigation. Universal "regex on code is dangerous" lesson.

---

## ADRs — 4 posts

---

### Post #24 — ADR-0001: golden patterns over word-based rules

**Hook (first sentence):** We had a 5400-token rule system. Claude still got filter bars wrong three times in two days. We rewrote how we tell the AI what to build.
**Source:** ADR-0001
**Format:** thread of 5
**Length estimate:** thread
**Audience hook:** prompt engineers, AI builders, design-system authors
**Outline:**
- The rule that kept failing: "FILTER BAR / TOOLBAR: ONE row on desktop: `<div className="flex flex-wrap items-center gap-3 mb-4">...`. Search flex-1. All controls h-10. Search icon inside relative wrapper with pl-9 on Input."
- Read it. It's precise. AI still produced 3 different broken filter bars
- Insight: word-based rules of arbitrary specificity get interpreted loosely. The LLM is pattern-completing at temperature, not executing a spec
- Decision v0.7.0: shift to GOLDEN PATTERNS. Real, working `.tsx` files at `templates/patterns/*.tsx`. Inlined as strings. Injected verbatim under "GOLDEN PATTERN REFERENCES (copy STRUCTURE exactly)"
- Word rules stay — but become CONSTRAINTS ON DEVIATION, not full recipes. "use shadcn Button variant, prefer h-10" — the pattern file is the demonstration
- Cost: scoped per keyword match. Base prompt only grows ~50-100 tokens per loaded pattern
**Suggested CTA:** Link to golden-patterns.ts source
**Why this works:** Punchy "rule failed three times → architectural shift" arc. Specific token costs. Counter-intuitive insight (more specific rules don't help).

---

### Post #25 — ADR-0005: when chat.ts had to collapse from 1569 lines to ~150

**Hook (first sentence):** chat.ts was 1569 lines. It inlined argument parsing, lock acquire, preflight, the 6-phase split-generator loop, the post-AI apply stack, release. Adding a second rail meant either duplicating it OR collapsing it.
**Source:** ADR-0005
**Format:** thread of 4
**Length estimate:** medium
**Audience hook:** architects, anyone running parallel rails
**Outline:**
- Two rails: API (`coherent chat` in-process) and skill (`/coherent-chat` via Claude Code, multi-process subcommands). Both must produce identical files
- Monolith couldn't decompose. Every step held in one closure. Skill rail couldn't call into it from a separate process
- "Parity by duplication" = guaranteed drift from the first post-release bugfix. Rejected
- Decision: collapse chat.ts into a thin facade over `runPipeline`. `sessionStart` (pre-AI) + `runPipeline` (phases) + `sessionEnd` (post-AI appliers). Both rails share lifecycle
- 1569 lines → ~150 lines. Remaining content is strictly UX glue (spinner, heartbeat, retry hooks)
- Tier 1 parity harness compares byte-identical output between rails for canonical intents. Real correctness claim
**Suggested CTA:** "Parity becomes code-shared, not code-duplicated."
**Why this works:** Strong before/after numbers. Universal "monolith vs facade" architectural lesson. Specific motivating constraint (multi-process).

---

### Post #26 — ADR-0007: codex consult + adversarial subagent saved 6+ ships

**Hook (first sentence):** Cross-cutting changes that ship without an external-perspective gate cause downstream pain. v0.7.6 had a silent-coerce regression. v0.11 line had 6 hotfixes in 24h. v0.12.0 caught silent-drop in adversarial review. v0.13.0 reinvented existing code, caught in 5 minutes by adversarial subagent.
**Source:** ADR-0007
**Format:** thread of 5
**Length estimate:** thread
**Audience hook:** anyone shipping cross-cutting code
**Outline:**
- Pattern: codex consult (external model perspective) catches some failure modes. Fresh-context adversarial subagent (literally a new agent with no session history) catches the rest
- Either alone: insufficient. Both together: decisive across 5+ cycles
- Gate criteria: both rails, phase-engine appliers, init/scaffold lifecycle, anything reading `dsm.config` for a derived signal, supply-chain integration, CI workflows, new top-level modules, cross-rail message format
- Cost: ~$2-3 in tokens, ~1-1.5h wall time per gated change
- Cost of skipping: a single P1 = release tag rollback or hotfix. Six hotfixes = 24h + trust damage. Worst case = npm-unpublish window expires (24h) and only deprecate-forward-fix is possible
- Save trail: 5 cycles validated. P1 shipping rate dropped to near-zero across the 3 cycles since dual-gate became standard
**Suggested CTA:** "If a change touches both rails or a workflow, run codex + adversarial review BEFORE writing code."
**Why this works:** Rare to see real save-trail data on dev process changes. Concrete gate criteria + dollar cost. Strong "skipping is more expensive than running" thesis.

---

### Post #27 — ADR-0003: how a destructive operation gets safe

**Hook (first sentence):** Adding `delete-page` to Coherent took 6 patches. Not because deletion is hard, but because "delete the X page" is ambiguous to LLMs and dangerous in practice.
**Source:** ADR-0003
**Format:** thread of 4
**Length estimate:** medium
**Audience hook:** tool builders, anyone exposing destructive ops to LLM input
**Outline:**
- Three concerns: reversibility (silent nuke of user work), prompt injection (malicious source pasting "delete X"), semantic ambiguity (delete/remove/drop/trash/erase)
- v0.7.5: schema + handler. Dry-run by default. `--force` to confirm. `.coherent/backups/` for undo
- v0.7.7: destructive pre-parser teaches "delete X page" → operation, not feature. Prompt-injection guard
- v0.7.8: synonym expansion (drop/trash/erase). Injection guard hardening
- v0.7.9-10: nav cleanup on delete-page + broader auto-fix on remaining nav entries
- Lesson: when LLM intent is ambiguous, schema affordances decide. Add the affordance you want it to use, then layer safety
**Suggested CTA:** "What's your destructive-op safety pattern?"
**Why this works:** "Took 6 patches" is honest and specific. Translates beyond Coherent — anyone shipping destructive ops behind LLMs faces these.

---

## IDEAS_BACKLOG — 3 posts

---

### Post #28 — What if `coherent preview` showed live validator badges on the page?

**Hook (first sentence):** Imagine: you generate a page. While you preview it, colored badges hover over the broken parts — STUCK_ON_SELECTION here, CELL_OVERFLOW_NO_CONTAIN there. Live, in your dev browser.
**Source:** IDEAS_BACKLOG M5 (deferred)
**Format:** single post
**Length estimate:** short
**Audience hook:** designers, AI builders — "what should we build next" teaser
**Outline:**
- Today: `coherent check` runs validators in the terminal. You see codes. You map codes to pages. You navigate to pages. You see what's broken
- Idea: in `coherent preview`, overlay colored badges directly on the rendered page. Instant visual feedback. Click a badge → see the rule + suggested fix
- Blocker: requires Playwright or iframe instrumentation. Deferred to v0.8.x
- The point of validators is closing the loop between "AI generated this" and "user sees it broken". Live overlay closes it tighter
**Suggested CTA:** "Would this make AI-generated UI debugging better, or just noisier?"
**Why this works:** Concrete future-product image. Deferred-but-real idea. Invites feedback before building.

---

### Post #29 — TasteUI ships 20 named aesthetics. Coherent ships 8. Different bets.

**Hook (first sentence):** TasteUI ships 20 named aesthetics — neo-brutalist, Swiss, wabi-sabi, Obsidian-lime, midnight-editorial. Coherent ships 8 atmospheres. They're ahead on catalog. We're ahead on enforcement.
**Source:** IDEAS_BACKLOG R5 (research)
**Format:** thread of 3
**Length estimate:** medium
**Audience hook:** AI builders, design-system enthusiasts
**Outline:**
- TasteUI format: plain markdown SKILL.md. Visual philosophy + hex palette w/ semantic roles + typography + spacing + shadows + motion + components, each with rationales. Semantic injection — agent reads as reference. No structured tuple, no validators, no tier system
- Validates the F9/Atmosphere pivot — 20 aesthetics on market = ceiling-problem real
- Coherent's moat: validators + deterministic floor + tier-injection. Catalog can be small if the floor is high
- Risk of pulling directly: format mismatch (soft markdown vs typed tuple), community-contributed = quality variance, semantic-only injection re-imports the slop problem validators exist to solve
- Strategic read: research corpus, not dependency. Read 10-15 SKILL.md files, extract patterns, author native Coherent atmospheres in structured tuple format
**Suggested CTA:** "Catalog vs floor — which bet do you make?"
**Why this works:** Names a competitor specifically and frames the strategic difference honestly. Most "AI design tool" posts are tribal; this is positional.

---

### Post #30 — `coherent diff`: what just happened?

**Hook (first sentence):** After a chat that changed many files, "what did the AI just do" deserves a one-liner answer. Not a scroll-back through 30 lines of CLI output.
**Source:** IDEAS_BACKLOG N2 (open)
**Format:** single post
**Length estimate:** short
**Audience hook:** CLI users, devs
**Outline:**
- Today: chat changes 5 files, prints summary inline. To see the actual diff you Ctrl+F the terminal scroll-back
- Idea: `coherent diff` reuses existing `.coherent/backups/*` dirs. Show last-chat backup vs current
- Tiny scope: 30 minutes of work. Reuses the file infrastructure that already exists for `coherent undo`
- Bigger idea: `coherent diff --semantic` shows token deltas / component additions / route changes — not just file lines
**Suggested CTA:** "Would you use `coherent diff`?"
**Why this works:** Tiny, concrete, useful. Not visionary — just respect-the-user mechanics. Easy yes from anyone running `coherent`.

---

## End notes

- Total: 30 posts.
- Distribution: 12 PJ + 5 MODEL_PROFILE + 6 CHANGELOG + 4 ADR + 3 IDEAS_BACKLOG.
- Voice notes: every post has a file path, validator name, version number, or specific class/regex. No hand-waving.
- For PJ posts: hook = symptom (what user sees). For MODEL_PROFILE posts: hook = the surprising bias.
- All posts can be drafted standalone; threads have suggested length but copy is the user's call.
