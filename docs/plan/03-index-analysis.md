# Phase 3: Index & Analysis

**Timeline:** 5-7 days  
**Status:** Pending

## Goal

SQLite index enables fast cross-file queries.

## Overview

This phase builds the persistent index that unlocks North's power features. The index stores tokens, usage sites, relationships, and enables cross-file analysis that single-file linting can't provide.

**Scope:** Index is the unlock for Phases 4 and 5. Get it right.

## Tasks

### 3.1 Index Schema

- [ ] Create tables: `tokens`, `usages`, `patterns`, `token_graph`, `component_graph`, `meta`
- [ ] Closure table for `token_graph`
- [ ] Determinism constraints (no WAL, stable inserts)
- [ ] Add `meta.source_tree_hash` for freshness validation

**MVP cut:** For faster ship, defer `similarity` cache and `component_graph` to v0.2. Compute similarity on-demand, skip wrapper chain analysis initially.

### 3.2 Token Resolution (Narrow Scope)

**Avoid the tarpit:** "Resolve Tailwind classes to tokens" can balloon into reimplementing Tailwind. Keep it narrow for v0.1:

Resolve (confident mapping):
- Variable shorthand `p-(--token)` → token usage
- Semantic color classes with all prefixes:
  - `bg-primary` → `--color-primary`
  - `text-primary` → `--color-primary`
  - `border-primary` → `--color-primary`
  - `ring-ring/20` → `--color-ring`
  - `fill-primary`, `stroke-primary` → `--color-primary`
- Direct semantic classes: `bg-background`, `text-foreground`, `border-border`
- `var(--x)` references in CSS files

Record but don't resolve (still useful for patterns):
- Standard Tailwind classes (`p-4`, `rounded-lg`) → recorded in `usages.class_name`
- Everything else → "unresolved class"

This is enough for:
- Similarity (class overlap + resolved token overlap)
- Pattern detection (class clusters)
- Refactor impact (token_graph from CSS parsing)
- `find --colors` with meaningful coverage

...without needing Tailwind's internal class generation logic.

### 3.3 Index Builder

- [ ] Scan all TSX/JSX files
- [ ] Apply extraction contract from Phase 2
- [ ] Parse CSS files via PostCSS for token definitions
- [ ] Build `token_graph` from `var(--x)` references in token values
- [ ] Compute content hash
- [ ] Store `meta.source_tree_hash` (git tree hash or file content hash)
- [ ] Keep SQL queries in dedicated `queries.ts` module (recursive CTEs are tricky)

### 3.4 Index Commands

- [ ] `north index` — full rebuild
- [ ] `north index --check-fresh` — validate freshness
- [ ] `north index --status` — show stats

### 3.5 Context Classification (upgraded from Phase 2)

- [ ] JSDoc annotation parsing (`@north context:layout`)
- [ ] Store context in `usages` table
- [ ] Path-based detection now persisted, not just runtime

### 3.6 Tables Populated in v0.1

| Table | v0.1 Status |
|-------|-------------|
| `tokens` | ✅ Full |
| `usages` | ✅ Full |
| `token_graph` | ✅ Full (closure table) |
| `meta` | ✅ Full |
| `patterns` | ✅ Basic (class clusters) |
| `component_graph` | ❌ Deferred to v0.2 |
| `similarity` | ❌ Deferred (compute on-demand) |

**Cascade debugger scope alignment:** The spec's MVP scope for `find --cascade` is tokens + theme + file location. Wrapper chain analysis (which needs `component_graph`) is v0.2. Plan and spec are aligned.

## Exit Criteria

- `.north/index.db` created successfully
- Queries work and return correct results
- `north check` uses index for context classification
- `north index --status` shows accurate statistics
- Freshness validation detects stale index

## Key Details

### Determinism

The index must be deterministic for reliable testing and reproducibility:
- No WAL mode (causes non-deterministic file contents)
- Stable insert order
- Predictable hash computation
- Documented freshness strategy

### Token Resolution Philosophy

Don't try to be Tailwind. Map the subset we care about (semantic design tokens), record everything else as patterns. This is enough for all v0.1 features.

### SQL Query Complexity

Recursive CTEs for closure table traversal are tricky. Keep these in a dedicated `queries.ts` module with good documentation and tests.

## Dependencies

- **Requires:** Phase 1 (Config & Generation), Phase 2 (Linting)

## Cross-References

### Spec Documents

- [11-index-architecture.md](../spec/11-index-architecture.md) - Complete index schema and rationale
- [03-token-architecture.md](../spec/03-token-architecture.md) - Token system
- [15-drift-detection.md](../spec/15-drift-detection.md) - Freshness validation
- [12-refactoring.md](../spec/12-refactoring.md) - How index enables refactoring

### Related Phases

- **Requires:** Phase 1 (Config & Generation), Phase 2 (Linting)
- **Enables:** Phase 4 (Discovery Tools), Phase 5 (Evolution Tools)
- **Enhanced by:** Phase 6 (Doctor adds health checks)

## Key Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Token resolution becomes Tailwind reimplementation | Keep narrow scope: variable shorthand + semantic colors only |
| better-sqlite3 native module issues | Test on all platforms early, have fallback to slower pure-JS option if needed |
| Index merge conflicts | Config is truth, index is cache — clear policy already defined |
| SQL query complexity causes bugs | Dedicated queries module, comprehensive tests, clear documentation |
| Freshness detection too slow | Use git tree hash when available, fall back to content hashing |

## Notes

- Index is a cache, config is truth
- Don't commit `.north/index.db` to git (add to `.gitignore`)
- Test with `examples/nextjs-shadcn` to ensure realistic performance
- Recursive CTEs need careful testing - they're powerful but tricky
- Component graph and similarity cache deferred to v0.2 for faster shipping
