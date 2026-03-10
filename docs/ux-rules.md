# Coherent UX Ruleset — Extended Reference

Sources: Apple HIG (universal principles), WCAG 2.2 AA, Nielsen Norman Group.

---

## Apple HIG — Universal Principles

### Clarity
- Every element should be legible at a glance
- Typography, iconography, and spacing communicate hierarchy
- UI should never overshadow content — interface exists to support tasks
- Avoid using same color for different meanings (blue = action, red = destructive)

### Consistency
- Standard UI elements and visual cues across all pages
- Same action → same visual treatment everywhere
- Don't force unfamiliar patterns — use conventions users already know

### Deference
- Content is king — UI serves content, not the other way around
- Minimize chrome and decoration
- Use depth (shadows, layers) sparingly and purposefully

### Typography Hierarchy
- Establish clear hierarchy through size AND weight, not size alone
- Minimum font size: 14px (text-sm) for body, 12px (text-xs) for captions only
- Limit to 2-3 font sizes per page to maintain clarity
- Heavier weight = more important. Lighter weight = supporting content

### Color Usage
- Use color purposefully — not decoratively
- Every color should have a semantic meaning (primary = action, destructive = danger, muted = supporting)
- Test in both light and dark contexts
- Don't rely on color alone to convey information

---

## WCAG 2.2 AA — Specific Requirements

### Perceivable
- **1.1.1** — Images must have alt text (or alt="" for decorative)
- **1.3.1** — Structure conveyed through semantics (headings, lists, landmarks), not just visual
- **1.3.5** — Input purpose identifiable (autocomplete attributes on form fields)
- **1.4.3** — Text contrast ≥ 4.5:1 (AA), ≥ 7:1 (AAA)
- **1.4.11** — Non-text contrast ≥ 3:1 (borders, icons, focus indicators)
- **1.4.12** — Text spacing: user must be able to adjust line-height, letter-spacing, word-spacing without breaking layout
- **1.4.13** — Content on hover/focus must be dismissible, hoverable, and persistent

### Operable
- **2.1.1** — All functionality available via keyboard
- **2.4.3** — Focus order matches visual reading order
- **2.4.6** — Headings and labels describe topic or purpose
- **2.4.7** — Focus visible at all times during keyboard navigation
- **2.4.11** — Focus indicator ≥ 2px thick perimeter, ≥ 3:1 contrast
- **2.5.5** — Touch target ≥ 44×44 CSS pixels (with exceptions for inline text)
- **2.5.8** — Target spacing ≥ 24px between adjacent targets

### Understandable
- **3.1.1** — Page language declared in HTML
- **3.2.3** — Consistent navigation across pages
- **3.2.4** — Consistent identification (same component = same name everywhere)
- **3.3.1** — Input errors identified and described in text
- **3.3.2** — Labels or instructions provided for user input
- **3.3.7** — Redundant entry: don't ask user for same information twice
- **3.3.8** — Accessible authentication: don't rely on cognitive function tests

### Robust
- **4.1.2** — Name, role, value available for all UI components (semantic HTML)

---

## Nielsen Norman Group — Usability Heuristics

1. **Visibility of system status** → Always show loading states, progress indicators, save confirmations
2. **Match between system and real world** → Use language users understand. "Delete account" not "Terminate instance"
3. **User control and freedom** → Undo, cancel, back. Don't trap users in flows. Confirmation before destructive actions
4. **Consistency and standards** → Follow platform conventions. Login = top-right. Logo = top-left → home. Save = bottom of form
5. **Error prevention** → Disable submit until form valid. Confirm destructive actions. Clear input requirements upfront
6. **Recognition rather than recall** → Show options, don't make users remember. Active nav state. Breadcrumbs. Contextual help
7. **Flexibility and efficiency of use** → Keyboard shortcuts for power users. Search. Filters. Bulk actions on lists
8. **Aesthetic and minimalist design** → Every element earns its place. Remove what doesn't help the user's task. Less > more
9. **Help users recognize, diagnose, and recover from errors** → Error messages: plain language, specific problem, suggested fix. "Email already registered. Try logging in instead."
10. **Help and documentation** → Contextual help text near complex inputs. Tooltips. Don't make users leave the page for help

---

## Interaction Patterns (Behavioral Rules)

**Source:** Adapted from Microsoft Fluent Copilot interaction patterns, Nielsen Norman feedback heuristics, and Apple HIG response patterns.

**Why behavioral rules matter:**  
Design systems traditionally define how interfaces LOOK. In the AI era, they must also define how interfaces BEHAVE — loading states, error recovery, feedback loops, and transitions. Without behavioral rules, every team invents their own patterns, leading to inconsistent UX across pages.

Coherent Design Method embeds these rules in generation — the AI follows them automatically, so every page has consistent behavior from the start. This is preventive, not retroactive.

**Loading Pattern Hierarchy:**
1. Instant (<100ms): no indicator needed
2. Brief (100ms–1s): subtle indicator (button disabled state, opacity change)
3. Moderate (1–3s): skeleton or spinner with label
4. Long (3–10s): progress steps or progress bar
5. Very long (>10s): progress with estimated time, option to cancel

**Error Severity Scale:**
1. Field-level: inline, red border + message below field
2. Form-level: banner at top of form, scroll to it
3. Page-level: error boundary component with retry
4. App-level: full-page error with navigation home

**Empty State Types:**
1. First-time: welcoming, educational ("This is where your projects will appear")
2. No results: helpful, actionable ("Try different keywords")
3. Filtered empty: specific, resettable ("No items match. Reset filters?")
4. Error empty: empathetic, recoverable ("Couldn't load items. Try again.")

---

## Validator Checks

| Rule | Check | Severity |
|------|-------|----------|
| MISSING_LABEL | `<Input>` without adjacent `<Label>` with htmlFor | error |
| MISSING_ALT | `<img>` without alt attribute | error |
| NO_H1 | Page without exactly one `<h1>` | warning |
| MULTIPLE_H1 | More than one `<h1>` on a page | warning |
| SKIPPED_HEADING | h1 → h3 (skipped h2) | warning |
| PLACEHOLDER_ONLY_LABEL | `<Input>` with placeholder but no `<Label>` | error |
| MISSING_FOCUS_VISIBLE | Interactive element without focus-visible styles | info |
| GENERIC_BUTTON_TEXT | Button with "Submit", "OK", "Click here" | warning |
| NO_EMPTY_STATE | List/table/grid without empty state handling | warning |
| NO_LOADING_STATE | Page with data fetching but no loading/skeleton | warning |
| EMPTY_ERROR_MESSAGE | Error with generic text ("Error", "Something went wrong") | warning |
| DESTRUCTIVE_NO_CONFIRM | Destructive button without confirmation dialog | warning |
| FORM_NO_FEEDBACK | Form submit with no success/error feedback pattern | info |
| NAV_NO_ACTIVE_STATE | Navigation without active/current page indicator | info |

---

## Checklist for Generated Pages

- [ ] One h1, logical heading hierarchy
- [ ] All inputs have visible Labels
- [ ] All images have alt text
- [ ] All buttons have descriptive text (not "Submit")
- [ ] Primary action visually prominent, destructive actions in red
- [ ] Focus visible on all interactive elements (tab through page)
- [ ] No horizontal scroll at 375px viewport width
- [ ] Touch targets ≥ 44px
- [ ] Loading state exists (skeleton)
- [ ] Empty state exists (message + action)
- [ ] Error states have specific messages
- [ ] Realistic content (no placeholders)
- [ ] Current nav item has active state
