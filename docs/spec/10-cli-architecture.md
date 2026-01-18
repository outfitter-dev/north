
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

