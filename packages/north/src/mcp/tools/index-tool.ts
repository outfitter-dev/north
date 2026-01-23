/**
 * North Index MCP Tool
 *
 * Explicit index build/refresh/status control for the North design system.
 * Provides control over the token index lifecycle.
 *
 * This is a Tier 2 tool - requires config (.north/config.yaml) to be present,
 * but does not require an existing index (since it creates one).
 *
 * @see .scratch/mcp-server/11-remaining-issues-execution-plan.md for specification
 * @issue #85
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildIndex } from "../../index/build.ts";
import { checkIndexFresh, getIndexStatus } from "../../index/queries.ts";
import { detectContext } from "../state.ts";

// ============================================================================
// Input Schema
// ============================================================================

const INDEX_ACTIONS = ["build", "refresh", "status"] as const;

export const IndexInputSchema = z.object({
  action: z
    .enum(INDEX_ACTIONS)
    .describe("Action to perform: build (create new), refresh (rebuild), or status (check state)"),
  cwd: z.string().optional().describe("Working directory (defaults to process.cwd())"),
});

export type IndexInput = z.infer<typeof IndexInputSchema>;

export interface NorthIndexParams {
  action: "build" | "refresh" | "status";
}

// ============================================================================
// Response Types
// ============================================================================

export interface IndexBuildResponse {
  kind: "index";
  action: "build" | "refresh";
  success: true;
  indexPath: string;
  sourceHash: string;
  stats: {
    fileCount: number;
    cssFileCount: number;
    tokenCount: number;
    usageCount: number;
    patternCount: number;
    tokenGraphCount: number;
    componentGraphCount: number;
    classSiteCount: number;
  };
}

export interface IndexStatusResponse {
  kind: "index";
  action: "status";
  exists: boolean;
  indexPath: string;
  fresh?: boolean;
  meta: Record<string, string>;
  counts: {
    tokens: number;
    usages: number;
    patterns: number;
    tokenGraph: number;
  };
}

export type IndexResponse = IndexBuildResponse | IndexStatusResponse;

// ============================================================================
// Core Logic
// ============================================================================

export interface IndexOptions {
  action: (typeof INDEX_ACTIONS)[number];
}

/**
 * Execute the north_index tool handler.
 *
 * - build: Create a new index from scratch
 * - refresh: Rebuild the index (same as build, but semantically indicates update)
 * - status: Check index existence, freshness, and statistics
 */
export async function executeIndexTool(
  workingDir: string,
  configPath: string,
  options: IndexOptions
): Promise<IndexResponse> {
  const { action } = options;

  if (action === "status") {
    const status = await getIndexStatus(workingDir, configPath);
    let fresh: boolean | undefined;

    if (status.exists) {
      const freshness = await checkIndexFresh(workingDir, configPath);
      fresh = freshness.fresh;
    }

    return {
      kind: "index",
      action: "status",
      exists: status.exists,
      indexPath: status.indexPath,
      fresh,
      meta: status.meta,
      counts: status.counts,
    };
  }

  // For both "build" and "refresh", we call buildIndex
  const result = await buildIndex({ cwd: workingDir, configPath });

  return {
    kind: "index",
    action,
    success: true,
    indexPath: result.indexPath,
    sourceHash: result.sourceHash,
    stats: result.stats,
  };
}

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Register the north_index tool with the MCP server.
 *
 * This is a Tier 2 tool - requires config (.north/config.yaml) to be present,
 * but does not require an existing index since it creates one.
 */
export function registerIndexTool(server: McpServer): void {
  server.registerTool(
    "north_index",
    {
      description:
        "Manage the North design token index. " +
        "Actions: 'build' creates a new index, 'refresh' rebuilds the existing index, " +
        "'status' checks index existence and freshness. " +
        "Parameters: action (build|refresh|status, required), cwd (string, optional).",
    },
    async (args: unknown) => {
      const cwd = process.cwd();

      // Validate input
      const parseResult = IndexInputSchema.safeParse(args);
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
                    "This creates .north/config.yaml with default settings.",
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
        const payload = await executeIndexTool(workingDir, ctx.configPath as string, {
          action: input.action,
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
