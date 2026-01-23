import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import chalk from "chalk";
import { minimatch } from "minimatch";
import { resolveConfigPath, resolveNorthPaths } from "../config/env.ts";
import { loadConfig } from "../config/loader.ts";
import { openIndexDatabase } from "../index/db.ts";
import { resolveIndexPath } from "../index/sources.ts";
import { runLint } from "../lint/engine.ts";
import { formatLintReport } from "../lint/format.ts";
import type { LintIssue, LoadedRule, RuleSeverity } from "../lint/types.ts";

// ============================================================================
// Error Types
// ============================================================================

export class CheckError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "CheckError";
  }
}

// ============================================================================
// Repeated Pattern Detection
// ============================================================================

interface RepeatedPattern {
  classes: string;
  count: number;
  locations: string;
}

interface RepeatedPatternLocation {
  file: string;
  line: number;
  component?: string | null;
}

function isIgnoredByRule(filePath: string, ignore?: string[]): boolean {
  if (!ignore || ignore.length === 0) {
    return false;
  }

  const normalizedPath = filePath.replace(/\\/g, "/");
  return ignore.some((pattern) => minimatch(normalizedPath, pattern));
}

async function queryRepeatedPatterns(
  cwd: string,
  configPath: string | undefined,
  rule: LoadedRule
): Promise<LintIssue[]> {
  if (rule.severity === "off") {
    return [];
  }
  const severity = rule.severity as Exclude<RuleSeverity, "off">;
  // Try to find config and resolve index path
  const configFile = await resolveConfigPath(cwd, configPath);

  if (!configFile) {
    return [];
  }

  const configResult = await loadConfig(configFile);
  if (!configResult.success) {
    return [];
  }

  const paths = resolveNorthPaths(configFile, cwd);
  const indexPath = resolveIndexPath(paths, configResult.config);

  // Check if index exists - skip gracefully if not
  try {
    await access(indexPath);
  } catch {
    return [];
  }

  // Query patterns with count >= 3
  const db = await openIndexDatabase(indexPath);
  const patterns = db
    .prepare(
      `
    SELECT classes, count, locations
    FROM patterns
    WHERE count >= 3
    ORDER BY count DESC
    LIMIT 20
  `
    )
    .all() as RepeatedPattern[];

  db.close();

  // Convert to lint issues
  return patterns.flatMap((pattern) => {
    const locs = JSON.parse(pattern.locations) as RepeatedPatternLocation[];
    const eligibleLocs = rule.ignore
      ? locs.filter((loc) => !isIgnoredByRule(loc.file, rule.ignore))
      : locs;

    if (eligibleLocs.length === 0) {
      return [];
    }

    const firstLoc = eligibleLocs[0] ?? { file: "unknown", line: 1 };

    // Parse classes from JSON string (stored as JSON.stringify in build.ts)
    const classes = JSON.parse(pattern.classes) as string[];
    const className = classes.join(" ");

    return {
      ruleId: rule.id,
      ruleKey: rule.key,
      severity,
      message: rule.message,
      filePath: firstLoc.file,
      line: firstLoc.line,
      column: 1,
      className,
      note: `Pattern: "${className}"\nOccurrences: ${pattern.count}\nConsider extracting to a cn() utility or cva() variant.`,
    };
  });
}

// ============================================================================
// Check Command
// ============================================================================

export interface CheckOptions {
  cwd?: string;
  config?: string;
  json?: boolean;
  staged?: boolean;
  strict?: boolean;
}

export interface CheckResult {
  success: boolean;
  message: string;
  error?: Error;
}

function getStagedFiles(cwd: string): string[] {
  const result = spawnSync("git", ["diff", "--name-only", "--cached", "--diff-filter=ACMR"], {
    cwd,
    encoding: "utf-8",
  });

  if (result.error) {
    throw new CheckError("Failed to determine staged files", result.error);
  }

  if (result.status !== 0) {
    throw new CheckError(`Git diff failed: ${result.stderr}`);
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((file) => resolve(cwd, file))
    .filter((file) => file.endsWith(".tsx") || file.endsWith(".jsx"));
}

export async function check(options: CheckOptions = {}): Promise<CheckResult> {
  const cwd = options.cwd ?? process.cwd();

  try {
    const files = options.staged ? getStagedFiles(cwd) : undefined;

    if (options.staged && files && files.length === 0) {
      if (!options.json) {
        console.log(chalk.yellow("No staged TSX/JSX files to lint."));
      }
      return { success: true, message: "No staged files" };
    }

    const { report, configPath } = await runLint({
      cwd,
      configPath: options.config,
      files,
    });

    const repeatedRule = report.rules.find((rule) => rule.key === "extract-repeated-classes");

    // Query index for repeated patterns (skips gracefully if no index)
    if (repeatedRule) {
      const patternIssues = await queryRepeatedPatterns(cwd, configPath, repeatedRule);
      if (patternIssues.length > 0) {
        report.issues.push(...patternIssues);
        for (const issue of patternIssues) {
          if (issue.severity === "error") {
            report.summary.errors += 1;
          } else if (issue.severity === "warn") {
            report.summary.warnings += 1;
          } else {
            report.summary.info += 1;
          }
        }
      }
    }

    if (options.json) {
      const serializableReport = {
        summary: report.summary,
        violations: report.issues,
        stats: report.stats,
        rules: report.rules.map((rule) => ({
          ...rule,
          regex: rule.regex ? rule.regex.source : undefined,
        })),
      };

      console.log(JSON.stringify(serializableReport, null, 2));
    } else {
      console.log(formatLintReport(report));
    }

    const strict = options.strict ?? false;
    const hasErrors = report.summary.errors > 0 || (strict && report.summary.warnings > 0);

    return {
      success: !hasErrors,
      message: hasErrors ? "Lint errors found" : "Lint passed",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (!options.json) {
      console.log(chalk.red("\n✗ Lint failed"));
      console.log(chalk.dim(errorMessage));
    }

    return {
      success: false,
      message: `Lint failed: ${errorMessage}`,
      error: error instanceof Error ? error : new CheckError(errorMessage),
    };
  }
}
