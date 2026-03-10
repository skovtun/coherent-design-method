# Component Patterns for Coherent

## Form Components

### Input Pattern
```tsx
interface InputProps {
  label: string
  error?: string
  required?: boolean
}

<div className="space-y-2">
  <label className="text-sm font-medium">
    {label} {required && <span className="text-error">*</span>}
  </label>
  <Input {...props} />
  {error && <p className="text-sm text-error">{error}</p>}
</div>
```

### Button Pattern
```tsx
// Primary action (one per section)
<Button variant="default" size="md">Save Changes</Button>

// Secondary actions
<Button variant="secondary">Cancel</Button>
<Button variant="outline">Learn More</Button>

// Destructive
<Button variant="destructive">Delete</Button>
```

## Layout Components

### Card Pattern
```tsx
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Main content */}
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

### Container Pattern
```tsx
<div className="container mx-auto px-4 md:px-6 lg:px-8">
  <div className="max-w-4xl mx-auto">
    {/* Centered content */}
  </div>
</div>
```

## State Patterns

### Loading
```tsx
{loading ? (
  <Spinner />
) : (
  <Content />
)}
```

### Empty State
```tsx
{items.length === 0 ? (
  <EmptyState 
    icon={<Icon />}
    title="No items yet"
    description="Get started by creating your first item"
    action={<Button>Create Item</Button>}
  />
) : (
  <ItemList items={items} />
)}
```

### Error State
```tsx
{error ? (
  <Alert variant="destructive">
    <AlertTitle>Error</AlertTitle>
    <AlertDescription>{error.message}</AlertDescription>
  </Alert>
) : (
  <Content />
)}
```

## Composition Patterns

### Slot Pattern
```tsx
<Dialog>
  <DialogTrigger>Open</DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
    </DialogHeader>
    {/* Content */}
    <DialogFooter>
      <Button>Close</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Render Props
```tsx
<Form onSubmit={handleSubmit}>
  {({ values, errors, handleChange }) => (
    <>
      <Input 
        name="email"
        value={values.email}
        onChange={handleChange}
        error={errors.email}
      />
      <Button type="submit">Submit</Button>
    </>
  )}
</Form>
```
