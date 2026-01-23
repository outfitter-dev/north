/**
 * North Promote MCP Tool
 *
 * Promotes magic values to design tokens.
 * Analyzes usage, suggests token name, and provides implementation guidance.
 *
 * This is a Tier 3 tool - requires index (.north/state/index.db) to be present.
 */

import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type IndexDatabase, openIndexDatabase } from "../../index/db.ts";
import { checkIndexFresh, getIndexStatus } from "../../index/queries.ts";
import { detectContext } from "../state.ts";

// ============================================================================
// Input Schema
// ============================================================================

const TOKEN_TYPES = ["color", "spacing", "radius", "font", "shadow"] as const;

export const PromoteInputSchema = z.object({
  value: z
    .string()
    .min(1)
    .describe("The magic value to promote (e.g., '#3b82f6', '16px', '0.5rem')"),
  type: z.enum(TOKEN_TYPES).optional().describe("Token type hint"),
  suggestedName: z.string().optional().describe("Suggested token name"),
  analyze: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to analyze existing usage in codebase"),
  cwd: z.string().optional().describe("Working directory (defaults to process.cwd())"),
});

export type PromoteInput = z.infer<typeof PromoteInputSchema>;

// ============================================================================
// Response Types
// ============================================================================

export interface ExistingUsage {
  files: string[];
  count: number;
}

export interface SimilarToken {
  name: string;
  value: string;
  similarity: number;
}

export interface Recommendation {
  action: "create" | "use-existing" | "extend";
  tokenName: string;
  rationale: string;
  implementation: string;
}

export interface PromoteResponse {
  kind: "promote";
  value: string;
  type: string;
  suggestedName: string;
  existingUsage: ExistingUsage;
  similarTokens: SimilarToken[];
  recommendation: Recommendation;
}

// ============================================================================
// Type Detection
// ============================================================================

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB_REGEX = /^rgba?\s*\(/i;
const HSL_REGEX = /^hsla?\s*\(/i;
const OKLCH_REGEX = /^oklch\s*\(/i;

const PX_REGEX = /^\d+(\.\d+)?px$/;
const REM_REGEX = /^\d+(\.\d+)?rem$/;
const EM_REGEX = /^\d+(\.\d+)?em$/;

const RADIUS_KEYWORDS = ["rounded", "radius"];
const SHADOW_KEYWORDS = ["shadow", "box-shadow"];
const FONT_KEYWORDS = ["font", "text", "leading", "tracking"];

/**
 * Detect token type from value.
 */
export function detectTokenType(value: string): (typeof TOKEN_TYPES)[number] {
  const normalized = value.toLowerCase().trim();

  // Color detection
  if (HEX_COLOR_REGEX.test(normalized)) return "color";
  if (RGB_REGEX.test(normalized)) return "color";
  if (HSL_REGEX.test(normalized)) return "color";
  if (OKLCH_REGEX.test(normalized)) return "color";

  // Shadow detection (before spacing - shadows often contain px values)
  if (SHADOW_KEYWORDS.some((kw) => normalized.includes(kw))) return "shadow";
  // Detect box-shadow-like patterns: multiple space-separated values with px
  if (/^\d+px\s+\d+px/.test(normalized)) return "shadow";

  // Spacing detection
  if (PX_REGEX.test(normalized)) return "spacing";
  if (REM_REGEX.test(normalized)) return "spacing";
  if (EM_REGEX.test(normalized)) return "spacing";

  // Radius detection (based on context/name hints)
  if (RADIUS_KEYWORDS.some((kw) => normalized.includes(kw))) return "radius";

  // Font detection
  if (FONT_KEYWORDS.some((kw) => normalized.includes(kw))) return "font";

  // Default to spacing for numeric values
  if (/^\d+$/.test(normalized)) return "spacing";

  // Default to color for unknown values
  return "color";
}

// ============================================================================
// Name Generation
// ============================================================================

const COLOR_NAME_MAP: Record<string, string> = {
  "#3b82f6": "blue-500",
  "#2563eb": "blue-600",
  "#1d4ed8": "blue-700",
  "#ef4444": "red-500",
  "#dc2626": "red-600",
  "#22c55e": "green-500",
  "#16a34a": "green-600",
  "#eab308": "yellow-500",
  "#f59e0b": "amber-500",
  "#6366f1": "indigo-500",
  "#8b5cf6": "violet-500",
  "#ec4899": "pink-500",
  "#64748b": "slate-500",
  "#6b7280": "gray-500",
  "#71717a": "zinc-500",
};

/**
 * Generate a suggested token name from value and type.
 */
export function generateSuggestedName(value: string, type: string): string {
  const normalized = value.toLowerCase().trim();

  if (type === "color") {
    // Check known color map
    const mapped = COLOR_NAME_MAP[normalized];
    if (mapped) return `--color-${mapped}`;

    // Parse hex to generate name
    if (HEX_COLOR_REGEX.test(normalized)) {
      return `--color-custom-${normalized.replace("#", "")}`;
    }

    return "--color-custom";
  }

  if (type === "spacing") {
    // Extract numeric value
    const match = normalized.match(/^(\d+(?:\.\d+)?)(px|rem|em)?$/);
    if (match) {
      const num = match[1];
      const unit = match[2] ?? "";

      // Map common pixel values to t-shirt sizes
      if (unit === "px") {
        const px = Number.parseFloat(num ?? "0");
        if (px <= 4) return "--spacing-xs";
        if (px <= 8) return "--spacing-sm";
        if (px <= 16) return "--spacing-md";
        if (px <= 24) return "--spacing-lg";
        if (px <= 32) return "--spacing-xl";
        return "--spacing-2xl";
      }

      // Map rem values
      if (unit === "rem") {
        const rem = Number.parseFloat(num ?? "0");
        if (rem <= 0.25) return "--spacing-xs";
        if (rem <= 0.5) return "--spacing-sm";
        if (rem <= 1) return "--spacing-md";
        if (rem <= 1.5) return "--spacing-lg";
        if (rem <= 2) return "--spacing-xl";
        return "--spacing-2xl";
      }

      return `--spacing-${num}`;
    }

    return "--spacing-custom";
  }

  if (type === "radius") {
    const match = normalized.match(/^(\d+(?:\.\d+)?)(px|rem)?$/);
    if (match) {
      const num = match[1];
      const unit = match[2] ?? "";

      if (unit === "px") {
        const px = Number.parseFloat(num ?? "0");
        if (px <= 2) return "--radius-sm";
        if (px <= 4) return "--radius-md";
        if (px <= 8) return "--radius-lg";
        return "--radius-xl";
      }
    }

    return "--radius-custom";
  }

  if (type === "font") {
    return "--font-custom";
  }

  if (type === "shadow") {
    return "--shadow-custom";
  }

  return `--${type}-custom`;
}

// ============================================================================
// Similarity Calculation
// ============================================================================

/**
 * Calculate similarity between two color values.
 * Returns 0-1 where 1 is identical.
 */
function colorSimilarity(value1: string, value2: string): number {
  // Parse hex colors
  const hex1 = parseHexColor(value1);
  const hex2 = parseHexColor(value2);

  if (!hex1 || !hex2) return 0;

  // Calculate Euclidean distance in RGB space
  const dr = hex1.r - hex2.r;
  const dg = hex1.g - hex2.g;
  const db = hex1.b - hex2.b;

  const distance = Math.sqrt(dr * dr + dg * dg + db * db);
  const maxDistance = Math.sqrt(255 * 255 * 3); // Max possible distance

  return 1 - distance / maxDistance;
}

function parseHexColor(value: string): { r: number; g: number; b: number } | null {
  const normalized = value.toLowerCase().trim();
  const match = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);

  if (!match?.[1]) return null;

  let hex = match[1];
  if (hex.length === 3) {
    const [r, g, b] = hex.split("");
    hex = `${r}${r}${g}${g}${b}${b}`;
  }

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

/**
 * Calculate similarity between two spacing/numeric values.
 */
function spacingSimilarity(value1: string, value2: string): number {
  const num1 = parseNumericValue(value1);
  const num2 = parseNumericValue(value2);

  if (num1 === null || num2 === null) return 0;

  // Within 10% is considered similar
  const maxVal = Math.max(Math.abs(num1), Math.abs(num2), 1);
  const diff = Math.abs(num1 - num2);

  return Math.max(0, 1 - diff / maxVal);
}

function parseNumericValue(value: string): number | null {
  const match = value.match(/^(\d+(?:\.\d+)?)(px|rem|em)?$/);
  if (!match?.[1]) return null;

  let num = Number.parseFloat(match[1]);
  const unit = match[2];

  // Normalize to px for comparison
  if (unit === "rem") num *= 16;
  if (unit === "em") num *= 16;

  return num;
}

/**
 * Calculate similarity between two values based on type.
 */
function calculateSimilarity(value: string, tokenValue: string, type: string): number {
  if (type === "color") {
    return colorSimilarity(value, tokenValue);
  }

  if (type === "spacing" || type === "radius") {
    return spacingSimilarity(value, tokenValue);
  }

  // String equality for other types
  return value.toLowerCase() === tokenValue.toLowerCase() ? 1 : 0;
}

// ============================================================================
// Database Queries
// ============================================================================

interface TokenRow {
  name: string;
  value: string;
}

interface UsageRow {
  file: string;
  class_name: string;
  count: number;
}

function findSimilarTokens(
  db: IndexDatabase,
  value: string,
  type: string,
  limit = 5
): SimilarToken[] {
  // Get tokens that might match the type
  const typePrefix = `--${type}-`;
  const colorPrefix = "--color-";

  let tokens: TokenRow[];
  if (type === "color") {
    tokens = db
      .prepare("SELECT name, value FROM tokens WHERE name LIKE ?")
      .all(`${colorPrefix}%`) as TokenRow[];
  } else {
    tokens = db
      .prepare("SELECT name, value FROM tokens WHERE name LIKE ?")
      .all(`${typePrefix}%`) as TokenRow[];
  }

  // Calculate similarity for each token
  const withSimilarity: SimilarToken[] = tokens
    .map((token) => ({
      name: token.name,
      value: token.value,
      similarity: calculateSimilarity(value, token.value, type),
    }))
    .filter((t) => t.similarity > 0.5)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return withSimilarity;
}

function findExistingUsage(db: IndexDatabase, value: string): ExistingUsage {
  // Search for the value in class names (arbitrary values)
  const arbitraryPattern = `%[${value}]%`;

  const usages = db
    .prepare(
      `SELECT file, class_name, COUNT(*) as count
       FROM usages
       WHERE class_name LIKE ?
       GROUP BY file, class_name`
    )
    .all(arbitraryPattern) as UsageRow[];

  const files = [...new Set(usages.map((u) => u.file))];
  const count = usages.reduce((sum, u) => sum + u.count, 0);

  return { files, count };
}

// ============================================================================
// Recommendation Generation
// ============================================================================

function generateRecommendation(
  value: string,
  type: string,
  suggestedName: string,
  similarTokens: SimilarToken[],
  existingUsage: ExistingUsage
): Recommendation {
  // Check for exact match
  const exactMatch = similarTokens.find((t) => t.similarity >= 0.99);
  if (exactMatch) {
    return {
      action: "use-existing",
      tokenName: exactMatch.name,
      rationale: `An existing token "${exactMatch.name}" has the same value. Use it instead of creating a duplicate.`,
      implementation: `Replace "${value}" with "var(${exactMatch.name})" or use the corresponding utility class.`,
    };
  }

  // Check for very similar token (>95%)
  const veryClose = similarTokens.find((t) => t.similarity >= 0.95);
  if (veryClose) {
    return {
      action: "use-existing",
      tokenName: veryClose.name,
      rationale: `An existing token "${veryClose.name}" (${veryClose.value}) is nearly identical (${Math.round(veryClose.similarity * 100)}% similar). Consider using it for consistency.`,
      implementation: `Replace "${value}" with "var(${veryClose.name})" or use the corresponding utility class.`,
    };
  }

  // Check for similar token that could be extended
  const similar = similarTokens.find((t) => t.similarity >= 0.8);
  if (similar) {
    return {
      action: "extend",
      tokenName: suggestedName,
      rationale: `Found similar token "${similar.name}" (${Math.round(similar.similarity * 100)}% similar). Consider if this is a variant or if you should use the existing token.`,
      implementation: `Add to your token definitions:\n${suggestedName}: ${value};\n\nOr extend the existing token: ${similar.name}-variant: ${value};`,
    };
  }

  // No similar tokens - recommend creating new
  const usageNote =
    existingUsage.count > 0
      ? ` This value appears ${existingUsage.count} time(s) in ${existingUsage.files.length} file(s).`
      : "";

  return {
    action: "create",
    tokenName: suggestedName,
    rationale: `No similar tokens found. Create a new ${type} token.${usageNote}`,
    implementation: `Add to your token definitions (.north/tokens/base.css or semantic.css):\n${suggestedName}: ${value};`,
  };
}

// ============================================================================
// Core Logic
// ============================================================================

export interface PromoteOptions {
  value: string;
  type?: (typeof TOKEN_TYPES)[number];
  suggestedName?: string;
  analyze?: boolean;
}

/**
 * Execute the north_promote tool handler.
 *
 * Analyzes a magic value and provides guidance for promoting it to a design token.
 */
export async function executePromoteTool(
  workingDir: string,
  configPath: string,
  options: PromoteOptions
): Promise<PromoteResponse> {
  const { value, type: typeHint, suggestedName: nameHint, analyze = false } = options;

  // Detect token type if not provided
  const type = typeHint ?? detectTokenType(value);

  // Generate suggested name if not provided
  const suggestedName = nameHint ?? generateSuggestedName(value, type);

  // Get index status
  const status = await getIndexStatus(workingDir, configPath);

  let similarTokens: SimilarToken[] = [];
  let existingUsage: ExistingUsage = { files: [], count: 0 };

  if (status.exists && analyze) {
    const freshness = await checkIndexFresh(workingDir, configPath);
    if (freshness.fresh) {
      const db = await openIndexDatabase(status.indexPath);
      try {
        similarTokens = findSimilarTokens(db, value, type);
        existingUsage = findExistingUsage(db, value);
      } finally {
        db.close();
      }
    }
  }

  // Generate recommendation
  const recommendation = generateRecommendation(
    value,
    type,
    suggestedName,
    similarTokens,
    existingUsage
  );

  return {
    kind: "promote",
    value,
    type,
    suggestedName,
    existingUsage,
    similarTokens,
    recommendation,
  };
}

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Register the north_promote tool with the MCP server.
 *
 * This is a Tier 3 tool - requires index (.north/state/index.db) to be present.
 */
export function registerPromoteTool(server: McpServer): RegisteredTool {
  return server.registerTool(
    "north_promote",
    {
      description:
        "Promote a magic value to a design token. Analyzes usage, suggests token name, " +
        "and provides implementation guidance. " +
        "Parameters: value (string, required), type (color|spacing|radius|font|shadow), " +
        "suggestedName (string), analyze (boolean - search index for usage).",
    },
    async (args: unknown) => {
      const cwd = process.cwd();

      // Validate input
      const parseResult = PromoteInputSchema.safeParse(args);
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

      // Check context state - this tool requires indexed state (Tier 3)
      const ctx = await detectContext(workingDir);
      if (ctx.state !== "indexed") {
        const guidance =
          ctx.state === "none"
            ? [
                "Run 'north init' to initialize the project.",
                "Then run 'north index' to build the token index.",
              ]
            : [
                "Run 'north index' to build the token index.",
                "The promote tool works best with the index for similarity analysis.",
              ];

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: ctx.state === "none" ? "No North configuration found" : "Index not found",
                  guidance,
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
        const payload = await executePromoteTool(workingDir, ctx.configPath as string, {
          value: input.value,
          type: input.type,
          suggestedName: input.suggestedName,
          analyze: input.analyze,
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
