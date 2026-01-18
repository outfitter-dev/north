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
