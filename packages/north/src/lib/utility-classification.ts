/**
 * Centralized Utility Classification Module
 *
 * This module consolidates all Tailwind CSS utility parsing and classification
 * logic into a single source of truth. Previously this logic was duplicated
 * across 6+ files with subtle inconsistencies.
 *
 * @see packages/north/.scratch/foundational-refactor-plan.md
 */

// ============================================================================
// Constants - Spacing Utilities
// ============================================================================

/**
 * All spacing-related utility prefixes.
 * Includes padding, margin, gap, space, and dimension utilities.
 *
 * IMPORTANT: Longer prefixes MUST come before shorter ones (e.g., "gap-x" before "gap")
 * to ensure correct matching in parseSpacingUtility.
 */
export const SPACING_PREFIXES = [
  // Padding
  "px",
  "py",
  "pt",
  "pr",
  "pb",
  "pl",
  "p",
  // Margin
  "mx",
  "my",
  "mt",
  "mr",
  "mb",
  "ml",
  "m",
  // Gap - longer prefixes first!
  "gap-x",
  "gap-y",
  "gap",
  // Space between
  "space-x",
  "space-y",
  // Dimensions (from suggest.ts) - longer prefixes first!
  "min-w",
  "min-h",
  "max-w",
  "max-h",
  "w",
  "h",
] as const;

// ============================================================================
// Constants - Color Utilities
// ============================================================================

/**
 * All color-related utility prefixes.
 * Includes 'outline' which was previously missing in some files.
 */
export const COLOR_PREFIXES = [
  "bg",
  "text",
  "border",
  "ring",
  "fill",
  "stroke",
  "outline", // Was only in suggest.ts, now unified
] as const;

/**
 * Raw color values that are valid without a palette prefix.
 */
export const RAW_COLOR_VALUES = new Set(["transparent", "current", "black", "white", "inherit"]);

/**
 * Regex to match Tailwind palette color values like "blue-500", "gray-100".
 */
export const PALETTE_VALUE_REGEX = /^[a-z-]+-\d{2,3}$/i;

/**
 * Regex to extract CSS variable references from color values.
 */
export const VAR_COLOR_TOKEN_REGEX = /var\(\s*(--color-[A-Za-z0-9-_]+)\s*(?:,[^)]+)?\)/i;

/**
 * Regex to detect color literals inside arbitrary value brackets.
 * Used to distinguish color values from typography values.
 */
export const COLOR_LITERAL_REGEX =
  /^#[0-9a-f]{3,8}$|^rgb|^rgba|^hsl|^hsla|^oklch|^lab|^lch|^color\(/i;

// ============================================================================
// Constants - Typography Utilities
// ============================================================================

/**
 * Typography utility prefixes.
 */
export const TYPOGRAPHY_PREFIXES = ["text", "font", "leading", "tracking"] as const;

/**
 * Valid text size values (text-sm, text-lg, etc).
 */
export const TYPOGRAPHY_SIZE_VALUES = new Set([
  "xs",
  "sm",
  "base",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "4xl",
  "5xl",
  "6xl",
  "7xl",
  "8xl",
  "9xl",
]);

/**
 * Valid font weight values (font-bold, font-semibold, etc).
 */
export const FONT_WEIGHT_VALUES = new Set([
  "thin",
  "extralight",
  "light",
  "normal",
  "medium",
  "semibold",
  "bold",
  "extrabold",
  "black",
]);

/**
 * Valid font family values (font-sans, font-serif, font-mono).
 * This was missing in previous implementations - PR #92 feedback.
 */
export const FONT_FAMILY_VALUES = new Set(["sans", "serif", "mono"]);

/**
 * Valid leading (line-height) values.
 */
export const LEADING_VALUES = new Set(["none", "tight", "snug", "normal", "relaxed", "loose"]);

/**
 * Valid tracking (letter-spacing) values.
 */
export const TRACKING_VALUES = new Set(["tighter", "tight", "normal", "wide", "wider", "widest"]);

// ============================================================================
// Core Parsing Functions
// ============================================================================

/**
 * Split a string by a delimiter, respecting bracket and parenthesis depth.
 * This handles arbitrary values like `text-[calc(100%-20px)]` correctly.
 *
 * @example
 * splitByDelimiter("hover:text-blue-500", ":") // ["hover", "text-blue-500"]
 * splitByDelimiter("text-[calc(1:2)]", ":") // ["text-[calc(1:2)]"]
 */
export function splitByDelimiter(input: string, delimiter: string): string[] {
  const parts: string[] = [];
  let current = "";
  let bracketDepth = 0;
  let parenDepth = 0;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (!char) continue;

    if (char === "[") bracketDepth += 1;
    else if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (char === "(") parenDepth += 1;
    else if (char === ")") parenDepth = Math.max(0, parenDepth - 1);

    if (char === delimiter && bracketDepth === 0 && parenDepth === 0) {
      parts.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  parts.push(current);
  return parts;
}

/**
 * Extract the utility segment from a class name, removing responsive/state prefixes.
 *
 * @example
 * getUtilitySegment("hover:md:text-blue-500") // "text-blue-500"
 * getUtilitySegment("text-blue-500") // "text-blue-500"
 */
export function getUtilitySegment(className: string): string {
  const parts = splitByDelimiter(className, ":");
  return parts[parts.length - 1] ?? className;
}

// ============================================================================
// Parsed Utility Types
// ============================================================================

export interface ParsedUtility {
  prefix: string;
  value: string;
}

export type UtilityCategory = "color" | "spacing" | "typography" | "other";

export interface ClassificationResult {
  category: UtilityCategory;
  parsed: ParsedUtility | null;
  isArbitrary: boolean;
  isTokenized: boolean;
}

// ============================================================================
// Color Detection & Parsing
// ============================================================================

/**
 * Check if a value inside brackets represents a color literal.
 * Used to distinguish `text-[#fff]` (color) from `text-[14px]` (typography).
 *
 * This fixes PR #92 feedback where `text-[#fff]` was misclassified as typography.
 */
export function isColorLiteralValue(value: string): boolean {
  // Raw color keywords
  if (RAW_COLOR_VALUES.has(value)) return true;

  // Arbitrary color value in brackets
  if (value.startsWith("[")) {
    const inner = value.slice(1, -1).toLowerCase();
    // Check for color functions and hex values
    if (COLOR_LITERAL_REGEX.test(inner)) return true;
    // Check for var(--color-*) references
    if (/var\(--/.test(inner)) return true;
    return false;
  }

  // Palette value like "blue-500"
  return PALETTE_VALUE_REGEX.test(value);
}

/**
 * Parse a color utility class name.
 *
 * @example
 * parseColorUtility("bg-blue-500") // { prefix: "bg", value: "blue-500" }
 * parseColorUtility("text-[#fff]") // { prefix: "text", value: "[#fff]" }
 * parseColorUtility("text-lg") // null (typography, not color)
 */
export function parseColorUtility(className: string): ParsedUtility | null {
  const utility = getUtilitySegment(className);

  for (const prefix of COLOR_PREFIXES) {
    if (utility.startsWith(`${prefix}-`)) {
      const value = utility.slice(prefix.length + 1);

      // Special case for 'text-' prefix: distinguish color from typography
      if (prefix === "text") {
        // If it's a typography value, not a color
        if (isTypographySizeValue(value)) return null;
        // If it's an arbitrary value, check if it's a color literal
        if (value.startsWith("[") && !isColorLiteralValue(value)) return null;
      }

      return { prefix, value };
    }
  }

  return null;
}

/**
 * Extract a CSS color token reference from a value.
 *
 * @example
 * extractVarColorToken("[var(--color-primary)]") // "--color-primary"
 * extractVarColorToken("primary") // null
 */
export function extractVarColorToken(value: string): string | null {
  const inner = value.startsWith("[") ? value.slice(1, -1) : value;
  const match = inner.match(VAR_COLOR_TOKEN_REGEX);
  return match?.[1] ?? null;
}

// ============================================================================
// Spacing Detection & Parsing
// ============================================================================

/**
 * Parse a spacing utility class name.
 *
 * @example
 * parseSpacingUtility("p-4") // { prefix: "p", value: "4" }
 * parseSpacingUtility("gap-x-2") // { prefix: "gap-x", value: "2" }
 * parseSpacingUtility("text-lg") // null
 */
export function parseSpacingUtility(className: string): ParsedUtility | null {
  const utility = getUtilitySegment(className);

  for (const prefix of SPACING_PREFIXES) {
    if (utility.startsWith(`${prefix}-`)) {
      return {
        prefix,
        value: utility.slice(prefix.length + 1),
      };
    }
  }

  return null;
}

/**
 * Check if a class name is a spacing utility.
 */
export function isSpacingUtility(className: string): boolean {
  const utility = getUtilitySegment(className);
  for (const prefix of SPACING_PREFIXES) {
    if (utility.startsWith(`${prefix}-`) || utility === prefix) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// Typography Detection & Parsing
// ============================================================================

/**
 * Check if a value is a valid typography size value.
 * This includes scale values (xs, sm, lg, etc) and numeric/arbitrary sizes.
 */
function isTypographySizeValue(value: string): boolean {
  // Scale values
  if (TYPOGRAPHY_SIZE_VALUES.has(value)) return true;
  // Numeric values like "14" or "1.5"
  if (/^\d+(\.\d+)?$/.test(value)) return true;
  return false;
}

/**
 * Check if a value is a valid typography text value.
 * This rejects color literals like `#fff` - fixing PR #92 feedback.
 *
 * @example
 * isTypographyTextValue("lg") // true
 * isTypographyTextValue("[14px]") // true
 * isTypographyTextValue("[#fff]") // false - this is a color!
 * isTypographyTextValue("(--text-size)") // true - token reference
 */
export function isTypographyTextValue(value: string): boolean {
  // Scale values
  if (TYPOGRAPHY_SIZE_VALUES.has(value)) return true;

  // Arbitrary value in brackets - but NOT if it's a color literal
  if (value.startsWith("[")) {
    // Reject color literals inside brackets
    if (isColorLiteralValue(value)) return false;
    return true;
  }

  // Token reference via shorthand syntax
  if (value.startsWith("(--")) return true;

  // Numeric values like "14" or "1.5"
  if (/^\d+(\.\d+)?$/.test(value)) return true;

  return false;
}

/**
 * Check if a value is a valid font utility value (weight or family).
 */
function isFontUtilityValue(value: string): boolean {
  // Font weight values
  if (FONT_WEIGHT_VALUES.has(value)) return true;
  // Font family values (sans, serif, mono) - PR #92 fix
  if (FONT_FAMILY_VALUES.has(value)) return true;
  // Arbitrary value
  if (value.startsWith("[")) return true;
  // Token reference
  if (value.startsWith("(--")) return true;
  return false;
}

/**
 * Parse a typography utility class name.
 *
 * @example
 * parseTypographyUtility("text-lg") // { prefix: "text", value: "lg" }
 * parseTypographyUtility("font-bold") // { prefix: "font", value: "bold" }
 * parseTypographyUtility("font-sans") // { prefix: "font", value: "sans" }
 * parseTypographyUtility("text-[#fff]") // null - this is a color!
 */
export function parseTypographyUtility(className: string): ParsedUtility | null {
  const utility = getUtilitySegment(className);

  // text-* utilities (size)
  if (utility.startsWith("text-")) {
    const value = utility.slice(5);
    if (isTypographyTextValue(value)) {
      return { prefix: "text", value };
    }
    return null;
  }

  // font-* utilities (weight, family)
  if (utility.startsWith("font-")) {
    const value = utility.slice(5);
    if (isFontUtilityValue(value)) {
      return { prefix: "font", value };
    }
    return null;
  }

  // leading-* utilities (line-height)
  if (utility.startsWith("leading-")) {
    const value = utility.slice(8);
    if (
      LEADING_VALUES.has(value) ||
      value.startsWith("[") ||
      value.startsWith("(--") ||
      /^\d+(\.\d+)?$/.test(value)
    ) {
      return { prefix: "leading", value };
    }
    return null;
  }

  // tracking-* utilities (letter-spacing)
  if (utility.startsWith("tracking-")) {
    const value = utility.slice(9);
    if (TRACKING_VALUES.has(value) || value.startsWith("[") || value.startsWith("(--")) {
      return { prefix: "tracking", value };
    }
    return null;
  }

  return null;
}

/**
 * Check if a class name is a typography utility.
 */
export function isTypographyUtility(className: string): boolean {
  return parseTypographyUtility(className) !== null;
}

/**
 * Check if a class name is a color utility.
 */
export function isColorUtility(className: string): boolean {
  return parseColorUtility(className) !== null;
}

// ============================================================================
// Token Resolution
// ============================================================================

/**
 * Resolve a class name to its underlying CSS token, if any.
 *
 * @example
 * resolveClassToToken("bg-primary") // "--color-primary"
 * resolveClassToToken("p-(--spacing-md)") // "--spacing-md"
 * resolveClassToToken("p-4") // null
 */
export function resolveClassToToken(className: string): string | null {
  const utility = getUtilitySegment(className);

  // Shorthand token syntax: prefix-(--token-name)
  const shorthandMatch = utility.match(/^[A-Za-z-]+-\((--[A-Za-z0-9-_]+)\)$/);
  if (shorthandMatch?.[1]) {
    return shorthandMatch[1];
  }

  // Color utility: infer token from semantic name
  const colorMatch = utility.match(
    /^(bg|text|border|ring|fill|stroke|outline)-([A-Za-z0-9-_]+)(?:\/[\d.]+)?$/
  );
  if (colorMatch?.[2]) {
    const value = colorMatch[2];
    // Don't resolve palette colors (blue-500) - only semantic names
    if (PALETTE_VALUE_REGEX.test(value)) {
      return null;
    }
    // Don't resolve typography values (lg, sm, base, etc.) as color tokens
    // This fixes the issue where text-lg was incorrectly resolved to --color-lg
    if (TYPOGRAPHY_SIZE_VALUES.has(value)) {
      return null;
    }
    return `--color-${value}`;
  }

  return null;
}

/**
 * Resolve a class name to its underlying CSS token, validating against known tokens.
 * This version checks that the resolved token actually exists in the token set.
 */
export function resolveClassToTokenValidated(
  className: string,
  tokenNames: Set<string>
): string | null {
  const utility = getUtilitySegment(className);

  // Shorthand token syntax
  const shorthandMatch = utility.match(/^[A-Za-z-]+-\((--[A-Za-z0-9-_]+)\)$/);
  if (shorthandMatch?.[1]) {
    return shorthandMatch[1];
  }

  // Color utility with validation
  const colorMatch = utility.match(
    /^(bg|text|border|ring|fill|stroke|outline)-([A-Za-z0-9-_]+)(?:\/[\d.]+)?$/
  );
  if (colorMatch?.[2]) {
    const tokenName = `--color-${colorMatch[2]}`;
    if (tokenNames.has(tokenName)) {
      return tokenName;
    }
    return null;
  }

  return null;
}

// ============================================================================
// High-Level Classification
// ============================================================================

/**
 * Classify a utility class name into its category.
 *
 * @example
 * classifyUtility("bg-blue-500") // { category: "color", ... }
 * classifyUtility("p-4") // { category: "spacing", ... }
 * classifyUtility("text-lg") // { category: "typography", ... }
 * classifyUtility("text-[#fff]") // { category: "color", ... }
 */
export function classifyUtility(className: string): ClassificationResult {
  const utility = getUtilitySegment(className);

  // Check for color utilities first (including text-[#color])
  const colorParsed = parseColorUtility(className);
  if (colorParsed) {
    return {
      category: "color",
      parsed: colorParsed,
      isArbitrary: colorParsed.value.startsWith("["),
      isTokenized:
        colorParsed.value.startsWith("(--") || extractVarColorToken(colorParsed.value) !== null,
    };
  }

  // Check for spacing utilities
  const spacingParsed = parseSpacingUtility(className);
  if (spacingParsed) {
    return {
      category: "spacing",
      parsed: spacingParsed,
      isArbitrary: spacingParsed.value.includes("["),
      isTokenized: spacingParsed.value.includes("--"),
    };
  }

  // Check for typography utilities
  const typographyParsed = parseTypographyUtility(className);
  if (typographyParsed) {
    return {
      category: "typography",
      parsed: typographyParsed,
      isArbitrary: typographyParsed.value.startsWith("["),
      isTokenized: typographyParsed.value.startsWith("(--"),
    };
  }

  // Unknown utility
  return {
    category: "other",
    parsed: null,
    isArbitrary: utility.includes("["),
    isTokenized: utility.includes("--"),
  };
}

/**
 * Categorize a pattern of classes for adoption analysis.
 * Returns "mixed" if classes span multiple categories.
 */
export function categorizePattern(classes: string[]): "color" | "spacing" | "typography" | "mixed" {
  if (classes.length === 0) return "mixed";

  let colorCount = 0;
  let spacingCount = 0;
  let typographyCount = 0;

  for (const className of classes) {
    const result = classifyUtility(className);
    if (result.category === "color") colorCount += 1;
    else if (result.category === "spacing") spacingCount += 1;
    else if (result.category === "typography") typographyCount += 1;
  }

  const total = classes.length;

  if (colorCount === total) return "color";
  if (spacingCount === total) return "spacing";
  if (typographyCount === total) return "typography";

  return "mixed";
}

// ============================================================================
// Arbitrary Value Detection
// ============================================================================

/**
 * Check if a class contains an arbitrary color value.
 */
export function isArbitraryColorUtility(className: string): boolean {
  const utility = getUtilitySegment(className);
  return /^(bg|text|border|ring|fill|stroke|outline)-\[(#|rgb|rgba|hsl|hsla|oklch|lab|lch)/.test(
    utility
  );
}

/**
 * Check if a class contains an arbitrary value violation.
 * Returns true for arbitrary values that don't use CSS variables.
 */
export function isArbitraryValueViolation(className: string): boolean {
  const utility = getUtilitySegment(className);

  if (!utility.includes("[") || !utility.includes("]")) {
    return false;
  }

  // Not a violation if using a CSS variable
  if (utility.includes("var(--")) {
    return false;
  }

  return true;
}
