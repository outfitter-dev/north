import type {
  ComplexityDial,
  ContrastDial,
  DensityDial,
  NorthConfig,
  RadiusDial,
  ShadowsDial,
  TypographyScaleDial,
} from "./schema.ts";

// ============================================================================
// Default Dial Values
// ============================================================================

export const DEFAULT_RADIUS: RadiusDial = "md";
export const DEFAULT_SHADOWS: ShadowsDial = "default";
export const DEFAULT_DENSITY: DensityDial = "default";
export const DEFAULT_CONTRAST: ContrastDial = "default";
export const DEFAULT_TYPOGRAPHY_SCALE: TypographyScaleDial = "default";
export const DEFAULT_COMPLEXITY: ComplexityDial = "progressive";
export const DEFAULT_INDEX_PATH = "state/index.db";
export const DEFAULT_INDEX_COMMITTABLE = false;

// Typography measure defaults (characters per line)
export const DEFAULT_MEASURE_MIN = 45;
export const DEFAULT_MEASURE_MAX = 75;

// ============================================================================
// Default shadcn Colors (Light Mode, OKLCH)
// ============================================================================

export const DEFAULT_COLORS_LIGHT = {
  background: "oklch(1 0 0)",
  foreground: "oklch(0.145 0 0)",
  card: "oklch(1 0 0)",
  "card-foreground": "oklch(0.145 0 0)",
  popover: "oklch(1 0 0)",
  "popover-foreground": "oklch(0.145 0 0)",
  primary: "oklch(0.145 0 0)",
  "primary-foreground": "oklch(0.97 0 0)",
  secondary: "oklch(0.964 0 0)",
  "secondary-foreground": "oklch(0.145 0 0)",
  muted: "oklch(0.964 0 0)",
  "muted-foreground": "oklch(0.455 0.012 285.938)",
  accent: "oklch(0.964 0 0)",
  "accent-foreground": "oklch(0.145 0 0)",
  destructive: "oklch(0.577 0.245 27.325)",
  "destructive-foreground": "oklch(0.97 0.013 17.38)",
  border: "oklch(0.898 0 0)",
  input: "oklch(0.898 0 0)",
  ring: "oklch(0.145 0 0)",
} as const;

// ============================================================================
// Default Full Configuration
// ============================================================================

export const DEFAULT_CONFIG: NorthConfig = {
  extends: null,
  compatibility: undefined,
  dials: {
    radius: DEFAULT_RADIUS,
    shadows: DEFAULT_SHADOWS,
    density: DEFAULT_DENSITY,
    contrast: DEFAULT_CONTRAST,
  },
  typography: {
    scale: DEFAULT_TYPOGRAPHY_SCALE,
    measure: {
      min: DEFAULT_MEASURE_MIN,
      max: DEFAULT_MEASURE_MAX,
    },
  },
  policy: {
    complexity: DEFAULT_COMPLEXITY,
  },
  index: {
    path: DEFAULT_INDEX_PATH,
    committable: DEFAULT_INDEX_COMMITTABLE,
  },
  colors: DEFAULT_COLORS_LIGHT,
  rules: {
    "no-raw-palette": "error",
    "no-arbitrary-colors": "error",
    "no-arbitrary-values": "error",
    "repeated-spacing-pattern": {
      level: "warn",
      threshold: 3,
    },
    "component-complexity": {
      level: "warn",
      "max-classes": 15,
    },
    "deviation-tracking": {
      level: "info",
      "promote-threshold": 3,
    },
  },
  "third-party": {
    allowed: [
      {
        package: "@radix-ui/*",
        reason: "Headless primitives, styled by shadcn layer",
      },
      {
        package: "react-day-picker",
        reason: "Calendar primitive",
      },
      {
        package: "recharts",
        reason: "Charts use --chart-* tokens",
      },
      {
        package: "cmdk",
        reason: "Command palette primitive",
      },
    ],
    prohibited: [],
  },
};

// ============================================================================
// Default YAML Template (for north init)
// ============================================================================

export const DEFAULT_CONFIG_YAML = `# yaml-language-server: $schema=https://north.dev/schema.json

# Extend from org or base (set to null for standalone)
extends: null

# Style dials
dials:
  radius: md            # xs | sm | md | lg | full
  shadows: default      # none | subtle | default | pronounced
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

# Colors (OKLCH format)
# Uncomment to customize:
# colors:
#   primary: oklch(0.546 0.245 262)
#   background: oklch(1 0 0)

# Rule configuration
rules:
  no-raw-palette: error
  no-arbitrary-colors: error
  no-arbitrary-values: error

  repeated-spacing-pattern:
    level: warn
    threshold: 3

  component-complexity:
    level: warn
    max-classes: 15

  deviation-tracking:
    level: info
    promote-threshold: 3

# Lint configuration (optional)
# lint:
#   classFunctions: [cn, clsx, cva]

# Index configuration (optional)
# index:
#   path: state/index.db
#   committable: false

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

# Compatibility tracking (optional)
# compatibility:
#   shadcn: "2.1.0"
#   tailwind: "4.0.0"
`;

/**
 * Apply defaults to a partial config
 */
export function applyDefaults(config: Partial<NorthConfig>): NorthConfig {
  return {
    extends: config.extends ?? DEFAULT_CONFIG.extends,
    dials: {
      radius: config.dials?.radius ?? DEFAULT_RADIUS,
      shadows: config.dials?.shadows ?? DEFAULT_SHADOWS,
      density: config.dials?.density ?? DEFAULT_DENSITY,
      contrast: config.dials?.contrast ?? DEFAULT_CONTRAST,
    },
    typography: {
      scale: config.typography?.scale ?? DEFAULT_TYPOGRAPHY_SCALE,
      measure: {
        min: config.typography?.measure?.min ?? DEFAULT_MEASURE_MIN,
        max: config.typography?.measure?.max ?? DEFAULT_MEASURE_MAX,
      },
    },
    policy: {
      complexity: config.policy?.complexity ?? DEFAULT_COMPLEXITY,
    },
    index: {
      path: config.index?.path ?? DEFAULT_INDEX_PATH,
      committable: config.index?.committable ?? DEFAULT_INDEX_COMMITTABLE,
    },
    colors: config.colors ?? DEFAULT_COLORS_LIGHT,
    rules: config.rules ?? DEFAULT_CONFIG.rules,
    "third-party": config["third-party"] ?? DEFAULT_CONFIG["third-party"],
    registry: config.registry,
    compatibility: config.compatibility ?? DEFAULT_CONFIG.compatibility,
    lint: config.lint,
  };
}
