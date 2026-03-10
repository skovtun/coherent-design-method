# Design Tokens Best Practices

## Token Structure

### Colors
```typescript
colors: {
  // Brand
  primary: { DEFAULT, foreground },
  secondary: { DEFAULT, foreground },
  
  // Semantic
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
  
  // Neutral
  background: '#ffffff',
  foreground: '#0a0a0a',
  muted: { DEFAULT, foreground },
  accent: { DEFAULT, foreground },
  
  // UI
  border: '#e5e7eb',
  input: '#e5e7eb',
  ring: '#3b82f6'
}
```

### Typography
```typescript
fontSize: {
  xs: ['0.75rem', { lineHeight: '1rem' }],
  sm: ['0.875rem', { lineHeight: '1.25rem' }],
  base: ['1rem', { lineHeight: '1.5rem' }],
  lg: ['1.125rem', { lineHeight: '1.75rem' }],
  xl: ['1.25rem', { lineHeight: '1.75rem' }],
  '2xl': ['1.5rem', { lineHeight: '2rem' }],
  '3xl': ['1.875rem', { lineHeight: '2.25rem' }]
}
```

### Spacing
```typescript
spacing: {
  xs: '0.25rem',  // 4px
  sm: '0.5rem',   // 8px
  md: '1rem',     // 16px
  lg: '1.5rem',   // 24px
  xl: '2rem',     // 32px
  '2xl': '3rem',  // 48px
  '3xl': '4rem'   // 64px
}
```

### Border Radius
```typescript
borderRadius: {
  none: '0',
  sm: '0.125rem',  // 2px
  md: '0.375rem',  // 6px
  lg: '0.5rem',    // 8px
  xl: '0.75rem',   // 12px
  '2xl': '1rem',   // 16px
  full: '9999px'
}
```

## Token Usage

### In Components
```tsx
// Use tokens, not hardcoded values
<Button className="bg-primary text-primary-foreground rounded-md px-md py-sm">
  Click
</Button>

// ✗ Bad
<Button className="bg-blue-500 text-white rounded-lg px-4 py-2">
  Click
</Button>
```

### CSS Variables
```css
:root {
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --spacing-md: 1rem;
  --radius-md: 0.375rem;
}
```

## Token Benefits

1. **Consistency**: Same values everywhere
2. **Maintainability**: Change once, update everywhere
3. **Theming**: Easy light/dark mode
4. **Scale**: Add new tokens as needed
5. **Documentation**: Self-documenting system
