import { type RunCommandOptions, runCommand } from "./exec.ts";
import { repoPath } from "./paths.ts";

const NORTH_CLI = repoPath("packages/north/src/cli/index.ts");

export interface NorthJsonReport {
  summary: {
    errors: number;
    warnings: number;
    info: number;
  };
  violations: Array<{
    ruleId: string;
    ruleKey: string;
    severity: string;
    message: string;
    filePath: string;
    line: number;
    column: number;
    className?: string;
    context?: string;
  }>;
  stats: {
    totalFiles: number;
    filesWithClasses: number;
    filesWithNonLiteral: number;
    extractedClassCount: number;
    classSites: number;
    coveragePercent: number;
  };
  rules: Array<{
    id: string;
    key: string;
    severity: string;
    message: string;
    note?: string;
    regex?: string;
  }>;
}

export async function runNorth(args: string[], cwd: string, options: RunCommandOptions = {}) {
  return await runCommand("bun", [NORTH_CLI, ...args], {
    ...options,
    cwd,
    env: {
      ...process.env,
      ...options.env,
    },
  });
}

export function parseNorthJson(output: string): NorthJsonReport {
  return JSON.parse(output) as NorthJsonReport;
}
