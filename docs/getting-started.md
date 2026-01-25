# Getting Started

North is a CLI that creates and enforces a shared design vocabulary for your UI.

## Install (optional)

You can run North without installing it:

```bash
bunx @outfitter/north init
```

If you want `north` on your PATH:

```bash
bun add -D @outfitter/north
```

From here on, the docs assume `north` is available.

## 1) Initialize

```bash
north init
```

This creates `.north/` with a config file, base tokens, and lint rules. Commit the folder. The generated state stays in `.north/state/` and is ignored.

## 2) Generate tokens

```bash
north gen
```

Run this whenever you change `.north/config.yaml` or custom tokens.

## 3) Build the index (for discovery tools)

```bash
north index
```

## 4) Lint for drift

```bash
north check
```

Use `--strict` if you want warnings to fail CI.

## 5) Agent context (optional)

```bash
north context --compact
```

If you want MCP integration, run the bundled server:

```bash
north-mcp
```
