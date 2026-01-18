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

