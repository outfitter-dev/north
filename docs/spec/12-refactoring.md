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

