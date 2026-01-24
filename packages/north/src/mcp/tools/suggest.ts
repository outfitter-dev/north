/**
 * north_suggest MCP tool - Suggest appropriate design tokens for use cases
 *
 * Given a file location or violation, suggests appropriate semantic tokens
 * to replace raw values or arbitrary utilities.
 *
 * This is a Tier 2 tool - requires config (.north/config.yaml) to be present.
 *
 * @see .scratch/mcp-server/11-remaining-issues-execution-plan.md for specification
 * @issue #82
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DEFAULT_COLORS_LIGHT } from "../../config/defaults.ts";
import { loadConfig } from "../../config/loader.ts";
import type { NorthConfig } from "../../config/schema.ts";
import { COLOR_PREFIXES, SPACING_PREFIXES } from "../../lib/utility-classification.ts";
import { detectContext } from "../state.ts";

// ============================================================================
// Input Schema
// ============================================================================

export const SuggestInputSchema = z.object({
  file: z.string().describe("File path to analyze for token suggestions"),
  line: z.number().optional().describe("Line number to focus suggestions on (1-indexed)"),
  violation: z
    .string()
    .optional()
    .describe("Violation ID or class name from north_check for targeted suggestions"),
  category: z
    .enum(["colors", "spacing", "typography", "all"])
    .optional()
    .default("all")
    .describe("Filter suggestions by category"),
  cwd: z.string().optional().describe("Working directory (defaults to process.cwd())"),
});

export type SuggestInput = z.infer<typeof SuggestInputSchema>;

// ============================================================================
// Response Types
// ============================================================================

/**
 * A single token suggestion with reasoning.
 */
export interface TokenSuggestion {
  /** Current value (e.g., "bg-blue-500") */
  current: string;
  /** Suggested replacement (e.g., "bg-primary") */
  suggested: string;
  /** CSS variable name if applicable */
  cssVar?: string;
  /** Category of the suggestion */
  category: "color" | "spacing" | "typography" | "other";
  /** Confidence level */
  confidence: "high" | "medium" | "low";
  /** Explanation for why this suggestion is appropriate */
  reason: string;
}

/**
 * Response payload from north_suggest tool.
 */
export interface SuggestResponse {
  /** Response kind identifier */
  kind: "suggest";
  /** File that was analyzed */
  file: string;
  /** Line number if provided */
  line?: number;
  /** Array of suggestions */
  suggestions: TokenSuggestion[];
  /** General guidance for this context */
  guidance: string[];
  /** Available semantic tokens for reference */
  availableTokens: {
    colors: string[];
    spacing: string[];
    typography: string[];
  };
}

// ============================================================================
// Semantic Token Maps
// ============================================================================

const SEMANTIC_COLOR_MAP: Record<string, { token: string; reason: string }> = {
  // Primary colors
  "blue-500": { token: "primary", reason: "Primary action color" },
  "blue-600": { token: "primary", reason: "Primary action color (hover state)" },
  "blue-700": { token: "primary", reason: "Primary action color (pressed state)" },

  // Neutrals / Foreground
  "gray-900": { token: "foreground", reason: "Primary text color" },
  "gray-800": { token: "foreground", reason: "Primary text color" },
  "gray-700": { token: "foreground", reason: "Secondary text color" },

  // Muted
  "gray-500": { token: "muted-foreground", reason: "Muted/placeholder text" },
  "gray-400": { token: "muted-foreground", reason: "Muted text" },
  "gray-100": { token: "muted", reason: "Muted background" },
  "gray-50": { token: "muted", reason: "Subtle background" },

  // Borders
  "gray-200": { token: "border", reason: "Default border color" },
  "gray-300": { token: "border", reason: "Border color" },

  // Destructive
  "red-500": { token: "destructive", reason: "Error/destructive action" },
  "red-600": { token: "destructive", reason: "Error/destructive action" },
  "red-700": { token: "destructive", reason: "Error/destructive (pressed)" },

  // Success
  "green-500": { token: "success", reason: "Success state" },
  "green-600": { token: "success", reason: "Success state" },

  // Warning
  "yellow-500": { token: "warning", reason: "Warning state" },
  "amber-500": { token: "warning", reason: "Warning state" },
  "orange-500": { token: "warning", reason: "Warning state" },

  // Background
  white: { token: "background", reason: "Base background" },
  "slate-50": { token: "background", reason: "Base background" },
  "zinc-50": { token: "background", reason: "Base background" },
};

const SEMANTIC_SPACING_MAP: Record<string, { token: string; reason: string }> = {
  "0.5": { token: "xs", reason: "Extra small spacing (2px)" },
  "1": { token: "xs", reason: "Extra small spacing (4px)" },
  "1.5": { token: "sm", reason: "Small spacing (6px)" },
  "2": { token: "sm", reason: "Small spacing (8px)" },
  "3": { token: "md", reason: "Medium spacing (12px)" },
  "4": { token: "md", reason: "Medium spacing (16px)" },
  "5": { token: "lg", reason: "Large spacing (20px)" },
  "6": { token: "lg", reason: "Large spacing (24px)" },
  "8": { token: "xl", reason: "Extra large spacing (32px)" },
  "10": { token: "xl", reason: "Extra large spacing (40px)" },
  "12": { token: "2xl", reason: "2x extra large spacing (48px)" },
  "16": { token: "2xl", reason: "2x extra large spacing (64px)" },
};

// ============================================================================
// Parsing Utilities
// ============================================================================

function parseColorClass(
  className: string
): { prefix: string; color: string; opacity?: string } | null {
  for (const prefix of COLOR_PREFIXES) {
    const regex = new RegExp(`^${prefix}-([a-z]+-\\d+|[a-z]+)(?:/(\\d+))?$`);
    const match = className.match(regex);
    if (match?.[1]) {
      return {
        prefix,
        color: match[1],
        opacity: match[2],
      };
    }
  }
  return null;
}

function parseSpacingClass(className: string): { prefix: string; value: string } | null {
  for (const prefix of SPACING_PREFIXES) {
    if (className.startsWith(`${prefix}-`)) {
      const value = className.slice(prefix.length + 1);
      // Check for numeric values (including decimals and arbitrary)
      if (/^(\d+\.?\d*|\[.+\])$/.test(value)) {
        return { prefix, value };
      }
    }
  }
  return null;
}

function extractClassesFromLine(line: string): string[] {
  // Match className="..." or class="..." patterns
  const classNameMatches = line.matchAll(/(?:className|class)=["']([^"']+)["']/g);
  const classes: string[] = [];

  for (const match of classNameMatches) {
    if (match[1]) {
      classes.push(...match[1].split(/\s+/).filter(Boolean));
    }
  }

  // Also match cn(...), clsx(...), cva(...) patterns
  const utilityMatches = line.matchAll(/(?:cn|clsx|cva)\(([^)]+)\)/g);
  for (const match of utilityMatches) {
    if (match[1]) {
      // Extract string literals
      const literals = match[1].matchAll(/"([^"]+)"|'([^']+)'/g);
      for (const lit of literals) {
        const value = lit[1] ?? lit[2];
        if (value) {
          classes.push(...value.split(/\s+/).filter(Boolean));
        }
      }
    }
  }

  return classes;
}

// ============================================================================
// Suggestion Generation
// ============================================================================

function suggestColorReplacement(
  className: string,
  parsed: { prefix: string; color: string; opacity?: string },
  availableColors: string[]
): TokenSuggestion | null {
  const mapping = SEMANTIC_COLOR_MAP[parsed.color];
  if (!mapping) {
    // No direct mapping, provide generic guidance
    return {
      current: className,
      suggested: `${parsed.prefix}-{semantic-token}`,
      category: "color",
      confidence: "low",
      reason: `Replace raw palette color "${parsed.color}" with a semantic token from your design system`,
    };
  }

  // Validate token exists in config
  const tokenExists = availableColors.includes(mapping.token);

  const suggested = parsed.opacity
    ? `${parsed.prefix}-${mapping.token}/${parsed.opacity}`
    : `${parsed.prefix}-${mapping.token}`;

  return {
    current: className,
    suggested,
    cssVar: `--color-${mapping.token}`,
    category: "color",
    // Only high confidence if token exists in config
    confidence: tokenExists ? "high" : "medium",
    reason: tokenExists
      ? mapping.reason
      : `${mapping.reason} (Note: token "${mapping.token}" not found in config)`,
  };
}

function suggestSpacingReplacement(
  className: string,
  parsed: { prefix: string; value: string },
  availableSpacing: string[]
): TokenSuggestion | null {
  // Handle arbitrary values
  if (parsed.value.startsWith("[")) {
    return {
      current: className,
      suggested: `${parsed.prefix}-(--spacing-{token})`,
      category: "spacing",
      confidence: "low",
      reason: "Replace arbitrary value with a spacing token from your design system",
    };
  }

  const mapping = SEMANTIC_SPACING_MAP[parsed.value];
  if (!mapping) {
    return {
      current: className,
      suggested: `${parsed.prefix}-(--spacing-{token})`,
      category: "spacing",
      confidence: "low",
      reason: `Consider using a semantic spacing token instead of numeric value "${parsed.value}"`,
    };
  }

  // Validate token exists in config
  const tokenExists = availableSpacing.includes(mapping.token);

  return {
    current: className,
    suggested: `${parsed.prefix}-(--spacing-${mapping.token})`,
    cssVar: `--spacing-${mapping.token}`,
    category: "spacing",
    // Only high confidence if token exists in config
    confidence: tokenExists ? "high" : "medium",
    reason: tokenExists
      ? mapping.reason
      : `${mapping.reason} (Note: token "${mapping.token}" not found in config)`,
  };
}

function generateSuggestionsForClass(
  className: string,
  category: "colors" | "spacing" | "typography" | "all",
  availableTokens: SuggestResponse["availableTokens"]
): TokenSuggestion | null {
  // Try color parsing
  if (category === "all" || category === "colors") {
    const colorParsed = parseColorClass(className);
    if (colorParsed) {
      const colorSuggestion = suggestColorReplacement(
        className,
        colorParsed,
        availableTokens.colors
      );
      if (colorSuggestion) return colorSuggestion;
    }
  }

  // Try spacing parsing
  if (category === "all" || category === "spacing") {
    const spacingParsed = parseSpacingClass(className);
    if (spacingParsed) {
      const spacingSuggestion = suggestSpacingReplacement(
        className,
        spacingParsed,
        availableTokens.spacing
      );
      if (spacingSuggestion) return spacingSuggestion;
    }
  }

  return null;
}

function buildAvailableTokens(config: NorthConfig): SuggestResponse["availableTokens"] {
  // Start with keys from DEFAULT_COLORS_LIGHT as the baseline
  const colors = new Set<string>(Object.keys(DEFAULT_COLORS_LIGHT));

  // Enrich from config if available (may add custom tokens like success, warning)
  if (config.colors) {
    for (const key of Object.keys(config.colors)) {
      colors.add(key);
    }
  }

  // Spacing and typography remain unchanged (these are consistent defaults)
  const spacing: string[] = ["xs", "sm", "md", "lg", "xl", "2xl"];
  const typography: string[] = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl"];

  return { colors: [...colors], spacing, typography };
}

function buildGuidance(category: "colors" | "spacing" | "typography" | "all"): string[] {
  const guidance: string[] = [
    "Use semantic tokens for consistency across your design system.",
    "Run 'north check' to find all violations that need token replacement.",
  ];

  if (category === "all" || category === "colors") {
    guidance.push(
      "For colors: prefer semantic names like 'primary', 'foreground', 'muted' over raw palette values."
    );
  }

  if (category === "all" || category === "spacing") {
    guidance.push("For spacing: use --spacing-xs through --spacing-2xl instead of numeric values.");
  }

  if (category === "all" || category === "typography") {
    guidance.push("For typography: use semantic text sizes defined in your typography scale.");
  }

  return guidance;
}

// ============================================================================
// Core Logic
// ============================================================================

export interface SuggestOptions {
  file: string;
  line?: number;
  violation?: string;
  category?: "colors" | "spacing" | "typography" | "all";
}

/**
 * Execute the north_suggest tool handler.
 *
 * Analyzes a file location and suggests appropriate design tokens.
 */
export async function executeSuggestTool(
  workingDir: string,
  configPath: string,
  options: SuggestOptions
): Promise<SuggestResponse> {
  const { file, line, violation, category = "all" } = options;

  // Load config
  const loadResult = await loadConfig(configPath);
  if (!loadResult.success) {
    throw new Error(loadResult.error.message);
  }

  const config = loadResult.config;
  const filePath = resolve(workingDir, file);

  // Build available tokens from config first (for validation)
  const availableTokens = buildAvailableTokens(config);

  // Read file content
  let fileContent: string;
  try {
    fileContent = await readFile(filePath, "utf-8");
  } catch {
    throw new Error(`Could not read file: ${file}`);
  }

  const lines = fileContent.split("\n");
  const suggestions: TokenSuggestion[] = [];

  // If violation is provided, focus on that specific class
  if (violation) {
    const suggestion = generateSuggestionsForClass(violation, category, availableTokens);
    if (suggestion) {
      suggestions.push(suggestion);
    }
  } else if (line !== undefined) {
    // Analyze specific line
    const lineIndex = line - 1;
    if (lineIndex >= 0 && lineIndex < lines.length) {
      const lineContent = lines[lineIndex] ?? "";
      const classes = extractClassesFromLine(lineContent);

      for (const cls of classes) {
        const suggestion = generateSuggestionsForClass(cls, category, availableTokens);
        if (suggestion) {
          suggestions.push(suggestion);
        }
      }
    }
  } else {
    // Analyze entire file (limit to first 10 suggestions)
    for (const lineContent of lines) {
      const classes = extractClassesFromLine(lineContent);
      for (const cls of classes) {
        const suggestion = generateSuggestionsForClass(cls, category, availableTokens);
        if (suggestion && suggestions.length < 10) {
          // Avoid duplicates
          if (!suggestions.some((s) => s.current === suggestion.current)) {
            suggestions.push(suggestion);
          }
        }
      }
    }
  }

  return {
    kind: "suggest",
    file,
    line,
    suggestions,
    guidance: buildGuidance(category),
    availableTokens,
  };
}

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Register the north_suggest tool with the MCP server.
 *
 * This is a Tier 2 tool - requires config (.north/config.yaml) to be present.
 */
export function registerSuggestTool(server: McpServer): RegisteredTool {
  return server.registerTool(
    "north_suggest",
    {
      description:
        "Suggest appropriate design tokens for a file or specific class. " +
        "Parameters: file (string) - file path, line (number) - optional line number, " +
        "violation (string) - optional class name to get suggestions for, " +
        "category (string) - filter by colors/spacing/typography/all.",
      inputSchema: SuggestInputSchema,
    },
    async (args: unknown) => {
      const cwd = process.cwd();

      // Validate input
      const parseResult = SuggestInputSchema.safeParse(args);
      if (!parseResult.success) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: "Invalid input parameters",
                  details: parseResult.error.issues,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      const input = parseResult.data;
      const workingDir = input.cwd ?? cwd;

      // Check context state - this tool requires at least config state (Tier 2)
      const ctx = await detectContext(workingDir);
      if (ctx.state === "none") {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: "No North configuration found",
                  guidance: [
                    "Run 'north init' to initialize the project.",
                    "Then run 'north gen' to generate design tokens.",
                  ],
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      try {
        // configPath is guaranteed to exist when state !== 'none'
        const configPath = ctx.configPath as string;
        const payload = await executeSuggestTool(workingDir, configPath, {
          file: input.file,
          line: input.line,
          violation: input.violation,
          category: input.category,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(payload, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: message,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );
}
