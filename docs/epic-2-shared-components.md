# Epic 2: Shared Components with ID

## Vision

When a user builds multiple pages, repeating blocks (header, footer, sidebar, CTA sections) are currently duplicated as inline code on each page. Changing the header means editing every page manually — violating the core Coherent Design Method promise.

Epic 2 introduces **Shared Components** — reusable layout blocks with unique IDs that live in `components/shared/` and can be referenced, modified, and tracked across all pages.

**Key differentiator:** AI automatically detects duplication and proposes extraction. No other tool does this.

---

## Architecture

### Component Registry

A JSON manifest that tracks all shared components:

```json
// coherent.components.json (in project root)
{
  "shared": [
    {
      "id": "CID-001",
      "name": "Header",
      "type": "layout",
      "file": "components/shared/header.tsx",
      "usedIn": ["app/layout.tsx"],
      "createdAt": "2026-02-19T...",
      "description": "Main site header with logo and navigation"
    },
    {
      "id": "CID-002",
      "name": "Footer",
      "type": "layout",
      "file": "components/shared/footer.tsx",
      "usedIn": ["app/layout.tsx"],
      "createdAt": "2026-02-19T...",
      "description": "Site footer with links and copyright"
    },
    {
      "id": "CID-003",
      "name": "PricingCard",
      "type": "section",
      "file": "components/shared/pricing-card.tsx",
      "usedIn": ["app/pricing/page.tsx", "app/page.tsx"],
      "createdAt": "2026-02-19T...",
      "description": "Pricing tier card with features list and CTA"
    }
  ],
  "nextId": 4
}
```

### ID Format

- `CID-XXX` where XXX is a zero-padded auto-incrementing number (CID-001, CID-002, …).
- User can reference by ID ("update CID-001") or by name ("update the Header").
- AI includes ID in responses: "I've updated CID-001 (Header) — the search button is now visible on all 5 pages."

### File Structure

```
components/
  shared/                    ← Shared components live here
    header.tsx               ← CID-001
    footer.tsx               ← CID-002
    pricing-card.tsx        ← CID-003
  ui/                        ← Base UI components (Button, Card, etc.)
    button.tsx
    card.tsx
    ...
```

### Types of Shared Components

| Type     | Usage | Examples |
|----------|--------|----------|
| **layout**  | Via `layout.tsx`, appear on every page | Header, Footer, Sidebar, Breadcrumb wrapper |
| **section** | Reusable content blocks on multiple (not all) pages | CTA section, Pricing card, Testimonial block, Feature grid |
| **widget**  | Small reusable elements | Search bar, Notification bell, User avatar menu |

### How Shared Components Are Used

**Layout components** → imported in `app/layout.tsx`:

```tsx
import { Header } from "@/components/shared/header"   // CID-001
import { Footer } from "@/components/shared/footer"   // CID-002

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Header />        {/* CID-001 */}
        <main>{children}</main>
        <Footer />        {/* CID-002 */}
      </body>
    </html>
  )
}
```

**Section/Widget components** → imported in specific pages:

```tsx
import { PricingCard } from "@/components/shared/pricing-card" // CID-003

export default function PricingPage() {
  return (
    <div>
      <h1>Pricing</h1>
      <div className="grid md:grid-cols-3 gap-6">
        <PricingCard tier="starter" />   {/* CID-003 */}
        <PricingCard tier="pro" />        {/* CID-003 */}
        <PricingCard tier="enterprise" /> {/* CID-003 */}
      </div>
    </div>
  )
}
```

---

## AI Behavior: Duplication Detection

### When AI Detects Duplication

After generating a page:

1. **Scan** the new page code for blocks structurally similar to:
   - Existing shared components (exact or near-match)
   - Blocks on other pages (header-like, footer-like patterns)

2. **Propose** extraction if:
   - A block appears on 2+ pages with >70% structural similarity
   - A block matches a common layout pattern (nav with links, footer with copyright)

3. **Report** to user via CLI:
   ```
   ✅ Page "Pricing" created successfully.

   💡 Suggestion: The header on this page is similar to the header
      on Dashboard and Services. Want me to extract it as a shared
      component?

      [Y] Yes, create shared Header (CID-001)
      [N] No, keep as inline code
      [A] Always auto-extract (set preference)
   ```

4. **On confirmation:** Create `components/shared/header.tsx`, register in `coherent.components.json`, replace inline code on ALL pages with import, update `usedIn`, report: "Created CID-001 (Header). Updated 3 pages."

### Similarity Detection Algorithm

- AST-based (no ML): extract top-level JSX blocks → normalize (strip text, keep structure) → compare (tree edit distance or hash).
- Threshold: >70% node match → flag as candidate.
- Layout heuristics: blocks with `<nav>`, `<header>`, `<footer>` → auto-flag.

### Proactive Shared Creation

For the **first** page, if user says "add a dashboard with header and footer":

- AI creates Header + Footer as shared components immediately (not inline).
- Registers in manifest, imports in layout.tsx.
- Reports: "Created CID-001 (Header) and CID-002 (Footer) as shared components."

Heuristic: user mentions "header", "footer", "sidebar", "navbar", "nav" → create as shared from the start.

---

## User Interactions

| Action | Example | Result |
|--------|---------|--------|
| **Modify by ID** | `coherent chat "in CID-001, add a search input next to the nav links"` | AI edits `components/shared/header.tsx`; all pages get the change. |
| **Modify by Name** | `coherent chat "update the footer — add social media links"` | Resolve CID-002 (Footer) by name → same behavior. |
| **List** | `coherent components` | Table: ID, Name, Type, Used In. |
| **Promote** | `coherent chat "make the testimonials section on the About page a shared component"` | Extract → create file → assign CID-XXX → replace inline. |
| **Inline (break link)** | `coherent chat "make the footer on the Login page different from the rest"` | Page-specific footer on login; login no longer uses CID-002; update `usedIn`. |

---

## Design System Viewer Integration

- New section: **Shared Components** (between Components and Tokens).
- Index: table with ID, Name, Type, Used In (count), Description.
- Detail: live preview, code view, "Used in" list (clickable page links).
- Order: layout first, then section, then widget.

---

## Stories (Execution Order)

| Order | Story | Summary |
|-------|--------|---------|
| 1 | **2.1** Component Registry | Manifest format, CRUD, `nextId`, `coherent components`, TS types. |
| 2 | **2.2** Shared Component Generator | Create file in `components/shared/`, register with CID. |
| 3 | **2.3** Layout Integration | Layout components in `app/layout.tsx`; section/widget in pages; update `usedIn`. |
| 4 | **2.6** Proactive Shared Creation | Header/footer/sidebar/nav → create as shared from first page. |
| 5 | **2.4** Modify by ID/Name | Chat resolves CID-XXX or name → edit correct file → propagation. |
| 6 | **2.9** CLI: `coherent components` | List table; `--json`, `--verbose`. |
| 7 | **2.5** Duplication Detection | Scan after page gen; similarity algo; Y/N/A prompt. |
| 8 | **2.7** Promote / Inline | Extract to shared; break link (inline on one page); manifest `usedIn`. |
| 9 | **2.8** DS Viewer: Shared Components | Nav, index, detail (preview + code + usage). |
| 10 | **2.10** Smoke Test | E2E: init → 3 pages with headers → detect → extract → modify by ID → `coherent components` → build. |

---

## Edge Cases

1. **Non-existent ID:** "update CID-099" → "Component CID-099 not found. Available: CID-001 (Header), CID-002 (Footer)."
2. **Name collision:** Two "Card" → "Card", "Card2" or ask user to rename.
3. **Delete shared component:** Warn about pages → on confirm, inline on all pages → remove from manifest.
4. **Circular dependencies:** A imports B imports A → validate at creation, reject.
5. **Props:** Shared components may have props (e.g. `PricingCard` with `tier`). Typed interface in source; registry does not track props.
6. **Auth pages:** Login/signup often hide header. Use route groups: `(auth)/layout.tsx` without Header, `(app)/layout.tsx` with Header.
7. **Manifest out of sync:** `coherent validate` checks manifest vs actual files and reports discrepancies.

---

## Success Metrics

- No layout code duplicated across pages.
- Modify by ID → change visible on all pages.
- AI suggests extraction after 2nd similar page.
- DS viewer shows shared components with live preview.
- `coherent validate` catches manifest/file mismatches.
- Build passes with shared components.

---

## Relation to Design System Config (layoutBlocks)

The design system config already defines **layout blocks** (`config.layoutBlocks`, `page.layoutBlockIds`) with kebab-case IDs and optional `numericId`. These can be used as the **source of truth for layout-type shared components** when generating from config:

- **Option A:** Generated layout blocks (from config) are also registered in `coherent.components.json` with a CID; `file` points to the generated path (e.g. `components/shared/header.tsx` or `app/_layout-blocks/...`). User can refer to either "id876" (numericId) or "CID-001".
- **Option B:** Epic 2 manifest is the only registry; design-system `layoutBlocks` are deprecated in favor of manifest-driven shared components.

Current codebase: types in `design-system.ts` (LayoutBlockDefinition, layoutBlockIds) and `docs/layout-components.md`. When implementing Epic 2, align manifest IDs (CID-XXX) with layout block IDs where layout components are generated from config, and use the same `ModificationRequest` types (`modify-layout-block` / shared component modify) so chat and generators stay consistent.
