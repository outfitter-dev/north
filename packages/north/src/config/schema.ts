import { z } from "zod";

// ============================================================================
// Dial Schemas
// ============================================================================

export const RadiusDialSchema = z.enum(["xs", "sm", "md", "lg", "full"]);
export type RadiusDial = z.infer<typeof RadiusDialSchema>;

export const ShadowsDialSchema = z.enum(["none", "subtle", "default", "pronounced"]);
export type ShadowsDial = z.infer<typeof ShadowsDialSchema>;

export const DensityDialSchema = z.enum(["compact", "default", "comfortable"]);
export type DensityDial = z.infer<typeof DensityDialSchema>;

export const ContrastDialSchema = z.enum(["low", "default", "high"]);
export type ContrastDial = z.infer<typeof ContrastDialSchema>;

export const TypographyScaleDialSchema = z.enum(["compact", "default", "relaxed"]);
export type TypographyScaleDial = z.infer<typeof TypographyScaleDialSchema>;

export const ComplexityDialSchema = z.enum(["progressive", "dense"]);
export type ComplexityDial = z.infer<typeof ComplexityDialSchema>;

// ============================================================================
// Dials Configuration
// ============================================================================

export const DialsConfigSchema = z.object({
  radius: RadiusDialSchema.optional(),
  shadows: ShadowsDialSchema.optional(),
  density: DensityDialSchema.optional(),
  contrast: ContrastDialSchema.optional(),
});

export type DialsConfig = z.infer<typeof DialsConfigSchema>;

// ============================================================================
// Typography Configuration
// ============================================================================

export const TypographyConfigSchema = z.object({
  scale: TypographyScaleDialSchema.optional(),
  measure: z
    .object({
      min: z.number().min(30).max(90).optional(),
      max: z.number().min(30).max(120).optional(),
    })
    .optional(),
});

export type TypographyConfig = z.infer<typeof TypographyConfigSchema>;

// ============================================================================
// Policy Configuration
// ============================================================================

export const PolicyConfigSchema = z.object({
  complexity: ComplexityDialSchema.optional(),
});

export type PolicyConfig = z.infer<typeof PolicyConfigSchema>;

// ============================================================================
// Color Configuration (OKLCH)
// ============================================================================

// OKLCH color in format: oklch(L C H) or oklch(L C H / A)
// L: lightness (0-1), C: chroma (0-0.4 typically), H: hue (0-360)
export const OKLCHColorSchema = z
  .string()
  .regex(/^oklch\(\s*[\d.]+\s+[\d.]+\s+[\d.]+(?:\s*\/\s*[\d.]+)?\s*\)$/, {
    message: "Color must be in OKLCH format: oklch(L C H) or oklch(L C H / A)",
  });

export type OKLCHColor = z.infer<typeof OKLCHColorSchema>;

// shadcn color mapping with support for custom semantic tokens
export const ColorsConfigSchema = z
  .object({
    background: OKLCHColorSchema.optional(),
    foreground: OKLCHColorSchema.optional(),
    card: OKLCHColorSchema.optional(),
    "card-foreground": OKLCHColorSchema.optional(),
    popover: OKLCHColorSchema.optional(),
    "popover-foreground": OKLCHColorSchema.optional(),
    primary: OKLCHColorSchema.optional(),
    "primary-foreground": OKLCHColorSchema.optional(),
    secondary: OKLCHColorSchema.optional(),
    "secondary-foreground": OKLCHColorSchema.optional(),
    muted: OKLCHColorSchema.optional(),
    "muted-foreground": OKLCHColorSchema.optional(),
    accent: OKLCHColorSchema.optional(),
    "accent-foreground": OKLCHColorSchema.optional(),
    destructive: OKLCHColorSchema.optional(),
    "destructive-foreground": OKLCHColorSchema.optional(),
    border: OKLCHColorSchema.optional(),
    input: OKLCHColorSchema.optional(),
    ring: OKLCHColorSchema.optional(),
  })
  // Allow custom semantic tokens (e.g., success, warning) beyond the standard shadcn set
  .catchall(OKLCHColorSchema)
  .optional();

export type ColorsConfig = z.infer<typeof ColorsConfigSchema>;

// ============================================================================
// Rules Configuration
// ============================================================================

export const RuleLevelSchema = z.enum(["error", "warn", "info", "off"]);
export type RuleLevel = z.infer<typeof RuleLevelSchema>;

/** Base rule config with optional level and per-rule file ignores */
export const BaseRuleConfigSchema = z.object({
  level: RuleLevelSchema.optional(),
  ignore: z.array(z.string()).optional(),
});

/** Rule config that accepts either a level string or an object with level and ignore */
export const SimpleRuleConfigSchema = z.union([RuleLevelSchema, BaseRuleConfigSchema]);

export const RulesConfigSchema = z
  .object({
    "no-raw-palette": SimpleRuleConfigSchema.optional(),
    "no-arbitrary-colors": SimpleRuleConfigSchema.optional(),
    "no-arbitrary-values": SimpleRuleConfigSchema.optional(),
    "component-complexity": z
      .object({
        level: RuleLevelSchema.optional(),
        ignore: z.array(z.string()).optional(),
        "max-classes": z.number().int().min(1).optional(),
      })
      .optional(),
    "deviation-tracking": z
      .object({
        level: RuleLevelSchema.optional(),
        ignore: z.array(z.string()).optional(),
        "promote-threshold": z.number().int().min(1).optional(),
      })
      .optional(),
    "extract-repeated-classes": SimpleRuleConfigSchema.optional(),
  })
  .optional();

export type RulesConfig = z.infer<typeof RulesConfigSchema>;

// ============================================================================
// Third-Party Configuration
// ============================================================================

export const ThirdPartyAllowedSchema = z.object({
  package: z.string(),
  reason: z.string(),
});

export const ThirdPartyProhibitedSchema = z.object({
  package: z.string(),
  reason: z.string(),
  alternative: z.string().optional(),
});

export const ThirdPartyConfigSchema = z
  .object({
    allowed: z.array(ThirdPartyAllowedSchema).optional(),
    prohibited: z.array(ThirdPartyProhibitedSchema).optional(),
  })
  .optional();

export type ThirdPartyConfig = z.infer<typeof ThirdPartyConfigSchema>;

// ============================================================================
// Registry Configuration
// ============================================================================

export const RegistryConfigSchema = z
  .object({
    namespace: z.string().optional(),
    url: z.string().url().optional(),
  })
  .optional();

export type RegistryConfig = z.infer<typeof RegistryConfigSchema>;

// ============================================================================
// Compatibility Configuration
// ============================================================================

export const CompatibilityConfigSchema = z
  .object({
    shadcn: z.string().optional(),
    tailwind: z.string().optional(),
  })
  .optional();

export type CompatibilityConfig = z.infer<typeof CompatibilityConfigSchema>;

// ============================================================================
// Lint Configuration
// ============================================================================

export const LintConfigSchema = z
  .object({
    classFunctions: z.array(z.string()).min(1).optional(),
    ignore: z.array(z.string()).optional(),
  })
  .optional();

export type LintConfig = z.infer<typeof LintConfigSchema>;

// ============================================================================
// Index Configuration
// ============================================================================

export const IndexConfigSchema = z
  .object({
    path: z.string().optional(),
    committable: z.boolean().optional(),
  })
  .optional();

export type IndexConfig = z.infer<typeof IndexConfigSchema>;

// ============================================================================
// Main North Configuration
// ============================================================================

export const NorthConfigSchema = z.object({
  extends: z.string().nullable().optional(),
  dials: DialsConfigSchema.optional(),
  typography: TypographyConfigSchema.optional(),
  policy: PolicyConfigSchema.optional(),
  colors: ColorsConfigSchema.optional(),
  rules: RulesConfigSchema.optional(),
  "third-party": ThirdPartyConfigSchema.optional(),
  registry: RegistryConfigSchema.optional(),
  compatibility: CompatibilityConfigSchema.optional(),
  lint: LintConfigSchema.optional(),
  index: IndexConfigSchema.optional(),
});

export type NorthConfig = z.infer<typeof NorthConfigSchema>;

// ============================================================================
// Validation Helper
// ============================================================================

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: ValidationError };

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: Array<{ path: string; message: string }>
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Validate config against schema and return helpful error messages
 */
export function validateConfig(config: unknown): ValidationResult<NorthConfig> {
  const result = NorthConfigSchema.safeParse(config);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const issues = result.error.issues.map((err: z.ZodIssue) => ({
    path: err.path.join(".") || "root",
    message: err.message,
  }));

  const errorMessage = `Configuration validation failed:\n${issues
    .map((issue: { path: string; message: string }) => `  - ${issue.path}: ${issue.message}`)
    .join("\n")}`;

  return {
    success: false,
    error: new ValidationError(errorMessage, issues),
  };
}
