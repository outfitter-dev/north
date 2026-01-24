## Appendix A: shadcn Compatibility Matrix

| shadcn Token | North Equivalent | Notes |
|--------------|------------------|-------|
| `--background` | `--surface-base` | Aliased, both work |
| `--card` | `--surface-raised` | Aliased for elevated context |
| `--popover` | `--surface-overlay` | Aliased |
| `--radius` | `--radius-md` | North adds full scale |
| (none) | `--spacing-*` | North addition |
| (none) | `--shadow-*` | North addition (scale) |
| (none) | `--layer-*` | North addition (z-index) |
| (none) | `--text-*` | North addition (typography roles) |
| (none) | `--leading-*` | North addition (line heights) |
| (none) | `--tracking-*` | North addition (letter spacing) |
| (none) | `--control-*` | North addition (component tokens) |
| (none) | `--effect-*` | North addition (composite treatments) |
| (none) | `--rhythm-*` | North addition (vertical spacing) |
| (none) | `--container-*` | North addition (max-widths) |

---

## Appendix B: Example ast-grep Rules

These rules follow ast-grep's YAML rule format. See [ast-grep documentation](https://ast-grep.github.io/reference/yaml.html) for full reference.

### no-raw-palette.yaml

```yaml
id: north/no-raw-palette
language: tsx
severity: error
message: "Use semantic color tokens instead of raw Tailwind palette colors"
rule:
  kind: string_fragment
  regex: "(bg|text|border|ring|fill|stroke)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\\d+"
note: |
  Replace with semantic token:
  - bg-blue-500 → bg-primary
  - text-gray-600 → text-muted-foreground
  - border-slate-200 → border-border
```

### no-arbitrary-values.yaml

```yaml
id: north/no-arbitrary-values
language: tsx
severity: error
message: "Use scale tokens or variable shorthand instead of arbitrary literal values"
rule:
  kind: string_fragment
  # Match arbitrary values with literal numbers/colors, but NOT variable references
  regex: "(p|m|gap|space|w|h|top|right|bottom|left|inset|rounded)-\\[\\d+[a-z]*\\]"
note: |
  Prohibited: p-[13px], w-[347px], rounded-[5px]
  Allowed: p-(--control-padding), w-(--sidebar-width)
  
  If this value is needed, either:
  1. Use an existing scale token (p-md, w-lg)
  2. Add a semantic token for this case
  3. Use variable shorthand: p-(--my-token)
```

**Implementation note:** This regex is a simplified example. The actual implementation uses allow/deny logic: bracket values are allowed if they contain `var(--`, prohibited otherwise. The CLI handles this with token detection, not regex alone.

### no-arbitrary-colors.yaml

```yaml
id: north/no-arbitrary-colors
language: tsx
severity: error
message: "Use semantic color tokens instead of arbitrary color values"
rule:
  kind: string_fragment
  regex: "(bg|text|border|ring|fill|stroke)-\\[(#|rgb|hsl|oklch)[^\\]]+\\]"
note: |
  Prohibited: bg-[#ff0000], text-[rgb(0,0,0)]
  Use semantic tokens: bg-destructive, text-foreground
```

### numeric-spacing-in-component.yaml

```yaml
id: north/numeric-spacing-in-component
language: tsx
severity: warning  # Becomes error in "primitive" context
message: "Consider using named spacing token instead of numeric spacing"
rule:
  kind: string_fragment
  regex: "^(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap)-(\\d+)$"
note: |
  Numeric spacing is allowed in layout files but discouraged in components.
  
  Consider: p-control, gap-card, m-section
  
  If this numeric value repeats 3+ times, it should become a token.
# Note: Context-awareness (layout vs component) requires CLI-level analysis
```

### component-complexity.yaml

```yaml
id: north/component-complexity
language: tsx
severity: warning
message: "Component className has many utilities - consider extracting"
rule:
  kind: jsx_attribute
  has:
    kind: string_fragment
    # Rough heuristic: lots of spaces = lots of classes
    regex: "(\\S+\\s+){12,}"
note: |
  When className has 12+ utilities, consider:
  1. Extract to a composed component
  2. Use @apply in a CSS module
  3. Create component-level tokens
  
  Threshold is configurable per context:
  - primitive: 10
  - composed: 15
  - layout: 20
```

### deviation-tracking.yaml

```yaml
id: north/deviation-tracking  
language: tsx
severity: hint
message: "Tracked deviation - counted for system review"
rule:
  kind: comment
  regex: "@north-deviation"
note: |
  This is an informational rule for tracking.
  
  When the same rule+reason combination appears 3+ times,
  the CLI will suggest promoting to a token.
  
  Format:
  /* @north-deviation
     rule: <rule-id>
     reason: <explanation>
     ticket: <optional-reference>
  */
```

### Note on Cross-File Analysis

Several enforcement needs require cross-file analysis that ast-grep alone cannot provide:

- Counting repeated patterns across the codebase
- Aggregating deviation comments
- Context classification from file paths
- Token promotion suggestions

These are handled by the `north` CLI, which runs ast-grep for pattern matching and adds aggregation/analysis on top.

---

## Appendix C: Tailwind Theme Extension

North tokens integrate with Tailwind v4 via the `@theme` directive. Understanding the distinction between `@theme` and runtime overrides is critical.

### How Tailwind v4 Theming Works

- `@theme` defines **which utilities exist** and creates global CSS variables
- `@theme inline` creates utilities but does **not** create overridable global variables
- Runtime switching happens via CSS cascade (`:root`, `.dark`, `[data-*]`)

**Critical rule for @theme:**

When defining `@theme` values, use **literal values** (OKLCH numbers, rems, etc.), not `var()` references to other tokens.

```css
/* ✅ Correct - literal values in @theme */
@theme {
  --spacing-card: 1.5rem;
  --color-surface-base: oklch(1 0 0);
}

/* ❌ Incorrect - var() references in @theme */
@theme {
  --spacing-card: var(--spacing-lg);      /* Don't do this */
  --color-surface-base: var(--background); /* Don't do this */
}
```

Why? Tailwind processes `@theme` at build time. Variable references inside `@theme` can cause unexpected resolution behavior and break runtime overridability.

**For aliases and relationships**, use normal CSS:

```css
/* Aliases and relationships go in regular CSS, not @theme */
:root {
  --surface-base: var(--background);  /* This is fine here */
}
```

**When to use `@theme inline`:**

Reserve `@theme inline` for cases where you deliberately don't want downstream overrides, or where you're defining derived values that shouldn't create global variables. Most North tokens should use standard `@theme`.

### North's Approach

**Step 1: Define theme keys with `@theme`**

This creates the utilities and base variables:

```css
/* globals.css */
@import "tailwindcss";

@theme {
  /* Spacing utilities */
  --spacing-control: 1rem;
  --spacing-card: 1.5rem;
  --spacing-layout: 2rem;
  --spacing-section: 3rem;
  
  /* Surface colors */
  --color-surface-base: oklch(1 0 0);
  --color-surface-raised: oklch(1 0 0);
  --color-surface-inset: oklch(0.97 0 0);
  --color-surface-overlay: oklch(0.97 0 0);
  
  /* Shadows */
  --shadow-subtle: 0 1px 2px 0 oklch(0 0 0 / 0.05);
  --shadow-default: 0 1px 3px 0 oklch(0 0 0 / 0.1);
  --shadow-pronounced: 0 4px 6px -1px oklch(0 0 0 / 0.1);
  --shadow-elevated: 0 10px 15px -3px oklch(0 0 0 / 0.1);
  
  /* Radius */
  --radius-control: 0.5rem;
  --radius-card: 0.75rem;
}
```

**Step 2: Wire runtime overrides for switching**

This enables light/dark/contrast switching without rebuild:

```css
/* Runtime overrides - these cascade over @theme values */
:root {
  --color-surface-base: oklch(1 0 0);
  --color-surface-raised: oklch(1 0 0);
  --color-surface-inset: oklch(0.97 0 0);
}

.dark {
  --color-surface-base: oklch(0.145 0 0);
  --color-surface-raised: oklch(0.205 0 0);
  --color-surface-inset: oklch(0.1 0 0);
}

[data-contrast="high"] {
  --color-surface-base: oklch(1 0 0);
  --color-surface-raised: oklch(0.98 0 0);
  /* Higher contrast between surfaces */
}
```

**Step 3: Use in components**

```tsx
// These utilities now exist thanks to @theme
<div className="p-card bg-surface-raised shadow-subtle rounded-card">
  <h2 className="mb-control">Title</h2>
  <p>Content</p>
</div>

// Variable shorthand for dynamic values
<aside className="w-(--sidebar-width) p-layout">
  ...
</aside>
```

### Generated vs Hand-Maintained

North's CLI generates the `@theme` block from `.north/config.yaml`:

```bash
north gen  # Outputs .north/tokens/generated.css
```

The generated file is committed to the repo. When dials change, regenerate and review the diff.

### Color Format Requirements

**North requires full OKLCH color values, not space-separated tuples.**

```css
/* ✅ Correct - full OKLCH values */
--color-primary: oklch(0.546 0.245 262.881);
--color-primary-foreground: oklch(0.97 0.014 254.604);

/* ❌ Incorrect - tuple format (won't work with relative color syntax) */
--color-primary: 0.546 0.245 262.881;
```

This enables relative color syntax for effects:
```css
--effect-ring-color: oklch(from var(--ring) l c h / 0.2);
```

