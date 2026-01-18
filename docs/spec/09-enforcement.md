
## Enforcement: ast-grep Rules

North uses ast-grep for structural linting. Rules are YAML files that can be shared via registry.

### Rule Structure

```yaml
id: north/no-raw-palette
message: "Use semantic color tokens instead of raw Tailwind palette"
severity: error
language: tsx
rule:
  kind: string_fragment
  regex: "(bg|text|border|ring)-(red|blue|green|yellow|gray|slate|zinc|neutral|stone)-\\d+"
note: |
  Instead of: bg-blue-500
  Use: bg-primary or bg-accent
```

**Note:** ast-grep treats TypeScript (`.ts`) and TSX (`.tsx`) as different parsers. North rules use `language: tsx` since className strings live in JSX. For pure TypeScript files, a separate rule with `language: typescript` may be needed.

### Rule Categories

**Hard Errors** (block build/commit):
- `no-raw-palette` — No literal Tailwind colors in components
- `no-arbitrary-values` — No arbitrary literal values like `p-[13px]`; token-anchored calc allowed
- `no-inline-color` — No inline style colors

**Warnings** (flag for review):
- `extract-repeated-classes` — Same class cluster 3+ times
- `component-complexity` — More than N Tailwind classes
- `missing-semantic-comment` — New composed components need role documentation

### Enforcement Levels

```yaml
# north.config.yaml
rules:
  # Locked by base - cannot override
  no-raw-palette: error
  no-inline-color: error
  
  # Configurable - project can tune
  extract-repeated-classes:
    level: warn
    threshold: 3
  
  component-complexity:
    level: warn
    max-classes: 15
```
