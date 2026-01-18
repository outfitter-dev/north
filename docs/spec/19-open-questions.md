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

