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

## Repo registry

Pinned repos live in `harness/repos.json`. Suites reference repos by name (for example, `repo: north`), and corpus entries can be marked `enabled: false` to keep heavier repos out of default runs.

### Repo tools

Defaults to bumping all repos to `HEAD` when no filters are provided.

```bash
bun run harness:repos list
bun run harness:repos add --name my-app --url https://github.com/org/repo.git --tag opt-in
bun run harness:bump-sha --repo north
bun run harness:bump-sha --tag opt-in
bun run harness:bump-sha --repo my-app --ref main
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

## Fuzz suite

Fuzz runs a static fixture set to validate extraction edge cases and warning behavior.

```bash
bun run harness fuzz
bun run harness fuzz --limit 10
```

Fixtures live under `harness/fixtures/fuzz/cases` and are enumerated in `harness/fixtures/fuzz/manifest.json`.

## UI probes

UI probes spin up a dev server and validate runtime UI behavior across viewports.

```bash
bun run harness ui-probes
bun run harness ui-probes --route home
```

Evidence bundles (JSON + screenshots) are written to `harness/artifacts/ui-probes/<repo>/<sha>/<scenario>/`.

## Promote + Refactor suite

Promote scenarios inject repeated patterns, run `north promote`, apply codemods, and verify reductions with `north check --strict`.

```bash
bun run harness promote
bun run harness promote --scenario golden-button
```

Artifacts include before/after pattern counts, dry-run output, and base.css diffs under `harness/artifacts/promote/<scenario>/`.
