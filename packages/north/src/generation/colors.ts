import type { ColorsConfig, OKLCHColor } from "../config/schema.ts";

// ============================================================================
// OKLCH Color Parsing
// ============================================================================

export interface OKLCHComponents {
  lightness: number;
  chroma: number;
  hue: number;
  alpha?: number;
}

export class ColorParseError extends Error {
  constructor(
    message: string,
    public readonly color: string
  ) {
    super(message);
    this.name = "ColorParseError";
  }
}

/**
 * Parse OKLCH color string into components
 * Format: oklch(L C H) or oklch(L C H / A)
 */
export function parseOKLCH(color: OKLCHColor): OKLCHComponents {
  const match = color.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/);

  if (!match) {
    throw new ColorParseError(
      "Invalid OKLCH format. Expected: oklch(L C H) or oklch(L C H / A)",
      color
    );
  }

  const [, l, c, h, a] = match;

  const lightness = Number.parseFloat(l ?? "0");
  const chroma = Number.parseFloat(c ?? "0");
  const hue = Number.parseFloat(h ?? "0");
  const alpha = a ? Number.parseFloat(a) : undefined;

  // Validate ranges
  if (Number.isNaN(lightness) || lightness < 0 || lightness > 1) {
    throw new ColorParseError(`Lightness must be between 0 and 1. Got: ${l}`, color);
  }

  if (Number.isNaN(chroma) || chroma < 0) {
    throw new ColorParseError(`Chroma must be >= 0. Got: ${c}`, color);
  }

  if (Number.isNaN(hue) || hue < 0 || hue >= 360) {
    throw new ColorParseError(`Hue must be between 0 and 360. Got: ${h}`, color);
  }

  if (alpha !== undefined && (Number.isNaN(alpha) || alpha < 0 || alpha > 1)) {
    throw new ColorParseError(`Alpha must be between 0 and 1. Got: ${a}`, color);
  }

  return { lightness, chroma, hue, alpha };
}

/**
 * Format OKLCH components back into string
 */
export function formatOKLCH(components: OKLCHComponents): OKLCHColor {
  const { lightness, chroma, hue, alpha } = components;

  if (alpha !== undefined) {
    return `oklch(${lightness} ${chroma} ${hue} / ${alpha})` as OKLCHColor;
  }

  return `oklch(${lightness} ${chroma} ${hue})` as OKLCHColor;
}

/**
 * Validate that a color string is valid OKLCH
 */
export function isValidOKLCH(color: string): color is OKLCHColor {
  try {
    parseOKLCH(color as OKLCHColor);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// shadcn Color Mapping
// ============================================================================

export interface ColorTokens {
  // Tailwind v4 @theme (with --color- prefix for utility generation)
  "--color-background": OKLCHColor;
  "--color-foreground": OKLCHColor;
  "--color-card": OKLCHColor;
  "--color-card-foreground": OKLCHColor;
  "--color-popover": OKLCHColor;
  "--color-popover-foreground": OKLCHColor;
  "--color-primary": OKLCHColor;
  "--color-primary-foreground": OKLCHColor;
  "--color-secondary": OKLCHColor;
  "--color-secondary-foreground": OKLCHColor;
  "--color-muted": OKLCHColor;
  "--color-muted-foreground": OKLCHColor;
  "--color-accent": OKLCHColor;
  "--color-accent-foreground": OKLCHColor;
  "--color-destructive": OKLCHColor;
  "--color-destructive-foreground": OKLCHColor;
  "--color-border": OKLCHColor;
  "--color-input": OKLCHColor;
  "--color-ring": OKLCHColor;
}

export interface ShadcnAliases extends Record<string, string> {
  // shadcn compatibility aliases (without --color- prefix)
  "--background": string; // var(--color-background)
  "--foreground": string;
  "--card": string;
  "--card-foreground": string;
  "--popover": string;
  "--popover-foreground": string;
  "--primary": string;
  "--primary-foreground": string;
  "--secondary": string;
  "--secondary-foreground": string;
  "--muted": string;
  "--muted-foreground": string;
  "--accent": string;
  "--accent-foreground": string;
  "--destructive": string;
  "--destructive-foreground": string;
  "--border": string;
  "--input": string;
  "--ring": string;
}

/**
 * Generate Tailwind v4 color tokens (with --color- prefix)
 */
export function generateColorTokens(colors: ColorsConfig): ColorTokens {
  return {
    "--color-background": colors?.background ?? ("oklch(1 0 0)" as OKLCHColor),
    "--color-foreground": colors?.foreground ?? ("oklch(0.145 0 0)" as OKLCHColor),
    "--color-card": colors?.card ?? ("oklch(1 0 0)" as OKLCHColor),
    "--color-card-foreground": colors?.["card-foreground"] ?? ("oklch(0.145 0 0)" as OKLCHColor),
    "--color-popover": colors?.popover ?? ("oklch(1 0 0)" as OKLCHColor),
    "--color-popover-foreground":
      colors?.["popover-foreground"] ?? ("oklch(0.145 0 0)" as OKLCHColor),
    "--color-primary": colors?.primary ?? ("oklch(0.145 0 0)" as OKLCHColor),
    "--color-primary-foreground":
      colors?.["primary-foreground"] ?? ("oklch(0.97 0 0)" as OKLCHColor),
    "--color-secondary": colors?.secondary ?? ("oklch(0.964 0 0)" as OKLCHColor),
    "--color-secondary-foreground":
      colors?.["secondary-foreground"] ?? ("oklch(0.145 0 0)" as OKLCHColor),
    "--color-muted": colors?.muted ?? ("oklch(0.964 0 0)" as OKLCHColor),
    "--color-muted-foreground":
      colors?.["muted-foreground"] ?? ("oklch(0.455 0.012 285.938)" as OKLCHColor),
    "--color-accent": colors?.accent ?? ("oklch(0.964 0 0)" as OKLCHColor),
    "--color-accent-foreground":
      colors?.["accent-foreground"] ?? ("oklch(0.145 0 0)" as OKLCHColor),
    "--color-destructive": colors?.destructive ?? ("oklch(0.577 0.245 27.325)" as OKLCHColor),
    "--color-destructive-foreground":
      colors?.["destructive-foreground"] ?? ("oklch(0.97 0.013 17.38)" as OKLCHColor),
    "--color-border": colors?.border ?? ("oklch(0.898 0 0)" as OKLCHColor),
    "--color-input": colors?.input ?? ("oklch(0.898 0 0)" as OKLCHColor),
    "--color-ring": colors?.ring ?? ("oklch(0.145 0 0)" as OKLCHColor),
  };
}

/**
 * Generate shadcn compatibility aliases
 */
export function generateShadcnAliases(): ShadcnAliases {
  return {
    "--background": "var(--color-background)",
    "--foreground": "var(--color-foreground)",
    "--card": "var(--color-card)",
    "--card-foreground": "var(--color-card-foreground)",
    "--popover": "var(--color-popover)",
    "--popover-foreground": "var(--color-popover-foreground)",
    "--primary": "var(--color-primary)",
    "--primary-foreground": "var(--color-primary-foreground)",
    "--secondary": "var(--color-secondary)",
    "--secondary-foreground": "var(--color-secondary-foreground)",
    "--muted": "var(--color-muted)",
    "--muted-foreground": "var(--color-muted-foreground)",
    "--accent": "var(--color-accent)",
    "--accent-foreground": "var(--color-accent-foreground)",
    "--destructive": "var(--color-destructive)",
    "--destructive-foreground": "var(--color-destructive-foreground)",
    "--border": "var(--color-border)",
    "--input": "var(--color-input)",
    "--ring": "var(--color-ring)",
  };
}

// ============================================================================
// North Surface Colors (extensions to shadcn)
// ============================================================================

export interface SurfaceColorTokens {
  "--color-surface-base": string;
  "--color-surface-raised": string;
  "--color-surface-inset": string;
  "--color-surface-overlay": string;
}

export function generateSurfaceTokens(): SurfaceColorTokens {
  return {
    "--color-surface-base": "var(--color-background)",
    "--color-surface-raised": "var(--color-card)",
    "--color-surface-inset": "oklch(0.97 0 0)",
    "--color-surface-overlay": "var(--color-popover)",
  };
}
