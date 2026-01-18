# Phase 5: Evolution Tools

**Timeline:** 4-5 days  
**Status:** Pending

## Goal

`north promote` and `north refactor` work end-to-end.

## Overview

This phase implements the evolution tools that help design systems grow intentionally. These tools enable safe refactoring and pattern promotion with full impact analysis.

**Note:** This phase can run in parallel with Phase 4 after Phase 3 completes.

## Tasks

### 5.1 Promote Command

- [ ] `north promote <pattern> --as <name>`
- [ ] `--similar` flag for variant discovery
- [ ] `--dry-run` shows what would change
- [ ] Generates `@theme` additions (literal values)
- [ ] Generates `@utility` definitions
- [ ] Suggests codemods

### 5.2 Refactor Command

- [ ] `north refactor <token> --to <value>`
- [ ] `--dry-run` simulates change
- [ ] Cascade impact analysis via `token_graph`
- [ ] Rule re-evaluation against simulated state
- [ ] `--apply` executes changes

## Exit Criteria

- `north promote --dry-run` shows accurate preview
- `north refactor --dry-run` shows complete impact analysis
- `--apply` flag actually executes changes correctly
- Codemods generated are accurate and safe
- Both commands work with real-world patterns

## Key Details

### Promote Command

Takes a repeated class pattern and promotes it to a design token or utility class.

**Example workflow:**
```bash
# Find similar components
north find --similar components/Button.tsx

# Promote common pattern
north promote "px-4 py-2 rounded-lg" --as "button-base" --dry-run

# Review output, then apply
north promote "px-4 py-2 rounded-lg" --as "button-base"
```

**Output:**
- Generates `@theme` additions for literal values
- Generates `@utility` definitions for class patterns
- Suggests codemods to update usage sites
- Uses `--similar` flag to find variants automatically

### Refactor Command

Changes a token value and shows cascade impact.

**Example workflow:**
```bash
# See what would change
north refactor --color-primary --to "hsl(210 50% 50%)" --dry-run

# Review impact, then apply
north refactor --color-primary --to "hsl(210 50% 50%)" --apply
```

**Impact analysis includes:**
- Direct usages (components using `bg-primary`)
- Downstream tokens (tokens derived from `--color-primary`)
- Rule violations introduced by change
- Components affected

### Safety

Both commands require `--dry-run` first (or explicit confirmation) for destructive operations. Never silently change user code.

## Dependencies

- **Requires:** Phase 3 (Index & Analysis)

## Cross-References

### Spec Documents

- [12-refactoring.md](../spec/12-refactoring.md) - Refactoring methodology
- [15-drift-detection.md](../spec/15-drift-detection.md) - Impact analysis
- [10-cli-architecture.md](../spec/10-cli-architecture.md) - Command interface
- [11-index-architecture.md](../spec/11-index-architecture.md) - Graph traversal for impact

### Related Phases

- **Requires:** Phase 3 (Index & Analysis)
- **Parallel with:** Phase 4 (Discovery Tools)
- **Leads to:** Phase 6 (Doctor & Polish)

## Key Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Impact analysis misses edge cases | Comprehensive testing, clear documentation of limitations |
| Codemods break code | Conservative generation, require user review, provide escape hatches |
| Token graph traversal bugs | Thorough testing of recursive queries, edge case handling |
| User confusion about dry-run vs apply | Clear UX, require confirmation for destructive ops |

## Notes

- **Safety first:** Never silently change code. Always show preview, require confirmation.
- Codemods are suggestions, not automatic (agents can apply them)
- Test against `examples/nextjs-shadcn` constantly
- Token graph (closure table) enables efficient cascade analysis
- Both commands output JSON for agent consumption
