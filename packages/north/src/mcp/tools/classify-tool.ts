/**
 * north_classify MCP tool - Set component context classifications
 *
 * Classifies component files by context (primitive, composed, layout) to enable
 * context-aware linting rules. Files can be classified explicitly, automatically
 * based on path patterns, or via heuristics.
 *
 * This is a Tier 3 tool - requires index (.north/state/index.db) to be present.
 *
 * @see .scratch/mcp-server/12-cli-classify-spec.md for CLI specification
 * @issue #87 (partial)
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type ClassifyReport, classify } from "../../commands/classify.ts";
import { type IndexDatabase, openIndexDatabase } from "../../index/db.ts";
import type { LintContext } from "../../lint/types.ts";
import { detectContext } from "../state.ts";

// ============================================================================
// Input Schema
// ============================================================================

export const ClassifyInputSchema = z.object({
  files: z
    .array(z.string())
    .optional()
    .describe("Glob patterns or file paths to classify (default: all indexed files)"),
  context: z
    .enum(["primitive", "composed", "layout"])
    .optional()
    .describe("Explicit context to assign to all matched files"),
  auto: z
    .boolean()
    .optional()
    .default(false)
    .describe("Use automatic classification based on path patterns and heuristics"),
  dryRun: z
    .boolean()
    .optional()
    .default(true)
    .describe("Preview changes without applying them (default: true for safety)"),
  cwd: z.string().optional().describe("Working directory (defaults to process.cwd())"),
});

export type ClassifyInput = z.infer<typeof ClassifyInputSchema>;

// ============================================================================
// Response Types
// ============================================================================

/**
 * Classification entry for a single file.
 */
export interface ClassifyFileResult {
  /** File path (relative to cwd) */
  file: string;
  /** Previous context classification (null if unclassified) */
  from: LintContext | null;
  /** New context classification */
  to: LintContext;
  /** How the classification was determined */
  source: "explicit" | "auto" | "path" | "default";
  /** Whether the context changed */
  changed: boolean;
}

/**
 * Response payload from north_classify tool.
 */
export interface ClassifyResponse {
  /** Response kind identifier */
  kind: "classify";
  /** Whether changes were applied to the index */
  applied: boolean;
  /** Whether this was a dry run (preview only) */
  dryRun: boolean;
  /** Classification results per file */
  files: ClassifyFileResult[];
  /** Summary statistics */
  summary: {
    /** Total files processed */
    total: number;
    /** Files classified as primitive */
    primitive: number;
    /** Files classified as composed */
    composed: number;
    /** Files classified as layout */
    layout: number;
    /** Files whose classification changed */
    changed: number;
  };
  /** Guidance for next steps */
  guidance: string[];
}

// ============================================================================
// Core Logic
// ============================================================================

export interface ClassifyOptions {
  files?: string[];
  context?: LintContext;
  auto?: boolean;
  dryRun?: boolean;
}

/**
 * Execute the north_classify tool handler.
 *
 * Classifies files by component context and optionally updates the index.
 */
export async function executeClassifyTool(
  workingDir: string,
  configPath: string,
  indexPath: string,
  options: ClassifyOptions = {}
): Promise<ClassifyResponse> {
  const { files, context, auto = false, dryRun = true } = options;

  // Open the index database
  let db: IndexDatabase | undefined;
  try {
    db = await openIndexDatabase(indexPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to open index database: ${message}`);
  }

  try {
    // Execute classify command
    const report: ClassifyReport = await classify({
      cwd: workingDir,
      config: configPath,
      files,
      context,
      auto,
      dryRun,
      apply: !dryRun, // Apply if not dry run
      _testDb: db,
    });

    // Map to response format with changed flag
    const fileResults: ClassifyFileResult[] = report.files.map((f) => ({
      file: f.file,
      from: f.from,
      to: f.to,
      source: f.source,
      changed: f.from !== f.to,
    }));

    // Build guidance
    const guidance: string[] = [];
    if (dryRun) {
      guidance.push("This was a dry run - no changes were applied.");
      if (report.summary.changed > 0) {
        guidance.push(
          `Set dryRun=false to apply ${report.summary.changed} classification change(s).`
        );
      }
    } else if (report.summary.changed > 0) {
      guidance.push(`Applied ${report.summary.changed} classification change(s) to the index.`);
      guidance.push("Run 'north check' to see how context-aware rules affect your files.");
    } else {
      guidance.push("All files are already correctly classified.");
    }

    return {
      kind: "classify",
      applied: report.applied,
      dryRun,
      files: fileResults,
      summary: report.summary,
      guidance,
    };
  } finally {
    // Ensure database is closed
    db?.close();
  }
}

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Register the north_classify tool with the MCP server.
 *
 * This is a Tier 3 tool - requires index (.north/state/index.db) to be present.
 */
export function registerClassifyTool(server: McpServer): void {
  server.registerTool(
    "north_classify",
    {
      description:
        "Classify component files by context (primitive, composed, layout). " +
        "Context-aware linting rules use these classifications to enforce different " +
        "complexity thresholds. Parameters: files (string[]) - glob patterns, " +
        "context ('primitive'|'composed'|'layout') - explicit context, " +
        "auto (boolean) - use heuristic classification, dryRun (boolean) - preview only.",
      inputSchema: ClassifyInputSchema,
    },
    async (args: unknown) => {
      const cwd = process.cwd();

      // Validate input
      const parseResult = ClassifyInputSchema.safeParse(args);
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
        // Both configPath and indexPath are guaranteed when state === 'indexed'
        const configPath = ctx.configPath as string;
        const indexPath = ctx.indexPath as string;

        const payload = await executeClassifyTool(workingDir, configPath, indexPath, {
          files: input.files,
          context: input.context,
          auto: input.auto,
          dryRun: input.dryRun,
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
