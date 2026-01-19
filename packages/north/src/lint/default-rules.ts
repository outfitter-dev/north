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
];
