/**
 * north_propose MCP tool - Generate migration plan from lint violations
 *
 * Analyzes lint violations and generates a migration plan with actionable
 * steps to fix design system violations.
 *
 * This is a Tier 2 tool - requires config (.north/config.yaml) to be present.
 *
 * @see .scratch/mcp-server/14-cli-propose-spec.md for CLI specification
 */

import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type ProposeReport, propose } from "../../commands/propose.ts";
import { detectContext } from "../state.ts";

// ============================================================================
// Input Schema
// ============================================================================

export const ProposeInputSchema = z.object({
  from: z
    .string()
    .optional()
    .default("check")
    .describe("Source of violations: 'check' (fresh lint), file path, or 'stdin' (default: check)"),
  output: z
    .string()
    .optional()
    .default(".north/state/migration-plan.json")
    .describe("Output path for the migration plan (default: .north/state/migration-plan.json)"),
  strategy: z
    .enum(["conservative", "balanced", "aggressive"])
    .optional()
    .default("balanced")
    .describe(
      "Migration strategy: conservative (high confidence only), balanced (default), aggressive (more changes)"
    ),
  include: z.array(z.string()).optional().describe("Only include violations from these rule IDs"),
  exclude: z.array(z.string()).optional().describe("Exclude violations from these rule IDs"),
  maxChanges: z.number().int().positive().optional().describe("Maximum changes per file"),
  dryRun: z
    .boolean()
    .optional()
    .default(false)
    .describe("Preview plan without writing to file (default: false)"),
  cwd: z.string().optional().describe("Working directory (defaults to process.cwd())"),
});

export type ProposeInput = z.infer<typeof ProposeInputSchema>;

// ============================================================================
// Response Types
// ============================================================================

/**
 * A migration action to be performed.
 */
export type MigrationActionResult =
  | { type: "replace"; from: string; to: string }
  | { type: "extract"; pattern: string; utilityName: string }
  | { type: "tokenize"; value: string; tokenName: string }
  | { type: "remove"; className: string };

/**
 * A single migration step in the plan.
 */
export interface MigrationStepResult {
  /** Step identifier */
  id: string;
  /** File to modify */
  file: string;
  /** Line number */
  line: number;
  /** Column number */
  column: number;
  /** Rule that triggered this step */
  ruleId: string;
  /** Severity of the violation */
  severity: "error" | "warn" | "info";
  /** Action to perform */
  action: MigrationActionResult;
  /** Confidence score (0-1) */
  confidence: number;
  /** Before/after preview */
  preview: {
    before: string;
    after: string;
  };
  /** Dependencies on other steps */
  dependencies?: string[];
}

/**
 * Response payload from north_propose tool.
 */
export interface ProposeResponse {
  /** Response kind identifier */
  kind: "propose";
  /** Path where plan was written (or would be written in dry-run) */
  planPath: string;
  /** Whether the plan was actually written */
  written: boolean;
  /** Whether this was a dry run */
  dryRun: boolean;
  /** Migration strategy used */
  strategy: "conservative" | "balanced" | "aggressive";
  /** Migration steps in the plan */
  steps: MigrationStepResult[];
  /** Summary statistics */
  summary: {
    /** Total violations found */
    totalViolations: number;
    /** Violations that can be addressed */
    addressableViolations: number;
    /** Number of files affected */
    filesAffected: number;
    /** Breakdown by rule */
    byRule: Record<string, number>;
    /** Breakdown by severity */
    bySeverity: {
      error: number;
      warn: number;
      info: number;
    };
  };
  /** Guidance for next steps */
  guidance: string[];
}

// ============================================================================
// Core Logic
// ============================================================================

export interface ProposeOptions {
  from?: string;
  output?: string;
  strategy?: "conservative" | "balanced" | "aggressive";
  include?: string[];
  exclude?: string[];
  maxChanges?: number;
  dryRun?: boolean;
}

/**
 * Execute the north_propose tool handler.
 *
 * Generates a migration plan from lint violations.
 */
export async function executeProposeTool(
  workingDir: string,
  configPath: string,
  options: ProposeOptions = {}
): Promise<ProposeResponse> {
  const { dryRun = false } = options;

  // Execute propose command
  const report: ProposeReport = await propose({
    cwd: workingDir,
    config: configPath,
    from: options.from,
    output: options.output,
    strategy: options.strategy,
    include: options.include,
    exclude: options.exclude,
    maxChanges: options.maxChanges,
    dryRun,
    json: false,
    quiet: true, // Suppress console output in MCP context
  });

  // Build guidance
  const guidance: string[] = [];
  if (report.plan.steps.length === 0) {
    if (report.plan.summary.totalViolations === 0) {
      guidance.push("No violations found. Codebase is compliant!");
    } else {
      guidance.push("No violations match the strategy/filters. Try adjusting strategy or filters.");
    }
  } else {
    guidance.push(
      `Generated migration plan with ${report.plan.steps.length} steps for ${report.plan.summary.filesAffected} files.`
    );
    if (dryRun) {
      guidance.push("This was a dry run - plan was not written to disk.");
      guidance.push("Set dryRun=false to write the plan.");
    } else {
      guidance.push(`Plan written to: ${report.planPath}`);
      guidance.push("Preview changes: Run 'north migrate --dry-run' to see what will change.");
      guidance.push("Apply changes: Run 'north migrate --apply' to execute the plan.");
    }
  }

  return {
    kind: "propose",
    planPath: report.planPath,
    written: !dryRun,
    dryRun,
    strategy: report.plan.strategy,
    steps: report.plan.steps,
    summary: report.plan.summary,
    guidance,
  };
}

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Register the north_propose tool with the MCP server.
 *
 * This is a Tier 2 tool - requires config (.north/config.yaml) to be present.
 */
export function registerProposeTool(server: McpServer): RegisteredTool {
  return server.registerTool(
    "north_propose",
    {
      description:
        "Generate a migration plan from lint violations. Analyzes design system violations " +
        "and creates actionable steps to fix them. " +
        "Parameters: from (string), output (string), strategy ('conservative'|'balanced'|'aggressive'), " +
        "include (string[]), exclude (string[]), maxChanges (number), dryRun (boolean).",
      inputSchema: ProposeInputSchema,
    },
    async (args: unknown) => {
      const cwd = process.cwd();

      // Validate input
      const parseResult = ProposeInputSchema.safeParse(args);
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
        // configPath is guaranteed when state !== 'none'
        const configPath = ctx.configPath as string;

        const payload = await executeProposeTool(workingDir, configPath, {
          from: input.from,
          output: input.output,
          strategy: input.strategy,
          include: input.include,
          exclude: input.exclude,
          maxChanges: input.maxChanges,
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
