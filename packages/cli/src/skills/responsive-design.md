# Responsive Design for Coherent

## Mobile-First Approach

Start with mobile design, enhance for larger screens.

```tsx
// Mobile first
<div className="p-4 md:p-6 lg:p-8">
  <h1 className="text-xl md:text-2xl lg:text-3xl">
    Heading
  </h1>
</div>
```

## Breakpoints

Tailwind default breakpoints:
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px
- `2xl`: 1536px

## Layout Patterns

### Stack to Grid
```tsx
// Mobile: stacked, Desktop: grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  <Card />
  <Card />
  <Card />
</div>
```

### Hide/Show
```tsx
// Hide on mobile, show on desktop
<div className="hidden md:block">Desktop only</div>

// Show on mobile, hide on desktop
<div className="block md:hidden">Mobile only</div>
```

### Responsive Spacing
```tsx
<div className="space-y-4 md:space-y-6 lg:space-y-8">
  {/* Content with responsive spacing */}
</div>
```

## Touch Targets

- Minimum 44×44px for buttons/links
- Spacing between interactive elements
- Larger tap areas for mobile

```tsx
// Good mobile button
<Button className="h-12 px-6">Large Touch Area</Button>
```

## Typography

Scale font sizes responsively:

```tsx
<h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl">
  Responsive Heading
</h1>

<p className="text-sm md:text-base lg:text-lg">
  Responsive body text
</p>
```

## Images

Always responsive:

```tsx
<img 
  src="/image.jpg" 
  alt="Description"
  className="w-full h-auto"
/>
```

## Navigation

Mobile: Hamburger menu
Desktop: Full navigation

```tsx
<nav>
  {/* Mobile menu button */}
  <button className="md:hidden">Menu</button>
  
  {/* Desktop navigation */}
  <div className="hidden md:flex gap-4">
    <Link href="/">Home</Link>
    <Link href="/about">About</Link>
  </div>
</nav>
```

## Testing Checklist

- [ ] Test on mobile (375px)
- [ ] Test on tablet (768px)
- [ ] Test on desktop (1280px+)
- [ ] Touch targets large enough
- [ ] Content readable on all sizes
- [ ] No horizontal scroll
- [ ] Images scale properly
