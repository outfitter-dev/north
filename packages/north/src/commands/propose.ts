/**
 * north propose - Generate migration plan from lint violations
 *
 * @see .scratch/mcp-server/14-cli-propose-spec.md for full specification
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { resolveConfigPath } from "../config/env.ts";
import { writeFileAtomic } from "../generation/file-writer.ts";
import { runLint } from "../lint/engine.ts";
import type { LintIssue, RuleSeverity } from "../lint/types.ts";

// ============================================================================
// Error Types
// ============================================================================

export class ProposeError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "ProposeError";
  }
}

// ============================================================================
// Types
// ============================================================================

export interface ProposeOptions {
  cwd?: string;
  config?: string;
  from?: string;
  output?: string;
  strategy?: "conservative" | "balanced" | "aggressive";
  include?: string[];
  exclude?: string[];
  maxChanges?: number;
  dryRun?: boolean;
  json?: boolean;
  quiet?: boolean;
}

export type MigrationAction =
  | { type: "replace"; from: string; to: string }
  | { type: "extract"; pattern: string; utilityName: string }
  | { type: "tokenize"; value: string; tokenName: string }
  | { type: "remove"; className: string };

export interface MigrationStep {
  id: string;
  file: string;
  line: number;
  column: number;
  ruleId: string;
  severity: "error" | "warn" | "info";
  action: MigrationAction;
  confidence: number;
  preview: {
    before: string;
    after: string;
  };
  dependencies?: string[];
}

export interface MigrationPlan {
  version: 1;
  createdAt: string;
  strategy: "conservative" | "balanced" | "aggressive";
  config: {
    include?: string[];
    exclude?: string[];
    maxChanges?: number;
  };
  steps: MigrationStep[];
  summary: {
    totalViolations: number;
    addressableViolations: number;
    filesAffected: number;
    byRule: Record<string, number>;
    bySeverity: {
      error: number;
      warn: number;
      info: number;
    };
  };
}

export interface ProposeReport {
  kind: "propose";
  planPath: string;
  plan: MigrationPlan;
}

// ============================================================================
// Strategy Thresholds
// ============================================================================

interface StrategyConfig {
  minConfidence: number;
  severities: Set<Exclude<RuleSeverity, "off">>;
}

const STRATEGY_CONFIGS: Record<ProposeOptions["strategy"] & string, StrategyConfig> = {
  conservative: {
    minConfidence: 0.9,
    severities: new Set(["error"]),
  },
  balanced: {
    minConfidence: 0.7,
    severities: new Set(["error", "warn"]),
  },
  aggressive: {
    minConfidence: 0.5,
    severities: new Set(["error", "warn", "info"]),
  },
};

// ============================================================================
// Rule-to-Action Mapping
// ============================================================================

/**
 * Determine migration action based on rule ID and violation details.
 * Returns null for info-only rules with no auto-fix.
 */
function determineAction(issue: LintIssue): MigrationAction | null {
  const { ruleKey, className } = issue;

  switch (ruleKey) {
    case "no-raw-palette": {
      // Replace palette color with semantic token
      const token = suggestSemanticToken(className ?? "");
      return {
        type: "replace",
        from: className ?? "",
        to: token,
      };
    }

    case "no-arbitrary-colors": {
      // Tokenize arbitrary color to new token
      const tokenName = generateTokenName(className ?? "", "color");
      return {
        type: "tokenize",
        value: className ?? "",
        tokenName,
      };
    }

    case "no-arbitrary-values": {
      // Replace arbitrary value with scale value
      const scaleValue = suggestScaleValue(className ?? "");
      return {
        type: "replace",
        from: className ?? "",
        to: scaleValue,
      };
    }

    case "numeric-spacing-in-component": {
      // Replace numeric spacing with token reference
      const tokenRef = suggestSpacingToken(className ?? "");
      return {
        type: "replace",
        from: className ?? "",
        to: tokenRef,
      };
    }

    case "no-inline-color": {
      // Tokenize inline color to new token
      // Extract the color value from note (format: "Found: prop: value\n...")
      const colorValue = extractInlineColorValue(issue.note) ?? className ?? "";
      const tokenName = generateTokenName(colorValue, "inline-color");
      return {
        type: "tokenize",
        value: colorValue,
        tokenName,
      };
    }

    case "extract-repeated-classes": {
      // Extract repeated pattern to @utility
      const utilityName = generateUtilityName(className ?? "");
      return {
        type: "extract",
        pattern: className ?? "",
        utilityName,
      };
    }

    // Info-only rules with no auto-fix
    case "missing-semantic-comment":
    case "component-complexity":
    case "non-literal-classname":
    case "parse-error":
      return null;

    default:
      return null;
  }
}

/**
 * Calculate confidence score for a migration action.
 */
function calculateConfidence(issue: LintIssue, action: MigrationAction): number {
  let confidence: number;

  // Base confidence by action type
  switch (action.type) {
    case "replace":
      // Higher confidence if we're replacing with a known token
      confidence = action.to.includes("--") ? 0.95 : 0.85;
      break;
    case "tokenize":
      confidence = 0.7;
      break;
    case "extract":
      confidence = 0.65;
      break;
    case "remove":
      confidence = 0.9;
      break;
    default:
      confidence = 0.5;
  }

  // Adjust based on context
  if (issue.className?.includes("?") || issue.className?.includes(":")) {
    // Conditional className - reduce confidence
    confidence -= 0.2;
  }

  if (issue.className && issue.className.split(" ").length > 3) {
    // Complex expression - reduce confidence
    confidence -= 0.1;
  }

  // Clamp to valid range
  return Math.max(0, Math.min(1, confidence));
}

// ============================================================================
// Suggestion Helpers
// ============================================================================

/**
 * Extract inline color value from note field.
 * Note format: "Found: prop: value\nUse: ..."
 */
function extractInlineColorValue(note?: string): string | undefined {
  if (!note) return undefined;

  // Match "Found: property: value" pattern
  const match = note.match(/^Found:\s*[\w-]+:\s*(.+?)(?:\n|$)/);
  if (match?.[1]) {
    return match[1].trim();
  }

  return undefined;
}

/**
 * Suggest semantic token based on palette color class.
 */
function suggestSemanticToken(className: string): string {
  // Extract the color from className like "bg-blue-500" or "bg-blue-500/50"
  const match = className.match(/^(bg|text|border|ring|fill|stroke)-(\w+)-(\d+)(?:\/(\d+))?$/);
  if (!match) {
    return `var(--${className.replace(/[^a-z0-9-]/gi, "-")})`;
  }

  const [, prefix, color, shade, opacity] = match;
  // Suggest semantic token based on common patterns
  const semanticMap: Record<string, string> = {
    "blue-500": "primary",
    "blue-600": "primary-dark",
    "gray-100": "muted",
    "gray-500": "muted-foreground",
    "red-500": "destructive",
    "green-500": "success",
    "yellow-500": "warning",
  };

  const semantic = semanticMap[`${color}-${shade}`] ?? `${color}-${shade}`;
  // Preserve opacity suffix if present
  const opacitySuffix = opacity ? `/${opacity}` : "";
  return `${prefix}-(--${semantic})${opacitySuffix}`;
}

/**
 * Generate a token name for arbitrary values.
 */
function generateTokenName(value: string, prefix: string): string {
  // Extract value from arbitrary syntax like "bg-[#ff0000]"
  const arbitraryMatch = value.match(/\[([^\]]+)\]/);
  const rawValue = arbitraryMatch ? arbitraryMatch[1] : value;

  // Clean up the value for use as a token name
  const cleaned = (rawValue ?? value)
    .replace(/^#/, "")
    .replace(/[^a-z0-9]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return `--${prefix}-${cleaned || "custom"}`;
}

/**
 * Suggest scale value for arbitrary value.
 */
function suggestScaleValue(className: string): string {
  // Extract the property and arbitrary value
  const match = className.match(/^([\w-]+)-\[([^\]]+)\]$/);
  if (!match) {
    return className;
  }

  const [, property, value] = match;

  // Common arbitrary-to-scale mappings
  const scaleMap: Record<string, Record<string, string>> = {
    p: { "4px": "1", "8px": "2", "12px": "3", "16px": "4", "24px": "6", "32px": "8" },
    m: { "4px": "1", "8px": "2", "12px": "3", "16px": "4", "24px": "6", "32px": "8" },
    gap: { "4px": "1", "8px": "2", "12px": "3", "16px": "4", "24px": "6", "32px": "8" },
    w: { "100%": "full", "50%": "1/2", "33.333%": "1/3" },
    h: { "100%": "full", "50%": "1/2" },
  };

  const propScales = scaleMap[property ?? ""];
  if (propScales && value && propScales[value]) {
    return `${property}-${propScales[value]}`;
  }

  // Try to extract numeric value and suggest closest scale
  const numMatch = value?.match(/^(\d+(?:\.\d+)?)(px|rem|em)?$/);
  if (numMatch) {
    const num = Number.parseFloat(numMatch[1] ?? "0");
    const unit = numMatch[2] ?? "px";

    // Convert to Tailwind scale (assuming 4px base)
    let scaleValue: number;
    if (unit === "rem") {
      scaleValue = Math.round(num * 4);
    } else if (unit === "em") {
      scaleValue = Math.round(num * 4);
    } else {
      scaleValue = Math.round(num / 4);
    }

    if (scaleValue > 0 && scaleValue <= 96) {
      return `${property}-${scaleValue}`;
    }
  }

  // Return token reference as fallback
  return `${property}-(--spacing-custom)`;
}

/**
 * Suggest spacing token for numeric spacing class.
 */
function suggestSpacingToken(className: string): string {
  // Extract property and numeric value like "p-4" or "gap-8"
  const match = className.match(/^(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|space-[xy])-(\d+)$/);
  if (!match) {
    return className;
  }

  const [, property, value] = match;
  // Suggest semantic spacing token
  const semanticMap: Record<string, string> = {
    "1": "xs",
    "2": "sm",
    "3": "sm",
    "4": "md",
    "5": "md",
    "6": "lg",
    "8": "lg",
    "10": "xl",
    "12": "xl",
    "16": "2xl",
  };

  const semantic = semanticMap[value ?? ""] ?? value;
  return `${property}-(--spacing-${semantic})`;
}

/**
 * Generate utility name from repeated pattern.
 */
function generateUtilityName(pattern: string): string {
  // Parse the pattern to generate a meaningful name
  const classes = pattern.split(/\s+/).filter(Boolean);

  // Look for common patterns
  const hasLayout = classes.some((c) => /^(flex|grid|block|inline)/.test(c));
  const hasText = classes.some((c) => /^(text-|font-)/.test(c));
  const hasSpacing = classes.some((c) => /^(p|m|gap)-/.test(c));
  const hasBg = classes.some((c) => /^bg-/.test(c));
  const hasBorder = classes.some((c) => /^(border|rounded)/.test(c));

  const parts: string[] = [];
  if (hasLayout) parts.push("layout");
  if (hasText) parts.push("text");
  if (hasSpacing) parts.push("spacing");
  if (hasBg) parts.push("surface");
  if (hasBorder) parts.push("bordered");

  if (parts.length === 0) {
    parts.push("utility");
  }

  return `@apply-${parts.join("-")}`;
}

// ============================================================================
// Violation Gathering
// ============================================================================

interface GatherResult {
  issues: LintIssue[];
  source: "check" | "file" | "stdin";
}

/**
 * Gather violations from the specified source.
 */
async function gatherViolations(options: ProposeOptions): Promise<GatherResult> {
  const cwd = options.cwd ?? process.cwd();
  const from = options.from ?? "check";

  if (from === "check") {
    // Run fresh lint check
    // Note: This only includes violations from runLint, not the extra
    // extract-repeated-classes violations that `north check` adds via
    // queryRepeatedPatterns. For complete coverage including repeated patterns,
    // pipe check output: `north check --json | north propose --from stdin`
    const { report } = await runLint({
      cwd,
      configPath: options.config,
    });

    return {
      issues: report.issues,
      source: "check",
    };
  }

  if (from === "stdin") {
    // Read from stdin
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.from(chunk as ArrayBuffer));
    }
    const input = Buffer.concat(chunks).toString("utf-8");

    try {
      const parsed = JSON.parse(input) as { violations?: LintIssue[] };
      const issues = parsed.violations ?? [];
      return {
        issues,
        source: "stdin",
      };
    } catch (error) {
      throw new ProposeError(
        `Failed to parse stdin as JSON: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  // Read from file
  const filePath = resolve(cwd, from);
  try {
    const content = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(content) as { violations?: LintIssue[] };
    const issues = parsed.violations ?? [];
    return {
      issues,
      source: "file",
    };
  } catch (error) {
    throw new ProposeError(`Could not read violations from: ${filePath}`, error);
  }
}

// ============================================================================
// Violation Filtering
// ============================================================================

/**
 * Filter violations based on include/exclude rules and max changes.
 */
function filterViolations(issues: LintIssue[], options: ProposeOptions): LintIssue[] {
  let filtered = issues;

  // Apply include filter
  if (options.include && options.include.length > 0) {
    const includeSet = new Set(options.include);
    filtered = filtered.filter((issue) => includeSet.has(issue.ruleKey));
  }

  // Apply exclude filter
  if (options.exclude && options.exclude.length > 0) {
    const excludeSet = new Set(options.exclude);
    filtered = filtered.filter((issue) => !excludeSet.has(issue.ruleKey));
  }

  // Apply max changes per file
  if (options.maxChanges !== undefined && options.maxChanges > 0) {
    const byFile = new Map<string, LintIssue[]>();
    for (const issue of filtered) {
      const fileIssues = byFile.get(issue.filePath) ?? [];
      fileIssues.push(issue);
      byFile.set(issue.filePath, fileIssues);
    }

    filtered = [];
    for (const [, fileIssues] of byFile) {
      // Sort by severity (error > warn > info), then take top N
      const sorted = [...fileIssues].sort((a, b) => {
        const severityOrder = { error: 0, warn: 1, info: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      });
      filtered.push(...sorted.slice(0, options.maxChanges));
    }
  }

  return filtered;
}

// ============================================================================
// Step Generation
// ============================================================================

/**
 * Convert a lint issue to a migration step.
 * Returns null if the issue is not addressable.
 */
function issueToStep(issue: LintIssue, index: number): MigrationStep | null {
  const action = determineAction(issue);
  if (!action) {
    return null;
  }

  const confidence = calculateConfidence(issue, action);
  const preview = generatePreview(issue, action);

  return {
    id: `step-${String(index + 1).padStart(3, "0")}`,
    file: issue.filePath,
    line: issue.line,
    column: issue.column,
    ruleId: issue.ruleId,
    severity: issue.severity,
    action,
    confidence,
    preview,
  };
}

/**
 * Generate before/after preview for a step.
 */
function generatePreview(
  issue: LintIssue,
  action: MigrationAction
): { before: string; after: string } {
  const className = issue.className ?? "";

  switch (action.type) {
    case "replace":
      return {
        before: className,
        after: action.to,
      };

    case "tokenize":
      return {
        before: className,
        after: `/* Define: ${action.tokenName}: ${action.value} */ ${action.tokenName.replace(/^--/, "")}`,
      };

    case "extract":
      return {
        before: action.pattern,
        after: action.utilityName,
      };

    case "remove":
      return {
        before: action.className,
        after: "/* removed */",
      };
  }
}

/**
 * Apply strategy filter to steps.
 */
function applyStrategyFilter(
  steps: MigrationStep[],
  strategy: ProposeOptions["strategy"]
): MigrationStep[] {
  const config = STRATEGY_CONFIGS[strategy ?? "balanced"];

  return steps.filter((step) => {
    // Filter by confidence threshold
    if (step.confidence < config.minConfidence) {
      return false;
    }

    // Filter by severity
    if (!config.severities.has(step.severity)) {
      return false;
    }

    return true;
  });
}

/**
 * Build dependency graph between steps.
 * Extract/tokenize steps must precede replacement steps that use the new tokens.
 */
function buildDependencies(steps: MigrationStep[]): MigrationStep[] {
  const tokenDefinitions = new Map<string, string>(); // tokenName -> stepId

  // First pass: collect token definitions from tokenize steps
  for (const step of steps) {
    if (step.action.type === "tokenize") {
      tokenDefinitions.set(step.action.tokenName, step.id);
    }
  }

  // Second pass: add dependencies to steps that reference tokens
  return steps.map((step) => {
    if (step.action.type === "replace") {
      const dependencies: string[] = [];

      // Check if the replacement target references any defined tokens
      for (const [tokenName, defStepId] of tokenDefinitions) {
        if (step.action.to.includes(tokenName)) {
          dependencies.push(defStepId);
        }
      }

      if (dependencies.length > 0) {
        return { ...step, dependencies };
      }
    }

    return step;
  });
}

// ============================================================================
// Summary Generation
// ============================================================================

interface SummaryStats {
  totalViolations: number;
  addressableViolations: number;
  filesAffected: number;
  byRule: Record<string, number>;
  bySeverity: {
    error: number;
    warn: number;
    info: number;
  };
}

/**
 * Generate summary statistics from violations and steps.
 */
function generateSummary(allIssues: LintIssue[], steps: MigrationStep[]): SummaryStats {
  const filesAffected = new Set(steps.map((s) => s.file)).size;

  const byRule: Record<string, number> = {};
  for (const step of steps) {
    const ruleKey = step.ruleId.replace("north/", "");
    byRule[ruleKey] = (byRule[ruleKey] ?? 0) + 1;
  }

  const bySeverity = { error: 0, warn: 0, info: 0 };
  for (const step of steps) {
    bySeverity[step.severity] += 1;
  }

  return {
    totalViolations: allIssues.length,
    addressableViolations: steps.length,
    filesAffected,
    byRule,
    bySeverity,
  };
}

// ============================================================================
// Output Formatting
// ============================================================================

/**
 * Format human-readable output.
 */
function formatOutput(plan: MigrationPlan, planPath: string, source: string): string {
  const lines: string[] = [];

  lines.push("Migration Plan Generated");
  lines.push("");
  lines.push(`Strategy: ${plan.strategy}`);
  lines.push(`Source: ${source === "check" ? "lint check (ran fresh)" : source}`);
  lines.push("");
  lines.push("Summary:");
  lines.push(`  Total violations: ${plan.summary.totalViolations}`);

  const pct =
    plan.summary.totalViolations > 0
      ? Math.round((plan.summary.addressableViolations / plan.summary.totalViolations) * 100)
      : 0;
  lines.push(`  Addressable: ${plan.summary.addressableViolations} (${pct}%)`);
  lines.push(`  Files affected: ${plan.summary.filesAffected}`);
  lines.push("");

  if (Object.keys(plan.summary.byRule).length > 0) {
    lines.push("By Rule:");
    for (const [rule, count] of Object.entries(plan.summary.byRule).sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${rule}: ${count}`);
    }
    lines.push("");
  }

  lines.push("By Severity:");
  lines.push(`  error: ${plan.summary.bySeverity.error}`);
  lines.push(`  warn: ${plan.summary.bySeverity.warn}`);
  lines.push(`  info: ${plan.summary.bySeverity.info}`);
  lines.push("");

  lines.push(`Plan written to: ${planPath}`);
  lines.push("");
  lines.push("Next steps:");
  lines.push(`  1. Review plan: cat ${planPath} | jq .`);
  lines.push("  2. Preview changes: north migrate --dry-run");
  lines.push("  3. Apply changes: north migrate --apply");

  return lines.join("\n");
}

// ============================================================================
// Main Command
// ============================================================================

export async function propose(options: ProposeOptions = {}): Promise<ProposeReport> {
  const cwd = options.cwd ?? process.cwd();
  const strategy = options.strategy ?? "balanced";
  const outputPath = options.output ?? ".north/state/migration-plan.json";

  // Verify config exists
  const configPath = await resolveConfigPath(cwd, options.config);
  if (!configPath) {
    throw new ProposeError("Run 'north init' first");
  }

  // 1. Gather violations
  const { issues: allIssues, source } = await gatherViolations(options);

  // Handle no violations case
  if (allIssues.length === 0) {
    const emptyPlan: MigrationPlan = {
      version: 1,
      createdAt: new Date().toISOString(),
      strategy,
      config: {
        include: options.include,
        exclude: options.exclude,
        maxChanges: options.maxChanges,
      },
      steps: [],
      summary: {
        totalViolations: 0,
        addressableViolations: 0,
        filesAffected: 0,
        byRule: {},
        bySeverity: { error: 0, warn: 0, info: 0 },
      },
    };

    const planPath = resolve(cwd, outputPath);

    if (!options.dryRun && !options.json) {
      await writeFileAtomic(planPath, JSON.stringify(emptyPlan, null, 2));
    }

    if (!options.quiet) {
      if (options.json) {
        console.log(JSON.stringify({ kind: "propose", planPath, plan: emptyPlan }, null, 2));
      } else {
        console.log("No violations found. Codebase is compliant!");
      }
    }

    return { kind: "propose", planPath, plan: emptyPlan };
  }

  // 2. Filter violations
  const filteredIssues = filterViolations(allIssues, options);

  // Handle all violations filtered case
  if (filteredIssues.length === 0) {
    const emptyPlan: MigrationPlan = {
      version: 1,
      createdAt: new Date().toISOString(),
      strategy,
      config: {
        include: options.include,
        exclude: options.exclude,
        maxChanges: options.maxChanges,
      },
      steps: [],
      summary: {
        totalViolations: allIssues.length,
        addressableViolations: 0,
        filesAffected: 0,
        byRule: {},
        bySeverity: { error: 0, warn: 0, info: 0 },
      },
    };

    const planPath = resolve(cwd, outputPath);

    if (!options.dryRun && !options.json) {
      await writeFileAtomic(planPath, JSON.stringify(emptyPlan, null, 2));
    }

    if (!options.quiet) {
      if (options.json) {
        console.log(JSON.stringify({ kind: "propose", planPath, plan: emptyPlan }, null, 2));
      } else {
        console.log("No violations match the specified filters");
      }
    }

    return { kind: "propose", planPath, plan: emptyPlan };
  }

  // 3. Convert violations to steps
  let stepIndex = 0;
  const rawSteps: MigrationStep[] = [];
  for (const issue of filteredIssues) {
    const step = issueToStep(issue, stepIndex);
    if (step) {
      rawSteps.push(step);
      stepIndex += 1;
    }
  }

  // 4. Apply strategy filter
  const filteredSteps = applyStrategyFilter(rawSteps, strategy);

  // 5. Re-index steps after filtering
  const indexedSteps = filteredSteps.map((step, idx) => ({
    ...step,
    id: `step-${String(idx + 1).padStart(3, "0")}`,
  }));

  // 6. Build dependency graph
  const stepsWithDeps = buildDependencies(indexedSteps);

  // 7. Generate summary
  const summary = generateSummary(allIssues, stepsWithDeps);

  // 8. Build plan
  const plan: MigrationPlan = {
    version: 1,
    createdAt: new Date().toISOString(),
    strategy,
    config: {
      include: options.include,
      exclude: options.exclude,
      maxChanges: options.maxChanges,
    },
    steps: stepsWithDeps,
    summary,
  };

  const planPath = resolve(cwd, outputPath);

  // 9. Write plan file (unless dry-run or JSON output)
  if (!options.dryRun && !options.json) {
    await writeFileAtomic(planPath, JSON.stringify(plan, null, 2));
  }

  // 10. Output
  if (!options.quiet) {
    if (options.json) {
      console.log(JSON.stringify({ kind: "propose", planPath, plan }, null, 2));
    } else {
      console.log(formatOutput(plan, planPath, source));
    }
  }

  return { kind: "propose", planPath, plan };
}
