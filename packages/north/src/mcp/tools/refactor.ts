/**
 * North Refactor MCP Tool
 *
 * Identifies candidates for refactoring to use design tokens.
 * Generates migration plans and suggests token replacements.
 *
 * This is a Tier 3 tool - requires index (.north/state/index.db) to be present.
 */

import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runLint } from "../../lint/engine.ts";
import type { LintIssue, RuleSeverity } from "../../lint/types.ts";
import { detectContext } from "../state.ts";

// ============================================================================
// Input Schema
// ============================================================================

const RefactorScopeSchema = z.enum(["colors", "spacing", "typography", "all"]);

const RefactorInputSchema = z.object({
  files: z
    .array(z.string())
    .optional()
    .describe("Glob patterns to analyze (default: all indexed files)"),
  scope: RefactorScopeSchema.optional()
    .default("all")
    .describe("Scope of refactoring: colors, spacing, typography, or all"),
  dryRun: z
    .boolean()
    .optional()
    .default(true)
    .describe("Preview changes without applying (default: true)"),
  limit: z.number().optional().default(20).describe("Maximum candidates to return (default: 20)"),
  cwd: z.string().optional().describe("Working directory (defaults to process.cwd())"),
});

type RefactorInput = z.infer<typeof RefactorInputSchema>;
type RefactorScope = z.infer<typeof RefactorScopeSchema>;

// ============================================================================
// Response Types
// ============================================================================

export interface RefactorCandidate {
  file: string;
  line: number;
  column: number;
  currentValue: string;
  suggestedToken: string;
  confidence: "high" | "medium" | "low";
  context: string;
}

export interface RefactorSummary {
  totalCandidates: number;
  byType: Record<string, number>;
  estimatedImpact: string;
}

export interface RefactorResponse {
  scope: string;
  totalFiles: number;
  candidates: RefactorCandidate[];
  summary: RefactorSummary;
}

// ============================================================================
// Token Suggestion Mapping
// ============================================================================

const COLOR_SUGGESTIONS: Record<string, string> = {
  "blue-500": "primary",
  "blue-600": "primary",
  "gray-50": "muted",
  "gray-100": "muted",
  "gray-200": "border",
  "gray-300": "border",
  "gray-400": "muted-foreground",
  "gray-500": "muted-foreground",
  "gray-600": "muted-foreground",
  "gray-700": "foreground",
  "gray-800": "foreground",
  "gray-900": "foreground",
  "slate-50": "muted",
  "slate-100": "muted",
  "slate-200": "border",
  "slate-300": "border",
  "slate-400": "muted-foreground",
  "slate-500": "muted-foreground",
  "slate-600": "muted-foreground",
  "slate-700": "foreground",
  "slate-800": "foreground",
  "slate-900": "foreground",
  "red-500": "destructive",
  "red-600": "destructive",
  "green-500": "success",
  "green-600": "success",
  "yellow-500": "warning",
  "amber-500": "warning",
};

function suggestTokenForColor(className: string): string {
  // Extract the color part (e.g., "blue-500" from "bg-blue-500")
  const match = className.match(/(bg|text|border|ring|fill|stroke)-(\w+-\d+)/);
  if (!match) return "semantic-token";

  const [, prefix, colorValue] = match;
  const suggestion = COLOR_SUGGESTIONS[colorValue ?? ""];

  if (suggestion && prefix) {
    // Map prefix to semantic equivalent
    if (prefix === "bg") return `bg-${suggestion}`;
    if (prefix === "text")
      return `text-${suggestion === "primary" ? "primary-foreground" : suggestion}`;
    if (prefix === "border") return `border-${suggestion === "border" ? "border" : suggestion}`;
    return `${prefix}-${suggestion}`;
  }

  return "semantic-color-token";
}

function suggestTokenForSpacing(className: string): string {
  // Extract spacing value
  const match = className.match(
    /(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|space-x|space-y)-(\d+(?:\.\d+)?)/
  );
  if (!match) return "spacing-token";

  const [, prefix, value] = match;
  const numValue = Number.parseFloat(value ?? "0");

  // Map to semantic spacing
  let semanticName: string;
  if (numValue <= 1) semanticName = "xs";
  else if (numValue <= 2) semanticName = "sm";
  else if (numValue <= 4) semanticName = "md";
  else if (numValue <= 6) semanticName = "lg";
  else if (numValue <= 8) semanticName = "xl";
  else semanticName = "2xl";

  return `${prefix}-(--spacing-${semanticName})`;
}

function suggestToken(className: string, ruleKey: string): string {
  if (ruleKey === "no-raw-palette" || ruleKey === "no-arbitrary-colors") {
    return suggestTokenForColor(className);
  }

  if (ruleKey === "numeric-spacing-in-component") {
    return suggestTokenForSpacing(className);
  }

  return "design-token";
}

// ============================================================================
// Scope Filtering
// ============================================================================

const COLOR_RULES = new Set(["no-raw-palette", "no-arbitrary-colors", "no-inline-color"]);
const SPACING_RULES = new Set(["numeric-spacing-in-component", "no-arbitrary-values"]);
const TYPOGRAPHY_RULES = new Set<string>(); // Future expansion

// Rules that represent actual refactoring candidates (token replacement)
const REFACTOR_CANDIDATE_RULES = new Set([...COLOR_RULES, ...SPACING_RULES, ...TYPOGRAPHY_RULES]);

function isRefactorCandidate(issue: LintIssue): boolean {
  // Only include issues that represent actual token refactoring opportunities
  return REFACTOR_CANDIDATE_RULES.has(issue.ruleKey);
}

function isIssueInScope(issue: LintIssue, scope: RefactorScope): boolean {
  // First, filter to only refactor candidates
  if (!isRefactorCandidate(issue)) return false;

  if (scope === "all") return true;

  if (scope === "colors") {
    return COLOR_RULES.has(issue.ruleKey);
  }

  if (scope === "spacing") {
    return SPACING_RULES.has(issue.ruleKey);
  }

  if (scope === "typography") {
    return TYPOGRAPHY_RULES.has(issue.ruleKey);
  }

  return false;
}

// ============================================================================
// Confidence Mapping
// ============================================================================

function mapSeverityToConfidence(severity: RuleSeverity): "high" | "medium" | "low" {
  switch (severity) {
    case "error":
      return "high";
    case "warn":
      return "medium";
    default:
      return "low";
  }
}

// ============================================================================
// Impact Estimation
// ============================================================================

function estimateImpact(candidateCount: number, fileCount: number): string {
  if (candidateCount === 0) {
    return "No refactoring needed - codebase follows design system patterns";
  }

  const density = fileCount > 0 ? candidateCount / fileCount : 0;

  if (candidateCount <= 5) {
    return "Low impact - minor cleanup, quick fixes";
  }

  if (candidateCount <= 20) {
    return "Medium impact - focused refactoring session recommended";
  }

  if (density > 3) {
    return "High impact - systematic refactoring needed, consider incremental approach";
  }

  return "Significant impact - plan phased migration to design tokens";
}

// ============================================================================
// Context Extraction
// ============================================================================

function extractContext(issue: LintIssue): string {
  const parts: string[] = [];

  if (issue.className) {
    parts.push(`className="${issue.className}"`);
  }

  if (issue.context) {
    parts.push(`[${issue.context} context]`);
  }

  return parts.join(" ");
}

// ============================================================================
// Core Logic
// ============================================================================

export interface RefactorOptions {
  files?: string[];
  scope?: RefactorScope;
  dryRun?: boolean;
  limit?: number;
}

/**
 * Execute the north_refactor tool handler.
 *
 * Analyzes the codebase for refactoring candidates and generates
 * a migration plan for converting magic values to design tokens.
 */
export async function executeRefactorTool(
  workingDir: string,
  configPath: string,
  options: RefactorOptions = {}
): Promise<RefactorResponse> {
  const { files, scope = "all", limit = 20 } = options;

  // Run lint to find violations
  const { report } = await runLint({
    cwd: workingDir,
    configPath,
    files,
    collectIssues: true,
  });

  // Filter issues by scope
  const scopedIssues = report.issues.filter((issue) => isIssueInScope(issue, scope));

  // Convert issues to candidates
  const allCandidates: RefactorCandidate[] = scopedIssues.map((issue) => ({
    file: issue.filePath,
    line: issue.line,
    column: issue.column,
    currentValue: issue.className ?? issue.message,
    suggestedToken: suggestToken(issue.className ?? "", issue.ruleKey),
    confidence: mapSeverityToConfidence(issue.severity),
    context: extractContext(issue),
  }));

  // Apply limit
  const candidates = allCandidates.slice(0, limit);

  // Build byType breakdown
  const byType: Record<string, number> = {};
  for (const issue of scopedIssues) {
    const type = issue.ruleKey;
    byType[type] = (byType[type] ?? 0) + 1;
  }

  // Calculate unique files with candidates
  const uniqueFiles = new Set(allCandidates.map((c) => c.file));

  return {
    scope,
    totalFiles: report.stats.totalFiles,
    candidates,
    summary: {
      totalCandidates: allCandidates.length,
      byType,
      estimatedImpact: estimateImpact(allCandidates.length, uniqueFiles.size),
    },
  };
}

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Register the north_refactor tool with the MCP server.
 *
 * This is a Tier 3 tool - requires index (.north/state/index.db) to be present.
 */
export function registerRefactorTool(server: McpServer): RegisteredTool {
  return server.registerTool(
    "north_refactor",
    {
      description:
        "Identify and plan refactoring to use design tokens. Finds magic values " +
        "(raw colors, arbitrary values, inline spacing) and suggests token replacements. " +
        "Parameters: files (string[]) - glob patterns, scope (colors|spacing|typography|all), " +
        "dryRun (boolean, default true), limit (number, default 20).",
    },
    async (args: unknown) => {
      const cwd = process.cwd();

      // Validate input
      const parseResult = RefactorInputSchema.safeParse(args);
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

      const input: RefactorInput = parseResult.data;
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
                "The refactor tool requires the index for full analysis.",
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
        const payload = await executeRefactorTool(workingDir, ctx.configPath as string, {
          files: input.files,
          scope: input.scope,
          dryRun: input.dryRun,
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
