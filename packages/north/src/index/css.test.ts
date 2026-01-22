import { describe, expect, test } from "bun:test";
import { parseCssTokensWithThemes } from "./css.ts";

describe("parseCssTokensWithThemes", () => {
  test("parses light theme from :root selector", () => {
    const css = `
      :root {
        --color-primary: #3b82f6;
      }
    `;

    const { themeVariants } = parseCssTokensWithThemes(css, "test.css");

    expect(themeVariants.get("--color-primary")).toEqual({
      light: { value: "#3b82f6", source: ":root" },
    });
  });

  test("parses dark theme from .dark selector", () => {
    const css = `
      .dark {
        --color-primary: #60a5fa;
      }
    `;

    const { themeVariants } = parseCssTokensWithThemes(css, "test.css");

    expect(themeVariants.get("--color-primary")).toEqual({
      dark: { value: "#60a5fa", source: ".dark" },
    });
  });

  test("parses both light and dark themes", () => {
    const css = `
      :root {
        --color-bg: #ffffff;
      }
      .dark {
        --color-bg: #0a0a0a;
      }
    `;

    const { themeVariants } = parseCssTokensWithThemes(css, "test.css");

    expect(themeVariants.get("--color-bg")).toEqual({
      light: { value: "#ffffff", source: ":root" },
      dark: { value: "#0a0a0a", source: ".dark" },
    });
  });

  test("parses dark theme from html.dark selector", () => {
    const css = `
      html.dark {
        --color-accent: #f59e0b;
      }
    `;

    const { themeVariants } = parseCssTokensWithThemes(css, "test.css");

    expect(themeVariants.get("--color-accent")).toEqual({
      dark: { value: "#f59e0b", source: "html.dark" },
    });
  });

  test("parses dark theme from :root.dark selector", () => {
    const css = `
      :root.dark {
        --color-text: #f5f5f5;
      }
    `;

    const { themeVariants } = parseCssTokensWithThemes(css, "test.css");

    expect(themeVariants.get("--color-text")).toEqual({
      dark: { value: "#f5f5f5", source: ":root.dark" },
    });
  });

  test("parses dark theme from data-theme attribute selector", () => {
    const css = `
      [data-theme="dark"] {
        --color-border: #374151;
      }
    `;

    const { themeVariants } = parseCssTokensWithThemes(css, "test.css");

    expect(themeVariants.get("--color-border")).toEqual({
      dark: { value: "#374151", source: '[data-theme="dark"]' },
    });
  });

  test("parses dark theme from prefers-color-scheme media query", () => {
    const css = `
      @media (prefers-color-scheme: dark) {
        :root {
          --color-surface: #1f2937;
        }
      }
    `;

    const { themeVariants } = parseCssTokensWithThemes(css, "test.css");

    expect(themeVariants.get("--color-surface")).toEqual({
      dark: { value: "#1f2937", source: "@media (prefers-color-scheme: dark)" },
    });
  });

  test("returns tokens alongside theme variants", () => {
    const css = `
      :root {
        --spacing-sm: 0.5rem;
        --color-primary: #3b82f6;
      }
    `;

    const { tokens, themeVariants } = parseCssTokensWithThemes(css, "test.css");

    expect(tokens).toHaveLength(2);
    expect(tokens[0]?.name).toBe("--spacing-sm");
    expect(tokens[1]?.name).toBe("--color-primary");
    expect(themeVariants.size).toBe(2);
  });

  test("ignores non-themed selectors", () => {
    const css = `
      .button {
        --button-padding: 1rem;
      }
    `;

    const { themeVariants } = parseCssTokensWithThemes(css, "test.css");

    expect(themeVariants.has("--button-padding")).toBe(false);
  });

  test("handles complex CSS with multiple selectors", () => {
    const css = `
      :root {
        --color-bg: #fff;
        --color-text: #000;
      }

      .dark {
        --color-bg: #000;
        --color-text: #fff;
      }

      .some-component {
        --local-var: 10px;
      }
    `;

    const { themeVariants } = parseCssTokensWithThemes(css, "test.css");

    expect(themeVariants.get("--color-bg")).toEqual({
      light: { value: "#fff", source: ":root" },
      dark: { value: "#000", source: ".dark" },
    });
    expect(themeVariants.get("--color-text")).toEqual({
      light: { value: "#000", source: ":root" },
      dark: { value: "#fff", source: ".dark" },
    });
    expect(themeVariants.has("--local-var")).toBe(false);
  });

  // ============================================================================
  // Comma-Separated Selector Tests (PR #91 feedback)
  // ============================================================================

  test("parses dark theme from comma-separated selector ':root, .dark'", () => {
    const css = `
      :root, .dark {
        --color-accent: #f97316;
      }
    `;

    const { themeVariants } = parseCssTokensWithThemes(css, "test.css");

    // Dark takes precedence in comma-separated lists
    expect(themeVariants.get("--color-accent")).toEqual({
      dark: { value: "#f97316", source: ":root, .dark" },
    });
  });

  test("parses dark theme from multiple dark selectors", () => {
    const css = `
      html.dark, [data-theme="dark"] {
        --color-warning: #fbbf24;
      }
    `;

    const { themeVariants } = parseCssTokensWithThemes(css, "test.css");

    expect(themeVariants.get("--color-warning")).toEqual({
      dark: { value: "#fbbf24", source: 'html.dark, [data-theme="dark"]' },
    });
  });

  test("parses light theme from .light class", () => {
    const css = `
      .light {
        --color-surface: #fafafa;
      }
    `;

    const { themeVariants } = parseCssTokensWithThemes(css, "test.css");

    expect(themeVariants.get("--color-surface")).toEqual({
      light: { value: "#fafafa", source: ".light" },
    });
  });

  test("handles body.dark selector", () => {
    const css = `
      body.dark {
        --color-input: #27272a;
      }
    `;

    const { themeVariants } = parseCssTokensWithThemes(css, "test.css");

    expect(themeVariants.get("--color-input")).toEqual({
      dark: { value: "#27272a", source: "body.dark" },
    });
  });

  test("handles complex comma-separated selector with whitespace", () => {
    const css = `
      :root ,
      .dark ,
      [data-theme="dark"] {
        --color-ring: #3b82f6;
      }
    `;

    const { themeVariants } = parseCssTokensWithThemes(css, "test.css");

    // Dark takes precedence
    expect(themeVariants.get("--color-ring")).toEqual({
      dark: {
        value: "#3b82f6",
        source: ':root ,\n      .dark ,\n      [data-theme="dark"]',
      },
    });
  });
});
