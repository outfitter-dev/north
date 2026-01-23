# @outfitter/north

Design system enforcement CLI for maintaining consistency across your codebase.

## Quick start

```bash
# Initialize North in your project
bunx @outfitter/north init

# Generate tokens and build the index
bunx @outfitter/north gen
bunx @outfitter/north index

# Check and discover usage
bunx @outfitter/north check
bunx @outfitter/north find --patterns

# Health check
bunx @outfitter/north doctor

# Evolution tools
bunx @outfitter/north promote "rounded-md bg-card px-4 py-2" --as button-base --dry-run
bunx @outfitter/north refactor --token=--color-primary --to "oklch(0.2 0 0)" --dry-run

# Context for agents/LLMs
bunx @outfitter/north context --compact
```

## Installation

### Global

```bash
bun add -g @outfitter/north
```

### Per-project

```bash
bun add -D @outfitter/north
```

## Common commands

```bash
north init                    # Set up .north/ and default config
north gen                     # Regenerate tokens
north index                   # Build the index
north check                   # Lint design system usage
north find --colors           # Color usage report
north promote <pattern> --as <name> --dry-run
north refactor <token> --to <value> --dry-run
north doctor                  # Health check
north context --compact        # LLM/system prompt context
```

## Project files

North stores project assets in `.north/` and expects it to be tracked. The derived index lives in `.north/state/` and is ignored by default via `.north/.gitignore`.

## Development

This package is part of the North monorepo.

### Building

```bash
bun run build
```

### Type checking

```bash
bun run typecheck
```

### Linting

```bash
bun run lint
```

## License

MIT
