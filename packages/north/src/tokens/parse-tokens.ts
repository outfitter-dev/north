/**
 * Token Parser
 *
 * Parses CSS custom properties from North's generated.css
 * and categorizes them with semantic intents.
 */

// ============================================================================
// Types
// ============================================================================

export interface Token {
  name: string;
  value?: string;
  intent?: string;
}

export interface TokenCategories {
  surfaces: Token[];
  colors: Token[];
  spacing: Token[];
  typography: Token[];
  radii: Token[];
  shadows: Token[];
  layers: Token[];
  controls: Token[];
  breakpoints: Token[];
  containers: Token[];
  other: Token[];
}

export interface ParsedTokens {
  tokens: Token[];
  categories: TokenCategories;
}

export interface ParseOptions {
  includeValues?: boolean;
}

// ============================================================================
// Category Detection
// ============================================================================

type TokenCategory = keyof TokenCategories;

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: TokenCategory }> = [
  // Surface tokens come first (more specific than general colors)
  { pattern: /^--color-surface-/, category: "surfaces" },
  { pattern: /^--color-/, category: "colors" },
  { pattern: /^--spacing-/, category: "spacing" },
  { pattern: /^--text-/, category: "typography" },
  { pattern: /^--leading-/, category: "typography" },
  { pattern: /^--tracking-/, category: "typography" },
  { pattern: /^--weight-/, category: "typography" },
  { pattern: /^--radius-/, category: "radii" },
  { pattern: /^--shadow-/, category: "shadows" },
  { pattern: /^--layer-/, category: "layers" },
  { pattern: /^--control-/, category: "controls" },
  { pattern: /^--breakpoint-/, category: "breakpoints" },
  { pattern: /^--container-/, category: "containers" },
];

export function categorizeToken(name: string): TokenCategory {
  for (const { pattern, category } of CATEGORY_PATTERNS) {
    if (pattern.test(name)) {
      return category;
    }
  }
  return "other";
}

// ============================================================================
// Intent Mapping
// ============================================================================

const TOKEN_INTENTS: Record<string, string> = {
  // Colors - semantic meanings
  "--color-background": "Primary app background",
  "--color-foreground": "Primary text color",
  "--color-card": "Card/panel background",
  "--color-card-foreground": "Text on cards",
  "--color-popover": "Popover/dropdown background",
  "--color-popover-foreground": "Text on popovers",
  "--color-primary": "Primary interactive elements and CTAs",
  "--color-primary-foreground": "Text on primary-colored backgrounds",
  "--color-secondary": "Secondary interactive elements",
  "--color-secondary-foreground": "Text on secondary backgrounds",
  "--color-muted": "Subtle backgrounds, disabled states",
  "--color-muted-foreground": "Secondary/muted text",
  "--color-accent": "Accent highlights, hover states",
  "--color-accent-foreground": "Text on accent backgrounds",
  "--color-destructive": "Destructive/danger actions",
  "--color-destructive-foreground": "Text on destructive backgrounds",
  "--color-border": "Default border color",
  "--color-input": "Input field borders/backgrounds",
  "--color-ring": "Focus ring color",

  // Surfaces - elevation hierarchy
  "--color-surface-base": "Base layer background",
  "--color-surface-raised": "Elevated elements (cards, modals)",
  "--color-surface-inset": "Recessed/input backgrounds",
  "--color-surface-overlay": "Overlay/popover backgrounds",

  // Spacing - usage guidance
  "--spacing-xs": "Minimal spacing (icons, tight groups)",
  "--spacing-sm": "Small spacing (within components)",
  "--spacing-md": "Medium spacing (between related elements)",
  "--spacing-lg": "Large spacing (section padding)",
  "--spacing-xl": "Extra-large spacing (major sections)",
  "--spacing-2xl": "Maximum spacing (page-level separation)",

  // Typography - text hierarchy
  "--text-display": "Hero text, large marketing headlines",
  "--text-title": "Page titles",
  "--text-heading": "Section headings",
  "--text-subheading": "Subsection headings",
  "--text-body": "Body text, paragraphs",
  "--text-ui": "UI elements (buttons, labels)",
  "--text-caption": "Small helper text, captions",
  "--text-micro": "Tiny text (badges, counts)",

  // Line height
  "--leading-display": "Display text line height",
  "--leading-title": "Title line height",
  "--leading-heading": "Heading line height",
  "--leading-body": "Body text line height",
  "--leading-ui": "UI element line height",

  // Letter spacing
  "--tracking-display": "Display text letter spacing",
  "--tracking-title": "Title letter spacing",
  "--tracking-heading": "Heading letter spacing",
  "--tracking-body": "Body text letter spacing",
  "--tracking-ui": "UI element letter spacing",
  "--tracking-caps": "All-caps text letter spacing",

  // Font weights
  "--weight-display": "Display text weight",
  "--weight-title": "Title weight",
  "--weight-heading": "Heading weight",
  "--weight-body": "Body text weight",
  "--weight-ui": "UI element weight",
  "--weight-strong": "Emphasis/strong weight",

  // Radii - corner treatments
  "--radius-xs": "Minimal rounding (tiny elements)",
  "--radius-sm": "Subtle rounding (inputs, small cards)",
  "--radius-md": "Standard rounding (buttons, cards)",
  "--radius-lg": "Larger rounding (dialogs, panels)",
  "--radius-xl": "Extra-large rounding (feature cards)",
  "--radius-full": "Fully rounded (avatars, pills)",

  // Shadows - elevation
  "--shadow-none": "No shadow",
  "--shadow-subtle": "Minimal elevation",
  "--shadow-default": "Standard elevation",
  "--shadow-pronounced": "Medium elevation",
  "--shadow-elevated": "High elevation (modals, popovers)",

  // Layers - z-index stacking
  "--layer-base": "Default stacking level",
  "--layer-raised": "Slightly elevated (cards)",
  "--layer-dropdown": "Dropdowns, menus",
  "--layer-sticky": "Sticky headers/footers",
  "--layer-overlay": "Overlay backgrounds",
  "--layer-modal": "Modal dialogs",
  "--layer-popover": "Popovers, floating UI",
  "--layer-toast": "Toast notifications",
  "--layer-tooltip": "Tooltips (highest level)",

  // Controls - interactive element sizing
  "--control-height-sm": "Small control height (compact buttons)",
  "--control-height-md": "Standard control height",
  "--control-height-lg": "Large control height",
  "--control-padding-x": "Horizontal control padding",
  "--control-padding-y": "Vertical control padding",
  "--control-gap": "Gap between control elements",

  // Breakpoints - responsive design
  "--breakpoint-sm": "Small screens (mobile landscape)",
  "--breakpoint-md": "Medium screens (tablets)",
  "--breakpoint-lg": "Large screens (desktop)",
  "--breakpoint-xl": "Extra-large screens (wide desktop)",
  "--breakpoint-2xl": "Ultra-wide screens",

  // Containers - max-widths
  "--container-prose": "Readable text width (65ch)",
  "--container-content": "Content area width",
  "--container-wide": "Wide content width",
};

export function getTokenIntent(name: string): string | undefined {
  return TOKEN_INTENTS[name];
}

// ============================================================================
// CSS Parsing
// ============================================================================

const THEME_BLOCK_REGEX = /@theme\s*\{([^}]+)\}/;
const CSS_VAR_REGEX = /(--[\w-]+):\s*([^;]+);/g;

function createEmptyCategories(): TokenCategories {
  return {
    surfaces: [],
    colors: [],
    spacing: [],
    typography: [],
    radii: [],
    shadows: [],
    layers: [],
    controls: [],
    breakpoints: [],
    containers: [],
    other: [],
  };
}

export function parseTokensFromCss(css: string, options: ParseOptions = {}): ParsedTokens {
  const { includeValues = false } = options;

  if (!css.trim()) {
    return { tokens: [], categories: createEmptyCategories() };
  }

  const themeMatch = css.match(THEME_BLOCK_REGEX);
  const themeContent = themeMatch?.[1];
  if (!themeContent) {
    return { tokens: [], categories: createEmptyCategories() };
  }

  const tokens: Token[] = [];
  const categories: TokenCategories = createEmptyCategories();

  const matches = themeContent.matchAll(CSS_VAR_REGEX);
  for (const match of matches) {
    const name = match[1];
    const rawValue = match[2];
    if (!name || !rawValue) continue;

    const value = rawValue.trim();
    const intent = getTokenIntent(name);

    const token: Token = {
      name,
      ...(includeValues && { value }),
      ...(intent && { intent }),
    };

    tokens.push(token);

    const category = categorizeToken(name);
    categories[category].push(token);
  }

  return { tokens, categories };
}
