/**
 * north_adopt MCP tool - Discover patterns worth tokenizing
 *
 * Analyzes the indexed codebase to find repeated class patterns that could
 * be extracted into reusable design tokens or utilities.
 *
 * This is a Tier 3 tool - requires index (.north/index.db) to be present.
 *
 * @see .scratch/mcp-server/13-cli-adopt-spec.md for CLI specification
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type AdoptReport, adopt } from "../../commands/adopt.ts";
import { detectContext } from "../state.ts";

// ============================================================================
// Input Schema
// ============================================================================

export const AdoptInputSchema = z.object({
  minCount: z
    .number()
    .int()
    .positive()
    .optional()
    .default(3)
    .describe("Minimum occurrences to consider a pattern (default: 3)"),
  minFiles: z
    .number()
    .int()
    .positive()
    .optional()
    .default(2)
    .describe("Minimum files a pattern must appear in (default: 2)"),
  maxClasses: z
    .number()
    .int()
    .positive()
    .optional()
    .default(6)
    .describe("Maximum classes in a pattern to consider (default: 6)"),
  category: z
    .enum(["colors", "spacing", "typography", "all"])
    .optional()
    .default("all")
    .describe("Filter by pattern category (default: all)"),
  sort: z
    .enum(["count", "files", "impact"])
    .optional()
    .default("impact")
    .describe("Sort results by count, files, or impact score (default: impact)"),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .default(10)
    .describe("Maximum number of candidates to return (default: 10)"),
  cwd: z.string().optional().describe("Working directory (defaults to process.cwd())"),
});

export type AdoptInput = z.infer<typeof AdoptInputSchema>;

// ============================================================================
// Response Types
// ============================================================================

/**
 * A candidate pattern for adoption as a design token or utility.
 */
export interface AdoptCandidateResult {
  /** Unique hash identifying the pattern */
  hash: string;
  /** Classes that make up the pattern */
  classes: string[];
  /** Number of times the pattern appears */
  count: number;
  /** Number of unique files containing the pattern */
  fileCount: number;
  /** Components that use this pattern */
  components: string[];
  /** Suggested token/utility name */
  suggestedName: string;
  /** Pattern category (color, spacing, typography, mixed) */
  category: "color" | "spacing" | "typography" | "mixed";
  /** Impact score (higher = more valuable to extract) */
  impactScore: number;
  /** Whether this pattern is suitable for tokenization */
  tokenizable: boolean;
  /** Sample locations where the pattern is used */
  locations: Array<{
    file: string;
    line: number;
    component: string | null;
  }>;
}

/**
 * Response payload from north_adopt tool.
 */
export interface AdoptResponse {
  /** Response kind identifier */
  kind: "adopt";
  /** Adoption candidates sorted by relevance */
  candidates: AdoptCandidateResult[];
  /** Summary statistics */
  summary: {
    /** Total patterns in the index */
    totalPatterns: number;
    /** Patterns meeting filter criteria */
    eligiblePatterns: number;
    /** Breakdown by category */
    byCategory: {
      color: number;
      spacing: number;
      typography: number;
      mixed: number;
    };
    /** Estimated lines of code that could be reduced */
    estimatedReduction: number;
  };
  /** Applied filters */
  filters: {
    minCount: number;
    minFiles: number;
    maxClasses: number;
    category: string;
  };
  /** Guidance for next steps */
  guidance: string[];
}

// ============================================================================
// Core Logic
// ============================================================================

export interface AdoptOptions {
  minCount?: number;
  minFiles?: number;
  maxClasses?: number;
  category?: "colors" | "spacing" | "typography" | "all";
  sort?: "count" | "files" | "impact";
  limit?: number;
}

/**
 * Execute the north_adopt tool handler.
 *
 * Discovers patterns worth tokenizing from the indexed codebase.
 */
export async function executeAdoptTool(
  workingDir: string,
  configPath: string,
  options: AdoptOptions = {}
): Promise<AdoptResponse> {
  // Execute adopt command
  const report: AdoptReport = await adopt({
    cwd: workingDir,
    config: configPath,
    minCount: options.minCount,
    minFiles: options.minFiles,
    maxClasses: options.maxClasses,
    category: options.category,
    sort: options.sort,
    limit: options.limit,
    json: false,
    quiet: true, // Suppress console output in MCP context
  });

  // Build guidance
  const guidance: string[] = [];
  if (report.candidates.length === 0) {
    if (report.summary.totalPatterns === 0) {
      guidance.push("No patterns indexed. Run 'north index' to scan the codebase.");
    } else {
      guidance.push("No patterns meet the criteria. Try lowering minCount or minFiles.");
    }
  } else {
    guidance.push(
      `Found ${report.candidates.length} adoption candidates from ${report.summary.eligiblePatterns} eligible patterns.`
    );
    if (report.summary.estimatedReduction > 0) {
      guidance.push(
        `Adopting these patterns could reduce ~${report.summary.estimatedReduction} lines of code.`
      );
    }
    guidance.push("Use 'north propose' to generate a migration plan for these patterns.");
  }

  return {
    kind: "adopt",
    candidates: report.candidates,
    summary: report.summary,
    filters: report.filters,
    guidance,
  };
}

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Register the north_adopt tool with the MCP server.
 *
 * This is a Tier 3 tool - requires index (.north/index.db) to be present.
 */
export function registerAdoptTool(server: McpServer): void {
  server.registerTool(
    "north_adopt",
    {
      description:
        "Discover patterns worth tokenizing in the codebase. Analyzes indexed class usage " +
        "to find repeated patterns that could be extracted into design tokens or utilities. " +
        "Parameters: minCount (number), minFiles (number), maxClasses (number), " +
        "category ('colors'|'spacing'|'typography'|'all'), sort ('count'|'files'|'impact'), limit (number).",
      inputSchema: AdoptInputSchema,
    },
    async (args: unknown) => {
      const cwd = process.cwd();

      // Validate input
      const parseResult = AdoptInputSchema.safeParse(args);
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
        // configPath is guaranteed when state === 'indexed'
        const configPath = ctx.configPath as string;

        const payload = await executeAdoptTool(workingDir, configPath, {
          minCount: input.minCount,
          minFiles: input.minFiles,
          maxClasses: input.maxClasses,
          category: input.category,
          sort: input.sort,
          limit: input.limit,
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
