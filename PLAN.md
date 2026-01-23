# North Implementation Plan

> Implementation roadmap for North v0.1 — the self-enforcing design system skill.

**Spec:** `north-spec.md`  
**Package:** `@outfitter/north`  
**CLI Command:** `north`  
**Config Directory:** `.north/` (cache), `north/` (source)

---

## Monorepo Structure

**Note:** The repo root is `north-repo/` to avoid confusion with the in-project `north/` config directory.

```
north-repo/                       # Repo root (not "north/" to avoid confusion)
├── .github/
│   └── workflows/
│       ├── ci.yml                # Lint, test, build
│       └── release.yml           # npm publish on tag
├── packages/
│   └── north/                    # Main CLI package (@outfitter/north)
│       ├── src/
│       │   ├── cli/              # Command implementations
│       │   │   ├── init.ts
│       │   │   ├── gen.ts
│       │   │   ├── check.ts
│       │   │   ├── find.ts
│       │   │   ├── promote.ts
│       │   │   ├── refactor.ts
│       │   │   ├── doctor.ts
│       │   │   └── index-cmd.ts
│       │   ├── core/             # Core logic
│       │   │   ├── config.ts     # Config loading/validation
│       │   │   ├── tokens.ts     # Token generation
│       │   │   ├── lint.ts       # ast-grep integration
│       │   │   ├── extract.ts    # Classname extraction contract
│       │   │   └── index.ts
│       │   ├── index/            # SQLite index
│       │   │   ├── schema.ts     # Table definitions
│       │   │   ├── build.ts      # Index builder
│       │   │   ├── query.ts      # Query helpers
│       │   │   └── graph.ts      # Closure table ops
│       │   ├── analysis/         # Cross-file analysis
│       │   │   ├── cascade.ts    # Cascade debugger
│       │   │   ├── similar.ts    # Similarity finder
│       │   │   └── patterns.ts   # Pattern detection
│       │   └── utils/
│       │       ├── fs.ts
│       │       ├── hash.ts
│       │       └── format.ts
│       ├── templates/            # Scaffolding templates
│       │   ├── .north/config.yaml
│       │   ├── tokens/
│       │   │   └── base.css
│       │   └── rules/
│       │       └── core/
│       ├── test/
│       │   ├── cli/
│       │   ├── core/
│       │   └── fixtures/
│       ├── package.json
│       └── tsconfig.json
├── examples/                     # Dogfood playground (workspace package)
│   └── nextjs-shadcn/
│       ├── package.json          # Workspace member
│       └── ...                   # Real Next.js + shadcn app
├── docs/                         # Documentation site (future)
├── lefthook.yml
├── biome.json
├── bun.lockb
├── package.json                  # Workspace root
├── turbo.json                    # Turborepo config
└── README.md
```

---

## Tooling Configuration

### Package Manager & Runtime

```json
// package.json (root)
{
  "name": "north-monorepo",
  "private": true,
  "workspaces": ["packages/*", "examples/*"],
  "scripts": {
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "check": "biome check .",
    "format": "biome format --write ."
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "ultracite": "^4.0.0",
    "lefthook": "^1.6.0",
    "turbo": "^2.0.0",
    "typescript": "^5.4.0"
  },
  "packageManager": "bun@1.1.0"
}
```

### Turborepo

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"],
      "cache": true
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "cache": true
    },
    "lint": {
      "cache": true
    }
  }
}
```

### Biome (via Ultracite)

```json
// biome.json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "extends": ["ultracite/biome"],
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  }
}
```

**Note:** `ultracite` provides the shared config. Make sure it's in devDependencies.

### Lefthook

```yaml
# lefthook.yml
pre-commit:
  parallel: true
  commands:
    biome:
      glob: "*.{ts,tsx,js,jsx,json}"
      run: bunx biome check --staged --no-errors-on-unmatched
    typecheck:
      glob: "*.{ts,tsx}"
      run: bun run typecheck

pre-push:
  commands:
    test:
      run: bun test
```

---

## Dependencies

### Core Dependencies

```json
// packages/north/package.json
{
  "name": "@outfitter/north",
  "version": "0.1.0",
  "bin": {
    "north": "./dist/cli.js"
  },
  "dependencies": {
    "@ast-grep/napi": "^0.25.0",
    "better-sqlite3": "^11.0.0",
    "yaml": "^2.4.0",
    "chalk": "^5.3.0",
    "commander": "^12.0.0",
    "glob": "^10.4.0",
    "ora": "^8.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.9",
    "@types/bun": "latest",
    "typescript": "^5.4.0"
  }
}
```

**SQLite decision:** Using `better-sqlite3` (native addon).

**Trade-offs acknowledged:**
- Native module means platform-specific binaries (prebuild handles most cases)
- Users running `npx @outfitter/north check` for basic linting work without SQLite
- Index-dependent features (`find --cascade`, `find --similar`, `promote`) require the native module
- If prebuild fails, user sees clear error: "Install @outfitter/north locally for full features"

**Not doing:** Fallback to sql.js/WASM. Adds complexity for marginal gain. Keep it simple.

```
# Basic linting works everywhere
npx @outfitter/north check

# For full features, install locally
bun add -d @outfitter/north
north find --cascade ".btn"
```

### ast-grep Integration

```typescript
import { parse, Lang } from '@ast-grep/napi';

const source = `<div className="bg-blue-500 p-4" />`;
const root = parse(Lang.Tsx, source).root();

// Find className attributes
const classNames = root.findAll({
  rule: { kind: 'string_fragment' }
});
```

---

## Phased Milestones

### Phase 0: Scaffolding (1-2 days)

**Goal:** Monorepo exists, tooling configured, CI green.

- [ ] Initialize monorepo with Bun workspaces
- [ ] Configure Turborepo
- [ ] Set up Biome + Ultracite
- [ ] Configure Lefthook
- [ ] Set up GitHub Actions (lint, test)
- [ ] Create `packages/north` structure
- [ ] Basic CLI entrypoint (`north --version`)
- [ ] **Create `examples/nextjs-shadcn` as workspace package** — dogfood playground from day 1
- [ ] Publish placeholder to npm

**Dogfood immediately:** Don't mock the filesystem. Use `examples/nextjs-shadcn` as a live integration test bench. Run `north gen` against real files during development.

**Exit:** `npx @outfitter/north --version` works. (`bunx` also works as fast path.)

---

### Phase 1: Config & Generation (3-4 days)

**Goal:** `north init` and `north gen` work end-to-end.

#### 1.1 Config System

- [ ] Define `.north/config.yaml` schema (TypeScript types + runtime validation)
- [ ] Zod schema for config validation (TS types alone won't guard user YAML)
- [ ] Config loader with validation
- [ ] `extends` resolution (local files, npm packages, registry URLs; last-wins merge)
- [ ] Dial defaults

#### 1.2 Token Generation

- [ ] Dial → token value computation
- [ ] CSS generation (Tailwind v4 `@theme` format)
- [ ] OKLCH color handling
- [ ] Generated file with checksum header

#### 1.3 Init Command

- [ ] `north init` scaffolds `north/` directory
- [ ] Creates default `.north/config.yaml`
- [ ] Creates `north/tokens/base.css`
- [ ] Runs initial `north gen`

#### 1.4 Primitive Doctor (debugging aid)

- [ ] `north doctor` — basic config validation
- [ ] "Config loaded successfully" / "Config error at line X"
- [ ] Checksum verification for generated files
- [ ] Helps debug "why isn't my config loading?" during dev

**Exit:** `north init && north gen` produces valid Tailwind v4 CSS.

---

### Phase 2: Linting (4-5 days)

**Goal:** `north check` catches design system violations (single-file rules only).

**Scope clarification:** ast-grep is fast but single-file. Cross-file analysis (pattern detection, repeated clusters) requires the index — that's Phase 3/4. Phase 2 is strictly local linting.

#### 2.1 Classname Extraction Contract

This is the hardest "boring" problem. Real shadcn codebases use:

```tsx
// All of these need handling:
className="bg-primary p-4"
className={cn("bg-primary", condition && "p-4")}
className={clsx(styles.foo, "bg-primary")}
className={`bg-primary ${variant}`}
className={cva("base-class", { variants: {...} })(...)}
const base = "bg-primary"; // variable reference
```

**v0.1 extraction contract (80% coverage):**

Extract literal string fragments from:
- JSX attribute `className` → direct string values
- Calls to `cn()`, `clsx()`, `cva()` → string literal arguments
- Configurable function list in config

**Important constraint:** Only extract literals that are *directly in the AST subtree* of `className` attribute or `cn|clsx|cva` calls. Don't search the file for arbitrary strings.

**What counts as non-literal (ignored but warned):**
- Template literals with `${}` expressions
- Identifier references (variables)
- Conditional expressions resolving to non-literals
- Arrays/objects passed to `clsx` containing variables
- Computed values of any kind

**Warning behavior:** Per-site, not per-file (avoid spam):

```
⚠️  components/Button.tsx:12
    className contains non-literal values; lint coverage reduced
    Suggestion: Extract dynamic classes to a constant for better analysis
```

**ast-grep anchoring (not just `string_fragment`):**
```yaml
# Find className attribute string fragments
rule:
  kind: jsx_attribute
  has:
    kind: property_identifier
    regex: "^className$"
  has:
    kind: string_fragment

# Find cn/clsx/cva call string fragments  
rule:
  kind: call_expression
  has:
    kind: identifier
    regex: "^(cn|clsx|cva)$"
  has:
    kind: string_fragment
```

#### 2.2 ast-grep Integration

- [ ] Load rules from `north/rules/`
- [ ] Parse TSX/JSX files
- [ ] Apply extraction contract
- [ ] Collect violations with file/line/column
- [ ] Emit warnings for non-literal classNames

#### 2.3 Core Rules (single-file only)

- [ ] `no-raw-palette` — ban `bg-blue-500` etc.
- [ ] `no-arbitrary-values` — ban `p-[13px]`, allow `p-(--token)`
- [ ] `no-arbitrary-colors` — ban `bg-[#hex]`

#### 2.4 Minimal Context Classification (path-based only)

Severity varies by context. For Phase 2, use path-only detection (no JSDoc yet):

```typescript
function getContext(filePath: string): 'primitive' | 'composed' | 'layout' {
  if (filePath.includes('/ui/') || filePath.includes('/primitives/')) return 'primitive';
  if (filePath.includes('/layouts/') || filePath.includes('/templates/')) return 'layout';
  return 'composed';
}
```

This gives immediate value ("why is this error vs warning?") without needing the index.

Phase 3 upgrades this with JSDoc parsing and persists to `usages` table.

#### 2.5 Output Formatting

- [ ] Human-readable terminal output
- [ ] JSON output (`--json`) — first-class from day one (agents love it)
- [ ] `--staged` flag for lefthook integration
- [ ] Exit code for CI

#### 2.6 Doctor Extension

- [ ] `north doctor --lint` — verifies rules load, files discovered, extraction coverage %
- [ ] Reports: "Found 47 files, extracted classes from 43 (91%), 4 files have non-literal classNames"

**Exit:** `north check` reports violations, exits non-zero if errors.

---

### Phase 3: Index & Analysis (5-7 days)

**Goal:** SQLite index enables fast cross-file queries.

#### 3.1 Index Schema

- [ ] Create tables: `tokens`, `usages`, `patterns`, `token_graph`, `component_graph`, `meta`
- [ ] Closure table for `token_graph`
- [ ] Determinism constraints (no WAL, stable inserts)
- [ ] Add `meta.source_tree_hash` for freshness validation

**MVP cut:** For faster ship, defer `similarity` cache and `component_graph` to v0.2. Compute similarity on-demand, skip wrapper chain analysis initially.

#### 3.2 Token Resolution (Narrow Scope)

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

#### 3.3 Index Builder

- [ ] Scan all TSX/JSX files
- [ ] Apply extraction contract from Phase 2
- [ ] Parse CSS files via PostCSS for token definitions
- [ ] Build `token_graph` from `var(--x)` references in token values
- [ ] Compute content hash
- [ ] Store `meta.source_tree_hash` (git tree hash or file content hash)
- [ ] Keep SQL queries in dedicated `queries.ts` module (recursive CTEs are tricky)

#### 3.4 Index Commands

- [ ] `north index` — full rebuild
- [ ] `north index --check-fresh` — validate freshness
- [ ] `north index --status` — show stats

#### 3.5 Context Classification (upgraded from Phase 2)

- [ ] JSDoc annotation parsing (`@north context:layout`)
- [ ] Store context in `usages` table
- [ ] Path-based detection now persisted, not just runtime

#### 3.6 Tables Populated in v0.1

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

**Exit:** `.north/index.db` created, queries work, `north check` uses it for context.

---

### Phase 4: Discovery Tools (5-7 days)

**Goal:** `north find` family of commands.

#### 4.1 Basic Finders

- [ ] `north find --colors` — color usage report
- [ ] `north find --spacing` — spacing analysis
- [ ] `north find --patterns` — repeated class clusters
- [ ] `north find --tokens` — token usage stats

#### 4.2 Cascade Debugger

- [ ] `north find --cascade <selector>`
- [ ] Tailwind class → CSS resolution
- [ ] CSS variable chain tracing
- [ ] Component wrapper detection
- [ ] Formatted output with suggestions

#### 4.3 Similarity Finder

- [ ] `north find --similar <file>`
- [ ] Class pattern matching (Jaccard similarity)
- [ ] Token usage matching
- [ ] Threshold filtering (≥80%)

**Exit:** `north find --cascade` traces resolution chain correctly.

---

### Phase 5: Evolution Tools (4-5 days)

**Goal:** `north promote` and `north refactor` work.

#### 5.1 Promote Command

- [ ] `north promote <pattern> --as <n>`
- [ ] `--similar` flag for variant discovery
- [ ] `--dry-run` shows what would change
- [ ] Generates `@theme` additions (literal values)
- [ ] Generates `@utility` definitions
- [ ] Suggests codemods

#### 5.2 Refactor Command

- [ ] `north refactor <token> --to <value>`
- [ ] `--dry-run` simulates change
- [ ] Cascade impact analysis via `token_graph`
- [ ] Rule re-evaluation against simulated state
- [ ] `--apply` executes changes

**Exit:** `north promote --dry-run` shows accurate preview.

---

### Phase 6: Doctor & Polish (2-3 days)

**Goal:** `north doctor` full health check, polish CLI UX.

#### 6.1 Doctor Command (extended)

Building on Phase 1's primitive doctor:
- [ ] Index freshness check (git tree hash comparison)
- [ ] Compatibility version tracking (shadcn, Tailwind)
- [ ] Token sync validation (--color-* ↔ shadcn aliases)
- [ ] `--fail-on-drift` for CI
- [ ] Orphan token detection

#### 6.2 CLI Polish

- [ ] Consistent output formatting (box drawing, colors)
- [ ] Progress indicators
- [ ] `--help` for all commands
- [ ] `--verbose` and `--quiet` flags
- [ ] `north context` for LLM injection
- [ ] `north context --compact` for system prompts

#### 6.3 Documentation

- [ ] README with quick start
- [ ] CLI help text
- [ ] Run through `examples/nextjs-shadcn` as integration test

**Exit:** External developer can adopt North in <10 minutes.

---

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

**Critical path:** 0 → 1 → 2 → 3 → 6

Phases 4 and 5 can run parallel after Phase 3.

---

## Timeline

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

---

## Testing Strategy

### Test Types

- **Unit:** Config parsing, token computation, individual rules
- **Integration:** Full command flows, index building
- **Fixtures:** Projects with known states (valid, violations, edge cases)

### Fixture Structure

```
test/fixtures/
├── valid-project/        # Passes all checks
├── violations/           # Known violations for each rule
├── edge-cases/           # Arbitrary values, deviations
└── large-project/        # Performance testing
```

### Running Tests

```bash
bun test                  # All tests
bun test --watch          # Watch mode
bun test src/core/        # Specific directory
```

---

## Success Metrics

**v0.1 is successful if:**

1. `npx @outfitter/north init` works in fresh Next.js + shadcn project
2. `north gen` produces valid Tailwind v4 CSS
3. `north check` catches raw palette and arbitrary values
4. `north find --cascade` traces a real styling issue
5. Docs sufficient for self-serve setup

---

## Notes

- **Ship incrementally:** Phase 1-2 is useful alone. Ship it, get feedback.
- **Index is the unlock:** Power features depend on it. Get it right.
- **Don't over-engineer rules:** 3 core rules that work perfectly.
- **Cascade debugger is the demo:** Makes people say "I need this."
- **Dogfood relentlessly:** Run against `examples/nextjs-shadcn` constantly.

---

## Key Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Classname extraction misses patterns** | Define strict contract, warn on non-literals, iterate based on real usage |
| **Token resolution becomes Tailwind reimplementation** | Keep narrow scope: variable shorthand + semantic colors only |
| **better-sqlite3 native module issues** | Test on all platforms early, have fallback to slower pure-JS option if needed |
| **ast-grep rule complexity** | Start with 3 simple rules, add more only when needed |
| **Index merge conflicts** | Config is truth, index is cache — clear policy already defined |
| **Phase scope creep** | Exit criteria defined for each phase — don't add features mid-phase |
