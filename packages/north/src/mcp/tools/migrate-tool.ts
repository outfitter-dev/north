/**
 * north_migrate MCP tool - Execute a migration plan in batch
 *
 * Applies migration steps from a plan file, transforming code to use
 * design tokens and utilities.
 *
 * This is a Tier 2 tool - requires config (.north/config.yaml) to be present.
 *
 * @see .scratch/mcp-server/15-cli-migrate-spec.md for CLI specification
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type MigrateReport, migrate } from "../../commands/migrate.ts";
import { resolveSafeMode } from "../../core/safe-mode.ts";
import { detectContext } from "../state.ts";

// ============================================================================
// Input Schema
// ============================================================================

export const MigrateInputSchema = z.object({
  plan: z
    .string()
    .optional()
    .default(".north/state/migration-plan.json")
    .describe("Path to migration plan file (default: .north/state/migration-plan.json)"),
  steps: z.array(z.string()).optional().describe("Only execute these specific step IDs"),
  skip: z.array(z.string()).optional().describe("Skip these specific step IDs"),
  file: z.string().optional().describe("Only process steps affecting this file"),
  backup: z
    .boolean()
    .optional()
    .default(true)
    .describe("Create .bak backups before modifying files (default: true)"),
  apply: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Actually apply changes (default: false). " +
        "IMPORTANT: Set to true to modify files. Without this, only a preview is returned."
    ),
  continue: z
    .boolean()
    .optional()
    .default(false)
    .describe("Continue from checkpoint if available (default: false)"),
  cwd: z.string().optional().describe("Working directory (defaults to process.cwd())"),
});

export type MigrateInput = z.infer<typeof MigrateInputSchema>;

// ============================================================================
// Response Types
// ============================================================================

/**
 * Result of a single migration step execution.
 */
export interface StepResultOutput {
  /** Step identifier */
  stepId: string;
  /** Execution status */
  status: "applied" | "skipped" | "failed" | "pending";
  /** File that was modified */
  file: string;
  /** Description of the action performed */
  action: string;
  /** Error message if failed */
  error?: string;
  /** Lines changed (if applied) */
  diff?: {
    removed: number;
    added: number;
  };
}

/**
 * Response payload from north_migrate tool.
 */
export interface MigrateResponse {
  /** Response kind identifier */
  kind: "migrate";
  /** Whether changes were actually applied */
  applied: boolean;
  /** Whether this was a dry run */
  dryRun: boolean;
  /** Path to the migration plan */
  planPath: string;
  /** Results for each step */
  results: StepResultOutput[];
  /** Summary statistics */
  summary: {
    /** Total steps processed */
    total: number;
    /** Steps successfully applied */
    applied: number;
    /** Steps skipped */
    skipped: number;
    /** Steps that failed */
    failed: number;
    /** Number of files modified */
    filesChanged: number;
    /** Total lines removed */
    linesRemoved: number;
    /** Total lines added */
    linesAdded: number;
  };
  /** Checkpoint info if available */
  checkpoint?: {
    completedSteps: string[];
    failedSteps: string[];
    skippedSteps: string[];
  };
  /** Guidance for next steps */
  guidance: string[];
}

// ============================================================================
// Core Logic
// ============================================================================

export interface MigrateOptions {
  plan?: string;
  steps?: string[];
  skip?: string[];
  file?: string;
  backup?: boolean;
  /** Set to true to apply changes. Default: false (preview only) */
  apply?: boolean;
  continue?: boolean;
}

/**
 * Execute the north_migrate tool handler.
 *
 * Executes a migration plan to apply design system fixes.
 */
export async function executeMigrateTool(
  workingDir: string,
  configPath: string,
  options: MigrateOptions = {}
): Promise<MigrateResponse> {
  // Use SafeMode abstraction - in MCP, only `apply` flag matters
  const { shouldApply } = resolveSafeMode({ apply: options.apply }, "mcp");

  // Execute migrate command (non-interactive for MCP)
  const report: MigrateReport = await migrate({
    cwd: workingDir,
    config: configPath,
    plan: options.plan,
    steps: options.steps,
    skip: options.skip,
    file: options.file,
    interactive: false, // Never interactive in MCP context
    backup: options.backup,
    dryRun: !shouldApply, // SafeMode determines dryRun
    apply: shouldApply,
    continue: options.continue,
    json: false,
    quiet: true, // Suppress console output in MCP context
  });

  // Build guidance
  const guidance: string[] = [];
  if (report.results.length === 0) {
    guidance.push("No steps to execute.");
    if (report.checkpoint) {
      guidance.push("All steps completed or skipped from previous run.");
    } else {
      guidance.push("Check filters or run 'north propose' to generate a new plan.");
    }
  } else if (!report.applied) {
    guidance.push("This was a dry run - no changes were applied.");
    guidance.push(`Preview shows ${report.summary.total} steps would be executed.`);
    guidance.push("Set apply=true to execute the migration.");
  } else {
    const failedCount = report.summary.failed;
    const appliedCount = report.summary.applied;

    if (failedCount > 0) {
      guidance.push(`Migration completed with ${failedCount} failed step(s).`);
      guidance.push("Fix failed steps manually or adjust the plan.");
      guidance.push("Run with continue=true to retry failed steps.");
    } else {
      guidance.push(`Migration completed successfully! Applied ${appliedCount} step(s).`);
    }

    if (report.summary.filesChanged > 0) {
      guidance.push(`Modified ${report.summary.filesChanged} file(s).`);
      guidance.push("Run 'north check' to verify remaining violations.");
    }
  }

  return {
    kind: "migrate",
    applied: report.applied,
    dryRun: !report.applied,
    planPath: report.planPath,
    results: report.results,
    summary: report.summary,
    checkpoint: report.checkpoint
      ? {
          completedSteps: report.checkpoint.completedSteps,
          failedSteps: report.checkpoint.failedSteps,
          skippedSteps: report.checkpoint.skippedSteps,
        }
      : undefined,
    guidance,
  };
}

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Register the north_migrate tool with the MCP server.
 *
 * This is a Tier 2 tool - requires config (.north/config.yaml) to be present.
 */
export function registerMigrateTool(server: McpServer): void {
  server.registerTool(
    "north_migrate",
    {
      description:
        "Execute a migration plan to apply design system fixes. Transforms code based on " +
        "steps generated by 'north propose'. " +
        "Parameters: plan (string), steps (string[]), skip (string[]), file (string), " +
        "backup (boolean), apply (boolean), continue (boolean). " +
        "IMPORTANT: By default, only a preview is returned. Set apply=true to actually modify files.",
      inputSchema: MigrateInputSchema,
    },
    async (args: unknown) => {
      const cwd = process.cwd();

      // Validate input
      const parseResult = MigrateInputSchema.safeParse(args);
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
                    "Then run 'north propose' to generate a migration plan.",
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
        // configPath is guaranteed when state !== 'none'
        const configPath = ctx.configPath as string;

        const payload = await executeMigrateTool(workingDir, configPath, {
          plan: input.plan,
          steps: input.steps,
          skip: input.skip,
          file: input.file,
          backup: input.backup,
          apply: input.apply,
          continue: input.continue,
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
