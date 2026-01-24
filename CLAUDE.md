# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important

- **Issue tracking**: Linear, team ID `NOR` (e.g., NOR-123)

## Project Overview

North is a design system enforcement CLI (`@outfitter/north`) that teaches AI agents to produce consistent, themeable, maintainable frontend code. It targets React + Tailwind CSS v4 + shadcn/ui with OKLCH colors.

Core concept: Constraints enable creativity. By providing agents a vocabulary of design tokens and linting rules, they produce consistent UI instead of random `bg-blue-500`, `p-[13px]` variations.

## Commands

```bash
# Development (from repo root)
bun run build          # Build all packages (turbo)
bun run test           # Run all tests (turbo)
bun run lint           # Biome lint
bun run typecheck      # TypeScript check
bun run check          # Biome check + autofix

# Package-level (from packages/north)
bun test                        # Run all tests
bun test src/lint/engine.ts     # Single file (pattern match)
bun test --watch                # Watch mode
bun run build                   # Build CLI + MCP binaries

# Harness (integration tests against real repos)
bun run harness                 # Run harness test suites
bun run harness:repos           # Manage test repos
bun run harness:explore         # Explore harness data
```

## Architecture

```
packages/north/src/
├── cli/           # CLI entry point (commander)
├── mcp/           # MCP server for agent integration
│   └── tools/     # Individual MCP tools (20+)
├── commands/      # CLI command implementations
├── lint/          # Lint engine core
│   ├── engine.ts  # Main lint orchestration
│   ├── rules.ts   # Rule loading/resolution
│   ├── extract.ts # AST extraction (ast-grep)
│   └── context.ts # Context classification (primitive/composed/layout)
├── config/        # Config loading, schema (Zod), extends resolution
├── generation/    # Token generation from dials → CSS
├── index/         # SQLite index (build, queries, component graph)
├── tokens/        # Token parsing utilities
└── lib/           # Shared utilities (utility-classification)
```

**Key patterns:**
- Commands return `{ success: boolean, ... }` and call `process.exit(1)` on failure
- Config uses Zod schemas with `extends` support (npm, HTTP, local files)
- Lint engine extracts class tokens via ast-grep, evaluates rules, respects deviations
- Context classification (primitive/composed/layout) adjusts rule severity by file path or JSDoc

## Configuration

North config lives in `.north/config.yaml` (legacy: `north.config.yaml`). Key sections:

```yaml
dials:           # High-level design controls (radius, shadows, density, contrast)
typography:      # Type scale, measure
policy:          # Complexity mode
colors:          # OKLCH color overrides
rules:           # Rule severity and options
extends:         # Composable presets (npm, HTTP, local)
```

## Lint Rules

Built-in rules in `src/lint/default-rules.ts`:
- `no-raw-palette` - Ban raw Tailwind colors (bg-blue-500)
- `no-arbitrary-values` - Ban arbitrary literals (p-[13px])
- `no-arbitrary-colors` - Ban arbitrary colors (bg-[#ff0000])
- `no-inline-color` - Ban inline style colors
- `component-complexity` - Flag components with too many classes
- `numeric-spacing-in-component` - Warn on numeric spacing
- `missing-semantic-comment` - Flag missing @north-role JSDoc
- `extract-repeated-classes` - Suggest extracting patterns
- `repeated-spacing-pattern` - Flag repeated spacing patterns

Context classification adjusts severity:
- **primitive** (components/ui/**): strictest
- **composed** (app/**/page.tsx): moderate
- **layout** (app/**/layout.tsx, components/layouts/**): relaxed

## Testing

Tests use Bun's test runner. Fixtures live alongside test files or in `harness/fixtures/`.

```bash
# Run specific test file
bun test src/commands/check.test.ts

# Run tests matching pattern
bun test --grep "should lint"

# Run with coverage
bun test --coverage
```

The harness system (`harness/`) runs integration tests against real repos defined in `harness/repos.json`.

## MCP Server

North exposes an MCP server (`north-mcp` binary) for agent integration. Tools in `src/mcp/tools/`:
- check, suggest, discover, promote, refactor, query, status, context, etc.

Each tool has corresponding `.test.ts` file with fixture-based tests.
