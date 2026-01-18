# North Implementation Plan

This directory contains the phased implementation plan for North v0.1.

## Overview

North is being built in 7 phases over approximately 5-6 weeks. Each phase has clear goals, tasks, and exit criteria.

## Phases

### [Phase 0: Scaffolding](./00-scaffolding.md)
**Timeline:** 1-2 days  
**Goal:** Monorepo exists, tooling configured, CI green.

Sets up the monorepo structure, tooling, and basic CLI entrypoint.

### [Phase 1: Config & Generation](./01-config-generation.md)
**Timeline:** 3-4 days  
**Goal:** `north init` and `north gen` work end-to-end.

Implements configuration system and token generation engine.

### [Phase 2: Linting](./02-linting.md)
**Timeline:** 4-5 days  
**Goal:** `north check` catches design system violations.

Builds the linting engine with ast-grep integration and classname extraction.

### [Phase 3: Index & Analysis](./03-index-analysis.md)
**Timeline:** 5-7 days  
**Goal:** SQLite index enables fast cross-file queries.

Creates the persistent index that unlocks power features.

### [Phase 4: Discovery Tools](./04-discovery-tools.md)
**Timeline:** 5-7 days  
**Goal:** `north find` family of commands work.

Implements discovery tools for understanding design system usage.

**Note:** Can run in parallel with Phase 5 after Phase 3.

### [Phase 5: Evolution Tools](./05-evolution-tools.md)
**Timeline:** 4-5 days  
**Goal:** `north promote` and `north refactor` work.

Implements tools for safe refactoring and pattern promotion.

**Note:** Can run in parallel with Phase 4 after Phase 3.

### [Phase 6: Doctor & Polish](./06-doctor-polish.md)
**Timeline:** 2-3 days  
**Goal:** `north doctor` full health check, polish CLI UX.

Completes the doctor command and polishes overall experience.

## Build Order

```
Phase 0: Scaffolding
    │
    ▼
Phase 1: Config & Gen ──────────────────┐
    │                                   │
    ▼                                   │
Phase 2: Linting                        │
    │                                   │
    ▼                                   │
Phase 3: Index ◄────────────────────────┘
    │
    ├─────────────┬─────────────┐
    ▼             ▼             ▼
Phase 4:      Phase 5:      Phase 6:
Discovery     Evolution     Doctor
    │             │             │
    └─────────────┴─────────────┘
                  │
                  ▼
              v0.1 Release
```

## Critical Path

The critical path for v0.1 release is: **0 → 1 → 2 → 3 → 6**

Phases 4 and 5 can run in parallel after Phase 3 completes.

## Timeline Summary

| Phase | Days | Cumulative |
|-------|------|------------|
| 0: Scaffolding | 1-2 | 2 |
| 1: Config & Gen | 3-4 | 6 |
| 2: Linting | 4-5 | 11 |
| 3: Index | 5-7 | 18 |
| 4: Discovery | 5-7 | 25 |
| 5: Evolution | 4-5 | 30 |
| 6: Doctor & Polish | 2-3 | 33 |

**MVP (Phases 0-2):** ~11 days → `north init && north gen && north check`

**Full v0.1:** ~5-6 weeks

## Milestones

### MVP (Phases 0-2)
- Configuration and token generation
- Basic linting with single-file rules
- Can be shipped and is immediately useful

### Power Features (Phases 3-5)
- Cross-file analysis
- Discovery and evolution tools
- Requires index from Phase 3

### Polish (Phase 6)
- Complete health checks
- Refined UX
- Ready for external adoption

## Key Principles

- **Ship incrementally:** Phase 1-2 is useful alone. Ship it, get feedback.
- **Index is the unlock:** Power features depend on it. Get it right.
- **Don't over-engineer rules:** 3 core rules that work perfectly.
- **Cascade debugger is the demo:** Makes people say "I need this."
- **Dogfood relentlessly:** Run against `examples/nextjs-shadcn` constantly.

## Related Documentation

- **Spec Docs:** [`../spec/`](../spec/) - What North is (architecture, features, design)
- **Root PLAN.md:** [`../../PLAN.md`](../../PLAN.md) - Quick reference version
- **Root Overview:** [`../../OVERVIEW.md`](../../OVERVIEW.md) - Project introduction

## Success Criteria

**v0.1 is successful if:**

1. `npx @outfitter/north init` works in fresh Next.js + shadcn project
2. `north gen` produces valid Tailwind v4 CSS
3. `north check` catches raw palette and arbitrary values
4. `north find --cascade` traces a real styling issue
5. Docs sufficient for self-serve setup
