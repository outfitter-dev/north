import type {
  DensityDial,
  NorthConfig,
  RadiusDial,
  ShadowsDial,
  TypographyScaleDial,
} from "../config/schema.ts";

// ============================================================================
// Token Value Types
// ============================================================================

export interface SpacingTokens {
  "--spacing-xs": string;
  "--spacing-sm": string;
  "--spacing-md": string;
  "--spacing-lg": string;
  "--spacing-xl": string;
  "--spacing-2xl": string;
}

export interface RadiusTokens {
  "--radius-xs": string;
  "--radius-sm": string;
  "--radius-md": string;
  "--radius-lg": string;
  "--radius-xl": string;
  "--radius-full": string;
}

export interface ShadowTokens {
  "--shadow-none": string;
  "--shadow-subtle": string;
  "--shadow-default": string;
  "--shadow-pronounced": string;
  "--shadow-elevated": string;
}

export interface DensityTokens {
  "--control-height-sm": string;
  "--control-height-md": string;
  "--control-height-lg": string;
  "--control-padding-x": string;
  "--control-padding-y": string;
  "--control-gap": string;
}

export interface TypographyTokens {
  "--text-display": string;
  "--text-title": string;
  "--text-heading": string;
  "--text-subheading": string;
  "--text-body": string;
  "--text-ui": string;
  "--text-caption": string;
  "--text-micro": string;

  "--leading-display": string;
  "--leading-title": string;
  "--leading-heading": string;
  "--leading-body": string;
  "--leading-ui": string;

  "--tracking-display": string;
  "--tracking-title": string;
  "--tracking-heading": string;
  "--tracking-body": string;
  "--tracking-ui": string;
  "--tracking-caps": string;

  "--weight-display": string;
  "--weight-title": string;
  "--weight-heading": string;
  "--weight-body": string;
  "--weight-ui": string;
  "--weight-strong": string;
}

export interface LayoutTokens {
  "--layer-base": string;
  "--layer-raised": string;
  "--layer-dropdown": string;
  "--layer-sticky": string;
  "--layer-overlay": string;
  "--layer-modal": string;
  "--layer-popover": string;
  "--layer-toast": string;
  "--layer-tooltip": string;

  "--breakpoint-sm": string;
  "--breakpoint-md": string;
  "--breakpoint-lg": string;
  "--breakpoint-xl": string;
  "--breakpoint-2xl": string;

  "--container-prose": string;
  "--container-content": string;
  "--container-wide": string;
}

// ============================================================================
// Radius Dial → Tokens
// ============================================================================

export function generateRadiusTokens(dial: RadiusDial): RadiusTokens {
  const scales: Record<RadiusDial, RadiusTokens> = {
    xs: {
      "--radius-xs": "0.0625rem",
      "--radius-sm": "0.125rem",
      "--radius-md": "0.25rem",
      "--radius-lg": "0.375rem",
      "--radius-xl": "0.5rem",
      "--radius-full": "9999px",
    },
    sm: {
      "--radius-xs": "0.125rem",
      "--radius-sm": "0.25rem",
      "--radius-md": "0.375rem",
      "--radius-lg": "0.5rem",
      "--radius-xl": "0.75rem",
      "--radius-full": "9999px",
    },
    md: {
      "--radius-xs": "0.125rem",
      "--radius-sm": "0.25rem",
      "--radius-md": "0.5rem",
      "--radius-lg": "0.75rem",
      "--radius-xl": "1rem",
      "--radius-full": "9999px",
    },
    lg: {
      "--radius-xs": "0.25rem",
      "--radius-sm": "0.375rem",
      "--radius-md": "0.75rem",
      "--radius-lg": "1rem",
      "--radius-xl": "1.5rem",
      "--radius-full": "9999px",
    },
    full: {
      "--radius-xs": "0.5rem",
      "--radius-sm": "0.75rem",
      "--radius-md": "1rem",
      "--radius-lg": "1.5rem",
      "--radius-xl": "2rem",
      "--radius-full": "9999px",
    },
  };

  return scales[dial];
}

// ============================================================================
// Shadow Dial → Tokens
// ============================================================================

export function generateShadowTokens(dial: ShadowsDial): ShadowTokens {
  const scales: Record<ShadowsDial, ShadowTokens> = {
    none: {
      "--shadow-none": "none",
      "--shadow-subtle": "none",
      "--shadow-default": "none",
      "--shadow-pronounced": "none",
      "--shadow-elevated": "none",
    },
    subtle: {
      "--shadow-none": "none",
      "--shadow-subtle": "0 1px 2px 0 oklch(0 0 0 / 0.03)",
      "--shadow-default": "0 1px 3px 0 oklch(0 0 0 / 0.05)",
      "--shadow-pronounced": "0 2px 4px 0 oklch(0 0 0 / 0.06)",
      "--shadow-elevated": "0 4px 6px 0 oklch(0 0 0 / 0.07)",
    },
    default: {
      "--shadow-none": "none",
      "--shadow-subtle": "0 1px 2px 0 oklch(0 0 0 / 0.05)",
      "--shadow-default": "0 1px 3px 0 oklch(0 0 0 / 0.1), 0 1px 2px -1px oklch(0 0 0 / 0.1)",
      "--shadow-pronounced": "0 4px 6px -1px oklch(0 0 0 / 0.1), 0 2px 4px -2px oklch(0 0 0 / 0.1)",
      "--shadow-elevated": "0 10px 15px -3px oklch(0 0 0 / 0.1), 0 4px 6px -4px oklch(0 0 0 / 0.1)",
    },
    pronounced: {
      "--shadow-none": "none",
      "--shadow-subtle": "0 2px 4px 0 oklch(0 0 0 / 0.08)",
      "--shadow-default": "0 4px 6px -1px oklch(0 0 0 / 0.15), 0 2px 4px -2px oklch(0 0 0 / 0.1)",
      "--shadow-pronounced":
        "0 10px 15px -3px oklch(0 0 0 / 0.2), 0 4px 6px -4px oklch(0 0 0 / 0.1)",
      "--shadow-elevated":
        "0 20px 25px -5px oklch(0 0 0 / 0.25), 0 8px 10px -6px oklch(0 0 0 / 0.15)",
    },
  };

  return scales[dial];
}

// ============================================================================
// Density Dial → Tokens
// ============================================================================

export function generateDensityTokens(dial: DensityDial): DensityTokens {
  const scales: Record<DensityDial, DensityTokens> = {
    compact: {
      "--control-height-sm": "1.75rem",
      "--control-height-md": "2rem",
      "--control-height-lg": "2.5rem",
      "--control-padding-x": "0.5rem",
      "--control-padding-y": "0.25rem",
      "--control-gap": "0.375rem",
    },
    default: {
      "--control-height-sm": "2rem",
      "--control-height-md": "2.5rem",
      "--control-height-lg": "3rem",
      "--control-padding-x": "0.75rem",
      "--control-padding-y": "0.5rem",
      "--control-gap": "0.5rem",
    },
    comfortable: {
      "--control-height-sm": "2.5rem",
      "--control-height-md": "3rem",
      "--control-height-lg": "3.5rem",
      "--control-padding-x": "1rem",
      "--control-padding-y": "0.75rem",
      "--control-gap": "0.75rem",
    },
  };

  return scales[dial];
}

// ============================================================================
// Spacing Tokens (based on density multiplier)
// ============================================================================

export function generateSpacingTokens(density: DensityDial): SpacingTokens {
  const multipliers: Record<DensityDial, number> = {
    compact: 0.875,
    default: 1,
    comfortable: 1.125,
  };

  const multiplier = multipliers[density];
  const base = 0.25; // 4px base unit

  return {
    "--spacing-xs": `${base * 1 * multiplier}rem`,
    "--spacing-sm": `${base * 2 * multiplier}rem`,
    "--spacing-md": `${base * 4 * multiplier}rem`,
    "--spacing-lg": `${base * 6 * multiplier}rem`,
    "--spacing-xl": `${base * 8 * multiplier}rem`,
    "--spacing-2xl": `${base * 12 * multiplier}rem`,
  };
}

// ============================================================================
// Typography Dial → Tokens
// ============================================================================

export function generateTypographyTokens(scale: TypographyScaleDial): TypographyTokens {
  const scales: Record<TypographyScaleDial, TypographyTokens> = {
    compact: {
      "--text-display": "2.5rem",
      "--text-title": "1.75rem",
      "--text-heading": "1.375rem",
      "--text-subheading": "1.125rem",
      "--text-body": "0.9375rem",
      "--text-ui": "0.8125rem",
      "--text-caption": "0.6875rem",
      "--text-micro": "0.5625rem",

      "--leading-display": "1.1",
      "--leading-title": "1.2",
      "--leading-heading": "1.25",
      "--leading-body": "1.5",
      "--leading-ui": "1.4",

      "--tracking-display": "-0.02em",
      "--tracking-title": "-0.01em",
      "--tracking-heading": "-0.005em",
      "--tracking-body": "0",
      "--tracking-ui": "0.005em",
      "--tracking-caps": "0.05em",

      "--weight-display": "700",
      "--weight-title": "600",
      "--weight-heading": "600",
      "--weight-body": "400",
      "--weight-ui": "500",
      "--weight-strong": "600",
    },
    default: {
      "--text-display": "3rem",
      "--text-title": "2rem",
      "--text-heading": "1.5rem",
      "--text-subheading": "1.25rem",
      "--text-body": "1rem",
      "--text-ui": "0.875rem",
      "--text-caption": "0.75rem",
      "--text-micro": "0.625rem",

      "--leading-display": "1.1",
      "--leading-title": "1.2",
      "--leading-heading": "1.3",
      "--leading-body": "1.5",
      "--leading-ui": "1.4",

      "--tracking-display": "-0.02em",
      "--tracking-title": "-0.01em",
      "--tracking-heading": "-0.01em",
      "--tracking-body": "0",
      "--tracking-ui": "0.01em",
      "--tracking-caps": "0.05em",

      "--weight-display": "700",
      "--weight-title": "600",
      "--weight-heading": "600",
      "--weight-body": "400",
      "--weight-ui": "500",
      "--weight-strong": "600",
    },
    relaxed: {
      "--text-display": "3.5rem",
      "--text-title": "2.25rem",
      "--text-heading": "1.75rem",
      "--text-subheading": "1.375rem",
      "--text-body": "1.0625rem",
      "--text-ui": "0.9375rem",
      "--text-caption": "0.8125rem",
      "--text-micro": "0.6875rem",

      "--leading-display": "1.15",
      "--leading-title": "1.25",
      "--leading-heading": "1.35",
      "--leading-body": "1.6",
      "--leading-ui": "1.5",

      "--tracking-display": "-0.015em",
      "--tracking-title": "-0.005em",
      "--tracking-heading": "0",
      "--tracking-body": "0",
      "--tracking-ui": "0.01em",
      "--tracking-caps": "0.05em",

      "--weight-display": "700",
      "--weight-title": "600",
      "--weight-heading": "600",
      "--weight-body": "400",
      "--weight-ui": "500",
      "--weight-strong": "600",
    },
  };

  return scales[scale];
}

// ============================================================================
// Layout Tokens (static, not affected by dials)
// ============================================================================

export function generateLayoutTokens(): LayoutTokens {
  return {
    "--layer-base": "0",
    "--layer-raised": "10",
    "--layer-dropdown": "100",
    "--layer-sticky": "200",
    "--layer-overlay": "300",
    "--layer-modal": "400",
    "--layer-popover": "500",
    "--layer-toast": "600",
    "--layer-tooltip": "700",

    "--breakpoint-sm": "640px",
    "--breakpoint-md": "768px",
    "--breakpoint-lg": "1024px",
    "--breakpoint-xl": "1280px",
    "--breakpoint-2xl": "1536px",

    "--container-prose": "65ch",
    "--container-content": "80rem",
    "--container-wide": "96rem",
  };
}

// ============================================================================
// Generate All Tokens from Config
// ============================================================================

export interface GeneratedTokens {
  spacing: SpacingTokens;
  radius: RadiusTokens;
  shadows: ShadowTokens;
  density: DensityTokens;
  typography: TypographyTokens;
  layout: LayoutTokens;
}

export function generateTokensFromConfig(config: NorthConfig): GeneratedTokens {
  return {
    spacing: generateSpacingTokens(config.dials?.density ?? "default"),
    radius: generateRadiusTokens(config.dials?.radius ?? "md"),
    shadows: generateShadowTokens(config.dials?.shadows ?? "default"),
    density: generateDensityTokens(config.dials?.density ?? "default"),
    typography: generateTypographyTokens(config.typography?.scale ?? "default"),
    layout: generateLayoutTokens(),
  };
}
