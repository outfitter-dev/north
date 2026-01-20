import { describe, expect, test } from "bun:test";
import {
  COLOR_PREFIXES,
  FONT_FAMILY_VALUES,
  SPACING_PREFIXES,
  categorizePattern,
  classifyUtility,
  extractVarColorToken,
  getUtilitySegment,
  isArbitraryColorUtility,
  isArbitraryValueViolation,
  isColorLiteralValue,
  isColorUtility,
  isSpacingUtility,
  isTypographyTextValue,
  isTypographyUtility,
  parseColorUtility,
  parseSpacingUtility,
  parseTypographyUtility,
  resolveClassToToken,
  resolveClassToTokenValidated,
  splitByDelimiter,
} from "./utility-classification.ts";

// ============================================================================
// Core Parsing Functions
// ============================================================================

describe("splitByDelimiter", () => {
  test("splits simple strings", () => {
    expect(splitByDelimiter("a:b:c", ":")).toEqual(["a", "b", "c"]);
  });

  test("respects bracket depth", () => {
    expect(splitByDelimiter("text-[calc(1:2)]", ":")).toEqual(["text-[calc(1:2)]"]);
  });

  test("respects parenthesis depth inside", () => {
    // Colon INSIDE parentheses should NOT split
    expect(splitByDelimiter("func(a:b)", ":")).toEqual(["func(a:b)"]);
  });

  test("splits at colon before parentheses", () => {
    // Colon BEFORE parentheses (at depth 0) SHOULD split
    expect(splitByDelimiter("hover:(a:b)", ":")).toEqual(["hover", "(a:b)"]);
  });

  test("handles empty input", () => {
    expect(splitByDelimiter("", ":")).toEqual([""]);
  });

  test("handles no delimiter", () => {
    expect(splitByDelimiter("text-lg", ":")).toEqual(["text-lg"]);
  });
});

describe("getUtilitySegment", () => {
  test("extracts utility from simple class", () => {
    expect(getUtilitySegment("text-blue-500")).toBe("text-blue-500");
  });

  test("extracts utility from prefixed class", () => {
    expect(getUtilitySegment("hover:text-blue-500")).toBe("text-blue-500");
  });

  test("extracts utility from multiple prefixes", () => {
    expect(getUtilitySegment("hover:md:text-blue-500")).toBe("text-blue-500");
  });

  test("preserves arbitrary values", () => {
    expect(getUtilitySegment("hover:text-[calc(100%:2)]")).toBe("text-[calc(100%:2)]");
  });
});

// ============================================================================
// Color Utilities - PR #92 Fix: text-[#fff] must be classified as color
// ============================================================================

describe("isColorLiteralValue", () => {
  test("recognizes raw color keywords", () => {
    expect(isColorLiteralValue("transparent")).toBe(true);
    expect(isColorLiteralValue("current")).toBe(true);
    expect(isColorLiteralValue("black")).toBe(true);
    expect(isColorLiteralValue("white")).toBe(true);
  });

  test("recognizes hex colors in brackets", () => {
    expect(isColorLiteralValue("[#fff]")).toBe(true);
    expect(isColorLiteralValue("[#ffffff]")).toBe(true);
    expect(isColorLiteralValue("[#FF5733]")).toBe(true);
  });

  test("recognizes color functions in brackets", () => {
    expect(isColorLiteralValue("[rgb(255,0,0)]")).toBe(true);
    expect(isColorLiteralValue("[rgba(255,0,0,0.5)]")).toBe(true);
    expect(isColorLiteralValue("[hsl(120,100%,50%)]")).toBe(true);
    expect(isColorLiteralValue("[oklch(0.7_0.15_200)]")).toBe(true);
  });

  test("recognizes palette values", () => {
    expect(isColorLiteralValue("blue-500")).toBe(true);
    expect(isColorLiteralValue("gray-100")).toBe(true);
    expect(isColorLiteralValue("red-50")).toBe(true);
  });

  test("rejects non-color arbitrary values", () => {
    expect(isColorLiteralValue("[14px]")).toBe(false);
    expect(isColorLiteralValue("[1rem]")).toBe(false);
    expect(isColorLiteralValue("[calc(100%-20px)]")).toBe(false);
  });

  test("recognizes var(--color) references", () => {
    expect(isColorLiteralValue("[var(--color-primary)]")).toBe(true);
  });
});

describe("parseColorUtility", () => {
  test("parses bg-* utilities", () => {
    expect(parseColorUtility("bg-blue-500")).toEqual({ prefix: "bg", value: "blue-500" });
    expect(parseColorUtility("bg-primary")).toEqual({ prefix: "bg", value: "primary" });
  });

  test("parses text-* color utilities", () => {
    expect(parseColorUtility("text-blue-500")).toEqual({ prefix: "text", value: "blue-500" });
    expect(parseColorUtility("text-primary")).toEqual({ prefix: "text", value: "primary" });
  });

  test("parses arbitrary color values (PR #92 fix)", () => {
    expect(parseColorUtility("text-[#fff]")).toEqual({ prefix: "text", value: "[#fff]" });
    expect(parseColorUtility("bg-[rgb(255,0,0)]")).toEqual({
      prefix: "bg",
      value: "[rgb(255,0,0)]",
    });
  });

  test("rejects typography text-* classes", () => {
    expect(parseColorUtility("text-lg")).toBeNull();
    expect(parseColorUtility("text-sm")).toBeNull();
    expect(parseColorUtility("text-base")).toBeNull();
  });

  test("parses outline-* utilities (was missing in some files)", () => {
    expect(parseColorUtility("outline-blue-500")).toEqual({ prefix: "outline", value: "blue-500" });
  });

  test("handles prefixed classes", () => {
    expect(parseColorUtility("hover:bg-blue-500")).toEqual({ prefix: "bg", value: "blue-500" });
  });
});

describe("extractVarColorToken", () => {
  test("extracts token from var() reference", () => {
    expect(extractVarColorToken("[var(--color-primary)]")).toBe("--color-primary");
    expect(extractVarColorToken("var(--color-secondary)")).toBe("--color-secondary");
  });

  test("returns null for non-var values", () => {
    expect(extractVarColorToken("blue-500")).toBeNull();
    expect(extractVarColorToken("[#fff]")).toBeNull();
  });
});

// ============================================================================
// Typography Utilities - PR #92 Fix: must not classify text-[#fff] as typography
// ============================================================================

describe("isTypographyTextValue", () => {
  test("accepts scale values", () => {
    expect(isTypographyTextValue("xs")).toBe(true);
    expect(isTypographyTextValue("sm")).toBe(true);
    expect(isTypographyTextValue("lg")).toBe(true);
    expect(isTypographyTextValue("2xl")).toBe(true);
  });

  test("accepts numeric values", () => {
    expect(isTypographyTextValue("14")).toBe(true);
    expect(isTypographyTextValue("1.5")).toBe(true);
  });

  test("accepts token references", () => {
    expect(isTypographyTextValue("(--text-size-lg)")).toBe(true);
  });

  test("accepts arbitrary size values", () => {
    expect(isTypographyTextValue("[14px]")).toBe(true);
    expect(isTypographyTextValue("[1rem]")).toBe(true);
    expect(isTypographyTextValue("[clamp(1rem,2vw,2rem)]")).toBe(true);
  });

  test("rejects color literals (PR #92 critical fix)", () => {
    expect(isTypographyTextValue("[#fff]")).toBe(false);
    expect(isTypographyTextValue("[#ffffff]")).toBe(false);
    expect(isTypographyTextValue("[rgb(255,0,0)]")).toBe(false);
    expect(isTypographyTextValue("[rgba(0,0,0,0.5)]")).toBe(false);
    expect(isTypographyTextValue("[hsl(120,100%,50%)]")).toBe(false);
    expect(isTypographyTextValue("[oklch(0.7_0.15_200)]")).toBe(false);
  });
});

describe("parseTypographyUtility", () => {
  test("parses text-* size utilities", () => {
    expect(parseTypographyUtility("text-lg")).toEqual({ prefix: "text", value: "lg" });
    expect(parseTypographyUtility("text-sm")).toEqual({ prefix: "text", value: "sm" });
    expect(parseTypographyUtility("text-2xl")).toEqual({ prefix: "text", value: "2xl" });
  });

  test("rejects text-* color utilities (PR #92 fix)", () => {
    expect(parseTypographyUtility("text-[#fff]")).toBeNull();
    expect(parseTypographyUtility("text-blue-500")).toBeNull();
    expect(parseTypographyUtility("text-primary")).toBeNull();
  });

  test("parses font-* weight utilities", () => {
    expect(parseTypographyUtility("font-bold")).toEqual({ prefix: "font", value: "bold" });
    expect(parseTypographyUtility("font-semibold")).toEqual({ prefix: "font", value: "semibold" });
  });

  test("parses font-* family utilities (PR #92 fix - was missing)", () => {
    expect(parseTypographyUtility("font-sans")).toEqual({ prefix: "font", value: "sans" });
    expect(parseTypographyUtility("font-serif")).toEqual({ prefix: "font", value: "serif" });
    expect(parseTypographyUtility("font-mono")).toEqual({ prefix: "font", value: "mono" });
  });

  test("parses leading-* utilities", () => {
    expect(parseTypographyUtility("leading-tight")).toEqual({ prefix: "leading", value: "tight" });
    expect(parseTypographyUtility("leading-relaxed")).toEqual({
      prefix: "leading",
      value: "relaxed",
    });
    expect(parseTypographyUtility("leading-6")).toEqual({ prefix: "leading", value: "6" });
  });

  test("parses tracking-* utilities", () => {
    expect(parseTypographyUtility("tracking-tight")).toEqual({
      prefix: "tracking",
      value: "tight",
    });
    expect(parseTypographyUtility("tracking-wider")).toEqual({
      prefix: "tracking",
      value: "wider",
    });
  });

  test("handles prefixed classes", () => {
    expect(parseTypographyUtility("hover:text-lg")).toEqual({ prefix: "text", value: "lg" });
    expect(parseTypographyUtility("md:font-bold")).toEqual({ prefix: "font", value: "bold" });
  });
});

// ============================================================================
// Spacing Utilities
// ============================================================================

describe("parseSpacingUtility", () => {
  test("parses padding utilities", () => {
    expect(parseSpacingUtility("p-4")).toEqual({ prefix: "p", value: "4" });
    expect(parseSpacingUtility("px-2")).toEqual({ prefix: "px", value: "2" });
    expect(parseSpacingUtility("py-6")).toEqual({ prefix: "py", value: "6" });
  });

  test("parses margin utilities", () => {
    expect(parseSpacingUtility("m-4")).toEqual({ prefix: "m", value: "4" });
    expect(parseSpacingUtility("mx-auto")).toEqual({ prefix: "mx", value: "auto" });
    expect(parseSpacingUtility("mt-2")).toEqual({ prefix: "mt", value: "2" });
  });

  test("parses gap utilities", () => {
    expect(parseSpacingUtility("gap-4")).toEqual({ prefix: "gap", value: "4" });
    expect(parseSpacingUtility("gap-x-2")).toEqual({ prefix: "gap-x", value: "2" });
    expect(parseSpacingUtility("gap-y-6")).toEqual({ prefix: "gap-y", value: "6" });
  });

  test("parses space utilities", () => {
    expect(parseSpacingUtility("space-x-4")).toEqual({ prefix: "space-x", value: "4" });
    expect(parseSpacingUtility("space-y-2")).toEqual({ prefix: "space-y", value: "2" });
  });

  test("parses dimension utilities (from suggest.ts)", () => {
    expect(parseSpacingUtility("w-full")).toEqual({ prefix: "w", value: "full" });
    expect(parseSpacingUtility("h-screen")).toEqual({ prefix: "h", value: "screen" });
    expect(parseSpacingUtility("min-w-0")).toEqual({ prefix: "min-w", value: "0" });
    expect(parseSpacingUtility("max-h-64")).toEqual({ prefix: "max-h", value: "64" });
  });

  test("parses arbitrary spacing values", () => {
    expect(parseSpacingUtility("p-[20px]")).toEqual({ prefix: "p", value: "[20px]" });
    expect(parseSpacingUtility("m-[calc(100%-20px)]")).toEqual({
      prefix: "m",
      value: "[calc(100%-20px)]",
    });
  });

  test("returns null for non-spacing utilities", () => {
    expect(parseSpacingUtility("text-lg")).toBeNull();
    expect(parseSpacingUtility("bg-blue-500")).toBeNull();
  });
});

describe("isSpacingUtility", () => {
  test("identifies spacing utilities", () => {
    expect(isSpacingUtility("p-4")).toBe(true);
    expect(isSpacingUtility("m-2")).toBe(true);
    expect(isSpacingUtility("gap-4")).toBe(true);
    expect(isSpacingUtility("w-full")).toBe(true);
  });

  test("rejects non-spacing utilities", () => {
    expect(isSpacingUtility("text-lg")).toBe(false);
    expect(isSpacingUtility("bg-blue-500")).toBe(false);
  });
});

// ============================================================================
// Token Resolution
// ============================================================================

describe("resolveClassToToken", () => {
  test("resolves shorthand token syntax", () => {
    expect(resolveClassToToken("bg-(--color-primary)")).toBe("--color-primary");
    expect(resolveClassToToken("p-(--spacing-md)")).toBe("--spacing-md");
  });

  test("resolves semantic color names", () => {
    expect(resolveClassToToken("bg-primary")).toBe("--color-primary");
    expect(resolveClassToToken("text-foreground")).toBe("--color-foreground");
  });

  test("does not resolve palette colors", () => {
    expect(resolveClassToToken("bg-blue-500")).toBeNull();
    expect(resolveClassToToken("text-gray-100")).toBeNull();
  });

  test("handles opacity modifiers", () => {
    expect(resolveClassToToken("bg-primary/50")).toBe("--color-primary");
  });

  test("returns null for non-token classes", () => {
    expect(resolveClassToToken("p-4")).toBeNull();
    expect(resolveClassToToken("text-lg")).toBeNull();
  });
});

describe("resolveClassToTokenValidated", () => {
  const tokens = new Set(["--color-primary", "--color-secondary", "--spacing-md"]);

  test("resolves only existing tokens", () => {
    expect(resolveClassToTokenValidated("bg-primary", tokens)).toBe("--color-primary");
    expect(resolveClassToTokenValidated("bg-tertiary", tokens)).toBeNull();
  });

  test("always resolves shorthand syntax", () => {
    expect(resolveClassToTokenValidated("bg-(--color-custom)", tokens)).toBe("--color-custom");
  });
});

// ============================================================================
// High-Level Classification
// ============================================================================

describe("classifyUtility", () => {
  test("classifies color utilities", () => {
    const result = classifyUtility("bg-blue-500");
    expect(result.category).toBe("color");
    expect(result.parsed).toEqual({ prefix: "bg", value: "blue-500" });
  });

  test("classifies text-[#fff] as color (PR #92 fix)", () => {
    const result = classifyUtility("text-[#fff]");
    expect(result.category).toBe("color");
    expect(result.parsed).toEqual({ prefix: "text", value: "[#fff]" });
  });

  test("classifies spacing utilities", () => {
    const result = classifyUtility("p-4");
    expect(result.category).toBe("spacing");
    expect(result.parsed).toEqual({ prefix: "p", value: "4" });
  });

  test("classifies typography utilities", () => {
    const result = classifyUtility("text-lg");
    expect(result.category).toBe("typography");
    expect(result.parsed).toEqual({ prefix: "text", value: "lg" });
  });

  test("classifies font-sans as typography (PR #92 fix)", () => {
    const result = classifyUtility("font-sans");
    expect(result.category).toBe("typography");
    expect(result.parsed).toEqual({ prefix: "font", value: "sans" });
  });

  test("classifies unknown utilities", () => {
    const result = classifyUtility("flex");
    expect(result.category).toBe("other");
    expect(result.parsed).toBeNull();
  });

  test("detects arbitrary values", () => {
    expect(classifyUtility("p-[20px]").isArbitrary).toBe(true);
    expect(classifyUtility("p-4").isArbitrary).toBe(false);
  });

  test("detects tokenized values", () => {
    expect(classifyUtility("p-(--spacing-md)").isTokenized).toBe(true);
    expect(classifyUtility("p-4").isTokenized).toBe(false);
  });
});

describe("categorizePattern", () => {
  test("categorizes pure color patterns", () => {
    expect(categorizePattern(["bg-blue-500", "text-white"])).toBe("color");
  });

  test("categorizes pure spacing patterns", () => {
    expect(categorizePattern(["p-4", "m-2", "gap-4"])).toBe("spacing");
  });

  test("categorizes pure typography patterns", () => {
    expect(categorizePattern(["text-lg", "font-bold", "leading-tight"])).toBe("typography");
  });

  test("categorizes mixed patterns", () => {
    expect(categorizePattern(["bg-blue-500", "p-4", "text-lg"])).toBe("mixed");
  });

  test("handles empty patterns", () => {
    expect(categorizePattern([])).toBe("mixed");
  });
});

// ============================================================================
// Arbitrary Value Detection
// ============================================================================

describe("isArbitraryColorUtility", () => {
  test("detects arbitrary hex colors", () => {
    expect(isArbitraryColorUtility("bg-[#fff]")).toBe(true);
    expect(isArbitraryColorUtility("text-[#ffffff]")).toBe(true);
  });

  test("detects arbitrary color functions", () => {
    expect(isArbitraryColorUtility("bg-[rgb(255,0,0)]")).toBe(true);
    expect(isArbitraryColorUtility("bg-[rgba(0,0,0,0.5)]")).toBe(true);
    expect(isArbitraryColorUtility("bg-[hsl(120,100%,50%)]")).toBe(true);
  });

  test("rejects non-color arbitrary values", () => {
    expect(isArbitraryColorUtility("p-[20px]")).toBe(false);
    expect(isArbitraryColorUtility("bg-blue-500")).toBe(false);
  });
});

describe("isArbitraryValueViolation", () => {
  test("detects arbitrary value violations", () => {
    expect(isArbitraryValueViolation("p-[20px]")).toBe(true);
    expect(isArbitraryValueViolation("text-[14px]")).toBe(true);
  });

  test("excludes CSS variable usage", () => {
    expect(isArbitraryValueViolation("p-[var(--spacing)]")).toBe(false);
  });

  test("excludes non-arbitrary values", () => {
    expect(isArbitraryValueViolation("p-4")).toBe(false);
    expect(isArbitraryValueViolation("text-lg")).toBe(false);
  });
});

// ============================================================================
// Constants Verification
// ============================================================================

describe("constants", () => {
  test("SPACING_PREFIXES includes dimension utilities", () => {
    expect(SPACING_PREFIXES).toContain("w");
    expect(SPACING_PREFIXES).toContain("h");
    expect(SPACING_PREFIXES).toContain("min-w");
    expect(SPACING_PREFIXES).toContain("max-h");
  });

  test("COLOR_PREFIXES includes outline", () => {
    expect(COLOR_PREFIXES).toContain("outline");
  });

  test("FONT_FAMILY_VALUES includes all families", () => {
    expect(FONT_FAMILY_VALUES.has("sans")).toBe(true);
    expect(FONT_FAMILY_VALUES.has("serif")).toBe(true);
    expect(FONT_FAMILY_VALUES.has("mono")).toBe(true);
  });
});

// ============================================================================
// Integration Tests - Boolean Checks
// ============================================================================

describe("boolean utility checks", () => {
  test("isTypographyUtility", () => {
    expect(isTypographyUtility("text-lg")).toBe(true);
    expect(isTypographyUtility("font-bold")).toBe(true);
    expect(isTypographyUtility("font-sans")).toBe(true);
    expect(isTypographyUtility("leading-tight")).toBe(true);
    expect(isTypographyUtility("tracking-wide")).toBe(true);
    expect(isTypographyUtility("text-[#fff]")).toBe(false); // Color, not typography
    expect(isTypographyUtility("text-blue-500")).toBe(false); // Color, not typography
    expect(isTypographyUtility("p-4")).toBe(false);
  });

  test("isColorUtility", () => {
    expect(isColorUtility("bg-blue-500")).toBe(true);
    expect(isColorUtility("text-primary")).toBe(true);
    expect(isColorUtility("text-[#fff]")).toBe(true);
    expect(isColorUtility("border-gray-200")).toBe(true);
    expect(isColorUtility("outline-red-500")).toBe(true);
    expect(isColorUtility("text-lg")).toBe(false); // Typography, not color
    expect(isColorUtility("p-4")).toBe(false);
  });
});
