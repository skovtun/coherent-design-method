# UI/UX Design Principles for Coherent

## Core Principles

### 1. Consistency
- Use design system tokens everywhere
- Maintain consistent spacing, colors, typography
- Reuse components, don't duplicate

### 2. Visual Hierarchy
- Use size, color, spacing to create hierarchy
- Important elements should be larger/bolder
- Group related items together

### 3. White Space
- Don't overcrowd interfaces
- Use spacing tokens (xs, sm, md, lg, xl)
- Breathing room improves readability

### 4. Color Usage
- Primary color: main actions, brand elements
- Secondary color: supporting elements
- Error/Success: feedback states
- Neutral: text, borders, backgrounds

### 5. Typography
- Hierarchy: h1 > h2 > h3 > body > caption
- Line height: 1.5 for body, 1.2 for headings
- Font size: use type scale (sm, base, lg, xl, 2xl, etc)

### 6. Interactive States
All interactive elements need:
- Default state
- Hover state
- Active/Pressed state
- Disabled state
- Focus state (accessibility)

### 7. Feedback
- Loading states for async actions
- Success/Error messages
- Progress indicators
- Validation feedback

## Layout Principles

### Grid System
- Use consistent columns (12-column grid)
- Responsive breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px)
- Mobile-first approach

### Spacing
- Use spacing scale: 4px, 8px, 16px, 24px, 32px, 48px, 64px
- Consistent padding/margin
- Vertical rhythm

### Alignment
- Left-align text by default
- Center align for emphasis
- Right-align numbers/dates

## Component Design

### Buttons
- Clear labels (verb-based: "Submit", "Cancel", not "OK")
- Primary: 1 per screen/section
- Secondary: supporting actions
- Sizes: sm, md, lg
- Icon + text when helpful

### Forms
- Label above input
- Placeholder as example, not instruction
- Validation on blur
- Clear error messages
- Required fields marked
- Submit button at bottom

### Cards
- Consistent padding
- Clear hierarchy (image → title → description → action)
- Hover state for interactive cards
- Shadow for elevation

## Mobile-First Design

### Principles
- Design for mobile first, enhance for desktop
- Touch targets: minimum 44×44px
- Thumb-friendly navigation
- Hamburger menu for mobile
- Stack content vertically on mobile

### Breakpoints
- Mobile: <640px
- Tablet: 640-1024px
- Desktop: >1024px

## Accessibility

### Contrast
- Text: minimum 4.5:1 ratio
- Large text (18pt+): minimum 3:1
- Interactive elements: 3:1

### Navigation
- Keyboard navigable
- Focus indicators visible
- Logical tab order

### Content
- Alt text for images
- Semantic HTML
- ARIA labels when needed

## Best Practices

### Do's
✓ Use design tokens
✓ Maintain consistent spacing
✓ Design for all screen sizes
✓ Consider accessibility
✓ Test with real content
✓ Provide feedback for actions

### Don'ts
✗ Hardcode colors/spacing
✗ Use too many font sizes
✗ Ignore mobile users
✗ Forget hover/focus states
✗ Use tiny touch targets
✗ Rely only on color for meaning
