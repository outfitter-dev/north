import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import chalk from "chalk";
import { runLint } from "../lint/engine.ts";
import { formatLintReport } from "../lint/format.ts";

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
// Check Command
// ============================================================================

export interface CheckOptions {
  cwd?: string;
  config?: string;
  json?: boolean;
  staged?: boolean;
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

    const { report } = await runLint({
      cwd,
      configPath: options.config,
      files,
    });

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

    const hasErrors = report.summary.errors > 0;

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
