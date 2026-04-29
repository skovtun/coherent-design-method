# Model Profile — Claude Sonnet 4

Empirical notes on how Claude Sonnet 4 behaves when given Coherent's prompts. Built by observation; unverified against first-principles model documentation.

Purpose: future rule-writing and debugging should lean on these patterns. If you see behavior that contradicts these notes, add a counter-example and a date — don't silently remove the note.

---

## Output pattern tendencies

### Consistent biases

- **Loves `<div>` wrappers.** Given any layout instruction, Claude will wrap in `<div>` twice — once for the section, once for "alignment". We've had to add explicit "no nested bordered containers" rules.

- **Favours `justify-between` for filter bars.** Natural impulse when "put things in a row" — causes the scattered-filter-with-big-gaps anti-pattern. We now specify `flex-wrap items-center gap-3` explicitly in the golden pattern.

- **Places icons as JSX siblings.** For "input with icon" it writes `<Icon /><Input />` instead of `<div className="relative"><Icon className="absolute..."/><Input className="pl-9"/></div>`. Must be shown the absolute-inside pattern explicitly.

- **Mixes heights on form controls.** Default Input is h-10, default Button is h-10, default SelectTrigger is h-10 — but Claude will set some and leave others default, producing visual mismatch. Fix: always specify h-10 on every control in the pattern, even when redundant.

- **Uses `<Button>` as a clickable wrapper for rows and cells without overriding CVA defaults.** When a page needs a clickable list item or grid cell, Claude reaches for `<Button>` (it gets keyboard + focus ring + hover for free) and adds container classes (`min-h-[92px]`, `p-3`, `flex-col items-start`) on top. But shadcn's `Button` CVA bakes in `inline-flex items-center justify-center gap-2 whitespace-nowrap h-9` — adding more classes doesn't unset those, the row stays 36px and children stay horizontal. Claude does not realize this because the broken classes are not in the page source — they come from the imported component. Fix: validators `BUTTON_AS_ROW_NO_HEIGHT_OVERRIDE` and `BUTTON_AS_CELL_NO_VERTICAL_LAYOUT` (v0.14.4) detect the pattern; the CORE rule recommends domain primitives (`SidebarMenuButton`, `TabsTrigger`) instead, or explicit `h-auto` + `flex-col items-start` overrides if `Button` is unavoidable. See PJ-012.

### JSON/code shape

- **Truncates on long pages.** At ~300 lines of generated TSX, Claude hits `max_tokens=16384` and cuts off mid-JSX. Symptom: `Unterminated string` or `RESPONSE_TRUNCATED` error. Mitigation: `--page X` now fails fast with guidance instead of cascading to full-project regen.

- **Mixes toFixed with currency.** Writes `${amount.toFixed(2)}` instead of `Intl.NumberFormat`. Especially for negative numbers, then double-signs with ternary (`{amount < 0 ? '-' : '+'}$...`). Caught by DOUBLE_SIGN validator.

- **Generates generic dates as strings in mock data.** Writes `{ date: "Yesterday" }` instead of ISO 8601 strings. Mitigation: MOCK/SAMPLE DATA section explicitly bans non-ISO dates in data.

### JSON schema interpretation

- **Over-expands sharedComponents.usedBy list.** Generates plan.sharedComponents with usedBy arrays missing pages that should clearly be included (e.g., StatCard usedBy for /reports). Suggests plan-level post-processing to retrofit routes.

- **Under-specifies `props` strings.** Generated `props: '{}'` is common; we treat this as "any". More specific schemas arrive randomly. Accept ambiguity; validator catches actual usage mismatches at page generation time.

## Prompt response characteristics

- Prompts up to ~18k tokens respond well. Beyond ~20k, quality degrades noticeably — "averaging" starts.
- Response time is proportional to output tokens, not input tokens. 1k output ≈ 8s, 16k output ≈ 90s.
- Re-prompting with "fix ONLY X" after a failure is usually effective (one retry), sometimes needs two.
- Cold start effect: first page in a split pipeline takes ~20% longer even with pre-warmed design context. Suspect prompt cache miss.

## Known quirks to design around

1. **Claude will often "improve" an instruction.** Asked to "fix the table", it will also redesign the header, add an empty state, tweak the badge variants. Sometimes helpful; often produces unwanted changes. Mitigation: `editPageCode()` minimal-diff path (shipped v0.7.2) + surgical `--page X` edits (shipped v0.7.20).

2. **Claude struggles with "before/after diff" instructions.** Better to describe the end state than the transformation: "the filter bar should have search + 2 selects + date range in one row" works. "Add a date range to the filter bar" often produces a new filter bar with only date range.

3. **shadcn primitives ARE in training data.** Claude knows `<Dialog>`, `<Sheet>`, `<DropdownMenu>`. The challenge is getting it to use them consistently instead of rolling custom — golden patterns solve this.

4. **Rule count threshold.** CORE_CONSTRAINTS around 3500 tokens is the comfort zone. Past that, rules start getting averaged rather than applied. We track with `check-constraint-budget.mjs`.

---

## Observations to verify

These are tentative; add dated counter-examples if you see otherwise.

- Claude seems to favour chart type `AreaChart` over `BarChart` regardless of data shape. Suspect training bias. Haven't measured.

- For "make this look professional", Claude defaults to Inter font + card grid. Coherent's atmosphere system overrides this when mood is clear, but ambiguous prompts still land on the stereotype.

- Dark mode colors look OK in generated output but have never been pixel-tested. The contrast ratio validator would help.

---

## Update this file when

- You observe a systematic behavior (not a one-off) across 2+ independent chat runs.
- You introduce a rule specifically to counteract a Claude-specific pattern.
- Claude's behavior changes materially after a Sonnet version bump (3.5 → 4.0 → ...). Note the model version in the entry.
