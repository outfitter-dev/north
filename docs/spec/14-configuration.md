---

## Configuration

### north.config.yaml

```yaml
# yaml-language-server: $schema=https://north.dev/schema.json

# Extend from local, npm, or registry presets (order matters, last wins)
extends:
  - "./presets/base.yaml"
  - "@myorg/north-base"
  # - "https://registry.myorg.com/north/base.json"

# Style dials
dials:
  radius: md            # xs | sm | md | lg | full
  shadows: subtle       # none | subtle | default | pronounced
  density: default      # compact | default | comfortable
  contrast: default     # low | default | high

# Typography configuration
typography:
  scale: default        # compact | default | relaxed
  measure:
    min: 45             # Minimum characters per line for prose
    max: 75             # Maximum characters per line for prose

# Policy dials
policy:
  complexity: progressive  # progressive | dense
  # progressive = default to disclosure, expand on demand
  # dense = show more by default, suited for power-user tools

# Rule configuration
rules:
  # Hard errors (cannot be downgraded)
  no-raw-palette:
    level: error
  no-arbitrary-colors:
    level: error
  no-arbitrary-values:
    level: error

  # Configurable warnings
  component-complexity:
    level: warn
    options:
      max-classes: 15       # Raise/lower per project needs

  deviation-tracking:
    level: info
    options:
      promote-threshold: 3  # Suggest system addition after N deviations

# Third-party component policy
third-party:
  allowed:
    - package: "@radix-ui/*"
      reason: "Headless primitives, styled by shadcn layer"
    - package: "react-day-picker"
      reason: "Calendar primitive"
    - package: "recharts"
      reason: "Charts use --chart-* tokens"
    - package: "cmdk"
      reason: "Command palette primitive"
      
  prohibited: []
  # - package: "some-lib"
  #   reason: "Incompatible with theming"
  #   alternative: "Use X instead"

# Registry configuration
registry:
  namespace: "@myorg"
  url: "https://registry.myorg.com/north/{name}.json"
```
