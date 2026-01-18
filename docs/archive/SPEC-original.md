# North: Design System Skill Specification

> A self-enforcing design system for building durable, themeable frontends with AI agents.

**Version:** 0.1.0-draft  
**Last Updated:** January 2025

---

## Overview

North is a design system skill that teaches AI agents how to build and maintain consistent, themeable frontend interfaces. It combines principles (the *why*), token architecture (the *what*), enforcement tooling (the *how*), and a registry-based distribution model.

The core insight: agents optimize for *working code now* rather than *maintainable architecture over time*. North provides the constraints and feedback loops to produce durable, forward-looking frontend code.

### Design Philosophy

**Roles, not values.** Inspired by Apple's Human Interface Guidelines, North uses semantic roles rather than literal values. You never say "gray at 60% opacity" — you say "muted" and the system figures out what that means in light mode, dark mode, at different contrast levels.

**Defaults with intentional escape hatches.** Rules exist to be followed most of the time. Breaking a rule requires explicit intention and documentation. If a rule is broken repeatedly, that's signal the system needs to evolve.

**Configure the system, not individual components.** A handful of dials control the entire visual language. Components reference roles, roles reference dials.

### Target Stack (v0.1)

North v0.1 targets:
- **React** (Next.js, Vite, etc.)
- **Tailwind CSS v4** (with `@theme` directive)
- **shadcn/ui** (as the primitive component layer)
- **OKLCH color model** (matching shadcn's current approach)

**Browser compatibility:** Tailwind v4 requires modern browsers (Safari 16.4+, Chrome 111+, Firefox 128+). North inherits this floor. If you need legacy browser support, Tailwind v3 + a North v3-compat layer would be a separate effort.

The principles are portable; platform-specific implementations (SwiftUI, etc.) are future extensions.

### Theme Switching Model

North supports two complementary switching mechanisms:

**Runtime switching (light/dark/contrast):**
- Uses CSS class or `data-` attribute (e.g., `.dark`, `[data-theme="dark"]`)
- Switches are boolean states that users toggle
- CSS variables cascade automatically
- No rebuild required

**Build-time generation (dial changes):**
- Dials like `radius`, `density`, `shadows` are design decisions
- Changing a dial regenerates `north/tokens/generated.css`
- Run `north gen` after config changes
- Requires rebuild/deploy

The distinction: **dark/light is a user preference toggle. Dial changes are design system evolution.**

Configuration example:
```yaml
# north.config.yaml
switching:
  runtime:
    - light-dark     # .dark class or [data-theme="dark"]
    - contrast       # [data-contrast="high"] for accessibility
  build-time:
    - radius
    - density
    - shadows
    - typography
```

This means a single CSS bundle supports light/dark/contrast combinations, but dial changes require regeneration.

### Scope of Truth (v0.1)

North enforcement covers:
- ✅ TSX/JSX component files (class strings, inline styles)
- ✅ CSS files defining tokens (`globals.css`, `north/tokens/*`)
- ✅ Tailwind config extensions

North does **not** enforce (v0.1):
- ❌ Third-party component internals (see Third-Party Policy)
- ❌ MDX/content files (future consideration)
- ❌ SVG internals (future consideration)
- ❌ External stylesheets from dependencies

This boundary is explicit so teams know what North guarantees.

---

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

---

## Token Architecture

North extends shadcn's existing token structure while adding scales, composite effects, and additional semantic layers.

### Color Bridge: North → Both Ecosystems

North is the **source of truth** for colors. It generates both Tailwind and shadcn tokens from a single canonical definition.

**Flow:**
```
north.config.yaml (canonical)
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
- Single source of truth (north.config.yaml)
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
│  DIALS (north.config.yaml)                                  │
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

---

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

---

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

---

## Agent Workflow

When an agent works within a North-enabled project, it follows this loop:

### 1. Search Existing Patterns
Before building anything new, check:
- Does a component for this already exist?
- Is there an established pattern in the codebase?
- Use ast-grep to find similar implementations

### 2. Build with Tokens
- Never use raw Tailwind palette colors (blue-500, gray-100)
- Never use arbitrary values for spacing/sizing
- Reference semantic tokens and scales only
- Numeric spacing allowed in layouts, but flag repeated patterns

### 3. Lint Before Committing
Run `north check` before presenting work:
- Catches raw palette usage
- Flags repeated class patterns
- Warns on complexity thresholds
- Suggests token promotions for repeated patterns

**This is mandatory.** Agents must run the linter before presenting any UI work. CI will also run it, but catching issues early saves cycles.

### 4. Fix or Document

If violations exist, the agent must either fix them or add a machine-readable deviation comment:

```tsx
{/* @north-deviation
   rule: no-arbitrary-values
   reason: Legacy API returns fixed 347px width constraint
   ticket: NORTH-123
   count: 1
*/}
<div className="w-[347px]">
```

**Deviation comment format (machine-readable):**
- `rule:` — Which rule is being bypassed
- `reason:` — Why (human explanation)
- `ticket:` — Optional tracking reference
- `count:` — How many instances this comment covers (for aggregation)

This format allows tooling to:
- Count deviations per rule
- Track which reasons are most common
- Automatically flag "3+ same rule/reason" for system review

### 5. Flag System Gaps

If the same deviation appears 3+ times across the codebase, the agent should:

```tsx
{/* @north-candidate
   pattern: w-[347px] for legacy panel widths
   occurrences: 4
   suggestion: Add --width-legacy-panel to token system
*/}
```

The `@north-candidate` comment signals that a pattern has graduated from "exception" to "system gap."

### Enforcement Posture

North enforcement runs at two levels:

**Local (agent/developer):**
- `north check` before presenting work
- Editor integration via ast-grep LSP (real-time feedback)
- Pre-commit hook (optional but recommended)

**CI (required):**
- `north check --strict` in CI pipeline
- Fails build on errors
- Reports warnings without failing
- Generates deviation report for review

Both levels must pass. An agent cannot present work with lint errors, and CI provides the backstop.

---

## Third-Party Component Policy

Third-party components (npm packages, external UI libraries) often ship with their own styles that may violate North principles. This policy defines how to handle them.

### Exception List

Maintain an explicit list of allowed third-party components in `north.config.yaml`:

```yaml
third-party:
  allowed:
    - package: "@radix-ui/*"
      reason: "Headless primitives, styled by shadcn layer"
    
    - package: "react-day-picker"
      reason: "Calendar primitive, styled via shadcn Calendar"
    
    - package: "recharts"
      reason: "Charts use --chart-* tokens, some internal classes unavoidable"
      
    - package: "cmdk"
      reason: "Command palette primitive"
```

When the linter encounters classes from an allowed package, it skips enforcement for that scope.

### Extend Pattern (Wrapping)

For components that need customization, use the "extend" pattern — wrap the third-party component and apply North tokens:

```tsx
// components/composed/themed-datepicker.tsx
import { DatePicker as BaseDatePicker } from "third-party-lib";
import { cn } from "@/lib/utils";

export function DatePicker({ className, ...props }) {
  return (
    <BaseDatePicker
      className={cn(
        // Override third-party defaults with North tokens
        "rounded-control border-border bg-surface-base",
        "focus:ring-ring/20 focus:ring-2",
        className
      )}
      {...props}
    />
  );
}
```

The wrapper becomes the blessed component; direct usage of the base component is discouraged.

### Prohibited Packages

Some packages are fundamentally incompatible with North (e.g., they inline arbitrary colors everywhere). These can be explicitly prohibited:

```yaml
third-party:
  prohibited:
    - package: "some-opinionated-ui-lib"
      reason: "Inlines colors, cannot be themed"
      alternative: "Use shadcn/ui equivalent"
```

The linter will error if a prohibited package is imported.

---

## Motion Tokens (Fast-Follow)

> **Note:** Motion is not in v0.1 scope but is planned as a fast-follow addition.

Motion tokens will cover:
- **Duration scale:** instant | fast | default | slow | deliberate
- **Easing functions:** ease-out, ease-in-out, spring, bounce
- **Reduced motion:** Automatic handling via `prefers-reduced-motion`

Placeholder structure:

```css
/* Duration scale */
--duration-instant: 0ms;
--duration-fast: 100ms;
--duration-default: 200ms;
--duration-slow: 300ms;
--duration-deliberate: 500ms;

/* Easing */
--ease-default: cubic-bezier(0.4, 0, 0.2, 1);
--ease-in: cubic-bezier(0.4, 0, 1, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);

/* Motion-safe wrapper */
@media (prefers-reduced-motion: no-preference) {
  :root {
    --motion-enabled: 1;
  }
}
```

This will be fully specified in a future revision.

---

## Enforcement: ast-grep Rules

North uses ast-grep for structural linting. Rules are YAML files that can be shared via registry.

### Rule Structure

```yaml
id: north/no-raw-palette
message: "Use semantic color tokens instead of raw Tailwind palette"
severity: error
language: tsx
rule:
  kind: string_fragment
  regex: "(bg|text|border|ring)-(red|blue|green|yellow|gray|slate|zinc|neutral|stone)-\\d+"
note: |
  Instead of: bg-blue-500
  Use: bg-primary or bg-accent
```

**Note:** ast-grep treats TypeScript (`.ts`) and TSX (`.tsx`) as different parsers. North rules use `language: tsx` since className strings live in JSX. For pure TypeScript files, a separate rule with `language: typescript` may be needed.

### Rule Categories

**Hard Errors** (block build/commit):
- `no-raw-palette` — No literal Tailwind colors in components
- `no-arbitrary-values` — No arbitrary literal values like `p-[13px]`; token-anchored calc allowed
- `no-inline-color` — No inline style colors

**Warnings** (flag for review):
- `extract-repeated-classes` — Same class cluster 3+ times
- `component-complexity` — More than N Tailwind classes
- `missing-semantic-comment` — New composed components need role documentation

### Enforcement Levels

```yaml
# north.config.yaml
rules:
  # Locked by base - cannot override
  no-raw-palette: error
  no-inline-color: error
  
  # Configurable - project can tune
  extract-repeated-classes:
    level: warn
    threshold: 3
  
  component-complexity:
    level: warn
    max-classes: 15
```

---

## CLI Architecture

North provides a CLI that's a **design system power tool**, not just a linter. The shift in mental model:

| Linter mindset | Power tool mindset |
|----------------|-------------------|
| "You did it wrong" | "Here's what you're actually doing" |
| Block bad code | Surface emergent patterns |
| Enforce rules | Evolve the system |
| CI gate | Workflow companion |
| Static rules | Living intelligence |

### Design Principles

- **Discovery first:** `north init` and `north find` help you understand your codebase before enforcing rules
- **Thin wrapper:** ast-grep does single-file analysis; North adds cross-file intelligence
- **Ecosystem-friendly:** Leverages Tailwind, PostCSS, existing tooling
- **Evolution-oriented:** Patterns graduate to tokens, the system learns from usage
- **Zero-install distribution:** Runs via `npx`/`bunx` with no local install required (v0.1); native binaries are a future optimization

### Commands

```bash
# Initialization & Discovery
north init                     # Snapshot + full audit + baseline report
north init --skip-report       # Just set up config, skip analysis

# Finding & Analysis (the power tools)
north find                     # Discovery umbrella
north find --colors            # All color usage: in system, gaps, orphans
north find --patterns          # Repeated class clusters (candidates for components)
north find --spacing           # Spacing values in use vs defined in system
north find --typography        # Type scale usage analysis
north find --tokens            # Full token usage report

north find --similar <target>  # "What else looks like this?"
                               # Matches by class patterns + token usage

north find --cascade <selector> # THE CASCADE DEBUGGER
                               # Trace why an element looks wrong
                               # Follows: classes → tokens → wrappers → theme

# Generation & Evolution
north gen                      # Dials → tokens (regenerate from config)
north propose                  # Draft system changes from findings
north promote <pattern> --as <name>  # Pattern → token with codemod

# Enforcement (now feels like last step, not first)
north check                    # Lint: ast-grep + cross-file analysis
north check --strict           # CI mode: fail on errors
north check --fix              # Auto-fix where possible

# Migration & Adoption
north migrate                  # Bulk codemods (raw palette → semantic, etc.)
north adopt                    # Adoption scoring + guided fixes for existing projects

# Utilities
north classify <file>          # Suggest context classification
north classify --batch         # Add @north annotations to unclassified files
north doctor                   # Validate config, check dependencies, health check
north context                  # Dump system state for LLM context injection
```

### The Cascade Debugger (`north find --cascade`)

This is the "save 45 minutes of DevTools archaeology" feature.

```bash
north find --cascade ".btn-primary"
```

**Output:**
```
Cascade trace for: .btn-primary
═══════════════════════════════════════════════════════════════

Background: oklch(0.205 0 0) ← OPAQUE (expected transparency?)

Resolution chain (conceptual — actual CSS output may vary):
  1. bg-primary/80           → applies 0.8 alpha to resolved --primary color
  2. BUT --primary resolves  → oklch(0.205 0 0)  ← no alpha channel in source
  3. Applied in              → components/ui/Button.tsx:34
  4. Wrapped by              → components/Card.tsx:47 (has bg-background)
  5. bg-background resolves  → var(--surface-base)
  6. --surface-base is       → oklch(1 0 0)  ← opaque white

⚠️  Conflict: Button wants transparency, but Card ancestor has opaque background.

Suggestions:
  • Use bg-primary/80 on element without opaque ancestor
  • Change Card to bg-transparent or bg-surface-base/95
  • Consider --surface-elevated for Cards containing transparent elements
```

The cascade debugger traces:
1. Tailwind's generated classes: what CSS does this produce?
2. CSS variable resolution: what token is this actually using?
3. Component composition: what React wrapper is applying styles?
4. Theme context: are we in dark mode? high contrast?
5. Specificity conflicts: is something overriding?

**MVP Scope (v0.1):**

The cascade debugger guarantees:
- ✅ Tailwind utility expansion (class → generated CSS rule)
- ✅ CSS variable resolution chain (where was `--token` last assigned?)
- ✅ Component wrapper chain (via `component_graph` in index)
- ✅ Theme context detection (which theme class is active?)

Deferred to v0.2+:
- ❌ Full CSS specificity simulation (would need browser engine)
- ❌ Computed style verification (requires headless rendering)
- ❌ Cross-file `@import` resolution
- ❌ Media query state detection

The v0.1 cascade debugger answers "what's applying this style and why?" via static analysis. It does *not* guarantee pixel-perfect rendering prediction — that's a fundamentally different problem.

### The Similarity Finder (`north find --similar`)

Find components/patterns that share DNA with a target.

```bash
north find --similar "components/ui/Card.tsx"
```

**Output:**
```
Similar to: components/ui/Card.tsx
═══════════════════════════════════════════════════════════════

Class pattern matches:
  • components/composed/ProfileCard.tsx    (87% similar)
    Shared: rounded-lg, bg-card, p-card, shadow-subtle
    Unique to target: border-border

  • components/composed/SettingsPanel.tsx  (72% similar)
    Shared: rounded-lg, bg-card, shadow-subtle
    Differs: p-lg vs p-card, no border

Token usage matches:
  • components/composed/InfoBox.tsx        (81% similar)
    Shared tokens: --card-radius, --card-padding, --surface-raised
    
  • components/ui/Dialog.tsx               (65% similar)
    Shared tokens: --card-radius, --surface-raised
    Differs: uses --surface-overlay instead of --surface-raised

💡 Consider:
  • ProfileCard and Card share 87% patterns → extract shared base?
  • 4 components use rounded-lg + bg-card + shadow-subtle → candidate for token group?
```

### The Promotion Flow

When patterns emerge, North helps graduate them to tokens:

```bash
# Step 1: Find patterns
north find --patterns

# Output:
# Pattern: "rounded-lg bg-card p-6 shadow-subtle" appears 7 times
# Pattern: "gap-6" appears 12 times in layout files

# Step 2: Promote a pattern
north promote "p-6" --as p-card --context composed

# North:
# 1. Adds to @theme: --spacing-card: 1.5rem
# 2. Creates utility: p-card
# 3. Generates codemod: replace p-6 → p-card in composed context
# 4. Updates lint: prefer p-card over p-6 in composed/primitive context

# Step 3: Review and apply
north migrate --dry-run    # Preview changes
north migrate              # Apply codemod
```

### `north check` Output

When enforcement runs, it produces:

**1. JSON Report (CI integration):**
```json
{
  "summary": { "errors": 3, "warnings": 12, "info": 5 },
  "violations": [...],
  "deviations": {
    "total": 8,
    "by_rule": { "no-arbitrary-values": 5, "numeric-spacing": 3 },
    "by_reason": { "legacy-api-constraint": 4 },
    "candidates_for_promotion": [
      { "rule": "no-arbitrary-values", "reason": "legacy-api-constraint", "count": 4 }
    ]
  }
}
```

**2. Deviation Histogram:**
```
@north-deviation summary:
═════════════════════════════════════════════════════════════
Rule                    Count   Top Reason
─────────────────────────────────────────────────────────────
no-arbitrary-values       5     legacy-api-constraint (4)
numeric-spacing           3     layout-grid-alignment (2)
═════════════════════════════════════════════════════════════

⚠️  "legacy-api-constraint" has 4 deviations
    → Run: north promote "w-[347px]" --as w-legacy-panel
```

**3. Token Promotion Suggestions:**
```
Suggested promotions:
═════════════════════════════════════════════════════════════
Pattern              Occurrences   Suggested Command
─────────────────────────────────────────────────────────────
gap-6                     7        north promote gap-6 --as gap-cards
p-8                       5        north promote p-8 --as p-section
═════════════════════════════════════════════════════════════
```

### Ecosystem Integration

North doesn't reinvent wheels:

- **ast-grep:** Core pattern matching, single-file linting
- **Tailwind CSS:** Token resolution, class generation analysis
- **PostCSS:** Token generation, CSS processing
- **prettier/eslint:** Complements (North = design system, not code style)

---

## Index Architecture

North maintains a SQLite index for instant queries across the codebase. Without an index, every `--similar` or `--cascade` query requires a full scan. With it, responses are <10ms.

### Index Location

North uses two directories with distinct purposes:

```
north/                        # Source of truth (committed)
├── north.config.yaml         # Main config, dials, extends
├── rules/                    # Custom lint rules
└── tokens/
    ├── base.css              # Hand-authored token extensions
    └── generated.css         # Output from `north gen` (committed)

.north/                       # Cache/derived data
└── index.db                  # SQLite index (optionally committed)
```

**Convention:** `north/` contains source files you author; `.north/` contains derived artifacts.

### Committable Index

For CI and remote execution scenarios, the index can be committed to the repo:

```yaml
# north.config.yaml
index:
  path: ".north/index.db"
  committable: true
```

**When `committable: true`:**
- Index is generated locally during development
- Committed to repo alongside code changes
- CI uses committed index directly — no rebuild needed
- `north check` validates index freshness before using
- `north index --refresh` updates and stages the index

**Freshness check:**
```bash
north check
# "Index is 3 commits behind, rebuilding..."
# or
# "Using committed index (fresh)"
```

**Why commit the index?**
- Stateless CI — no persistent cache required
- `npx north check` works in GitHub Actions without setup
- Consistent results between local and CI
- Trade-off: ~1-10MB added to repo (depends on codebase size)

### Determinism Requirements (when committable)

When `index.committable: true`, North MUST enforce these constraints to avoid churn and merge pain:

1. **WAL mode disabled** — prevents `-wal` and `-shm` sidecar files
2. **Stable insertion order** — rows inserted in deterministic order (sorted by file path, then line number)
3. **No auto-vacuum** — vacuum only on explicit `north index --optimize`
4. **Content hash in meta** — `meta.content_hash` stores hash of source files; stale = rebuild
5. **Schema version in meta** — `meta.schema_version` for compatibility checks

```sql
-- Required meta entries for committable indexes
INSERT INTO meta (key, value) VALUES 
  ('schema_version', '1'),
  ('content_hash', 'sha256:a3f8c2...'),
  ('source_file_count', '247'),
  ('created_at', '2025-01-17T21:30:00Z');
```

### Git Configuration

**Recommended `.gitignore`:**
```gitignore
# North - only ignore SQLite sidecar files if not using committable index
.north/index.db-wal
.north/index.db-shm

# If NOT using committable index, also ignore the db itself:
# .north/index.db
```

**What to commit:**
- `north/north.config.yaml` — always (source of truth)
- `north/rules/` — always (custom rules)
- `north/tokens/base.css` — always (hand-authored extensions)
- `north/tokens/generated.css` — always (enables "diff the token changes" workflow in PRs)
- `.north/index.db` — if `index.committable: true`

**What to gitignore:**
- `.north/index.db-wal`, `.north/index.db-shm` — SQLite sidecar files (should never exist if WAL disabled)
- `.north/index.db` — only if `index.committable: false` (default)

**Why commit generated.css?**
- PRs show token changes as reviewable diffs
- CI can verify with `git diff --exit-code` that `north gen` was run
- Drift detection becomes deterministic
- Trade-off: more git churn when dials change (but that's the point — you want to review those changes)

### Merge Conflict Strategy

SQLite files are binary — git cannot merge them. When parallel branches both modify the index:

**Rule: Config is source of truth. Index is derived.**

```bash
# When merge conflict occurs in .north/index.db:

# 1. Accept either version of index.db (doesn't matter which)
git checkout --ours .north/index.db

# 2. Resolve north.config.yaml conflicts normally (it's YAML, git can help)
# ... manual merge ...

# 3. Rebuild index from merged config
north index --rebuild

# 4. Commit the rebuilt index
git add .north/index.db
git commit -m "Rebuild index after merge"
```

**CI safety net:**
```yaml
# GitHub Actions - always rebuild if config changed
- name: Check index freshness
  run: |
    if ! north index --check-fresh; then
      echo "Index stale after merge, rebuilding..."
      north index --rebuild
    fi
```

The index is a cache, not a source of truth. If in doubt, rebuild.

### Schema

```sql
-- Token definitions and their values
CREATE TABLE tokens (
  name TEXT PRIMARY KEY,
  value TEXT,
  file TEXT,
  line INTEGER,
  layer INTEGER,           -- 1-6 per token architecture
  computed_value TEXT      -- resolved value after variable substitution
);

-- Where classes and tokens are used in components
CREATE TABLE usages (
  id INTEGER PRIMARY KEY,
  file TEXT,
  line INTEGER,
  column INTEGER,
  class_name TEXT,
  resolved_token TEXT,     -- which token this class maps to, if any
  context TEXT,            -- primitive | composed | layout
  component TEXT           -- nearest component name
);

-- Detected patterns (class clusters that appear together)
CREATE TABLE patterns (
  hash TEXT PRIMARY KEY,   -- hash of sorted classes
  classes TEXT,            -- JSON array
  count INTEGER,
  locations TEXT           -- JSON array of {file, line, component}
);

-- Forward dependency graph (closure table for transitive queries)
CREATE TABLE token_graph (
  ancestor TEXT,           -- the token being depended on
  descendant TEXT,         -- the token that depends on it
  depth INTEGER,           -- 1 = direct, 2+ = transitive
  path TEXT,               -- JSON array showing resolution chain
  PRIMARY KEY (ancestor, descendant)
);

-- Component composition graph
CREATE TABLE component_graph (
  parent_file TEXT,
  parent_component TEXT,
  child_file TEXT,
  child_component TEXT,
  line INTEGER,
  PRIMARY KEY (parent_file, parent_component, child_file, child_component)
);

-- Similarity cache (precomputed for common queries)
CREATE TABLE similarity (
  source_file TEXT,
  target_file TEXT,
  class_similarity REAL,   -- 0.0 to 1.0
  token_similarity REAL,   -- 0.0 to 1.0
  shared_classes TEXT,     -- JSON array
  shared_tokens TEXT,      -- JSON array
  PRIMARY KEY (source_file, target_file)
);

-- Index metadata
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
-- Tracks: last_full_index, schema_version, file_count, token_count
```

### Graph Relations

The `token_graph` table uses the **closure table pattern** for efficient ancestry queries:

```sql
-- "What depends on --card-padding?" (all descendants)
SELECT descendant, depth, path 
FROM token_graph 
WHERE ancestor = '--card-padding'
ORDER BY depth;

-- "What does --dialog-padding depend on?" (all ancestors)
SELECT ancestor, depth, path 
FROM token_graph 
WHERE descendant = '--dialog-padding'
ORDER BY depth;

-- "What breaks if I change --spacing-md?" (transitive impact)
SELECT DISTINCT u.file, u.line, u.component, g.path
FROM token_graph g
JOIN usages u ON u.resolved_token = g.descendant
WHERE g.ancestor = '--spacing-md';
```

The `component_graph` enables cascade tracing through React composition:

```sql
-- "What wraps Button?" (find parent components)
SELECT parent_file, parent_component, line
FROM component_graph
WHERE child_component = 'Button';

-- "What does Card contain?" (find children)
SELECT child_file, child_component, line
FROM component_graph
WHERE parent_component = 'Card';
```

### Index Maintenance

```bash
north index                 # Full rebuild
north index --watch         # Daemon mode, incremental on file save
north index --status        # Show index health and staleness
```

Index is automatically refreshed when:
- Running `north find`, `north check`, `north refactor` if stale
- File hash mismatches detected
- Config changes invalidate cached computations

CI can skip indexing: `north check --no-index` (slower, but no state)

---

## Refactoring with Confidence

North's refactor command simulates changes before applying them, using the index to trace all dependencies and re-evaluate rules against the simulated state.

### The Refactor Command

```bash
north refactor <target> --to <replacement>
north refactor <target> --to <replacement> --dry-run
north refactor <target> --to <replacement> --cascade
```

### Dry-Run Output

```bash
north refactor "--card-padding" --to "1rem" --dry-run
```

```
Refactor: --card-padding: 1.5rem → 1rem
═══════════════════════════════════════════════════════════════

Direct usages: 23 locations across 12 files
  components/ui/Card.tsx:12         p-(--card-padding)
  components/ui/Dialog.tsx:45       p-(--card-padding)
  components/composed/InfoBox.tsx:8 p-(--card-padding)
  ... (20 more)

Cascade dependencies (via token_graph):
  → --dialog-padding aliases --card-padding (depth: 1)
     └─ 8 usages would inherit change
  → --card-gap references calc(var(--card-padding) * 0.5) (depth: 1)
     └─ Now inconsistent: gap would be 0.5rem, padding 1rem

Rule evaluation after change:
  ✓ no-arbitrary-values: still passing
  ✓ semantic-colors: still passing
  ⚠️ spacing-consistency: WARNING
     card-padding (1rem) < card-gap (1.5rem)
     Cards typically have padding >= internal gap
  ✗ density-bounds: VIOLATION
     1rem violates minimum for "comfortable" density dial
     Current dial setting requires min: 1.25rem

Estimated visual impact:
  • Card content: 0.5rem closer to edges (8px reduction)
  • Dialog content: inherits change via --dialog-padding alias
  • 2 files have calc() expressions that will change proportionally

───────────────────────────────────────────────────────────────
Summary: 23 direct + 8 cascade = 31 total changes
         1 warning, 1 rule violation

Options:
  north refactor "--card-padding" --to "1rem" --apply      # Execute anyway
  north refactor "--card-padding" --to "1.25rem" --dry-run # Try compliant value
  north refactor "--card-padding" --to "1rem" --force      # Bypass rules (not recommended)
```

### Promoting with Similarity

The `--similar` flag transforms `promote` from exact-match to pattern discovery:

```bash
north promote "rounded-lg bg-card p-6 shadow-subtle" --similar --dry-run
```

```
Promotion candidate: rounded-lg bg-card p-6 shadow-subtle
═══════════════════════════════════════════════════════════════

Exact matches: 7 locations
  components/composed/ProfileCard.tsx:12
  components/composed/InfoBox.tsx:23
  components/composed/StatusCard.tsx:8
  components/composed/MetricCard.tsx:31
  ... (3 more)

Similar patterns (≥80% class overlap): 4 locations
  components/composed/SettingsPanel.tsx:8       (91% similar)
    └─ Differs: p-8 instead of p-6
  components/composed/Notification.tsx:15       (87% similar)
    └─ Differs: shadow-sm instead of shadow-subtle
  components/composed/AlertCard.tsx:22          (83% similar)
    └─ Differs: rounded-md instead of rounded-lg
  components/ui/Dialog.tsx:45                   (80% similar)
    └─ Differs: p-8, bg-background instead of bg-card

Variant analysis:
  ┌─────────────┬────────┬──────────┐
  │ Property    │ Common │ Variants │
  ├─────────────┼────────┼──────────┤
  │ padding     │ p-6 (7)│ p-8 (4)  │
  │ shadow      │ subtle │ sm (2)   │
  │ radius      │ lg (10)│ md (1)   │
  │ background  │ card   │ bg (1)   │
  └─────────────┴────────┴──────────┘

💡 Suggested token group:

  /* @theme block (literal values) */
  @theme {
    --spacing-card: 1.5rem;
    --spacing-card-lg: 2rem;
  }

  /* CSS aliases (for semantic naming) */
  :root {
    --card-radius: var(--radius-lg);
    --card-bg: var(--card);
    --card-padding: var(--spacing-card);
    --card-padding-lg: var(--spacing-card-lg);
    --card-shadow: var(--shadow-subtle);
  }

  /* Generated utility (supports variants like hover:card-surface) */
  @utility card-surface {
    border-radius: var(--card-radius);
    background-color: var(--card-bg);
    padding: var(--card-padding);
    box-shadow: var(--card-shadow);
  }

───────────────────────────────────────────────────────────────
Decisions needed:

  ⚠️  4 files use p-8 instead of p-6
      → [N]ormalize all to p-6 (--card-padding)
      → [V]ariants: create --card-padding and --card-padding-lg
      → [S]kip: leave p-8 instances unchanged

  ⚠️  2 files use shadow-sm instead of shadow-subtle  
      → [N]ormalize to shadow-subtle
      → [S]kip: leave as-is (may be intentional)

Run: north promote "rounded-lg bg-card p-6 shadow-subtle" \
       --similar --normalize --apply
```

### The Discovery → Refactor Flow

```
north find --patterns          # What patterns exist?
       ↓
north promote <pattern> --similar --dry-run
                               # What should this become?
       ↓
north refactor <token> --to <value> --dry-run
                               # What if I change this dial?
       ↓
north migrate --dry-run        # Preview all changes
       ↓
north migrate --apply          # Execute with confidence
```

Each step shows consequences. Nothing changes until you say `--apply`.

---

## Project Structure

```
north/                          # Source of truth (always committed)
├── north.config.yaml           # Main config, dials, extends declaration
├── rules/
│   ├── core/                   # Locked rules (from base/org)
│   │   ├── no-raw-palette.yaml
│   │   ├── no-arbitrary-values.yaml
│   │   └── no-inline-color.yaml
│   └── project/                # Project-level rules & overrides
│       └── custom-rules.yaml
├── tokens/
│   ├── base.css                # Hand-authored: extends shadcn, adds scales
│   ├── effects.css             # Hand-authored: composite tokens
│   └── generated.css           # Generated by `north gen` (committed)
└── components/
    └── composed/               # Project-specific composed components

.north/                         # Cache/derived data
└── index.db                    # SQLite index (optionally committed)
```

**Directory convention:**
- `north/` — source files you author or review (always committed)
- `.north/` — derived artifacts and cache (selectively committed)

---

## Configuration

### north.config.yaml

```yaml
# yaml-language-server: $schema=https://north.dev/schema.json

# Extend from org or base
extends: "@myorg/north-base"  # or null for standalone

# Style dials
dials:
  radius: md            # xs | sm | md | lg | full
  shadows: subtle       # none | subtle | default | pronounced
  density: default      # compact | default | comfortable
  contrast: default     # low | default | high

# Typography configuration
typography:
  scale: default        # compact | default | relaxed
  measure:
    min: 45             # Minimum characters per line for prose
    max: 75             # Maximum characters per line for prose

# Policy dials
policy:
  complexity: progressive  # progressive | dense
  # progressive = default to disclosure, expand on demand
  # dense = show more by default, suited for power-user tools

# Rule configuration
rules:
  # Hard errors (cannot be downgraded)
  no-raw-palette: error
  no-arbitrary-colors: error
  no-arbitrary-values: error
  
  # Configurable warnings
  repeated-spacing-pattern:
    level: warn
    threshold: 3          # Flag after N occurrences
    
  component-complexity:
    level: warn
    max-classes: 15       # Raise/lower per project needs
    
  deviation-tracking:
    level: info
    promote-threshold: 3  # Suggest system addition after N deviations

# Third-party component policy
third-party:
  allowed:
    - package: "@radix-ui/*"
      reason: "Headless primitives, styled by shadcn layer"
    - package: "react-day-picker"
      reason: "Calendar primitive"
    - package: "recharts"
      reason: "Charts use --chart-* tokens"
    - package: "cmdk"
      reason: "Command palette primitive"
      
  prohibited: []
  # - package: "some-lib"
  #   reason: "Incompatible with theming"
  #   alternative: "Use X instead"

# Registry configuration
registry:
  namespace: "@myorg"
  url: "https://registry.myorg.com/north/{name}.json"
```

---

## Drift Detection & Prevention

North maintains strict source-of-truth semantics. The config is the source, generated files are artifacts. Drift happens when these diverge.

### Compatibility Declarations

```yaml
# north.config.yaml
compatibility:
  shadcn: "2.1.0"      # Track which shadcn version we're aligned with
  tailwind: "4.0.0"    # Track Tailwind version for feature compatibility
```

### Generated File Protection

Generated files include a header with checksum:

```css
/* 
 * GENERATED BY NORTH — DO NOT EDIT DIRECTLY
 * Source: north.config.yaml
 * Regenerate: north gen
 * Checksum: a3f8c2e9b1d4...
 * 
 * Manual edits will be overwritten and will cause drift warnings.
 */
```

### `north doctor` Drift Checks

```bash
north doctor
```

```
North Health Check
═══════════════════════════════════════════════════════════════

Config:
  ✓ north.config.yaml valid
  ✓ Extends chain resolves: @myorg/north-base → @north/base

Compatibility:
  ✓ shadcn 2.1.0 declared, tokens aligned
  ⚠️ shadcn 2.2.0 available — run `north upgrade --check` to see changes
  ✓ Tailwind 4.0 features supported

Generated Files:
  ✓ tokens/generated.css checksum matches
  ✗ tokens/effects.css was manually modified (line 47)
    → Run `north gen` to regenerate, or `north gen --force` to overwrite

Token Sync:
  ✓ All --color-* tokens have matching shadcn aliases
  ✓ No orphaned shadcn tokens detected

Index:
  ✓ .north/index.db is current (last updated: 2 minutes ago)
```

### `north scan` for New Components

When adding new shadcn components, scan for untracked tokens:

```bash
north scan components/ui/chart.tsx
```

```
Scanning: components/ui/chart.tsx
═══════════════════════════════════════════════════════════════

New tokens detected (not in North config):
  --chart-1    used on line 23
  --chart-2    used on line 24
  --chart-3    used on line 31

Options:
  north add-tokens chart-1 chart-2 chart-3 --from-shadcn
  north add-tokens chart-1 chart-2 chart-3 --values "#8884d8,#82ca9d,#ffc658"
```

### Git Hooks Integration

North provides hooks for lefthook, husky, or raw git hooks:

**lefthook.yml:**
```yaml
pre-commit:
  commands:
    north-check:
      glob: "*.{tsx,ts,css}"
      run: north check --staged
    north-drift:
      glob: "north/**/*"
      run: north doctor --fail-on-drift

pre-push:
  commands:
    north-strict:
      run: north check --strict
```

**package.json (husky):**
```json
{
  "scripts": {
    "prepare": "husky install"
  },
  "husky": {
    "hooks": {
      "pre-commit": "north check --staged && north doctor --fail-on-drift"
    }
  }
}
```

**Raw git hook (.git/hooks/pre-commit):**
```bash
#!/bin/sh
north check --staged || exit 1
north doctor --fail-on-drift || exit 1
```

### CI Integration

```yaml
# .github/workflows/north.yml
name: North Design System
on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Check for drift
        run: npx north doctor --fail-on-drift
      - name: Lint design system
        run: npx north check --strict
      - name: Verify generated files
        run: |
          npx north gen
          git diff --exit-code north/tokens/
```

The final `git diff --exit-code` catches the case where someone forgot to run `north gen` after changing the config.

**Note:** `npx north` works without installation. For faster CI, you can cache npm or add `north` as a devDependency.

### Drift Prevention Flow

```
┌─────────────────────────────────────────────────────────────┐
│  Developer changes north.config.yaml                        │
└─────────────────────┬───────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────────┐
│  Runs `north gen` (or forgets to)                           │
└─────────────────────┬───────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────────┐
│  Git commit triggers pre-commit hook                        │
│  → `north doctor --fail-on-drift`                           │
│  → Blocks commit if generated files are stale               │
└─────────────────────┬───────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────────────┐
│  PR triggers CI                                             │
│  → Regenerates and diffs                                    │
│  → Fails if any generated file would change                 │
└─────────────────────────────────────────────────────────────┘
```

Two gates, same check, drift can't sneak through.

---

## Registry & Distribution

North uses a shadcn-compatible registry format for distributing tokens, rules, and composed components.

### Inheritance Model

```
┌─────────────────────────────────────────┐
│  North Base                             │  ← Core principles, foundational rules
│  (the skill itself)                     │    Default token scales
├─────────────────────────────────────────┤
│  Org Registry                           │  ← Published via shadcn-style registry
│  extends: "@north/base"                 │    Brand tokens, locked rules
│  - Locked rules (can't override)        │    Org-wide components
│  - Configurable rules (with defaults)   │
├─────────────────────────────────────────┤
│  Project                                │  ← Local overrides, extensions
│  extends: "@myorg/north-base"           │    Project-specific components
│  - Rule overrides (where allowed)       │
│  - Extended tokens                      │
└─────────────────────────────────────────┘
```

### Pull-Based Updates

- Projects explicitly pull updates from their upstream registry
- `npx north pull` — fetches latest from extends target
- Review changes before accepting
- Once pulled, you own the code

### Registry Item Types

```json
{
  "$schema": "https://north.dev/schema/registry-item.json",
  "name": "elevated-card",
  "type": "registry:component",
  "dependencies": ["@north/tokens"],
  "files": [
    {
      "path": "components/composed/elevated-card.tsx",
      "content": "..."
    }
  ],
  "cssVars": {
    "theme": {
      "shadow-card-elevated": "var(--shadow-pronounced)"
    }
  }
}
```

---

## Adoption Paths

### Fresh Project

1. Initialize: `npx north init`
2. Configure dials in `north.config.yaml`
3. Start building — agent follows North workflow automatically

### Existing Project

1. Install: `npx north init --audit`
2. Review audit report:
   - Raw palette usage locations
   - Repeated class patterns
   - Magic number instances
3. Decide per-finding:
   - Fix → update to use tokens
   - Enshrine → add as intentional deviation or extend token system
4. Enable enforcement incrementally:
   - Start with warnings only
   - Promote to errors as codebase cleans up

---

## Decision Frameworks for Agents

### Layout Structure Decisions

**Bordered sidebar vs flowing content:**
```
Is the sidebar navigation-heavy?
├── Yes → Bordered/elevated treatment, clear separation
└── No → Is it contextual/inspector-style?
    ├── Yes → Flow with content, subtle or no border
    └── No → Default to bordered for clarity
```

**Panel density:**
```
Is this a tooling/productivity app?
├── Yes → Bordered panels, clear hierarchy, compact density option
└── No → Is it content-focused (reading, media)?
    ├── Yes → Minimal separation, comfortable density
    └── No → Default treatment
```

### Progressive Disclosure Decisions

```
Does this form/panel have more than 5 fields/options?
├── Yes → Group into sections
│   └── Are some fields rarely used?
│       ├── Yes → Collapse secondary groups by default
│       └── No → Show all groups, use visual hierarchy
└── No → Show all fields, single section
```

---

## Open Questions

### Resolved in this revision
- ✅ Target stack: React + Tailwind v4 + shadcn for v0.1
- ✅ Color model: OKLCH (matches shadcn), full values not tuples
- ✅ Enforcement posture: Agent lint + CI (both required)
- ✅ Deviation format: Machine-readable `@north-deviation` comments
- ✅ Opacity policy: Modifiers allowed on semantic tokens
- ✅ Third-party handling: Exception list + extend/wrap pattern
- ✅ Motion: Fast-follow, not v0.1
- ✅ Theme switching: Runtime for light/dark/contrast, build-time for dial changes
- ✅ Context classification: Path convention primary, JSDoc annotation fallback
- ✅ Spacing philosophy: Named keys preferred, numeric tolerated in layouts, progressive adoption
- ✅ Dial computation: CLI command (`north gen`)
- ✅ `north check` output: JSON report + deviation histogram + token promotion suggestions
- ✅ CLI architecture: Thin wrapper over ast-grep, cross-file analysis, ecosystem integration
- ✅ Arbitrary values: Ban literals, allow `-(--token)` variable shorthand
- ✅ @theme vs @theme inline: Use @theme for keys, CSS cascade for runtime switching
- ✅ **Density inheritance:** React context for orchestration, CSS variables for values (components stay dumb)
- ✅ **Color bridge direction:** North owns source of truth, generates both Tailwind (`@theme`) and shadcn (`:root` aliases)
- ✅ **Sensible defaults:** shadcn-compatible where they have opinions, North fills gaps (spacing, shadows, typography)
- ✅ **Drift detection:** `north doctor` checks, generated file checksums, git hooks integration

### Still open
- [ ] **Figma integration:** Should there be a Figma plugin for designer ↔ developer token sync? If so, what's the source of truth direction?
- [ ] **SwiftUI extension:** Separate skill or unified spec with platform-specific sections?
- [ ] **Registry governance:** 
  - How do "locked rules" work mechanically — just config prevention, or signed/verified items?
  - Version pinning strategy (exact vs ranges)

### Resolved: CLI Distribution

**Decision: Node/Bun for v0.1, Rust later if needed**

North ships as a Bun-first Node package, executable via `npx north` or `bunx north` with zero local install required (like Cloudflare's wrangler).

**Runtime & Tooling:**
- **Bun** as primary runtime — fast, batteries-included (bundler, test runner, SQLite native)
- **Polyglot monorepo** from day one — structured for future Rust additions
- **Mise** added later if/when Rust components are needed
- ast-grep via `@ast-grep/napi` npm package

**Remote execution model (like wrangler):**
```bash
# Works immediately, no install
npx north check
bunx north init

# Or install locally for speed
bun add -d north
```

**Committable index for CI:**
```yaml
# north.config.yaml
index:
  path: ".north/index.db"
  committable: true  # Include in repo for CI use
```

When `committable: true`:
- Index is generated locally, committed to repo
- CI uses committed index directly (no rebuild)
- `north check` skips indexing if committed index is fresh
- `north index --refresh` updates committed index

**CI workflow (stateless):**
```yaml
- name: North check
  run: npx north check  # Uses committed index, no rebuild needed
```

**Why this approach:**
- Zero friction for target audience (React/Tailwind devs already have Node)
- Fast iteration on product before optimizing plumbing
- Bun's native SQLite avoids native module headaches
- Committable index makes CI stateless and fast
- Polyglot structure means Rust rewrite is additive, not disruptive

### Long-Term Roadmap

**Language Server Protocol (LSP)**

An LSP server transforms North from a CLI tool into a real-time development companion. The index architecture makes this feasible — without it, every keystroke would trigger a full scan.

| Phase | Interface | Latency | Experience |
|-------|-----------|---------|------------|
| v0.1 | CLI | seconds | "run check, fix, repeat" |
| v0.2 | CLI + SQLite index | <100ms | "instant find, fast refactor" |
| v0.3 | LSP | real-time | "the system is always watching" |

**LSP features (priority order):**

1. **Diagnostics** — Lint errors appear as you type, not when you run check
2. **Hover** — "What is bg-primary?" → shows `oklch(0.546...) from --primary`
3. **Code actions** — "Replace bg-blue-500 with bg-primary" as a quick-fix
4. **Go to definition** — Click a token usage, jump to its declaration in CSS
5. **Find references** — "Where is --card-padding used?" across the codebase
6. **Rename symbol** — Refactor a token name safely across all files
7. **Completions** — Suggest only valid semantic classes, not raw palette
8. **Inlay hints** — Show resolved values inline (optional, subtle)

**Implementation approach:**
- Separate binary (`north-lsp`) or subcommand (`north lsp --stdio`)
- Shares core with CLI, queries the same SQLite index
- Editors launch it via standard LSP configuration
- Index kept warm by `north index --watch` daemon

**Why this matters:**
The LSP closes the feedback loop. Today: write code → run check → see errors → fix. With LSP: write code → see errors immediately → fix as you go. The design system becomes ambient rather than a checkpoint.

---

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

North's CLI generates the `@theme` block from `north.config.yaml`:

```bash
north gen  # Outputs north/tokens/generated.css
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

---

## Implementation Notes (Logged for Build Phase)

Items surfaced during spec review that don't require spec changes but should be addressed during implementation:

### From External Reviews

**LLM-Friendly Error Output (Gemini)**
- `north check` errors should include "nearest neighbor" token suggestions
- Example: "Arbitrary value `w-[347px]`. Closest tokens: `--sidebar-width (320px)`, `--container-prose (65ch)`"
- Index should be queryable for token proximity matching
- Consider JSON/structured output mode for agent consumption

**Agent Lockout Prevention (Gemini)**
- If an agent fails lint 3+ times on same issue, consider allowing force-commit with `@north-deviation`
- Prevents infinite correction loops
- May be too prescriptive — evaluate during agent testing

**`north context --compact` (Gemini)**
- Add a minified output mode for system prompt injection
- "We are using North. Primary: `oklch(...)`. Spacing scale: `md=1rem`. No arbitrary values."
- Helps agents with limited context windows

**Index Determinism (ChatGPT)** ✅ *Now in spec*
- Determinism requirements promoted to Index Architecture section
- Consider `index.jsonl` as alternative committable format if SQLite merges prove painful (future)

**Rule Taxonomy (ChatGPT)**
- Finalize canonical rule IDs before publishing registry items
- Consider splitting `no-arbitrary-values` into:
  - `no-arbitrary-literals` (ban brackets without `var(--`)
  - `no-arbitrary-colors` (separate, already exists)
- Token-anchored expressions route through multiplier policy + promote logic

**`@utility` vs `@apply` (ChatGPT)**
- When promoting utilities that need variant support (`hover:`, `focus:`, responsive), use `@utility`
- Document `@reference` requirement for CSS modules/Vue/Svelte `<style>` blocks

**ast-grep File Conventions (ChatGPT)**
- `**/*.{tsx,jsx}` → `language: tsx`
- `**/*.{ts,js}` → `language: typescript` (for non-JSX rules like import checks)

### Future Considerations (v0.2+)

**Visual Regression Integration**
- North ensures *code structure* is correct, not that it *looks* correct
- An agent could use valid tokens but produce broken UI (e.g., `--text-display` in a tiny button)
- Future: integrate with screenshot diffing or computed style verification
- Requires headless browser — significant scope expansion

**Promotion Output Format**
- Standardize on `@utility` blocks for named utilities (done in spec)
- Keep `@apply` as implementation detail inside `@utility` body where needed

---

## Changelog

### 0.1.0-draft-8 (January 2025)
- **Generated CSS now committed:** Removed from .gitignore, enables "diff the token changes" workflow in PRs
- **Directory convention clarified:** `north/` for source of truth, `.north/` for cache/derived data
- **Install story standardized:** npx/bunx is blessed path, removed curl install script from examples
- **Rule names standardized:** Fixed remaining `no-magic-numbers` and `no-numeric-spacing` references to canonical `no-arbitrary-values`
- **Path format normalized:** Consistent `north/` (no leading `./`)

### 0.1.0-draft-7 (January 2025)
- **Fixed CLI distribution contradiction:** Changed "binary distribution" to "zero-install distribution" (npx/bunx)
- **Cascade debugger output labeled conceptual:** Actual CSS may use color-mix() or other modern features
- **Index determinism promoted to spec:** WAL disabled, stable insertion order, content hash, schema version
- **Git configuration documented:** Explicit guidance on what to commit vs gitignore
- **Merge conflict strategy added:** Index is derived data; on conflict, rebuild from merged config
- **CI safety net example:** Auto-rebuild if index stale after merge

### 0.1.0-draft-6 (January 2025)
- **Promoted utilities use `@utility`:** Updated to use Tailwind v4's `@utility` directive for proper variant support
- **Browser floor documented:** Added Tailwind v4 browser requirements (Safari 16.4+, Chrome 111+, Firefox 128+)
- **Cascade debugger MVP scoped:** Explicitly defined v0.1 guarantees vs deferred features
- **Implementation notes added:** Logged items from external reviews for build phase (LLM-friendly errors, agent lockout prevention, index determinism, etc.)

### 0.1.0-draft-5 (January 2025)
- **Density inheritance resolved:** React context for orchestration, CSS variables for values
- **Color bridge resolved:** North owns source of truth, generates both Tailwind and shadcn tokens
- **Sensible defaults resolved:** shadcn-compatible where they have opinions, North fills gaps
- **CLI distribution resolved:** Bun-first Node package, polyglot monorepo, Rust later if needed
- **Committable index:** Optional setting for stateless CI (`index.committable: true`)
- **Drift detection:** Added comprehensive section with `north doctor`, generated file checksums, `north scan`
- **Git hooks integration:** lefthook, husky, and raw git hook examples for pre-commit/pre-push
- **CI integration:** GitHub Actions workflow for drift detection
- Fixed `north promote` to respect `@theme` literal value rule
- Added color bridge note for ring/shadcn token mirroring
- Added calc multiplier policy (token math allowed, base is what matters)
- Standardized rule naming to `no-arbitrary-values`
- Fixed ast-grep rule examples to use `kind: string_fragment` consistently

### 0.1.0-draft-4 (January 2025)
- **Index architecture:** Added SQLite index for instant queries (tokens, usages, patterns, graphs)
- **Graph relations:** Added closure table pattern for token and component dependency traversal
- **Refactor command:** `north refactor --dry-run` simulates changes with full cascade tracing
- **Promote with similarity:** `north promote --similar` discovers variants and suggests token groups
- **Discovery → refactor flow:** Documented the full pattern-to-token graduation workflow
- **LSP roadmap:** Added long-term roadmap section with LSP feature priority list
- Expanded CLI as "power tool" philosophy (discovery first, enforcement last)
- Added cascade debugger and similarity finder to CLI commands
- Added `north index` commands for index maintenance
- Fixed `north promote` to write literals to `@theme` (was incorrectly showing `var()` references)
- Added color bridge note: shadcn tokens mirrored to Tailwind `--color-*` namespace
- Added calc multiplier policy (token math allowed, base is what matters)
- Standardized rule naming to `no-arbitrary-values` (was inconsistent: `no-magic-spacing`, `no-arbitrary-literal-values`)
- Fixed ast-grep rule example to use `kind: string_fragment` consistently
- Added TSX vs TypeScript parser note for ast-grep rules

### 0.1.0-draft-3 (January 2025)
- Added theme switching model section (runtime vs build-time)
- Added context classification system (path convention + JSDoc)
- Clarified spacing philosophy (named preferred, numeric tolerated, progressive)
- Fixed Tailwind @theme vs @theme inline usage
- Added variable shorthand `-(--token)` as approved escape hatch
- Added color format requirement (full OKLCH values, not tuples)
- Added comprehensive CLI architecture section
- Detailed `north check` output artifacts (JSON, histogram, promotions)
- Added ecosystem integration approach (ast-grep, Tailwind, PostCSS)
- Added rules-by-context table (primitive/composed/layout strictness levels)
- Updated open questions with newly resolved items

### 0.1.0-draft-2 (January 2025)
- Added contrast dial (7th dial)
- Split composite effects into per-property tokens (valid CSS)
- Reframed complexity as policy dial, separate from style dials
- Added target stack and scope of truth declarations
- Added Tailwind class vocabulary contract (allowed/prohibited/warning)
- Added opacity modifier policy (allowed on semantic tokens)
- Expanded token coverage: z-index layers, breakpoints, typography roles, component-level tokens
- Added typography inheritance and rhythm tokens
- Added third-party component policy (exception list, extend/wrap pattern)
- Added machine-readable deviation format (`@north-deviation`, `@north-candidate`)
- Clarified enforcement posture (agent lint + CI, both required)
- Added motion tokens as fast-follow placeholder
- Updated appendix with more ast-grep rules and Tailwind theme extension example
- Resolved multiple open questions, added new specific open items

### 0.1.0-draft (January 2025)
- Initial specification draft
- Core concepts: dials, token architecture, enforcement
- Registry model based on shadcn format
- ast-grep rule structure defined