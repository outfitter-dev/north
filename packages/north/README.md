# @outfitter/north

Helping agents (and humans) build, maintain, and enforce design systems that scale.

North sits above Tailwind + shadcn: it generates tokens, enforces rules, and makes the full styling chain visible so agents can fix drift instead of guessing.

## Quick start

```bash
bunx @outfitter/north init
north gen
north index
north check
```

Install to keep `north` on your PATH:

```bash
bun add -D @outfitter/north
```

## Common commands

```bash
north init                     # Set up .north/ and default config
north gen                      # Regenerate tokens
north index                    # Build the index
north check                    # Lint design system usage
north find --patterns          # Repeated class patterns
north find --cascade .btn      # Cascade debugger
north promote <pattern> --as <name> --dry-run
north refactor --token <name> --to <value> --dry-run
north context --compact        # LLM/system prompt context
north-mcp                      # MCP server
```

## Project files

North stores project assets in `.north/` and expects them to be tracked. Generated state lives in `.north/state/` and is ignored by default via `.north/.gitignore`.

## Development

This package is part of the North monorepo. Use the root scripts for build, lint, and tests.

## License

MIT
