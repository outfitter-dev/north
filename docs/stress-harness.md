# Stress Harness

Deterministic regression harness for North. Each suite clones a pinned repo, applies mutations or fixtures, and validates North behavior with stable comparisons.

## Quick start

```bash
bun run harness mutations
bun run harness mutations --suite palette-drift
```

## Directory layout

```
harness/
  run.ts
  fixtures/
    north/              # Shared North config + rules used by harness suites
  suites/
    mutations/
      config.json       # Golden repo + base patch config
      base.patch         # Adds north/ config + rules to the golden repo
      <suite>/
        patch.diff
        expect.json
  artifacts/             # Run outputs (ignored by git)
  .cache/                # Clones + temp workdirs (ignored by git)
```

## Mutation suite

Mutations clone a pinned golden repo, apply a base patch + mutation patch, and run `north check --json --staged`. Results are compared against `expect.json`.

### Mutation pack spec

- `patch.diff`: git-apply-able patch against the pinned SHA
- `expect.json`: expected assertions

Minimal example:

```json
{
  "rules": {
    "north/no-raw-palette": 2
  }
}
```

### `expect.json` schema

- `rules` (required): map of rule IDs to expected counts
- `severities` (optional): per-rule severity counts
- `files` (optional): per-file rules + line checks
- `options` (optional):
  - `allowExtraRules` (default false)
  - `allowExtraFiles` (default false)
  - `allowLineMismatch` (default false)

Example with severity + line assertions:

```json
{
  "rules": {
    "north/no-arbitrary-values": 2
  },
  "severities": {
    "north/no-arbitrary-values": { "error": 1, "warn": 1 }
  },
  "files": {
    "fixtures/harness/example.tsx": {
      "rules": { "north/no-arbitrary-values": 1 },
      "lines": { "north/no-arbitrary-values": [12] }
    }
  },
  "options": {
    "allowLineMismatch": true
  }
}
```

### Artifacts

Each mutation suite writes:

- `harness/artifacts/mutations/<suite>/actual.json`
- `harness/artifacts/mutations/<suite>/diff.json`
- `harness/artifacts/mutations/<suite>/command.log`

### CI

The mutation suite runs on every PR via `Harness (Mutations)` in `.github/workflows/ci.yml`.

## Corpus suite

Corpus runs North across pinned repos using invariant checks instead of exact counts.

```bash
bun run harness corpus
bun run harness corpus --repo north
```

`harness/corpus.yaml` defines repos and defaults.

Invariants enforced:

- completion within time budget
- extraction coverage ≥ threshold
- deterministic output across consecutive runs
- injected probe violations detected

Artifacts are written to `harness/artifacts/corpus/<repo>/` with reports and logs.
