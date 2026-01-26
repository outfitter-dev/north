# North

Helping agents (and humans) build, maintain, and **enforce** design systems that scale.

Agents can ship fast. They also drift fast. North gives them a shared vocabulary (tokens), guardrails (lint rules), and fast visibility into how a codebase is actually styled. Short feedback loops, fewer magic numbers.

North is tuned for Tailwind utility workflows and shadcn-style tokens.

## The magic (fast)

You can hand an agent a broken UI and get a traceable answer back.

```bash
# Trace the full styling chain for a selector or token
north find --cascade ".btn-primary"

# Surface magic numbers and raw values
north check --strict

# Find repeated class patterns worth promoting to tokens
north find --patterns
```

Example output (abridged):

```text
Cascade trace for: .btn-primary

Background: bg-primary/80
  └─ --primary -> oklch(0.145 0 0)
  └─ parent Card -> bg-background (opaque)

Conflict: Button wants transparency, Card is opaque.

Lint summary
  error: no-raw-palette (bg-blue-500)
  error: no-arbitrary-values (p-[13px])
  warn : repeated-spacing-pattern (gap-6 appears 12 times)
```

This is how agents stop guessing and start tracing.

## Where North starts (and where it doesn't)

- **Tailwind** handles the utility syntax and build pipeline.
- **shadcn** provides component defaults and token conventions.
- **Your CSS** (and component styles) is where the real variation happens.
- **North** sits on top: it defines the rules, generates tokens, and makes the full styling chain visible so agents can make consistent decisions.

## What it gives you

- **Token generation** from a small set of dials (`north gen`).
- **Linting** that blocks raw palette values and arbitrary spacing (`north check`).
- **Local indexing** for fast discovery (`north index`, `north find`).
- **Refactoring tools** for promoting patterns and migrating tokens (`north promote`, `north refactor`, `north propose`, `north migrate`).
- **Agent context** you can paste into prompts or serve over MCP (`north context`, `north-mcp`).

## Quick start

```bash
bunx @outfitter/north init
north gen
north index
north check

north find --patterns
```

If you want `north` on your PATH, install it once:

```bash
bun add -D @outfitter/north
```

## Why this helps agents stay on the trail

Agents don't just need rules. They need visibility.

North builds an index of your codebase, then lets an agent answer questions like:

- "Why does this button look off?" (trace the full cascade)
- "Where did this color come from?" (token > alias > utility > component)
- "How many places use this spacing pattern?" (find and promote)
- "Where are the hard-coded values hiding?" (lint + reports)

It turns styling into a chain you can follow and fix, not a black box.

## What North actually enforces

- **No raw palette colors** sneaking in next to tokens.
- **No arbitrary spacing or magic numbers** in classnames.
- **Patterns get promoted** instead of copy-pasted forever.
- **Rules are explicit**, so agents don't invent their own.

The result: agents stay inside the same design vocabulary humans expect.

## Docs

- `docs/getting-started.md`
- `docs/commands.md`
- `docs/config.md`

## Repo layout

- `packages/north` - CLI + MCP server (`@outfitter/north`)
- `examples/nextjs-shadcn` - dogfood playground
- `harness` - internal tooling for integration checks

## Status

North is early. It works, but the surface area is still settling. If you hit rough edges, open an issue with a repro.

## License

MIT
