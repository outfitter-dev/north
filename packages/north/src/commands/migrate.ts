/**
 * north migrate - Execute a migration plan in batch
 *
 * @see .scratch/mcp-server/15-cli-migrate-spec.md for full specification
 */

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import * as readline from "node:readline";
import chalk from "chalk";
import { resolveConfigPath, resolveNorthPaths } from "../config/env.ts";
import { writeFileAtomic } from "../generation/file-writer.ts";
import { buildIndex } from "../index/build.ts";
import type { MigrationAction, MigrationPlan, MigrationStep } from "./propose.ts";

// ============================================================================
// Error Types
// ============================================================================

export class MigrateError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "MigrateError";
  }
}

// ============================================================================
// Types
// ============================================================================

export interface MigrateOptions {
  cwd?: string;
  config?: string;
  plan?: string;
  steps?: string[];
  skip?: string[];
  file?: string;
  interactive?: boolean;
  backup?: boolean;
  dryRun?: boolean;
  apply?: boolean;
  continue?: boolean;
  json?: boolean;
  quiet?: boolean;
}

export interface StepResult {
  stepId: string;
  status: "applied" | "skipped" | "failed" | "pending";
  file: string;
  action: string;
  error?: string;
  diff?: {
    removed: number;
    added: number;
  };
}

export interface MigrationCheckpoint {
  planPath: string;
  planHash: string;
  completedSteps: string[];
  failedSteps: string[];
  skippedSteps: string[];
  lastUpdated: string;
}

export interface MigrateReport {
  kind: "migrate";
  applied: boolean;
  planPath: string;
  checkpointPath?: string;
  results: StepResult[];
  summary: {
    total: number;
    applied: number;
    skipped: number;
    failed: number;
    filesChanged: number;
    linesRemoved: number;
    linesAdded: number;
  };
  checkpoint?: MigrationCheckpoint;
  nextSteps?: string[];
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PLAN_FILENAME = "migration-plan.json";
const DEFAULT_CHECKPOINT_FILENAME = "migration-checkpoint.json";
const BASE_CSS_FILE = ".north/tokens/base.css";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Compute SHA256 hash of plan for integrity checking
 */
function computePlanHash(plan: MigrationPlan): string {
  const content = JSON.stringify(plan);
  return `sha256:${createHash("sha256").update(content).digest("hex").slice(0, 16)}`;
}

/**
 * Load migration plan from file
 */
async function loadPlan(planPath: string): Promise<MigrationPlan> {
  try {
    const content = await readFile(planPath, "utf-8");
    const plan = JSON.parse(content) as MigrationPlan;

    if (plan.version !== 1) {
      throw new MigrateError(`Invalid plan format. Expected version 1, got ${plan.version}`);
    }

    return plan;
  } catch (error) {
    if (error instanceof MigrateError) {
      throw error;
    }
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      throw new MigrateError(`Plan not found: ${planPath}. Run 'north propose' first.`);
    }
    throw new MigrateError(
      `Failed to load plan: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }
}

/**
 * Load checkpoint file if it exists
 */
async function loadCheckpoint(checkpointPath: string): Promise<MigrationCheckpoint | null> {
  try {
    const content = await readFile(checkpointPath, "utf-8");
    return JSON.parse(content) as MigrationCheckpoint;
  } catch {
    return null;
  }
}

/**
 * Save checkpoint to file
 */
async function saveCheckpoint(
  checkpointPath: string,
  checkpoint: MigrationCheckpoint
): Promise<void> {
  await mkdir(dirname(checkpointPath), { recursive: true });
  await writeFileAtomic(checkpointPath, JSON.stringify(checkpoint, null, 2));
}

/**
 * Filter steps based on options
 */
function filterSteps(
  steps: MigrationStep[],
  options: {
    include?: string[];
    skip?: string[];
    file?: string;
    completedSteps?: string[];
  }
): MigrationStep[] {
  let filtered = steps;

  // Filter by --steps (include only)
  if (options.include && options.include.length > 0) {
    const includeSet = new Set(options.include);
    filtered = filtered.filter((step) => includeSet.has(step.id));
  }

  // Filter by --skip (exclude)
  if (options.skip && options.skip.length > 0) {
    const skipSet = new Set(options.skip);
    filtered = filtered.filter((step) => !skipSet.has(step.id));
  }

  // Filter by --file
  if (options.file) {
    const targetFile = options.file;
    filtered = filtered.filter(
      (step) => step.file === targetFile || step.file.endsWith(`/${targetFile}`)
    );
  }

  // Filter out completed steps (for --continue)
  if (options.completedSteps && options.completedSteps.length > 0) {
    const completedSet = new Set(options.completedSteps);
    filtered = filtered.filter((step) => !completedSet.has(step.id));
  }

  return filtered;
}

/**
 * Topological sort steps by dependencies
 * Steps with no dependencies come first
 */
function topologicalSort(steps: MigrationStep[]): MigrationStep[] {
  const stepMap = new Map(steps.map((s) => [s.id, s]));
  const sorted: MigrationStep[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(stepId: string): void {
    if (visited.has(stepId)) return;
    if (visiting.has(stepId)) {
      // Circular dependency - skip it
      return;
    }

    visiting.add(stepId);
    const step = stepMap.get(stepId);
    if (step) {
      // Visit dependencies first
      if (step.dependencies) {
        for (const depId of step.dependencies) {
          if (stepMap.has(depId)) {
            visit(depId);
          }
        }
      }
      visited.add(stepId);
      sorted.push(step);
    }
    visiting.delete(stepId);
  }

  for (const step of steps) {
    visit(step.id);
  }

  return sorted;
}

/**
 * Describe an action in human-readable form
 */
function describeAction(action: MigrationAction): string {
  switch (action.type) {
    case "replace":
      return `replace ${action.from} -> ${action.to}`;
    case "extract":
      return `extract to ${action.utilityName}`;
    case "tokenize":
      return `tokenize ${action.value} as ${action.tokenName}`;
    case "remove":
      return `remove ${action.className}`;
  }
}

// ============================================================================
// Transformation Functions
// ============================================================================

/**
 * Apply replace transformation: string substitution at location
 */
export function applyReplace(
  content: string,
  line: number,
  column: number,
  from: string,
  to: string
): { content: string; diff: { removed: number; added: number } } | null {
  const lines = content.split("\n");
  const targetLine = lines[line - 1];

  if (!targetLine) {
    return null;
  }

  // Find the 'from' string starting near the column position
  // Search within a reasonable range around the column
  const searchStart = Math.max(0, column - 5);
  const searchEnd = Math.min(targetLine.length, column + from.length + 50);
  const searchArea = targetLine.slice(searchStart, searchEnd);

  const idx = searchArea.indexOf(from);
  if (idx === -1) {
    // Try searching the whole line
    const fullIdx = targetLine.indexOf(from);
    if (fullIdx === -1) {
      return null;
    }
    lines[line - 1] = targetLine.slice(0, fullIdx) + to + targetLine.slice(fullIdx + from.length);
  } else {
    const actualIdx = searchStart + idx;
    lines[line - 1] =
      targetLine.slice(0, actualIdx) + to + targetLine.slice(actualIdx + from.length);
  }

  return {
    content: lines.join("\n"),
    diff: {
      removed: from.length,
      added: to.length,
    },
  };
}

/**
 * Apply extract transformation: add @utility to base.css + update file
 */
export function applyExtract(
  content: string,
  line: number,
  pattern: string,
  utilityName: string
): { content: string; utilityBlock: string; diff: { removed: number; added: number } } | null {
  const lines = content.split("\n");
  const targetLine = lines[line - 1];

  if (!targetLine) {
    return null;
  }

  // Find the pattern in the line
  const idx = targetLine.indexOf(pattern);
  if (idx === -1) {
    return null;
  }

  // Replace pattern with utility name
  lines[line - 1] = targetLine.slice(0, idx) + utilityName + targetLine.slice(idx + pattern.length);

  // Generate utility block
  const utilityBlock = `@utility ${utilityName} {\n  @apply ${pattern};\n}`;

  return {
    content: lines.join("\n"),
    utilityBlock,
    diff: {
      removed: pattern.length,
      added: utilityName.length,
    },
  };
}

/**
 * Apply tokenize transformation: conceptually add token + update file
 * Note: The actual token definition needs to be added to tokens file separately
 */
export function applyTokenize(
  content: string,
  line: number,
  value: string,
  tokenName: string
): { content: string; tokenDefinition: string; diff: { removed: number; added: number } } | null {
  const lines = content.split("\n");
  const targetLine = lines[line - 1];

  if (!targetLine) {
    return null;
  }

  // Find the value in the line
  const idx = targetLine.indexOf(value);
  if (idx === -1) {
    return null;
  }

  // Generate replacement (use CSS var reference for the token)
  // Extract the property prefix (bg, text, border, etc.) from the value
  const prefixMatch = value.match(/^(bg|text|border|ring|fill|stroke)-/);
  const prefix = prefixMatch ? prefixMatch[1] : "bg";
  const tokenRef = `${prefix}-(${tokenName})`;

  // Replace value with token reference
  lines[line - 1] = targetLine.slice(0, idx) + tokenRef + targetLine.slice(idx + value.length);

  // Generate token definition (to be added to tokens file)
  // Extract the actual color value from arbitrary syntax like bg-[#ff0000]
  const colorMatch = value.match(/\[([^\]]+)\]/);
  const colorValue = colorMatch ? colorMatch[1] : value;
  const tokenDefinition = `${tokenName}: ${colorValue};`;

  return {
    content: lines.join("\n"),
    tokenDefinition,
    diff: {
      removed: value.length,
      added: tokenRef.length,
    },
  };
}

/**
 * Apply remove transformation: delete class from className string
 */
export function applyRemove(
  content: string,
  line: number,
  _column: number,
  className: string
): { content: string; diff: { removed: number; added: number } } | null {
  const lines = content.split("\n");
  const targetLine = lines[line - 1];

  if (!targetLine) {
    return null;
  }

  // Find the className in the line
  const idx = targetLine.indexOf(className);
  if (idx === -1) {
    return null;
  }

  // Remove the class and any surrounding whitespace
  let removeStart = idx;
  let removeEnd = idx + className.length;

  // Remove trailing space if present
  if (targetLine[removeEnd] === " ") {
    removeEnd += 1;
  } else if (removeStart > 0 && targetLine[removeStart - 1] === " ") {
    // Or leading space if no trailing space
    removeStart -= 1;
  }

  lines[line - 1] = targetLine.slice(0, removeStart) + targetLine.slice(removeEnd);

  return {
    content: lines.join("\n"),
    diff: {
      removed: removeEnd - removeStart,
      added: 0,
    },
  };
}

/**
 * Apply a migration step to file content
 */
function applyStep(
  content: string,
  step: MigrationStep
): {
  content: string;
  sideEffect?: { type: "utility" | "token"; value: string };
  diff: { removed: number; added: number };
} | null {
  const { action, line, column } = step;

  switch (action.type) {
    case "replace": {
      const result = applyReplace(content, line, column, action.from, action.to);
      if (!result) return null;
      return { content: result.content, diff: result.diff };
    }

    case "extract": {
      const result = applyExtract(content, line, action.pattern, action.utilityName);
      if (!result) return null;
      return {
        content: result.content,
        sideEffect: { type: "utility", value: result.utilityBlock },
        diff: result.diff,
      };
    }

    case "tokenize": {
      const result = applyTokenize(content, line, action.value, action.tokenName);
      if (!result) return null;
      return {
        content: result.content,
        sideEffect: { type: "token", value: result.tokenDefinition },
        diff: result.diff,
      };
    }

    case "remove": {
      const result = applyRemove(content, line, column, action.className);
      if (!result) return null;
      return { content: result.content, diff: result.diff };
    }
  }
}

// ============================================================================
// Interactive Mode
// ============================================================================

/**
 * Prompt user for confirmation in interactive mode
 */
async function promptUser(
  step: MigrationStep,
  rl: readline.Interface
): Promise<"yes" | "no" | "quit" | "all"> {
  const action = describeAction(step.action);

  console.log("");
  console.log(chalk.bold(`Step ${step.id}: ${action}`));
  console.log(`File: ${step.file}:${step.line}`);
  console.log("");
  console.log(chalk.dim("Before:"));
  console.log(`  ${step.preview.before}`);
  console.log("");
  console.log(chalk.dim("After:"));
  console.log(`  ${step.preview.after}`);
  console.log("");

  return new Promise((resolve) => {
    rl.question("Apply this change? [y]es / [n]o / [q]uit / [a]ll remaining: ", (answer) => {
      const normalized = answer.toLowerCase().trim();
      if (normalized === "y" || normalized === "yes") {
        resolve("yes");
      } else if (normalized === "n" || normalized === "no") {
        resolve("no");
      } else if (normalized === "q" || normalized === "quit") {
        resolve("quit");
      } else if (normalized === "a" || normalized === "all") {
        resolve("all");
      } else {
        // Default to no
        resolve("no");
      }
    });
  });
}

// ============================================================================
// Output Formatting
// ============================================================================

/**
 * Format step result symbol
 */
function formatResultSymbol(status: StepResult["status"]): string {
  switch (status) {
    case "applied":
      return chalk.green("ok");
    case "skipped":
      return chalk.yellow("skip");
    case "failed":
      return chalk.red("FAIL");
    case "pending":
      return chalk.dim("...");
  }
}

/**
 * Format dry-run output
 */
function formatDryRunOutput(plan: MigrationPlan, steps: MigrationStep[], planPath: string): string {
  const lines: string[] = [];

  lines.push(chalk.bold("Migration Preview (dry-run)"));
  lines.push("");
  lines.push(`Plan: ${planPath}`);
  lines.push(`Steps: ${plan.steps.length} total, ${steps.length} will execute`);
  lines.push("");

  // Show first few steps
  const previewLimit = 10;
  for (const step of steps.slice(0, previewLimit)) {
    const action = describeAction(step.action);
    lines.push(`Step ${step.id} ${chalk.dim("[PREVIEW]")}`);
    lines.push(`  File: ${step.file}:${step.line}`);
    lines.push(`  Rule: ${step.ruleId.replace("north/", "")}`);
    lines.push(`  Action: ${action}`);
    lines.push("");
  }

  if (steps.length > previewLimit) {
    lines.push(chalk.dim(`... (${steps.length - previewLimit} more steps)`));
    lines.push("");
  }

  // Estimate changes
  const filesAffected = new Set(steps.map((s) => s.file)).size;

  lines.push(chalk.bold("Summary:"));
  lines.push(`  Steps: ${steps.length}`);
  lines.push(`  Files: ${filesAffected}`);
  lines.push("");
  lines.push("Run 'north migrate --apply' to execute.");

  return lines.join("\n");
}

/**
 * Format applied output
 */
function formatAppliedOutput(report: MigrateReport, showAllResults = false): string {
  const lines: string[] = [];

  lines.push(chalk.bold("Migration Applied"));
  lines.push("");
  lines.push(`Plan: ${report.planPath}`);
  lines.push("");
  lines.push(chalk.bold("Results:"));

  // Show results (limited or all)
  const resultsToShow = showAllResults ? report.results : report.results.slice(0, 20);
  for (const result of resultsToShow) {
    const symbol = formatResultSymbol(result.status);
    const fileName = result.file.split("/").pop() ?? result.file;
    lines.push(`  ${symbol} ${result.stepId}: ${fileName} - ${result.action}`);
  }

  if (!showAllResults && report.results.length > 20) {
    lines.push(chalk.dim(`  ... (${report.results.length - 20} more results)`));
  }

  lines.push("");
  lines.push(chalk.bold("Summary:"));
  lines.push(`  Total: ${report.summary.total}`);
  lines.push(`  Applied: ${chalk.green(String(report.summary.applied))}`);
  lines.push(
    `  Failed: ${report.summary.failed > 0 ? chalk.red(String(report.summary.failed)) : "0"}`
  );
  lines.push(
    `  Skipped: ${report.summary.skipped > 0 ? chalk.yellow(String(report.summary.skipped)) : "0"}`
  );
  lines.push(`  Files changed: ${report.summary.filesChanged}`);
  lines.push(
    `  Lines: ${chalk.red(`-${report.summary.linesRemoved}`)}, ${chalk.green(`+${report.summary.linesAdded}`)}`
  );

  if (report.checkpoint) {
    lines.push("");
    const checkpointDisplay = report.checkpointPath ?? DEFAULT_CHECKPOINT_FILENAME;
    lines.push(chalk.dim(`Checkpoint saved: ${checkpointDisplay}`));
  }

  if (report.nextSteps && report.nextSteps.length > 0) {
    lines.push("");
    lines.push(chalk.bold("Next steps:"));
    for (let i = 0; i < report.nextSteps.length; i++) {
      lines.push(`  ${i + 1}. ${report.nextSteps[i]}`);
    }
  }

  return lines.join("\n");
}

// ============================================================================
// Main Command
// ============================================================================

export async function migrate(options: MigrateOptions = {}): Promise<MigrateReport> {
  const cwd = options.cwd ?? process.cwd();
  const configPath = await resolveConfigPath(cwd, options.config);
  const paths = configPath ? resolveNorthPaths(configPath, cwd) : null;
  const planPath = options.plan
    ? resolve(cwd, options.plan)
    : resolve(paths?.stateDir ?? cwd, DEFAULT_PLAN_FILENAME);
  const checkpointPath = resolve(paths?.stateDir ?? cwd, DEFAULT_CHECKPOINT_FILENAME);
  const apply = options.apply === true;
  const dryRun = options.dryRun ?? !apply;
  const backup = options.backup !== false;
  const interactive = options.interactive === true;
  const continueFromCheckpoint = options.continue === true;

  // 1. Load and validate plan
  const plan = await loadPlan(planPath);
  const planHash = computePlanHash(plan);

  // 2. Load checkpoint if --continue
  let checkpoint: MigrationCheckpoint | null = null;
  if (continueFromCheckpoint) {
    checkpoint = await loadCheckpoint(checkpointPath);
    if (checkpoint) {
      if (checkpoint.planHash !== planHash) {
        throw new MigrateError("Plan has changed since checkpoint. Remove checkpoint to restart.");
      }
    }
  }

  // 3. Filter steps
  const filteredSteps = filterSteps(plan.steps, {
    include: options.steps,
    skip: options.skip,
    file: options.file,
    completedSteps: checkpoint?.completedSteps,
  });

  // 4. Topological sort by dependencies
  const sortedSteps = topologicalSort(filteredSteps);

  // Handle no steps case
  if (sortedSteps.length === 0) {
    const emptyReport: MigrateReport = {
      kind: "migrate",
      applied: false,
      planPath,
      results: [],
      summary: {
        total: 0,
        applied: 0,
        skipped: 0,
        failed: 0,
        filesChanged: 0,
        linesRemoved: 0,
        linesAdded: 0,
      },
      nextSteps: checkpoint
        ? ["All steps completed or skipped."]
        : ["No steps to execute. Check filters or run 'north propose' to generate a new plan."],
    };

    if (!options.quiet) {
      if (options.json) {
        console.log(JSON.stringify(emptyReport, null, 2));
      } else {
        console.log("No steps to execute.");
      }
    }

    return emptyReport;
  }

  // For dry-run, just preview
  if (dryRun) {
    const results: StepResult[] = sortedSteps.map((step) => ({
      stepId: step.id,
      status: "pending" as const,
      file: step.file,
      action: describeAction(step.action),
    }));

    const filesAffected = new Set(sortedSteps.map((s) => s.file)).size;

    const report: MigrateReport = {
      kind: "migrate",
      applied: false,
      planPath,
      results,
      summary: {
        total: sortedSteps.length,
        applied: 0,
        skipped: 0,
        failed: 0,
        filesChanged: filesAffected,
        linesRemoved: 0,
        linesAdded: 0,
      },
    };

    if (!options.quiet) {
      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatDryRunOutput(plan, sortedSteps, planPath));
      }
    }

    return report;
  }

  // 5. Execute steps
  const results: StepResult[] = [];
  const completedSteps: string[] = checkpoint?.completedSteps ?? [];
  const failedSteps: string[] = checkpoint?.failedSteps ?? [];
  const skippedSteps: string[] = checkpoint?.skippedSteps ?? [];
  const fileContents = new Map<string, string>();
  const backedUpFiles = new Set<string>();
  const utilityBlocks: string[] = [];
  const tokenDefinitions: string[] = [];
  let totalRemoved = 0;
  let totalAdded = 0;
  let applyAll = false;

  // Set up readline for interactive mode
  let rl: readline.Interface | null = null;
  if (interactive) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  try {
    for (const step of sortedSteps) {
      const filePath = resolve(cwd, step.file);

      // Check if dependencies failed
      if (step.dependencies) {
        const hasFailedDep = step.dependencies.some((depId) => failedSteps.includes(depId));
        if (hasFailedDep) {
          results.push({
            stepId: step.id,
            status: "skipped",
            file: step.file,
            action: describeAction(step.action),
            error: "Dependency failed",
          });
          skippedSteps.push(step.id);
          continue;
        }
      }

      // Interactive mode prompt
      if (interactive && !applyAll && rl) {
        const response = await promptUser(step, rl);
        if (response === "quit") {
          // Save checkpoint and exit
          break;
        }
        if (response === "no") {
          results.push({
            stepId: step.id,
            status: "skipped",
            file: step.file,
            action: describeAction(step.action),
          });
          skippedSteps.push(step.id);
          continue;
        }
        if (response === "all") {
          applyAll = true;
        }
      }

      // Load file content (cached)
      let content = fileContents.get(filePath);
      if (content === undefined) {
        try {
          content = await readFile(filePath, "utf-8");
          fileContents.set(filePath, content);
        } catch (_error) {
          results.push({
            stepId: step.id,
            status: "failed",
            file: step.file,
            action: describeAction(step.action),
            error: `File not found: ${step.file}`,
          });
          failedSteps.push(step.id);
          continue;
        }
      }

      // Apply transformation
      const transformResult = applyStep(content, step);

      if (!transformResult) {
        results.push({
          stepId: step.id,
          status: "failed",
          file: step.file,
          action: describeAction(step.action),
          error: `Could not locate target at line ${step.line}`,
        });
        failedSteps.push(step.id);
        continue;
      }

      // Create backup if first change to file
      if (backup && !backedUpFiles.has(filePath)) {
        try {
          await copyFile(filePath, `${filePath}.bak`);
          backedUpFiles.add(filePath);
        } catch {
          // Backup failed, but continue anyway
        }
      }

      // Update cached content
      fileContents.set(filePath, transformResult.content);

      // Collect side effects
      if (transformResult.sideEffect) {
        if (transformResult.sideEffect.type === "utility") {
          utilityBlocks.push(transformResult.sideEffect.value);
        } else if (transformResult.sideEffect.type === "token") {
          tokenDefinitions.push(transformResult.sideEffect.value);
        }
      }

      totalRemoved += transformResult.diff.removed;
      totalAdded += transformResult.diff.added;

      results.push({
        stepId: step.id,
        status: "applied",
        file: step.file,
        action: describeAction(step.action),
        diff: transformResult.diff,
      });
      completedSteps.push(step.id);
    }
  } finally {
    if (rl) {
      rl.close();
    }
  }

  // 6. Write modified files
  const modifiedFiles = new Set<string>();
  for (const [filePath, content] of fileContents) {
    try {
      // Read original to check if changed
      const original = await readFile(filePath, "utf-8").catch(() => null);
      if (original !== content) {
        await writeFileAtomic(filePath, content);
        modifiedFiles.add(filePath);
      }
    } catch (error) {
      // Mark affected steps as failed
      for (const result of results) {
        if (resolve(cwd, result.file) === filePath && result.status === "applied") {
          result.status = "failed";
          result.error = `Failed to write file: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
    }
  }

  // 7. Append utilities and tokens to base.css
  if (utilityBlocks.length > 0 || tokenDefinitions.length > 0) {
    const baseCssPath = paths?.baseTokensPath ?? resolve(cwd, BASE_CSS_FILE);
    try {
      let baseCss = await readFile(baseCssPath, "utf-8").catch(() => "");

      if (tokenDefinitions.length > 0) {
        const tokenBlock = `\n/* north migrate: tokens */\n@theme {\n  ${tokenDefinitions.join("\n  ")}\n}\n`;
        baseCss = baseCss.trimEnd() + tokenBlock;
      }

      if (utilityBlocks.length > 0) {
        const utilitySection = `\n/* north migrate: utilities */\n${utilityBlocks.join("\n\n")}\n`;
        baseCss = baseCss.trimEnd() + utilitySection;
      }

      await writeFileAtomic(baseCssPath, baseCss);
      modifiedFiles.add(baseCssPath);
    } catch (error) {
      // Non-fatal: log but continue
      if (!options.quiet && !options.json) {
        console.log(
          chalk.yellow(
            `Warning: Could not update ${baseCssPath}: ${error instanceof Error ? error.message : String(error)}`
          )
        );
      }
    }
  }

  // 8. Rebuild index if files changed
  if (modifiedFiles.size > 0) {
    try {
      await buildIndex({ cwd, configPath: options.config });
    } catch {
      // Non-fatal: index rebuild failed
    }
  }

  // 9. Save checkpoint
  const newCheckpoint: MigrationCheckpoint = {
    planPath,
    planHash,
    completedSteps,
    failedSteps,
    skippedSteps,
    lastUpdated: new Date().toISOString(),
  };

  await saveCheckpoint(checkpointPath, newCheckpoint);

  // 10. Build report
  const appliedCount = results.filter((r) => r.status === "applied").length;
  const failedCount = results.filter((r) => r.status === "failed").length;
  const skippedCount = results.filter((r) => r.status === "skipped").length;

  const nextSteps: string[] = [];
  if (failedCount > 0) {
    nextSteps.push("Fix failed steps manually or adjust plan");
    nextSteps.push("Run 'north migrate --continue --apply' to retry");
  }
  if (appliedCount > 0) {
    nextSteps.push("Run 'north check' to verify remaining violations");
  }

  const report: MigrateReport = {
    kind: "migrate",
    applied: true,
    planPath,
    checkpointPath,
    results,
    summary: {
      total: results.length,
      applied: appliedCount,
      skipped: skippedCount,
      failed: failedCount,
      filesChanged: modifiedFiles.size,
      linesRemoved: totalRemoved,
      linesAdded: totalAdded,
    },
    checkpoint: newCheckpoint,
    nextSteps: nextSteps.length > 0 ? nextSteps : undefined,
  };

  // 11. Output
  if (!options.quiet) {
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatAppliedOutput(report));
    }
  }

  return report;
}

// Re-export MigrationPlan for convenience
export type { MigrationPlan };
