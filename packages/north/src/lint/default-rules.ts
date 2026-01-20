export interface RuleTemplate {
  filename: string;
  content: string;
}

export const DEFAULT_RULE_TEMPLATES: RuleTemplate[] = [
  {
    filename: "no-raw-palette.yaml",
    content: `id: north/no-raw-palette
language: tsx
severity: error
message: "Use semantic color tokens instead of raw Tailwind palette colors"
rule:
  kind: string_fragment
  regex: "(bg|text|border|ring|fill|stroke)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\\\\d+(?:\\\\/\\\\d+)?"
note: |
  Replace with semantic token:
  - bg-blue-500 -> bg-primary
  - text-gray-600 -> text-muted-foreground
  - border-slate-200 -> border-border
`,
  },
  {
    filename: "no-arbitrary-values.yaml",
    content: `id: north/no-arbitrary-values
language: tsx
severity: error
message: "Use scale tokens or variable shorthand instead of arbitrary literal values"
rule:
  kind: string_fragment
  regex: "\\\\[[^\\\\]]+\\\\]"
note: |
  Prohibited: p-[13px], w-[347px], rounded-[5px]
  Allowed: p-(--control-padding), w-(--sidebar-width)

  Bracket values are allowed only if they reference a token:
  - p-[calc(var(--spacing-md)*1.5)]
  - w-[calc(var(--sidebar-width)+var(--spacing-lg))]
`,
  },
  {
    filename: "no-arbitrary-colors.yaml",
    content: `id: north/no-arbitrary-colors
language: tsx
severity: error
message: "Use semantic color tokens instead of arbitrary color values"
rule:
  kind: string_fragment
  regex: "(bg|text|border|ring|fill|stroke)-\\\\[(#|rgb|rgba|hsl|hsla|oklch|lab|lch)[^\\\\]]+\\\\]"
note: |
  Prohibited: bg-[#ff0000], text-[rgb(0,0,0)]
  Use semantic tokens: bg-destructive, text-foreground
`,
  },
  {
    filename: "numeric-spacing-in-component.yaml",
    content: `id: north/numeric-spacing-in-component
language: tsx
severity: warn
message: "Use semantic spacing tokens instead of numeric values in components"
rule:
  kind: string_fragment
  regex: "(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y|inset|top|right|bottom|left)-\\\\d+(\\\\.\\\\d+)?$"
note: |
  In component files, prefer semantic spacing tokens:
  - p-4 -> p-(--spacing-md)
  - gap-2 -> gap-(--spacing-sm)

  This rule is OFF in layout context where numeric spacing is acceptable.
  This rule is ERROR in primitive context where strict token usage is required.
`,
  },
  {
    filename: "no-inline-color.yaml",
    content: `id: north/no-inline-color
language: tsx
severity: error
message: "Use CSS variables or Tailwind classes instead of inline color literals"
rule:
  kind: jsx_attribute
  has:
    kind: property_identifier
    regex: "^style$"
note: |
  Prohibited: style={{ color: '#ff0000' }}, style={{ backgroundColor: 'red' }}
  Allowed: style={{ color: 'var(--foreground)' }}, className="text-foreground"

  Inline color literals bypass the design system. Use CSS variables or
  Tailwind utility classes to ensure consistency and dark mode support.
`,
  },
  {
    filename: "component-complexity.yaml",
    content: `id: north/component-complexity
language: tsx
severity: warn
message: "Component has too many utility classes; consider extracting to composable utilities"
rule:
  kind: jsx_attribute
  has:
    kind: property_identifier
    regex: "^className$"
note: |
  Class count thresholds by context:
  - primitive: 10 classes (strict, should be simple)
  - composed: 15 classes (moderate complexity allowed)
  - layout: 20 classes (more flexibility for layout concerns)

  When a className attribute exceeds these thresholds, consider:
  - Extracting repeated patterns to utility functions
  - Using component variants with cva()
  - Creating semantic wrapper components
`,
  },
];
