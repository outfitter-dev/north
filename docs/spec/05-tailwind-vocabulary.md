
## Tailwind Class Vocabulary

North defines what Tailwind classes are allowed, warned, or prohibited. This creates a contract between tokens and actual usage.

### The Principle

**Semantic tokens in components, numeric overrides only at edges.**

Layouts (gaps, grids) may use numeric Tailwind classes as local overrides. But if a numeric pattern repeats across components, it should be promoted to the token system.

### Allowed Classes

| Category | Allowed | Notes |
|----------|---------|-------|
| Colors | `bg-primary`, `text-muted-foreground`, `border-border` | Semantic only |
| Spacing (semantic) | `p-control`, `gap-layout`, `m-section` | When Tailwind extended |
| Spacing (scale) | `p-4`, `gap-6`, `m-8` | Allowed in layouts as overrides |
| Radius | `rounded-md`, `rounded-control` | Semantic preferred |
| Shadows | `shadow-subtle`, `shadow-elevated` | Semantic only |

### Prohibited Classes

| Category | Prohibited | Why |
|----------|------------|-----|
| Raw palette | `bg-blue-500`, `text-gray-600` | Use semantic tokens |
| Arbitrary literal values | `p-[13px]`, `w-[347px]` | Use scale or add token |
| Arbitrary literal colors | `bg-[#ff0000]`, `text-[rgb(0,0,0)]` | Use semantic tokens |

### Allowed Escape Hatches

Tailwind v4's **variable shorthand** is the approved escape hatch for token-based arbitrary values:

```tsx
// ✅ Allowed - variable shorthand referencing tokens
<div className="p-(--control-padding-x)" />
<div className="z-(--layer-modal)" />
<div className="w-(--sidebar-width)" />

// ✅ Allowed - calc anchored to token variables
<div className="p-[calc(var(--spacing-md)*1.5)]" />
<div className="w-[calc(var(--sidebar-width)+var(--spacing-lg))]" />

// ❌ Prohibited - literal arbitrary values (no token reference)
<div className="p-[13px]" />
<div className="w-[347px]" />
<div className="p-[calc(16px*1.5)]" />  // Literal in calc = still prohibited
```

**Rule clarification:** Bracket values are allowed **only if they contain `var(--`** (token-anchored). This includes calc expressions that reference tokens. Literals inside calc without token references are still prohibited.

**Calc multiplier policy:** Token math is allowed — the "magic" is the *base value*, not the multiplier. If you're scaling a token (`var(--spacing-md) * 1.5`), the intent is clear. However, if the same multiplied pattern appears 3+ times, the linter will suggest extracting it to a named token. Non-standard multipliers (like `* 1.37`) will trigger a warning asking for justification.

This maintains "no magic numbers" while allowing legitimate token math.

### Warning Zone (flag for review)

| Pattern | Action |
|---------|--------|
| Same numeric spacing 3+ times | Lint suggests: "Consider `--spacing-card-gap` or similar" |
| Numeric spacing in component internals | Lint suggests: "Move to component token or inherit from parent" |
| Long class strings (>12 classes) | Lint suggests: "Extract to composed component" |

### Context Classification

North enforcement varies based on where code lives. This enables "numeric spacing allowed in layouts" to be enforceable rather than vibes.

**Classification methods (in priority order):**

1. **Path convention (primary):**
   ```
   components/ui/*          → primitive (strictest)
   components/composed/*    → composed (strict)
   components/layouts/*     → layout (relaxed)
   app/**/layout.tsx        → layout
   app/**/page.tsx          → composed
   ```

2. **JSDoc annotation (override):**
   ```tsx
   /** @north context:layout */
   export function DashboardShell({ children }) {
     // Numeric spacing allowed here
     return <div className="grid gap-6 p-8">{children}</div>
   }
   ```

3. **CLI tooling:** `north classify` can analyze a file and suggest the appropriate context, or batch-add annotations.

**Rules by context:**

| Rule | primitive | composed | layout |
|------|-----------|----------|--------|
| no-raw-palette | error | error | error |
| no-arbitrary-values | error | error | warn |
| numeric-spacing | error | warn | allowed |
| component-complexity | warn (10) | warn (15) | warn (20) |

Configure in `north.config.yaml`:
```yaml
context:
  paths:
    primitive: ["components/ui/**"]
    composed: ["components/composed/**", "app/**/page.tsx"]
    layout: ["components/layouts/**", "app/**/layout.tsx"]
  
  default: composed  # When path doesn't match
```

### Spacing Philosophy

**Named keys are preferred. Numeric spacing is tolerated in layouts. Adoption is progressive.**

The goal is semantic spacing (`p-control`, `gap-section`) everywhere, but pragmatism wins:

1. **Ideal:** All spacing uses named tokens
   ```tsx
   <Card className="p-card gap-card-content">
   ```

2. **Acceptable in layouts:** Numeric Tailwind spacing as local overrides
   ```tsx
   <div className="grid gap-6 p-8">  {/* Layout context */}
   ```

3. **Flagged for review:** Repeated numeric patterns
   ```tsx
   // Lint: "gap-6 appears 4 times in composed components. 
   //        Consider: --spacing-grid-gap or --gap-cards"
   ```

4. **Prohibited:** Arbitrary literal values
   ```tsx
   <div className="p-[13px]">  {/* Error */}
   ```

**Math on named keys** is allowed and encouraged:
```tsx
<div className="p-[calc(var(--spacing-md)*1.5)]">  {/* OK but verbose */}
<div className="p-(--spacing-lg)">                  {/* Preferred shorthand */}
```

**Progressive adoption path:**
1. Start by banning raw palette colors (easy win)
2. Add named spacing tokens as patterns emerge
3. Tighten numeric spacing rules as token coverage grows
4. Eventually: most components use only named tokens

### Opacity Modifiers

Opacity modifiers on semantic tokens are **allowed**:

```tsx
// ✅ Allowed - opacity is a transform on a semantic value
<div className="bg-muted/40" />
<div className="border-border/50" />
<div className="ring-ring/20" />

// ❌ Prohibited - raw palette with opacity
<div className="bg-blue-500/40" />
```

Rationale: Opacity modifiers transform an existing semantic value, they don't introduce new arbitrary colors.

### Component Inheritance

Nested components should inherit spacing/density from their parent context when possible:

```tsx
// ✅ Good - child inherits parent's density context
<Card density="compact">
  <CardContent> {/* Uses compact spacing automatically */}
    <Button /> {/* Button respects density context */}
  </CardContent>
</Card>

// ⚠️ Warning - overriding parent context without reason
<Card density="compact">
  <CardContent className="p-8"> {/* Why override? */}
    ...
  </CardContent>
</Card>
```

When a nested component overrides its parent's spacing context, the linter should flag it and suggest either:
1. Adjust the parent's density setting
2. Create a semantic token for this specific case
3. Document why this deviation is intentional
