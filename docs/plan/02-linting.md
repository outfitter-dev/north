# Phase 2: Linting

**Timeline:** 4-5 days  
**Status:** Pending

## Goal

`north check` catches design system violations (single-file rules only).

## Overview

This phase implements the linting engine using ast-grep for fast, single-file analysis. The hardest part is the classname extraction contract - reliably pulling Tailwind classes from JSX/TSX in real-world codebases.

**Scope clarification:** ast-grep is fast but single-file. Cross-file analysis (pattern detection, repeated clusters) requires the index — that's Phase 3/4. Phase 2 is strictly local linting.

## Tasks

### 2.1 Classname Extraction Contract

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

### 2.2 ast-grep Integration

- [ ] Load rules from `.north/rules/`
- [ ] Parse TSX/JSX files
- [ ] Apply extraction contract
- [ ] Collect violations with file/line/column
- [ ] Emit warnings for non-literal classNames

### 2.3 Core Rules (single-file only)

- [ ] `no-raw-palette` — ban `bg-blue-500` etc.
- [ ] `no-arbitrary-values` — ban `p-[13px]`, allow `p-(--token)`
- [ ] `no-arbitrary-colors` — ban `bg-[#hex]`

### 2.4 Minimal Context Classification (path-based only)

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

### 2.5 Output Formatting

- [ ] Human-readable terminal output
- [ ] JSON output (`--json`) — first-class from day one (agents love it)
- [ ] `--staged` flag for lefthook integration
- [ ] Exit code for CI

### 2.6 Doctor Extension

- [ ] `north doctor --lint` — verifies rules load, files discovered, extraction coverage %
- [ ] Reports: "Found 47 files, extracted classes from 43 (91%), 4 files have non-literal classNames"

## Exit Criteria

- `north check` reports violations with file/line/column
- Exits non-zero if errors found (warnings don't fail)
- JSON output format works for programmatic consumption
- `--staged` flag works with git for pre-commit hooks
- Doctor reports extraction coverage statistics

## Key Details

### ast-grep Anchoring

Don't just search for `string_fragment` everywhere. Anchor to className attributes and utility function calls:

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

### Extraction Contract Philosophy

80% coverage with clear boundaries beats 95% with mysterious edge cases. Better to warn "can't analyze this" than silently miss violations.

## Dependencies

- **Requires:** Phase 1 (Config & Generation)

## Cross-References

### Spec Documents

- [09-enforcement.md](../spec/09-enforcement.md) - Linting rules and severity
- [06-agent-workflow.md](../spec/06-agent-workflow.md) - AI agent integration patterns
- [04-component-architecture.md](../spec/04-component-architecture.md) - Component context classification

### Related Phases

- **Requires:** Phase 1 (Config & Generation)
- **Leads to:** Phase 3 (Index & Analysis)
- **Enhanced by:** Phase 3 (adds JSDoc context detection)

## Key Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Classname extraction misses patterns | Define strict contract, warn on non-literals, iterate based on real usage |
| ast-grep rule complexity | Start with 3 simple rules, add more only when needed |
| False positives annoy users | Make severity configurable, clear escape hatches |
| Performance on large codebases | ast-grep is fast, but test with real-world repos early |

## Notes

- **Ship incrementally:** Phase 1-2 is useful alone. Ship it, get feedback.
- **Don't over-engineer rules:** 3 core rules that work perfectly > 10 mediocre ones
- Test against `examples/nextjs-shadcn` constantly
- JSON output is first-class, not an afterthought (agents need it)
