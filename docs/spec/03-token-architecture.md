
## Token Architecture

North extends shadcn's existing token structure while adding scales, composite effects, and additional semantic layers.

### Color Bridge: North → Both Ecosystems

North is the **source of truth** for colors. It generates both Tailwind and shadcn tokens from a single canonical definition.

**Flow:**
```
.north/config.yaml (canonical)
    ↓ north gen
┌─────────────────────────────────────────────┐
│ @theme {                                    │  ← Tailwind namespace (literal values)
│   --color-primary: oklch(0.546 0.245 262);  │
│   --color-background: oklch(1 0 0);         │
│ }                                           │
├─────────────────────────────────────────────┤
│ :root {                                     │  ← shadcn aliases (for compatibility)
│   --primary: var(--color-primary);          │
│   --background: var(--color-background);    │
│ }                                           │
└─────────────────────────────────────────────┘
```

**Why this direction:**
- Single source of truth (.north/config.yaml)
- Tailwind gets literal values in `@theme` (required for proper utility generation)
- shadcn components work unchanged (they just see `--primary`)
- Future platforms (SwiftUI, etc.) can consume the same North config
- No drift between ecosystems — `north gen` guarantees sync

### Layer 1: shadcn Base (preserved for compatibility)

```css
/* These exist and we don't touch them */
--background, --foreground
--card, --card-foreground
--popover, --popover-foreground
--primary, --primary-foreground
--secondary, --secondary-foreground
--muted, --muted-foreground
--accent, --accent-foreground
--destructive
--border, --input, --ring
--radius
--chart-1 through --chart-5
--sidebar-* variants
```

### Layer 2: North Surfaces (extends shadcn)

Additional semantic surface tokens for more nuanced hierarchy:

```css
--surface-base        /* Foundation layer, maps to --background */
--surface-raised      /* Elevated panels, floating elements */
--surface-inset       /* Recessed areas, wells, code blocks */
--surface-overlay     /* Modal/sheet backdrops */
```

### Layer 3: North Scales

Named scales with numeric values underneath:

```css
/* Spacing scale */
--spacing-xs: 0.25rem;   /* 4px */
--spacing-sm: 0.5rem;    /* 8px */
--spacing-md: 1rem;      /* 16px */
--spacing-lg: 1.5rem;    /* 24px */
--spacing-xl: 2rem;      /* 32px */
--spacing-2xl: 3rem;     /* 48px */

/* Radius scale */
--radius-xs: 0.125rem;
--radius-sm: 0.25rem;
--radius-md: 0.5rem;
--radius-lg: 0.75rem;
--radius-xl: 1rem;
--radius-full: 9999px;

/* Shadow scale */
--shadow-none: none;
--shadow-subtle: 0 1px 2px 0 oklch(0 0 0 / 0.05);
--shadow-default: 0 1px 3px 0 oklch(0 0 0 / 0.1), 0 1px 2px -1px oklch(0 0 0 / 0.1);
--shadow-pronounced: 0 4px 6px -1px oklch(0 0 0 / 0.1), 0 2px 4px -2px oklch(0 0 0 / 0.1);
--shadow-elevated: 0 10px 15px -3px oklch(0 0 0 / 0.1), 0 4px 6px -4px oklch(0 0 0 / 0.1);

/* Z-index layers */
--layer-base: 0;
--layer-raised: 10;
--layer-dropdown: 100;
--layer-sticky: 200;
--layer-overlay: 300;
--layer-modal: 400;
--layer-popover: 500;
--layer-toast: 600;
--layer-tooltip: 700;

/* Breakpoints (reference, used in Tailwind config) */
--breakpoint-sm: 640px;
--breakpoint-md: 768px;
--breakpoint-lg: 1024px;
--breakpoint-xl: 1280px;
--breakpoint-2xl: 1536px;

/* Container max-widths */
--container-prose: 65ch;      /* Optimal reading width */
--container-content: 80rem;   /* Main content area */
--container-wide: 96rem;      /* Full-width layouts */
```

### Layer 4: Typography Roles

Typography tokens define semantic text roles, not just sizes. This replaces the "prose" blob with explicit relationships.

```css
/* Font families */
--font-sans: ui-sans-serif, system-ui, sans-serif;
--font-mono: ui-monospace, monospace;
--font-display: var(--font-sans);  /* Override for brand fonts */

/* Type scale - semantic roles */
--text-display: 3rem;      /* Hero headlines */
--text-title: 2rem;        /* Page titles */
--text-heading: 1.5rem;    /* Section headings */
--text-subheading: 1.25rem;/* Subsection headings */
--text-body: 1rem;         /* Default prose */
--text-ui: 0.875rem;       /* Interface elements */
--text-caption: 0.75rem;   /* Labels, hints */
--text-micro: 0.625rem;    /* Badges, tags */

/* Leading (line-height) per role */
--leading-display: 1.1;
--leading-title: 1.2;
--leading-heading: 1.3;
--leading-body: 1.5;
--leading-ui: 1.4;

/* Tracking (letter-spacing) per role */
--tracking-display: -0.02em;
--tracking-title: -0.01em;
--tracking-heading: -0.01em;
--tracking-body: 0;
--tracking-ui: 0.01em;
--tracking-caps: 0.05em;   /* For uppercase text */

/* Font weights per role */
--weight-display: 700;
--weight-title: 600;
--weight-heading: 600;
--weight-body: 400;
--weight-ui: 500;
--weight-strong: 600;
```

#### Typography Inheritance & Rhythm

When content elements follow each other, spacing follows predictable rules:

```css
/* Vertical rhythm - space after elements */
--rhythm-display: var(--spacing-xl);     /* After display → generous */
--rhythm-heading: var(--spacing-lg);     /* After heading → comfortable */
--rhythm-body: var(--spacing-md);        /* After paragraph → standard */
--rhythm-list: var(--spacing-sm);        /* Between list items → tight */
--rhythm-tight: var(--spacing-xs);       /* After label → minimal */

/* Heading → content relationships */
--rhythm-heading-to-body: var(--spacing-sm);   /* Heading followed by paragraph */
--rhythm-heading-to-list: var(--spacing-sm);   /* Heading followed by list */
--rhythm-body-to-heading: var(--spacing-xl);   /* Paragraph followed by next heading */
```

### Layer 5: Component-Level Semantic Tokens

Tokens for specific component contexts, referencing the global scales:

```css
/* Control elements (buttons, inputs, selects) */
--control-height-sm: 2rem;
--control-height-md: 2.5rem;
--control-height-lg: 3rem;
--control-padding-x: var(--spacing-md);
--control-padding-y: var(--spacing-sm);
--control-gap: var(--spacing-sm);
--control-radius: var(--radius-md);

/* Card elements */
--card-padding: var(--spacing-lg);
--card-gap: var(--spacing-md);
--card-radius: var(--radius-lg);

/* Layout elements */
--layout-gutter: var(--spacing-lg);
--layout-section-gap: var(--spacing-2xl);
--sidebar-width: 16rem;
--sidebar-width-collapsed: 4rem;
```

### Layer 6: North Effects (composite tokens)

Effects encode *treatments* — combinations of properties that work together. Each property is separate for valid CSS, and usage follows Tailwind v4's token patterns.

```css
/* Ring highlight - focus/emphasis glow */
--effect-ring-width: 2px;
--effect-ring-color: oklch(from var(--ring) l c h / 0.2);
--effect-ring-offset: 2px;
```
**Usage:** `ring-(--effect-ring-width) ring-ring/20 ring-offset-(--effect-ring-offset)`

**Color bridge note:** For `ring-ring` to work, shadcn's `--ring` must be mirrored into Tailwind's color namespace as `--color-ring`. North handles this by writing the literal OKLCH value to `@theme { --color-ring: oklch(...); }` and creating an alias in CSS (`:root { --ring: var(--color-ring); }`). This pattern applies to all shadcn semantic colors.

```css
/* Elevation - shadow + transform for lift effect */
--effect-lift-shadow: var(--shadow-pronounced);
--effect-lift-translate: -1px;
```
**Usage:** `shadow-pronounced -translate-y-px` or define in @theme as `--shadow-lift`

```css
/* Frost - backdrop blur for overlays */
--effect-frost-blur: 8px;
--effect-frost-saturate: 1.8;
--effect-frost-bg: oklch(from var(--background) l c h / 0.8);
```
**Usage:** `backdrop-blur-(--effect-frost-blur) backdrop-saturate-(--effect-frost-saturate) bg-background/80`

```css
/* Inset - recessed appearance */
/* Define as inset shadow in @theme */
--inset-shadow-subtle: inset 0 1px 2px oklch(0 0 0 / 0.05);
```
**Usage:** `inset-shadow-subtle bg-surface-inset`

**Note on inset shadows:** Tailwind v4 supports `--inset-shadow-*` theme variables natively. Define your inset shadow tokens in `@theme` and use them as utilities (`inset-shadow-subtle`, `inset-shadow-deep`) rather than arbitrary bracket values.

### Token Relationships Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  DIALS (.north/config.yaml)                                  │
│  radius: lg, density: compact, contrast: high               │
└─────────────────────┬───────────────────────────────────────┘
                      │ generates
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  SCALES (tokens/base.css)                                   │
│  --radius-md: 0.75rem, --spacing-md: 0.75rem                │
└─────────────────────┬───────────────────────────────────────┘
                      │ referenced by
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  COMPONENT TOKENS (tokens/components.css)                   │
│  --control-radius: var(--radius-md)                         │
│  --control-padding-x: var(--spacing-md)                     │
└─────────────────────┬───────────────────────────────────────┘
                      │ used in
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  COMPONENTS (Button, Card, Input...)                        │
│                                                             │
│  Phase 1 (adoption): Token shorthand                        │
│    className="rounded-(--control-radius)                    │
│               px-(--control-padding-x)"                     │
│                                                             │
│  Phase 2 (maturity): Named utilities                        │
│    className="rounded-control px-control"                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Utility Evolution Model

North supports a progressive path from token shorthand to named utilities:

**Phase 1 — Adoption (token shorthand):**
```tsx
// Works immediately, no extra @theme config needed
<div className="p-(--card-padding) gap-(--card-gap) rounded-(--card-radius)">
```

**Phase 2 — Stabilization (named utilities):**
```tsx
// Pattern recognized, named utility created via `north promote`
<div className="p-card gap-card rounded-card">
```

The `north promote` command handles the transition:
```bash
north promote "p-(--card-padding)" --as p-card
# 1. Computes literal value and adds to @theme: --spacing-card: 1.5rem
# 2. Wires alias in CSS: :root { --card-padding: var(--spacing-card); }
# 3. Suggests codemod for existing usage
# 4. Updates lint rules to prefer named utility
```

**Note:** `north promote` always writes literal values to `@theme` (per the "no `var()` inside `@theme`" rule), then creates aliases in normal CSS for runtime overridability.

**Lint behavior:**
- Token shorthand: always allowed
- Named utilities: preferred when available
- Linter suggests: "p-card is available, consider using instead of p-(--card-padding)"
