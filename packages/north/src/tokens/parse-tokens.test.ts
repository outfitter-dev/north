import { describe, expect, test } from "bun:test";
import { categorizeToken, getTokenIntent, parseTokensFromCss } from "./parse-tokens.ts";

const SAMPLE_GENERATED_CSS = `
@theme {
  --color-background: oklch(1 0 0);
  --color-foreground: oklch(0.145 0 0);
  --color-primary: oklch(0.145 0 0);
  --color-primary-foreground: oklch(0.97 0 0);
  --color-surface-base: var(--color-background);
  --color-surface-raised: var(--color-card);
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --shadow-subtle: 0 1px 2px 0 oklch(0 0 0 / 0.05);
  --shadow-default: 0 1px 3px 0 oklch(0 0 0 / 0.1);
  --text-body: 1rem;
  --text-heading: 1.5rem;
  --text-ui: 0.875rem;
  --leading-body: 1.5;
  --tracking-body: 0;
  --weight-body: 400;
  --layer-base: 0;
  --layer-modal: 400;
  --control-height-md: 2.5rem;
  --breakpoint-md: 768px;
  --container-prose: 65ch;
}
`;

describe("parseTokensFromCss", () => {
  test("extracts token names from @theme block", () => {
    const result = parseTokensFromCss(SAMPLE_GENERATED_CSS);

    expect(result.tokens).toContainEqual(expect.objectContaining({ name: "--color-background" }));
    expect(result.tokens).toContainEqual(expect.objectContaining({ name: "--spacing-md" }));
    expect(result.tokens).toContainEqual(expect.objectContaining({ name: "--radius-lg" }));
  });

  test("includes values when includeValues is true", () => {
    const result = parseTokensFromCss(SAMPLE_GENERATED_CSS, { includeValues: true });

    const spacingMd = result.tokens.find((t) => t.name === "--spacing-md");
    expect(spacingMd?.value).toBe("1rem");
  });

  test("excludes values when includeValues is false (default)", () => {
    const result = parseTokensFromCss(SAMPLE_GENERATED_CSS);

    const spacingMd = result.tokens.find((t) => t.name === "--spacing-md");
    expect(spacingMd?.value).toBeUndefined();
  });

  test("categorizes tokens correctly", () => {
    const result = parseTokensFromCss(SAMPLE_GENERATED_CSS);

    expect(result.categories.colors).toContainEqual(
      expect.objectContaining({ name: "--color-background" })
    );
    expect(result.categories.surfaces).toContainEqual(
      expect.objectContaining({ name: "--color-surface-base" })
    );
    expect(result.categories.spacing).toContainEqual(
      expect.objectContaining({ name: "--spacing-md" })
    );
    expect(result.categories.typography).toContainEqual(
      expect.objectContaining({ name: "--text-body" })
    );
    expect(result.categories.radii).toContainEqual(
      expect.objectContaining({ name: "--radius-md" })
    );
    expect(result.categories.shadows).toContainEqual(
      expect.objectContaining({ name: "--shadow-default" })
    );
    expect(result.categories.layers).toContainEqual(
      expect.objectContaining({ name: "--layer-modal" })
    );
    expect(result.categories.controls).toContainEqual(
      expect.objectContaining({ name: "--control-height-md" })
    );
    expect(result.categories.breakpoints).toContainEqual(
      expect.objectContaining({ name: "--breakpoint-md" })
    );
    expect(result.categories.containers).toContainEqual(
      expect.objectContaining({ name: "--container-prose" })
    );
  });

  test("returns empty result for empty CSS", () => {
    const result = parseTokensFromCss("");

    expect(result.tokens).toEqual([]);
    expect(result.categories.colors).toEqual([]);
  });

  test("handles CSS without @theme block", () => {
    const css = ":root { --foo: bar; }";
    const result = parseTokensFromCss(css);

    expect(result.tokens).toEqual([]);
  });
});

describe("categorizeToken", () => {
  test("categorizes color tokens", () => {
    expect(categorizeToken("--color-primary")).toBe("colors");
    expect(categorizeToken("--color-background")).toBe("colors");
  });

  test("categorizes surface tokens separately from colors", () => {
    expect(categorizeToken("--color-surface-base")).toBe("surfaces");
    expect(categorizeToken("--color-surface-raised")).toBe("surfaces");
  });

  test("categorizes spacing tokens", () => {
    expect(categorizeToken("--spacing-md")).toBe("spacing");
    expect(categorizeToken("--spacing-xl")).toBe("spacing");
  });

  test("categorizes typography tokens", () => {
    expect(categorizeToken("--text-body")).toBe("typography");
    expect(categorizeToken("--leading-body")).toBe("typography");
    expect(categorizeToken("--tracking-body")).toBe("typography");
    expect(categorizeToken("--weight-body")).toBe("typography");
  });

  test("categorizes radius tokens", () => {
    expect(categorizeToken("--radius-md")).toBe("radii");
  });

  test("categorizes shadow tokens", () => {
    expect(categorizeToken("--shadow-default")).toBe("shadows");
  });

  test("categorizes layer tokens", () => {
    expect(categorizeToken("--layer-modal")).toBe("layers");
  });

  test("categorizes control tokens", () => {
    expect(categorizeToken("--control-height-md")).toBe("controls");
  });

  test("categorizes breakpoint tokens", () => {
    expect(categorizeToken("--breakpoint-md")).toBe("breakpoints");
  });

  test("categorizes container tokens", () => {
    expect(categorizeToken("--container-prose")).toBe("containers");
  });

  test("returns 'other' for unknown tokens", () => {
    expect(categorizeToken("--unknown-token")).toBe("other");
  });
});

describe("getTokenIntent", () => {
  test("returns semantic intent for common color tokens", () => {
    expect(getTokenIntent("--color-background")).toBe("Primary app background");
    expect(getTokenIntent("--color-foreground")).toBe("Primary text color");
    expect(getTokenIntent("--color-primary")).toBe("Primary interactive elements and CTAs");
    expect(getTokenIntent("--color-primary-foreground")).toBe(
      "Text on primary-colored backgrounds"
    );
    expect(getTokenIntent("--color-destructive")).toBe("Destructive/danger actions");
    expect(getTokenIntent("--color-muted")).toBe("Subtle backgrounds, disabled states");
    expect(getTokenIntent("--color-muted-foreground")).toBe("Secondary/muted text");
  });

  test("returns semantic intent for surface tokens", () => {
    expect(getTokenIntent("--color-surface-base")).toBe("Base layer background");
    expect(getTokenIntent("--color-surface-raised")).toBe("Elevated elements (cards, modals)");
    expect(getTokenIntent("--color-surface-inset")).toBe("Recessed/input backgrounds");
    expect(getTokenIntent("--color-surface-overlay")).toBe("Overlay/popover backgrounds");
  });

  test("returns semantic intent for spacing tokens", () => {
    expect(getTokenIntent("--spacing-xs")).toBe("Minimal spacing (icons, tight groups)");
    expect(getTokenIntent("--spacing-sm")).toBe("Small spacing (within components)");
    expect(getTokenIntent("--spacing-md")).toBe("Medium spacing (between related elements)");
    expect(getTokenIntent("--spacing-lg")).toBe("Large spacing (section padding)");
    expect(getTokenIntent("--spacing-xl")).toBe("Extra-large spacing (major sections)");
  });

  test("returns semantic intent for typography tokens", () => {
    expect(getTokenIntent("--text-display")).toBe("Hero text, large marketing headlines");
    expect(getTokenIntent("--text-heading")).toBe("Section headings");
    expect(getTokenIntent("--text-body")).toBe("Body text, paragraphs");
    expect(getTokenIntent("--text-ui")).toBe("UI elements (buttons, labels)");
    expect(getTokenIntent("--text-caption")).toBe("Small helper text, captions");
  });

  test("returns semantic intent for radius tokens", () => {
    expect(getTokenIntent("--radius-sm")).toBe("Subtle rounding (inputs, small cards)");
    expect(getTokenIntent("--radius-md")).toBe("Standard rounding (buttons, cards)");
    expect(getTokenIntent("--radius-full")).toBe("Fully rounded (avatars, pills)");
  });

  test("returns semantic intent for shadow tokens", () => {
    expect(getTokenIntent("--shadow-subtle")).toBe("Minimal elevation");
    expect(getTokenIntent("--shadow-default")).toBe("Standard elevation");
    expect(getTokenIntent("--shadow-elevated")).toBe("High elevation (modals, popovers)");
  });

  test("returns semantic intent for layer tokens", () => {
    expect(getTokenIntent("--layer-base")).toBe("Default stacking level");
    expect(getTokenIntent("--layer-modal")).toBe("Modal dialogs");
    expect(getTokenIntent("--layer-tooltip")).toBe("Tooltips (highest level)");
  });

  test("returns undefined for tokens without defined intent", () => {
    expect(getTokenIntent("--unknown-custom-token")).toBeUndefined();
  });
});
