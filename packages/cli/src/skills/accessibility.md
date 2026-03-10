# Accessibility Guidelines for Coherent

## WCAG 2.1 AA Compliance

### Color Contrast
- Normal text: 4.5:1 minimum
- Large text (18pt+ or 14pt+ bold): 3:1 minimum
- UI components: 3:1 minimum
- Don't rely on color alone for meaning

### Keyboard Navigation
- All interactive elements keyboard accessible
- Visible focus indicators
- Logical tab order
- Skip links for main content

### Screen Readers
- Semantic HTML (button, nav, main, etc)
- Alt text for images
- ARIA labels for icons/buttons
- Form labels properly associated

### Forms
- Label every input
- Error messages descriptive
- Required fields indicated
- Validation feedback clear

## Component Accessibility

### Button
```tsx
// ✓ Good
<Button>Submit Form</Button>

// ✗ Bad
<Button><Icon /></Button> // No text

// ✓ Better with icon
<Button aria-label="Submit form">
  <Icon />
</Button>
```

### Input
```tsx
// ✓ Good
<label htmlFor="email">Email</label>
<Input id="email" type="email" />

// ✗ Bad
<Input placeholder="Email" /> // Placeholder not a label
```

### Links
```tsx
// ✓ Good
<a href="/about">Learn more about our company</a>

// ✗ Bad
<a href="/about">Click here</a> // Not descriptive
```

## Testing Checklist

- [ ] Can navigate with keyboard only
- [ ] Focus indicators visible
- [ ] Screen reader announces content correctly
- [ ] Color contrast passes
- [ ] Text resizable to 200%
- [ ] No keyboard traps
- [ ] Forms have labels
- [ ] Error messages clear
