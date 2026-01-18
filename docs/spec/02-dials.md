
## The Dials

North provides seven dials that control the visual language. Dials are **computed**, not just presets — changing a dial value triggers regeneration of dependent tokens throughout the system.

### Style Dials (visual parameters)

#### 1. Typography
- **Scale:** Type size progression (compact | default | relaxed)
- **Measure:** Line length constraints (CPL min/max for prose)
- **Leading:** Line height relationships
- **Tracking:** Letter spacing at different sizes

#### 2. Spacing
- **Base unit:** The foundational spacing value (e.g., 0.25rem)
- **Scale:** Progression of spacing values (xs, sm, md, lg, xl)
- **Rhythm:** Vertical spacing relationships

#### 3. Shadows
- **Depth:** none | subtle | default | pronounced
- Controls elevation perception across all components

#### 4. Radius
- **Scale:** xs | sm | md | lg | full
- Applied consistently to corners, buttons, inputs, cards

#### 5. Density
- **Scale:** compact | default | comfortable
- Controls padding, margins, touch targets globally

#### 6. Contrast
- **Scale:** low | default | high
- Controls color differentiation between surfaces, text weights
- Impacts accessibility compliance (AA vs AAA targets)
- Affects how aggressively light/dark mode values diverge

### Policy Dials (interaction/content architecture)

#### 7. Complexity
- **Default behavior:** Progressive disclosure
- **Override:** When density of information is required
- Decision framework for when to show/hide

Unlike style dials, complexity is an **information architecture policy**. It doesn't map to CSS tokens but to component composition rules and agent decision trees. Enforcement is via structural patterns, not value checks.

### Dial → Token Generation

When a dial changes, dependent tokens regenerate. Example for `radius: lg`:

```
dial: radius = "lg"
    ↓ generates
--radius-xs: 0.25rem
--radius-sm: 0.375rem
--radius-md: 0.75rem   ← values shift up
--radius-lg: 1rem
--radius-xl: 1.5rem
--radius-full: 9999px
    ↓ components reference
Button → rounded-md
Card → rounded-lg
Input → rounded-md
    ↓ result
Everything uses larger radii, proportionally
```

Density dial is multiplicative — it scales spacing tokens:

```
dial: density = "compact"
    ↓ multiplier: 0.75
--spacing-md: 1rem × 0.75 = 0.75rem
--control-padding-x: var(--spacing-md) → smaller
    ↓ result
All components tighten proportionally
```

### Density Inheritance Mechanism

Density uses **React context for orchestration, CSS variables for values**. Components stay dumb.

```tsx
// Context sets the class on a wrapper
<DensityProvider value="compact">
  <div className="density-compact"> {/* Provider adds this */}
    <Button />  {/* Just uses var(--control-height), doesn't know density */}
    <Input />
  </div>
</DensityProvider>
```

```css
/* CSS handles the actual values */
.density-compact {
  --control-height: 2rem;
  --control-padding-x: 0.5rem;
  --control-padding-y: 0.25rem;
}

.density-default {
  --control-height: 2.5rem;
  --control-padding-x: 0.75rem;
  --control-padding-y: 0.5rem;
}

.density-comfortable {
  --control-height: 3rem;
  --control-padding-x: 1rem;
  --control-padding-y: 0.75rem;
}
```

**Why this approach:**
- Components don't need density-awareness — they just consume CSS variables
- Context provides programmatic control when needed (e.g., "make this panel compact")
- CSS cascade naturally inherits to all children
- No runtime overhead for styling — it's just CSS
