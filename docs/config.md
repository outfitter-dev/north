# Configuration

North's config lives at `.north/config.yaml`. `north init` creates the file with sane defaults.

## The dials

Dials are the high-level decisions that shape the token system.

```yaml
dials:
  radius: md        # xs | sm | md | lg | full
  shadows: default  # none | subtle | default | pronounced
  density: default  # compact | default | comfortable
  contrast: default # low | default | high

typography:
  scale: default    # compact | default | relaxed
  measure:
    min: 45
    max: 75
```

## Rules

Rules control linting behavior. Keep the core rules strict; add exceptions only when you have to.

```yaml
rules:
  no-raw-palette:
    level: error
  no-arbitrary-values:
    level: error

  component-complexity:
    level: warn
    options:
      max-classes: 15
```

## Third-party policy

Declare which external component libraries are allowed and why. This keeps the boundary clear.

```yaml
third-party:
  allowed:
    - package: "@radix-ui/*"
      reason: "Headless primitives, styled by shadcn layer"
```

## Compatibility (optional)

North can track the versions you are aligning to:

```yaml
compatibility:
  tailwind: "4"
  shadcn: "2"
```

## Notes

- Custom tokens go in `.north/tokens/base.css`. North does not overwrite this file.
- The index database defaults to `.north/state/index.db` and is ignored by `.north/.gitignore`.
