# Next.js + shadcn Example

This is a dogfood project for testing North design system enforcement.

## Features

- Next.js 15 with App Router
- TypeScript (strict mode)
- Tailwind CSS
- shadcn/ui components (Button, Card)
- Turbopack for faster development

## Getting Started

```bash
# Install dependencies
bun install

# Run development server
bun run dev

# Build for production
bun run build

# Type check
bun run typecheck

# Lint with Biome
bun run lint
```

## Testing with North

This project references `@outfitter/north` as a workspace dependency. Use it to test North's design system enforcement capabilities:

```bash
# (Once North is built)
north --help
```
