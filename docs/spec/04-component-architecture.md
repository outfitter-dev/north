
## Component Architecture

### Hierarchy

1. **Primitives** — shadcn components (Button, Input, Card, etc.)
2. **Composed** — App-specific combinations (ProfileCard, SettingsPanel)
3. **Layouts** — Page-level patterns (Sidebar + Content, Dashboard grid)

### Decision Tree: When to Extract a Component

```
Is this pattern repeated 3+ times?
├── Yes → Extract to composed component
└── No → Is this a distinct conceptual unit?
    ├── Yes → Extract with TODO for reuse evaluation
    └── No → Keep inline, use tokens only
```

### Decision Tree: Where Does This Component Live?

```
Is it a shadcn primitive?
├── Yes → components/ui/ (don't modify unless necessary)
└── No → Is it app-specific or reusable?
    ├── App-specific → components/[feature]/
    └── Reusable → components/composed/
```

### Naming Conventions

- **Primitives:** PascalCase, noun (Button, Card, Input)
- **Composed:** PascalCase, descriptive noun (ProfileCard, SettingsPanel)
- **Variants:** kebab-case prop values (size="sm", variant="outline")
- **Tokens:** kebab-case with category prefix (--spacing-md, --shadow-subtle)
