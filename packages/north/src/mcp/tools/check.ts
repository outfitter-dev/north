/**
 * north_check MCP tool - Lint/check functionality for AI agents
 *
 * Runs design system linting on component files, identifying violations
 * of North design rules. Returns structured violation data suitable for
 * AI-driven code refactoring.
 *
 * This is a Tier 2 tool - requires config (.north/config.yaml) to be present.
 *
 * @see .scratch/mcp-server/11-remaining-issues-execution-plan.md for specification
 * @issue #81
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runLint } from "../../lint/engine.ts";
import type { LintIssue, LintStats, LintSummary } from "../../lint/types.ts";
import { detectContext } from "../state.ts";

// ============================================================================
// Input Schema
// ============================================================================

export const CheckInputSchema = z.object({
  files: z
    .array(z.string())
    .optional()
    .describe("Glob patterns or file paths to lint (default: all TSX/JSX files)"),
  staged: z.boolean().optional().default(false).describe("Only lint git staged files (TSX/JSX)"),
  rules: z
    .array(z.string())
    .optional()
    .describe("Filter to specific rule IDs (e.g., ['no-raw-palette', 'no-arbitrary-values'])"),
  fix: z.boolean().optional().default(false).describe("Include fix suggestions in the response"),
  cwd: z.string().optional().describe("Working directory (defaults to process.cwd())"),
});

export type CheckInput = z.infer<typeof CheckInputSchema>;

// ============================================================================
// Response Types
// ============================================================================

/**
 * A single violation with optional fix suggestion.
 */
export interface CheckViolation {
  /** Rule identifier (e.g., "north/no-raw-palette") */
  ruleId: string;
  /** Short rule key for filtering (e.g., "no-raw-palette") */
  ruleKey: string;
  /** Severity level: error, warn, or info */
  severity: "error" | "warn" | "info";
  /** Human-readable violation message */
  message: string;
  /** File path (relative to cwd) */
  file: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** The violating class name, if applicable */
  className?: string;
  /** Component context: primitive, composed, or layout */
  context?: string;
  /** Additional guidance note */
  note?: string;
  /** Fix suggestion (only when fix=true) */
  fix?: FixSuggestion;
}

/**
 * Suggested fix for a violation.
 */
export interface FixSuggestion {
  /** Description of the fix */
  description: string;
  /** Suggested replacement value */
  replacement?: string;
}

/**
 * Response payload from north_check tool.
 */
export interface CheckResponse {
  /** Response kind identifier */
  kind: "check";
  /** Summary counts of violations */
  summary: LintSummary;
  /** Array of violations found */
  violations: CheckViolation[];
  /** Statistics about the lint run */
  stats: LintStats;
  /** Whether the check passed (no errors) */
  passed: boolean;
  /** Rules that were filtered (if rules param provided) */
  filteredRules?: string[];
}

// ============================================================================
// Git Staged Files
// ============================================================================

/**
 * Get list of staged TSX/JSX files from git.
 */
function getStagedFiles(cwd: string): string[] {
  const result = spawnSync("git", ["diff", "--name-only", "--cached", "--diff-filter=ACMR"], {
    cwd,
    encoding: "utf-8",
  });

  if (result.error) {
    throw new Error(`Failed to determine staged files: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`Git diff failed: ${result.stderr}`);
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((file) => resolve(cwd, file))
    .filter((file) => file.endsWith(".tsx") || file.endsWith(".jsx"));
}

// ============================================================================
// Fix Suggestions
// ============================================================================

const FIX_SUGGESTIONS: Record<string, (className?: string) => FixSuggestion> = {
  "no-raw-palette": (className) => ({
    description: "Replace raw Tailwind palette color with semantic token",
    replacement: className
      ? suggestSemanticColorReplacement(className)
      : "Use a semantic color token like bg-primary, text-foreground, etc.",
  }),
  "no-arbitrary-colors": () => ({
    description: "Replace arbitrary color with CSS variable or semantic token",
    replacement: "Use var(--your-token) or a semantic color class",
  }),
  "no-arbitrary-values": () => ({
    description: "Replace arbitrary value with design token",
    replacement: "Use a predefined spacing/sizing token",
  }),
  "no-inline-color": () => ({
    description: "Move inline color to CSS variable or Tailwind class",
    replacement: "Use style={{ color: 'var(--token)' }} or a Tailwind class",
  }),
  "numeric-spacing-in-component": (className) => ({
    description: "Replace numeric spacing with semantic spacing token",
    replacement: className
      ? suggestSemanticSpacingReplacement(className)
      : "Use spacing tokens like gap-md, p-lg, etc.",
  }),
  "component-complexity": () => ({
    description: "Extract repeated class patterns to utility function",
    replacement: "Consider using cn() helper or cva() for variant management",
  }),
  "extract-repeated-classes": () => ({
    description: "Extract repeated class pattern to reusable component or utility",
    replacement: "Create a cn() utility or extract to a component",
  }),
};

function suggestSemanticColorReplacement(className: string): string {
  // Extract the color part (e.g., "blue-500" from "bg-blue-500")
  const colorMap: Record<string, string> = {
    "blue-500": "primary",
    "blue-600": "primary",
    "gray-50": "muted",
    "gray-100": "muted",
    "gray-200": "border",
    "gray-300": "border",
    "gray-500": "muted-foreground",
    "gray-700": "foreground",
    "gray-900": "foreground",
    "red-500": "destructive",
    "red-600": "destructive",
    "green-500": "success",
    "green-600": "success",
  };

  const match = className.match(/(bg|text|border|ring)-(\w+-\d+)/);
  if (match) {
    const [, prefix, color] = match;
    const semantic = colorMap[color ?? ""];
    if (semantic && prefix) {
      return `${prefix}-${semantic}`;
    }
  }

  return "Use a semantic color token (e.g., bg-primary, text-foreground)";
}

function suggestSemanticSpacingReplacement(className: string): string {
  const match = className.match(/(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap)-(\d+)/);
  if (match) {
    const [, prefix, value] = match;
    const numValue = Number.parseInt(value ?? "0", 10);

    let semantic: string;
    if (numValue <= 1) semantic = "xs";
    else if (numValue <= 2) semantic = "sm";
    else if (numValue <= 4) semantic = "md";
    else if (numValue <= 6) semantic = "lg";
    else if (numValue <= 8) semantic = "xl";
    else semantic = "2xl";

    return `${prefix}-(--spacing-${semantic})`;
  }

  return "Use a semantic spacing token (e.g., gap-md, p-lg)";
}

function getFixSuggestion(ruleKey: string, className?: string): FixSuggestion | undefined {
  const suggestionFn = FIX_SUGGESTIONS[ruleKey];
  return suggestionFn ? suggestionFn(className) : undefined;
}

// ============================================================================
// Issue to Violation Mapping
// ============================================================================

function mapIssueToViolation(issue: LintIssue, includeFix: boolean): CheckViolation {
  const violation: CheckViolation = {
    ruleId: issue.ruleId,
    ruleKey: issue.ruleKey,
    severity: issue.severity,
    message: issue.message,
    file: issue.filePath,
    line: issue.line,
    column: issue.column,
  };

  if (issue.className) {
    violation.className = issue.className;
  }

  if (issue.context) {
    violation.context = issue.context;
  }

  if (issue.note) {
    violation.note = issue.note;
  }

  if (includeFix) {
    const fix = getFixSuggestion(issue.ruleKey, issue.className);
    if (fix) {
      violation.fix = fix;
    }
  }

  return violation;
}

// ============================================================================
// Core Logic
// ============================================================================

export interface CheckOptions {
  files?: string[];
  staged?: boolean;
  rules?: string[];
  fix?: boolean;
}

/**
 * Execute the north_check tool handler.
 *
 * Runs design system linting and returns structured violation data.
 */
export async function executeCheckTool(
  workingDir: string,
  configPath: string,
  options: CheckOptions = {}
): Promise<CheckResponse> {
  const { files: filePatterns, staged = false, rules, fix = false } = options;

  // Determine files to lint
  let files: string[] | undefined;
  if (staged) {
    files = getStagedFiles(workingDir);
    if (files.length === 0) {
      // No staged files - return empty success response
      return {
        kind: "check",
        summary: { errors: 0, warnings: 0, info: 0 },
        violations: [],
        stats: {
          totalFiles: 0,
          filesWithClasses: 0,
          filesWithNonLiteral: 0,
          extractedClassCount: 0,
          classSites: 0,
          coveragePercent: 100,
        },
        passed: true,
      };
    }
  } else if (filePatterns && filePatterns.length > 0) {
    files = filePatterns;
  }

  // Run lint
  const { report } = await runLint({
    cwd: workingDir,
    configPath,
    files,
    collectIssues: true,
  });

  // Filter by rules if specified
  let filteredIssues = report.issues;
  if (rules && rules.length > 0) {
    const ruleSet = new Set(rules);
    filteredIssues = report.issues.filter((issue) => ruleSet.has(issue.ruleKey));
  }

  // Map issues to violations
  const violations = filteredIssues.map((issue) => mapIssueToViolation(issue, fix));

  // Recalculate summary if we filtered
  const summary =
    rules && rules.length > 0
      ? {
          errors: violations.filter((v) => v.severity === "error").length,
          warnings: violations.filter((v) => v.severity === "warn").length,
          info: violations.filter((v) => v.severity === "info").length,
        }
      : report.summary;

  return {
    kind: "check",
    summary,
    violations,
    stats: report.stats,
    passed: summary.errors === 0,
    ...(rules && rules.length > 0 ? { filteredRules: rules } : {}),
  };
}

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Register the north_check tool with the MCP server.
 *
 * This is a Tier 2 tool - requires config (.north/config.yaml) to be present.
 */
export function registerCheckTool(server: McpServer): void {
  server.registerTool(
    "north_check",
    {
      description:
        "Run North design system linting. Returns violations with file locations and optional fix suggestions. " +
        "Parameters: files (string[]) - glob patterns, staged (boolean) - lint only staged files, " +
        "rules (string[]) - filter to specific rules, fix (boolean) - include fix suggestions.",
      inputSchema: CheckInputSchema,
    },
    async (args: unknown) => {
      const cwd = process.cwd();

      // Validate input
      const parseResult = CheckInputSchema.safeParse(args);
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
        const payload = await executeCheckTool(workingDir, configPath, {
          files: input.files,
          staged: input.staged,
          rules: input.rules,
          fix: input.fix,
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
