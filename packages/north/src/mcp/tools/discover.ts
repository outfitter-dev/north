/**
 * North Discover MCP Tool
 *
 * Exposes token usage pattern discovery to LLMs via MCP.
 * Wraps the `north find` CLI functionality for programmatic access.
 *
 * This is a Tier 3 tool - requires index (.north/index.db) to be present.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type IndexDatabase, openIndexDatabase } from "../../index/db.ts";
import { checkIndexFresh, getIndexStatus } from "../../index/queries.ts";
import {
  extractVarColorToken,
  isColorLiteralValue,
  parseColorUtility as parseColorUtilityBase,
  parseSpacingUtility as parseSpacingUtilityBase,
  resolveClassToToken,
} from "../../lib/utility-classification.ts";
import { detectContext } from "../state.ts";

// ============================================================================
// Input Schema
// ============================================================================

const DISCOVER_MODES = [
  "colors",
  "spacing",
  "typography",
  "patterns",
  "tokens",
  "cascade",
  "similar",
] as const;

export const DiscoverInputSchema = z.object({
  mode: z.enum(DISCOVER_MODES).describe("Discovery mode to execute"),
  selector: z
    .string()
    .optional()
    .describe("Selector for cascade/similar modes (class name, token, or file path)"),
  threshold: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Similarity threshold for similar mode (0-1, default 0.8)"),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .default(10)
    .describe("Maximum number of results to return (default 10)"),
  format: z
    .enum(["compact", "detailed"])
    .optional()
    .default("compact")
    .describe("Output format (default compact)"),
  cwd: z.string().optional().describe("Working directory (defaults to process.cwd())"),
});

export type DiscoverInput = z.infer<typeof DiscoverInputSchema>;

// ============================================================================
// Response Types
// ============================================================================

export interface DiscoverPayload {
  success: boolean;
  mode: string;
  results?: unknown;
  summary: string;
  error?: string;
}

// ============================================================================
// Helper Types
// ============================================================================

interface ClassStat {
  className: string;
  resolvedToken: string | null;
  count: number;
}

interface ColorUsageResult {
  resolved: Array<{ token: string; count: number }>;
  unresolved: Array<{ className: string; count: number }>;
}

interface SpacingUsageResult {
  values: Array<{ value: string; count: number }>;
  utilities: Array<{ utility: string; count: number }>;
  categories: {
    tokenized: number;
    arbitrary: number;
    scale: number;
  };
}

interface TokenUsageResult {
  totalTokens: number;
  usedTokens: number;
  unusedTokens: string[];
  usage: Array<{ token: string; count: number }>;
}

interface PatternResult {
  hash: string;
  classes: string[];
  count: number;
  locations: Array<{ file: string; line: number; component: string | null }>;
}

interface CascadeResult {
  selector: string;
  className?: string;
  resolvedToken?: string;
  tokenDefinition?: { name: string; value: string; file: string; line: number };
  tokenChain: Array<{ ancestor: string; depth: number; path: string[] }>;
  usages: Array<{ file: string; line: number; column: number; className: string | null }>;
}

interface SimilarityResult {
  target: string;
  results: Array<{
    file: string;
    classSimilarity: number;
    tokenSimilarity: number;
    sharedClasses: string[];
    sharedTokens: string[];
  }>;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_LIMIT = 10;
const DEFAULT_SIMILARITY_THRESHOLD = 0.8;

// ============================================================================
// Helper Functions
// ============================================================================

// Adapters to maintain existing API that uses { utility, value } instead of { prefix, value }
function parseSpacingUtility(className: string): { utility: string; value: string } | null {
  const result = parseSpacingUtilityBase(className);
  if (!result) return null;
  return { utility: result.prefix, value: result.value };
}

function parseColorUtility(className: string): { utility: string; value: string } | null {
  const result = parseColorUtilityBase(className);
  if (!result) return null;
  return { utility: result.prefix, value: result.value };
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const item of left) {
    if (right.has(item)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

// ============================================================================
// Database Query Functions
// ============================================================================

function getClassStats(db: IndexDatabase): ClassStat[] {
  const rows = db
    .prepare(
      "SELECT class_name as className, resolved_token as resolvedToken, COUNT(*) as count FROM usages GROUP BY class_name, resolved_token"
    )
    .all() as Array<{ className: string; resolvedToken: string | null; count: number }>;
  return rows;
}

function getColorTokenSet(db: IndexDatabase): Set<string> {
  const rows = db.prepare("SELECT name FROM tokens WHERE name LIKE '--color-%'").all() as Array<{
    name: string;
  }>;
  return new Set(rows.map((row) => row.name));
}

function buildColorUsage(classStats: ClassStat[], colorTokens: Set<string>): ColorUsageResult {
  const resolved = new Map<string, number>();
  const unresolved = new Map<string, number>();

  for (const stat of classStats) {
    const token = stat.resolvedToken;
    if (token?.startsWith("--color-")) {
      resolved.set(token, (resolved.get(token) ?? 0) + stat.count);
      continue;
    }

    const colorUtility = parseColorUtility(stat.className);
    if (!colorUtility) continue;

    const varToken = extractVarColorToken(colorUtility.value);
    if (varToken && colorTokens.has(varToken)) {
      resolved.set(varToken, (resolved.get(varToken) ?? 0) + stat.count);
      continue;
    }

    const tokenName = `--color-${colorUtility.value}`;
    if (colorTokens.has(tokenName)) continue;

    if (!isColorLiteralValue(colorUtility.value)) continue;

    const utility = `${colorUtility.utility}-${colorUtility.value}`;
    unresolved.set(utility, (unresolved.get(utility) ?? 0) + stat.count);
  }

  return {
    resolved: Array.from(resolved.entries())
      .map(([token, count]) => ({ token, count }))
      .sort((a, b) => b.count - a.count || a.token.localeCompare(b.token)),
    unresolved: Array.from(unresolved.entries())
      .map(([className, count]) => ({ className, count }))
      .sort((a, b) => b.count - a.count || a.className.localeCompare(b.className)),
  };
}

function buildSpacingUsage(classStats: ClassStat[]): SpacingUsageResult {
  const values = new Map<string, number>();
  const utilities = new Map<string, number>();
  const categories = { tokenized: 0, arbitrary: 0, scale: 0 };

  for (const stat of classStats) {
    const spacing = parseSpacingUtility(stat.className);
    if (!spacing) continue;

    values.set(spacing.value, (values.get(spacing.value) ?? 0) + stat.count);
    utilities.set(spacing.utility, (utilities.get(spacing.utility) ?? 0) + stat.count);

    if (spacing.value.includes("--")) categories.tokenized += stat.count;
    else if (spacing.value.includes("[")) categories.arbitrary += stat.count;
    else categories.scale += stat.count;
  }

  return {
    values: Array.from(values.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
    utilities: Array.from(utilities.entries())
      .map(([utility, count]) => ({ utility, count }))
      .sort((a, b) => b.count - a.count || a.utility.localeCompare(b.utility)),
    categories,
  };
}

function buildTokenUsage(db: IndexDatabase): TokenUsageResult {
  const tokens = db.prepare("SELECT name FROM tokens ORDER BY name").all() as Array<{
    name: string;
  }>;
  const usageRows = db
    .prepare(
      "SELECT resolved_token as token, COUNT(*) as count FROM usages WHERE resolved_token IS NOT NULL GROUP BY resolved_token ORDER BY count DESC"
    )
    .all() as Array<{ token: string; count: number }>;

  const used = new Set(usageRows.map((row) => row.token));
  const unusedTokens = tokens.map((row) => row.name).filter((name) => !used.has(name));

  return {
    totalTokens: tokens.length,
    usedTokens: used.size,
    unusedTokens,
    usage: usageRows,
  };
}

function buildPatterns(db: IndexDatabase, limit: number): PatternResult[] {
  const rows = db
    .prepare(
      "SELECT hash, classes, count, locations FROM patterns ORDER BY count DESC, hash ASC LIMIT ?"
    )
    .all(limit) as Array<{
    hash: string;
    classes: string;
    count: number;
    locations: string;
  }>;

  return rows.map((row) => {
    let classes: string[] = [];
    let locations: Array<{ file: string; line: number; component: string | null }> = [];
    try {
      classes = JSON.parse(row.classes) as string[];
    } catch {
      classes = [];
    }
    try {
      locations = JSON.parse(row.locations) as Array<{
        file: string;
        line: number;
        component: string | null;
      }>;
    } catch {
      locations = [];
    }
    return { hash: row.hash, classes, count: row.count, locations };
  });
}

function buildCascade(db: IndexDatabase, selector: string, limit: number): CascadeResult {
  const trimmed = selector.trim();
  const isTokenSelector = trimmed.startsWith("--");
  const className = isTokenSelector
    ? undefined
    : trimmed.startsWith(".")
      ? trimmed.slice(1)
      : trimmed;
  let resolvedToken: string | undefined;

  if (isTokenSelector) {
    resolvedToken = trimmed;
  } else if (className) {
    resolvedToken = resolveClassToToken(className) ?? undefined;
  }

  let tokenDefinition: CascadeResult["tokenDefinition"];
  if (resolvedToken) {
    const tokenRow = db
      .prepare("SELECT name, value, file, line FROM tokens WHERE name = ?")
      .get(resolvedToken) as
      | { name: string; value: string; file: string; line: number }
      | undefined;
    if (tokenRow) tokenDefinition = tokenRow;
    else resolvedToken = undefined;
  }

  const chainRows = resolvedToken
    ? (db
        .prepare(
          "SELECT ancestor, depth, path FROM token_graph WHERE descendant = ? ORDER BY depth ASC"
        )
        .all(resolvedToken) as Array<{ ancestor: string; depth: number; path: string }>)
    : [];

  const tokenChain = chainRows.map((row) => {
    let path: string[] = [];
    try {
      path = JSON.parse(row.path) as string[];
    } catch {
      path = [];
    }
    return { ancestor: row.ancestor, depth: row.depth, path };
  });

  const usages: Array<{ file: string; line: number; column: number; className: string | null }> =
    [];
  const classLookup = className;

  if (classLookup) {
    const rows = db
      .prepare(
        "SELECT file, line, column, class_name as className FROM usages WHERE class_name = ? ORDER BY file, line"
      )
      .all(classLookup) as Array<{ file: string; line: number; column: number; className: string }>;
    for (const row of rows.slice(0, limit)) {
      usages.push({ file: row.file, line: row.line, column: row.column, className: row.className });
    }
  }

  if (usages.length === 0 && resolvedToken) {
    const rows = db
      .prepare(
        "SELECT file, line, column, class_name as className FROM usages WHERE resolved_token = ? ORDER BY file, line"
      )
      .all(resolvedToken) as Array<{
      file: string;
      line: number;
      column: number;
      className: string;
    }>;
    for (const row of rows.slice(0, limit)) {
      usages.push({ file: row.file, line: row.line, column: row.column, className: row.className });
    }
  }

  return { selector: trimmed, className, resolvedToken, tokenDefinition, tokenChain, usages };
}

function buildSimilarity(
  db: IndexDatabase,
  target: string,
  threshold: number,
  limit: number
): SimilarityResult {
  const rows = db
    .prepare("SELECT file, class_name as className, resolved_token as resolvedToken FROM usages")
    .all() as Array<{ file: string; className: string; resolvedToken: string | null }>;

  const fileMap = new Map<string, { classes: Set<string>; tokens: Set<string> }>();
  for (const row of rows) {
    const entry = fileMap.get(row.file) ?? {
      classes: new Set<string>(),
      tokens: new Set<string>(),
    };
    entry.classes.add(row.className);
    if (row.resolvedToken) entry.tokens.add(row.resolvedToken);
    fileMap.set(row.file, entry);
  }

  const normalizedTarget = normalizePath(target);
  const targetData = fileMap.get(normalizedTarget);
  if (!targetData) {
    return { target: normalizedTarget, results: [] };
  }

  const results: SimilarityResult["results"] = [];
  for (const [file, data] of fileMap.entries()) {
    if (file === normalizedTarget) continue;
    const classSimilarity = jaccardSimilarity(targetData.classes, data.classes);
    const tokenSimilarity = jaccardSimilarity(targetData.tokens, data.tokens);
    if (classSimilarity < threshold && tokenSimilarity < threshold) continue;

    const sharedClasses: string[] = [];
    for (const item of targetData.classes) {
      if (data.classes.has(item)) sharedClasses.push(item);
      if (sharedClasses.length >= 10) break;
    }

    const sharedTokens: string[] = [];
    for (const item of targetData.tokens) {
      if (data.tokens.has(item)) sharedTokens.push(item);
      if (sharedTokens.length >= 10) break;
    }

    results.push({ file, classSimilarity, tokenSimilarity, sharedClasses, sharedTokens });
  }

  results.sort((a, b) => {
    const scoreA = Math.max(a.classSimilarity, a.tokenSimilarity);
    const scoreB = Math.max(b.classSimilarity, b.tokenSimilarity);
    if (scoreA !== scoreB) return scoreB - scoreA;
    return a.file.localeCompare(b.file);
  });

  return { target: normalizedTarget, results: results.slice(0, limit) };
}

// ============================================================================
// Summary Generators
// ============================================================================

function summarizeColors(result: ColorUsageResult, limit: number): string {
  const resolvedCount = result.resolved.length;
  const unresolvedCount = result.unresolved.length;
  const topResolved = result.resolved
    .slice(0, limit)
    .map((r) => r.token)
    .join(", ");
  const topUnresolved = result.unresolved
    .slice(0, limit)
    .map((r) => r.className)
    .join(", ");

  let summary = `Found ${resolvedCount} resolved color tokens and ${unresolvedCount} unresolved color classes.`;
  if (topResolved) summary += ` Top tokens: ${topResolved}.`;
  if (topUnresolved) summary += ` Unresolved: ${topUnresolved}.`;
  return summary;
}

function summarizeSpacing(result: SpacingUsageResult, limit: number): string {
  const topValues = result.values
    .slice(0, limit)
    .map((v) => v.value)
    .join(", ");
  const { tokenized, arbitrary, scale } = result.categories;
  return `Spacing usage: ${tokenized} tokenized, ${scale} scale, ${arbitrary} arbitrary. Top values: ${topValues || "none"}.`;
}

function summarizeTokens(result: TokenUsageResult): string {
  const unusedCount = result.unusedTokens.length;
  return `${result.usedTokens} of ${result.totalTokens} tokens are used. ${unusedCount} tokens are unused.`;
}

function summarizePatterns(patterns: PatternResult[]): string {
  if (patterns.length === 0) return "No repeated class patterns found.";
  const topPattern = patterns[0];
  return `Found ${patterns.length} repeated patterns. Most common (${topPattern?.count ?? 0}x): ${topPattern?.classes.join(" ") ?? ""}.`;
}

function summarizeCascade(result: CascadeResult): string {
  const token = result.resolvedToken ?? "none";
  const usageCount = result.usages.length;
  const chainLen = result.tokenChain.length;
  return `Selector "${result.selector}" resolves to ${token}. ${usageCount} usages found. Chain depth: ${chainLen}.`;
}

function summarizeSimilar(result: SimilarityResult): string {
  if (result.results.length === 0) return `No files similar to "${result.target}" found.`;
  const top = result.results[0];
  return `Found ${result.results.length} similar files. Most similar: ${top?.file ?? ""} (${((top?.classSimilarity ?? 0) * 100).toFixed(0)}% class, ${((top?.tokenSimilarity ?? 0) * 100).toFixed(0)}% token).`;
}

// ============================================================================
// Core Logic
// ============================================================================

/**
 * Execute the north_discover tool handler.
 *
 * Queries the index database to discover token usage patterns
 * based on the specified mode.
 */
export async function executeDiscoverTool(
  workingDir: string,
  configPath: string,
  input: { mode: string; selector?: string; threshold?: number; limit: number; format: string }
): Promise<DiscoverPayload> {
  // Check index exists and is fresh
  const status = await getIndexStatus(workingDir, configPath);
  if (!status.exists) {
    return {
      success: false,
      mode: input.mode,
      summary: "Index not found",
      error: "Index not found. Run 'north index' to build it.",
    };
  }

  const freshness = await checkIndexFresh(workingDir, configPath);
  if (!freshness.fresh) {
    return {
      success: false,
      mode: input.mode,
      summary: "Index is stale",
      error: "Index is stale. Run 'north index' to refresh it.",
    };
  }

  // Validate mode-specific requirements
  if ((input.mode === "cascade" || input.mode === "similar") && !input.selector) {
    return {
      success: false,
      mode: input.mode,
      summary: `${input.mode} mode requires a selector`,
      error: `The ${input.mode} mode requires a selector parameter.`,
    };
  }

  let db: IndexDatabase | null = null;

  try {
    db = await openIndexDatabase(status.indexPath);
    const limit = input.limit ?? DEFAULT_LIMIT;
    const threshold = input.threshold ?? DEFAULT_SIMILARITY_THRESHOLD;

    switch (input.mode) {
      case "colors": {
        const classStats = getClassStats(db);
        const colorTokens = getColorTokenSet(db);
        const result = buildColorUsage(classStats, colorTokens);
        return {
          success: true,
          mode: "colors",
          results: result,
          summary: summarizeColors(result, limit),
        };
      }

      case "spacing": {
        const classStats = getClassStats(db);
        const result = buildSpacingUsage(classStats);
        return {
          success: true,
          mode: "spacing",
          results: result,
          summary: summarizeSpacing(result, limit),
        };
      }

      case "typography": {
        // Typography mode returns token usage filtered to typography-related tokens
        const tokens = db
          .prepare(
            "SELECT name, value, file, line FROM tokens WHERE name LIKE '--font-%' OR name LIKE '--text-%' OR name LIKE '--tracking-%' OR name LIKE '--leading-%'"
          )
          .all() as Array<{ name: string; value: string; file: string; line: number }>;

        const usageRows = db
          .prepare(
            "SELECT resolved_token as token, COUNT(*) as count FROM usages WHERE resolved_token LIKE '--font-%' OR resolved_token LIKE '--text-%' OR resolved_token LIKE '--tracking-%' OR resolved_token LIKE '--leading-%' GROUP BY resolved_token ORDER BY count DESC"
          )
          .all() as Array<{ token: string; count: number }>;

        const result = {
          totalTokens: tokens.length,
          usage: usageRows.slice(0, limit),
          tokens: tokens.slice(0, limit),
        };

        return {
          success: true,
          mode: "typography",
          results: result,
          summary: `Found ${tokens.length} typography tokens. ${usageRows.length} are in use.`,
        };
      }

      case "patterns": {
        const patterns = buildPatterns(db, limit);
        return {
          success: true,
          mode: "patterns",
          results: { patterns },
          summary: summarizePatterns(patterns),
        };
      }

      case "tokens": {
        const result = buildTokenUsage(db);
        return {
          success: true,
          mode: "tokens",
          results: {
            totalTokens: result.totalTokens,
            usedTokens: result.usedTokens,
            unusedTokens: result.unusedTokens.slice(0, limit),
            usage: result.usage.slice(0, limit),
          },
          summary: summarizeTokens(result),
        };
      }

      case "cascade": {
        const result = buildCascade(db, input.selector ?? "", limit);
        return {
          success: true,
          mode: "cascade",
          results: result,
          summary: summarizeCascade(result),
        };
      }

      case "similar": {
        const result = buildSimilarity(db, input.selector ?? "", threshold, limit);
        return {
          success: true,
          mode: "similar",
          results: result,
          summary: summarizeSimilar(result),
        };
      }

      default:
        return {
          success: false,
          mode: input.mode,
          summary: "Unknown mode",
          error: `Unknown discovery mode: ${input.mode}`,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      mode: input.mode,
      summary: "Discovery failed",
      error: message,
    };
  } finally {
    if (db) {
      db.close();
    }
  }
}

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Register the north_discover tool with the MCP server.
 *
 * This is a Tier 3 tool - requires index (.north/index.db) to be present.
 */
export function registerDiscoverTool(server: McpServer): void {
  server.registerTool(
    "north_discover",
    {
      description:
        "Discover token usage patterns in the codebase. Find where tokens are used, " +
        "explore cascade chains, and understand token dependencies. " +
        "Modes: colors, spacing, typography, patterns, tokens, cascade, similar. " +
        "Cascade and similar modes require a selector parameter.",
    },
    async (args: unknown) => {
      const cwd = process.cwd();

      // Validate input
      const parseResult = DiscoverInputSchema.safeParse(args);
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

      // Check context state - this tool requires indexed state
      const ctx = await detectContext(workingDir);
      if (ctx.state !== "indexed") {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: ctx.state === "none" ? "No North configuration found" : "Index not built",
                  guidance:
                    ctx.state === "none"
                      ? [
                          "Run 'north init' to initialize the project.",
                          "Then run 'north index' to build the index.",
                        ]
                      : ["Run 'north index' to build the token index."],
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
        const configPath = ctx.configPath as string;
        const payload = await executeDiscoverTool(workingDir, configPath, {
          mode: input.mode,
          selector: input.selector,
          threshold: input.threshold,
          limit: input.limit,
          format: input.format,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(payload, null, 2),
            },
          ],
          isError: !payload.success,
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
