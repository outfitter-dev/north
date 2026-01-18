# Phase 4: Discovery Tools

**Timeline:** 5-7 days  
**Status:** Pending

## Goal

`north find` family of commands work end-to-end.

## Overview

This phase builds the discovery tools that help developers understand their design system usage. These tools leverage the index built in Phase 3 to provide insights that aren't possible with single-file analysis.

**Note:** This phase can run in parallel with Phase 5 after Phase 3 completes.

## Tasks

### 4.1 Basic Finders

- [ ] `north find --colors` — color usage report
- [ ] `north find --spacing` — spacing analysis
- [ ] `north find --patterns` — repeated class clusters
- [ ] `north find --tokens` — token usage stats

### 4.2 Cascade Debugger

- [ ] `north find --cascade <selector>`
- [ ] Tailwind class → CSS resolution
- [ ] CSS variable chain tracing
- [ ] Component wrapper detection
- [ ] Formatted output with suggestions

### 4.3 Similarity Finder

- [ ] `north find --similar <file>`
- [ ] Class pattern matching (Jaccard similarity)
- [ ] Token usage matching
- [ ] Threshold filtering (≥80%)

## Exit Criteria

- `north find --cascade` traces resolution chain correctly
- `north find --colors` shows accurate color usage
- `north find --similar` identifies duplicate-ish components
- All finders produce both human-readable and JSON output
- Performance acceptable on real-world codebases

## Key Details

### Cascade Debugger

This is the demo feature. Makes people say "I need this."

**MVP scope:** Tokens + theme + file location. Wrapper chain analysis (component graph) deferred to v0.2.

Example output:
```
north find --cascade ".btn-primary"

Cascade trace:
  .btn-primary
  → bg-primary (Tailwind utility)
  → --color-primary (CSS variable)
  → hsl(222.2 47.4% 11.2%) (base value)
  → Dial: primary.base = 222

Used in:
  - components/Button.tsx:12
  - components/CTA.tsx:8
```

### Similarity Finder

Use Jaccard similarity on both:
- Raw class names (set intersection)
- Resolved token usage

Threshold at ≥80% by default. This catches "basically the same component" cases.

### Basic Finders

These provide quick insights:
- Color usage helps find palette sprawl
- Spacing analysis shows consistency
- Pattern detection finds repeated class clusters (candidates for components)
- Token stats show adoption/coverage

## Dependencies

- **Requires:** Phase 3 (Index & Analysis)

## Cross-References

### Spec Documents

- [11-index-architecture.md](../spec/11-index-architecture.md) - Query capabilities
- [12-refactoring.md](../spec/12-refactoring.md) - Similarity and pattern detection
- [10-cli-architecture.md](../spec/10-cli-architecture.md) - Command interface

### Related Phases

- **Requires:** Phase 3 (Index & Analysis)
- **Parallel with:** Phase 5 (Evolution Tools)
- **Leads to:** Phase 6 (Doctor & Polish)

## Key Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Cascade debugger too complex | Keep MVP scope narrow, defer wrapper analysis |
| Similarity false positives | Tune threshold based on real-world testing |
| Performance on large codebases | Test with realistic repos, optimize queries if needed |
| Output formatting inconsistent | Establish formatting patterns early, reuse across commands |

## Notes

- Cascade debugger is the killer feature - invest in good output formatting
- JSON output is first-class (agents need it)
- Test with `examples/nextjs-shadcn` constantly
- Pattern detection uses basic class clustering (no ML needed)
- Similarity computation is on-demand (no cache in v0.1)
