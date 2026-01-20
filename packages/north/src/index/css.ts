import selectorParser from "postcss-selector-parser";

export interface CssTokenDefinition {
  name: string;
  value: string;
  filePath: string;
  line: number;
  column: number;
  references: string[];
}

interface LineIndex {
  lineStarts: number[];
}

function buildLineIndex(content: string): LineIndex {
  const lineStarts = [0];
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] === "\n") {
      lineStarts.push(i + 1);
    }
  }
  return { lineStarts };
}

function getLineColumn(index: number, lineIndex: LineIndex): { line: number; column: number } {
  const { lineStarts } = lineIndex;
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const start = lineStarts[mid] ?? 0;
    const next = lineStarts[mid + 1] ?? Number.POSITIVE_INFINITY;

    if (index >= start && index < next) {
      return { line: mid + 1, column: index - start + 1 };
    }

    if (index < start) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return { line: 1, column: index + 1 };
}

const TOKEN_DECLARATION_REGEX = /(--[A-Za-z0-9-_]+)\s*:\s*([^;]+);/g;
const VAR_REFERENCE_REGEX = /var\(\s*(--[A-Za-z0-9-_]+)\s*(?:,[^)]+)?\)/g;

export function parseCssTokens(content: string, filePath: string): CssTokenDefinition[] {
  const tokens: CssTokenDefinition[] = [];
  const lineIndex = buildLineIndex(content);

  TOKEN_DECLARATION_REGEX.lastIndex = 0;
  let match = TOKEN_DECLARATION_REGEX.exec(content);
  while (match) {
    const name = match[1];
    const value = match[2]?.trim() ?? "";
    if (!name) {
      match = TOKEN_DECLARATION_REGEX.exec(content);
      continue;
    }

    const { line, column } = getLineColumn(match.index, lineIndex);
    const references: string[] = [];

    VAR_REFERENCE_REGEX.lastIndex = 0;
    let refMatch = VAR_REFERENCE_REGEX.exec(value);
    while (refMatch) {
      const ref = refMatch[1];
      if (ref) {
        references.push(ref);
      }
      refMatch = VAR_REFERENCE_REGEX.exec(value);
    }

    tokens.push({
      name,
      value,
      filePath,
      line,
      column,
      references: Array.from(new Set(references)).sort(),
    });

    match = TOKEN_DECLARATION_REGEX.exec(content);
  }

  return tokens;
}

// ============================================================================
// Theme Variant Parsing
// ============================================================================

export interface ThemeVariant {
  value: string;
  source: string;
}

export interface ThemeVariants {
  light?: ThemeVariant;
  dark?: ThemeVariant;
}

export interface CssTokensWithThemes {
  tokens: CssTokenDefinition[];
  themeVariants: Map<string, ThemeVariants>;
}

type ThemeType = "light" | "dark" | null;

/**
 * Check if a single selector node represents a dark theme.
 */
function isSelectorDarkTheme(selector: selectorParser.Selector): boolean {
  let hasDarkClass = false;
  let hasDarkDataTheme = false;

  selector.walk((node) => {
    // Check for .dark class
    if (node.type === "class" && node.value === "dark") {
      hasDarkClass = true;
    }
    // Check for data-theme="dark" or data-theme='dark' attribute
    if (node.type === "attribute" && node.attribute === "data-theme") {
      const value = node.value;
      if (value === "dark") {
        hasDarkDataTheme = true;
      }
    }
  });

  return hasDarkClass || hasDarkDataTheme;
}

/**
 * Check if a single selector node represents a light theme.
 * Currently only :root by itself (without .dark) is considered light.
 */
function isSelectorLightTheme(selector: selectorParser.Selector): boolean {
  let hasRoot = false;
  let hasDarkIndicator = false;

  selector.walk((node) => {
    if (node.type === "pseudo" && node.value === ":root") {
      hasRoot = true;
    }
    if (node.type === "class" && node.value === "dark") {
      hasDarkIndicator = true;
    }
    if (node.type === "class" && node.value === "light") {
      // .light class also indicates light theme
      hasRoot = true;
    }
  });

  return hasRoot && !hasDarkIndicator;
}

/**
 * Parse a selector list and determine the theme type.
 * Handles comma-separated selectors like ":root, .dark".
 * Returns "dark" if any selector in the list indicates dark theme.
 * Returns "light" if any selector indicates light theme (and no dark).
 */
function getThemeFromSelector(selectorList: string): ThemeType {
  const trimmed = selectorList.trim();
  if (!trimmed) return null;

  let foundDark = false;
  let foundLight = false;

  try {
    const processor = selectorParser((root) => {
      root.each((selector) => {
        if (selector.type === "selector") {
          if (isSelectorDarkTheme(selector)) {
            foundDark = true;
          }
          if (isSelectorLightTheme(selector)) {
            foundLight = true;
          }
        }
      });
    });

    processor.processSync(trimmed);
  } catch {
    // Fallback to simple string matching if parsing fails
    if (
      trimmed === ".dark" ||
      trimmed === ":root.dark" ||
      trimmed === "html.dark" ||
      trimmed.includes('data-theme="dark"') ||
      trimmed.includes("data-theme='dark'")
    ) {
      return "dark";
    }
    if (trimmed === ":root") {
      return "light";
    }
    return null;
  }

  // Dark takes precedence (for selectors like ".dark, :root" which is unusual but possible)
  if (foundDark) return "dark";
  if (foundLight) return "light";
  return null;
}

function isInDarkMediaQuery(content: string, position: number): string | null {
  const beforeContent = content.slice(0, position);

  const mediaMatches = beforeContent.matchAll(
    /@media\s*\([^)]*prefers-color-scheme:\s*dark[^)]*\)\s*\{/gi
  );
  let lastDarkMedia: { index: number; match: string } | null = null;

  for (const match of mediaMatches) {
    if (match.index !== undefined) {
      lastDarkMedia = { index: match.index, match: match[0] };
    }
  }

  if (!lastDarkMedia) {
    return null;
  }

  let braceCount = 1;
  const afterMediaStart = lastDarkMedia.index + lastDarkMedia.match.length;

  for (let i = afterMediaStart; i < position; i += 1) {
    if (content[i] === "{") {
      braceCount += 1;
    } else if (content[i] === "}") {
      braceCount -= 1;
    }

    if (braceCount === 0) {
      return null;
    }
  }

  return "@media (prefers-color-scheme: dark)";
}

function findSelectorAtPosition(content: string, position: number): string | null {
  let braceStart = -1;
  let braceDepth = 0;

  for (let i = position; i >= 0; i -= 1) {
    if (content[i] === "}") {
      braceDepth += 1;
    } else if (content[i] === "{") {
      if (braceDepth === 0) {
        braceStart = i;
        break;
      }
      braceDepth -= 1;
    }
  }

  if (braceStart === -1) {
    return null;
  }

  let selectorStart = 0;
  for (let i = braceStart - 1; i >= 0; i -= 1) {
    const char = content[i];
    if (char === "}" || char === ";") {
      selectorStart = i + 1;
      break;
    }
    if (char === "{") {
      selectorStart = i + 1;
      break;
    }
  }

  const selector = content.slice(selectorStart, braceStart).trim();
  return selector || null;
}

export function parseCssTokensWithThemes(content: string, filePath: string): CssTokensWithThemes {
  const tokens = parseCssTokens(content, filePath);
  const themeVariants = new Map<string, ThemeVariants>();

  TOKEN_DECLARATION_REGEX.lastIndex = 0;
  let match = TOKEN_DECLARATION_REGEX.exec(content);

  while (match) {
    const name = match[1];
    const value = match[2]?.trim() ?? "";

    if (!name) {
      match = TOKEN_DECLARATION_REGEX.exec(content);
      continue;
    }

    const position = match.index;

    const darkMediaSource = isInDarkMediaQuery(content, position);
    if (darkMediaSource) {
      const existing = themeVariants.get(name) ?? {};
      existing.dark = { value, source: darkMediaSource };
      themeVariants.set(name, existing);
      match = TOKEN_DECLARATION_REGEX.exec(content);
      continue;
    }

    const selector = findSelectorAtPosition(content, position);
    if (!selector) {
      match = TOKEN_DECLARATION_REGEX.exec(content);
      continue;
    }

    const theme = getThemeFromSelector(selector);
    if (theme) {
      const existing = themeVariants.get(name) ?? {};
      existing[theme] = { value, source: selector };
      themeVariants.set(name, existing);
    }

    match = TOKEN_DECLARATION_REGEX.exec(content);
  }

  return { tokens, themeVariants };
}
