import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { glob } from "glob";
import { minimatch } from "minimatch";
import { resolveConfigPath, resolveNorthPaths } from "../config/env.ts";
import { loadConfig } from "../config/loader.ts";
import type { NorthConfig } from "../config/schema.ts";
import {
  isArbitraryColorUtility,
  isArbitraryValueViolation,
} from "../lib/utility-classification.ts";
import { isIssueCoveredByDeviation, parseCandidates, parseDeviations } from "./comments.ts";
import { getContext } from "./context.ts";
import { extractClassTokens, extractComponentDefinitions } from "./extract.ts";
import { getIgnorePatterns } from "./ignores.ts";
import { loadRules } from "./rules.ts";
import { aggregateDeviations } from "./tracking.ts";
import type {
  Candidate,
  ClassToken,
  Deviation,
  ExtractionResult,
  LintIssue,
  LintReport,
  LintStats,
  LintSummary,
  LoadedRule,
  RuleSeverity,
} from "./types.ts";

// ============================================================================
// Lint Engine
// ============================================================================

export class LintError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "LintError";
  }
}

interface LintOptions {
  cwd?: string;
  configPath?: string;
  files?: string[];
  collectIssues?: boolean;
}

interface LintRun {
  report: LintReport;
  configPath: string;
}

function createSummary(issues: LintIssue[]): LintSummary {
  return issues.reduce<LintSummary>(
    (acc, issue) => {
      if (issue.severity === "error") {
        acc.errors += 1;
      } else if (issue.severity === "warn") {
        acc.warnings += 1;
      } else {
        acc.info += 1;
      }

      return acc;
    },
    { errors: 0, warnings: 0, info: 0 }
  );
}

function adjustSeverityForContext(
  ruleKey: string,
  severity: RuleSeverity,
  context: ClassToken["context"]
): RuleSeverity {
  if (severity === "off") {
    return "off";
  }

  if (ruleKey === "no-arbitrary-values" && context === "layout" && severity === "error") {
    return "warn";
  }

  // numeric-spacing-in-component: off in layout, error in primitive, warn (default) in composed
  if (ruleKey === "numeric-spacing-in-component") {
    if (context === "layout") {
      return "off";
    }
    if (context === "primitive") {
      return "error";
    }
    // composed context keeps default (warn)
  }

  return severity;
}

interface BuiltinRuleConfig {
  level: RuleSeverity;
  options: Record<string, unknown>;
}

/**
 * Resolve configuration for built-in rules (not loaded from YAML files).
 * Returns the configured level and any rule-specific options.
 */
function resolveBuiltinRuleConfig(
  config: NorthConfig,
  ruleKey: string,
  defaultLevel: RuleSeverity
): BuiltinRuleConfig {
  const rulesConfig = config.rules;
  if (!rulesConfig) {
    return { level: defaultLevel, options: {} };
  }

  const value = rulesConfig[ruleKey as keyof typeof rulesConfig];
  if (!value) {
    return { level: defaultLevel, options: {} };
  }

  // Handle string level (e.g., "off", "warn", "error")
  if (typeof value === "string") {
    return { level: value as RuleSeverity, options: {} };
  }

  // Handle object config (e.g., { level: "warn", "max-classes": 10 })
  if (typeof value === "object") {
    const level = "level" in value && value.level ? (value.level as RuleSeverity) : defaultLevel;
    const { level: _level, ignore: _ignore, ...options } = value as Record<string, unknown>;
    return { level, options };
  }

  return { level: defaultLevel, options: {} };
}

function isFileIgnoredForRule(rule: LoadedRule, filePath: string): boolean {
  if (!rule.ignore || rule.ignore.length === 0) {
    return false;
  }
  // Normalize Windows backslashes to forward slashes for cross-platform pattern matching
  const normalizedPath = filePath.replace(/\\/g, "/");
  return rule.ignore.some((pattern) => minimatch(normalizedPath, pattern));
}

function evaluateRule(rule: LoadedRule, token: ClassToken): LintIssue | null {
  // Check rule-level file ignores first
  if (isFileIgnoredForRule(rule, token.filePath)) {
    return null;
  }

  const severity = adjustSeverityForContext(rule.key, rule.severity, token.context);
  if (severity === "off") {
    return null;
  }

  if (rule.key === "no-arbitrary-values") {
    if (isArbitraryColorUtility(token.value)) {
      return null;
    }

    if (!isArbitraryValueViolation(token.value)) {
      return null;
    }

    return {
      ruleId: rule.id,
      ruleKey: rule.key,
      severity,
      message: rule.message,
      filePath: token.filePath,
      line: token.line,
      column: token.column,
      className: token.value,
      note: rule.note,
      context: token.context,
    };
  }

  if (rule.regex?.test(token.value)) {
    return {
      ruleId: rule.id,
      ruleKey: rule.key,
      severity,
      message: rule.message,
      filePath: token.filePath,
      line: token.line,
      column: token.column,
      className: token.value,
      note: rule.note,
      context: token.context,
    };
  }

  return null;
}

function computeStats(results: ExtractionResult[], totalFiles: number): LintStats {
  const filesWithClasses = results.filter((result) => result.tokens.length > 0).length;
  const filesWithNonLiteral = results.filter((result) => result.nonLiteralSites.length > 0).length;
  const extractedClassCount = results.reduce((acc, result) => acc + result.tokens.length, 0);
  const classSites = results.reduce((acc, result) => acc + result.classSites, 0);
  const coveragePercent =
    totalFiles === 0 ? 100 : Math.round((filesWithClasses / totalFiles) * 100);

  return {
    totalFiles,
    filesWithClasses,
    filesWithNonLiteral,
    extractedClassCount,
    classSites,
    coveragePercent,
  };
}

function sortIssues(issues: LintIssue[]): LintIssue[] {
  return [...issues].sort((a, b) => {
    if (a.filePath !== b.filePath) {
      return a.filePath.localeCompare(b.filePath);
    }
    if (a.line !== b.line) {
      return a.line - b.line;
    }
    return a.column - b.column;
  });
}

async function loadProjectConfig(cwd: string, configOverride?: string) {
  const configPath = await resolveConfigPath(cwd, configOverride);
  if (!configPath) {
    throw new LintError("Config file not found. Run 'north init' to initialize.");
  }

  const result = await loadConfig(configPath);
  if (!result.success) {
    throw new LintError(result.error.message, result.error);
  }

  const paths = resolveNorthPaths(configPath, cwd);

  return { config: result.config, configPath, paths };
}

async function listFiles(
  rootDir: string,
  config: NorthConfig,
  fileOverrides?: string[]
): Promise<string[]> {
  if (fileOverrides && fileOverrides.length > 0) {
    return fileOverrides.map((file) => (isAbsolute(file) ? file : resolve(rootDir, file)));
  }

  const ignorePatterns = getIgnorePatterns(config);
  const files = await glob("**/*.{tsx,jsx}", {
    cwd: rootDir,
    absolute: true,
    nodir: true,
    ignore: ignorePatterns,
  });

  return files;
}

function buildNonLiteralIssues(sites: ExtractionResult["nonLiteralSites"]): LintIssue[] {
  return sites.map((site) => ({
    ruleId: "north/non-literal-classname",
    ruleKey: "non-literal-classname",
    severity: "warn",
    message: "className contains non-literal values; lint coverage reduced",
    filePath: site.filePath,
    line: site.line,
    column: site.column,
    context: site.context,
  }));
}

// Color properties that should not have literal values in inline styles
const COLOR_PROPERTIES = [
  "color",
  "backgroundColor",
  "borderColor",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "outlineColor",
  "fill",
  "stroke",
];

// Pattern to match color literals (hex, rgb, rgba, hsl, hsla, named colors, oklch, lab, lch)
const COLOR_LITERAL_PATTERN =
  /(['"])(#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|rgba\([^)]+\)|hsl\([^)]+\)|hsla\([^)]+\)|oklch\([^)]+\)|lab\([^)]+\)|lch\([^)]+\)|red|blue|green|yellow|orange|purple|pink|cyan|magenta|black|white|gray|grey)\1/i;

/**
 * Scan source code for inline style attributes with literal color values.
 * Returns issues for each violation of the no-inline-color rule.
 */
// Class count thresholds by context for component-complexity rule
const COMPLEXITY_THRESHOLDS: Record<string, number> = {
  primitive: 10,
  composed: 15,
  layout: 20,
};

/**
 * Evaluate component complexity based on class count at each site.
 * Returns issues for sites exceeding context-specific thresholds.
 */
function evaluateComponentComplexity(
  sites: ExtractionResult["sites"],
  filePath: string,
  config: NorthConfig
): LintIssue[] {
  const ruleConfig = resolveBuiltinRuleConfig(config, "component-complexity", "warn");

  // Skip if rule is disabled
  if (ruleConfig.level === "off") {
    return [];
  }

  const issues: LintIssue[] = [];

  // Use configured max-classes if provided, otherwise use context-specific defaults
  const configuredMaxClasses =
    typeof ruleConfig.options["max-classes"] === "number"
      ? ruleConfig.options["max-classes"]
      : null;

  for (const site of sites) {
    // Config max-classes overrides context-specific thresholds
    const threshold = configuredMaxClasses ?? COMPLEXITY_THRESHOLDS[site.context] ?? 15;
    const classCount = site.classes.length;

    if (classCount > threshold) {
      issues.push({
        ruleId: "north/component-complexity",
        ruleKey: "component-complexity",
        severity: ruleConfig.level as Exclude<RuleSeverity, "off">,
        message: `className has ${classCount} classes, exceeds ${site.context} threshold of ${threshold}`,
        filePath,
        line: site.line,
        column: site.column,
        context: site.context,
        note: "Consider extracting repeated patterns to utility functions or using cva() variants.",
      });
    }
  }

  return issues;
}

/**
 * Evaluate exported components for missing @north-role semantic comments.
 * Only applies to composed context (not primitives or layouts).
 */
function evaluateMissingSemanticComment(
  source: string,
  filePath: string,
  context: string
): LintIssue[] {
  // Only apply to composed context
  if (context !== "composed") {
    return [];
  }

  const issues: LintIssue[] = [];
  const components = extractComponentDefinitions(source, filePath);

  for (const component of components) {
    if (!component.hasNorthRoleComment) {
      issues.push({
        ruleId: "north/missing-semantic-comment",
        ruleKey: "missing-semantic-comment",
        severity: "info",
        message: `Exported component "${component.name}" should have @north-role JSDoc annotation`,
        filePath,
        line: component.line,
        column: component.column,
        note: "Add a JSDoc comment with @north-role to document the component's purpose.",
      });
    }
  }

  return issues;
}

function scanInlineColorStyles(source: string, filePath: string, config: NorthConfig): LintIssue[] {
  const ruleConfig = resolveBuiltinRuleConfig(config, "no-inline-color", "error");

  // Skip if rule is disabled
  if (ruleConfig.level === "off") {
    return [];
  }

  const issues: LintIssue[] = [];

  // Match style={{ ... }} patterns
  const stylePattern = /style\s*=\s*\{\s*\{([^}]*)\}\s*\}/g;

  for (const match of source.matchAll(stylePattern)) {
    const styleContent = match[1] ?? "";
    const styleStartIndex = match.index ?? 0;
    const styleLine = source.slice(0, styleStartIndex).split("\n").length;

    // Check each color property
    for (const prop of COLOR_PROPERTIES) {
      // Match property: value patterns
      const propPattern = new RegExp(`${prop}\\s*:\\s*([^,}]+)`, "gi");
      for (const propMatch of styleContent.matchAll(propPattern)) {
        const value = propMatch[1]?.trim() ?? "";

        // Skip if value is a CSS variable
        if (value.includes("var(--")) {
          continue;
        }

        // Check if value contains a color literal
        if (COLOR_LITERAL_PATTERN.test(value)) {
          issues.push({
            ruleId: "north/no-inline-color",
            ruleKey: "no-inline-color",
            severity: ruleConfig.level as Exclude<RuleSeverity, "off">,
            message: `Use CSS variables instead of inline color literal for ${prop}`,
            filePath,
            line: styleLine,
            column: 1,
            note: `Found: ${prop}: ${value}\nUse: ${prop}: 'var(--your-token)' or a Tailwind class instead`,
          });
        }
      }
    }
  }

  return issues;
}

export async function runLint(options: LintOptions = {}): Promise<LintRun> {
  const cwd = options.cwd ?? process.cwd();
  const { config, configPath, paths } = await loadProjectConfig(cwd, options.configPath);

  const rulesDir = resolve(configPath, "..", "rules");
  const rules = await loadRules(rulesDir, config);

  const files = await listFiles(paths.projectRoot, config, options.files);
  const extractionResults: ExtractionResult[] = [];
  const rawIssues: LintIssue[] = [];
  const allDeviations: Deviation[] = [];
  const allCandidates: Candidate[] = [];

  for (const file of files) {
    const displayPath = relative(paths.projectRoot, file) || file;
    try {
      const source = await readFile(file, "utf-8");
      const extraction = extractClassTokens(source, displayPath, {
        classFunctions: config.lint?.classFunctions,
      });

      extractionResults.push(extraction);

      // Parse deviations from this file
      const fileDeviations = parseDeviations(source, displayPath);
      allDeviations.push(...fileDeviations);

      // Parse candidates from this file
      const fileCandidates = parseCandidates(source, displayPath);
      allCandidates.push(...fileCandidates);

      if (options.collectIssues !== false) {
        for (const token of extraction.tokens) {
          for (const rule of rules) {
            const issue = evaluateRule(rule, token);
            if (issue) {
              rawIssues.push(issue);
            }
          }
        }

        rawIssues.push(...buildNonLiteralIssues(extraction.nonLiteralSites));

        // Scan for inline style color violations
        rawIssues.push(...scanInlineColorStyles(source, displayPath, config));

        // Evaluate component complexity at site level
        rawIssues.push(...evaluateComponentComplexity(extraction.sites, displayPath, config));

        // Check for missing @north-role semantic comments on exported components
        const fileContext = getContext(displayPath, source);
        rawIssues.push(...evaluateMissingSemanticComment(source, displayPath, fileContext));
      }
    } catch (error) {
      rawIssues.push({
        ruleId: "north/parse-error",
        ruleKey: "parse-error",
        severity: "error",
        message: `Failed to parse file: ${error instanceof Error ? error.message : String(error)}`,
        filePath: displayPath,
        line: 1,
        column: 1,
      });
    }
  }

  // Filter out issues covered by deviations
  const issues = rawIssues.filter((issue) => {
    const fileDeviations = allDeviations.filter((d) => d.filePath === issue.filePath);
    return !isIssueCoveredByDeviation(issue.ruleKey, issue.line, fileDeviations);
  });

  // Aggregate deviations for tracking and promotion suggestions
  const deviationAnalysis = aggregateDeviations(allDeviations);

  // Merge suggested candidates from deviation analysis with parsed candidates
  const finalCandidates = [...allCandidates, ...deviationAnalysis.suggestedCandidates];

  const stats = computeStats(extractionResults, files.length);
  const sortedIssues = sortIssues(issues);
  const summary = createSummary(sortedIssues);

  return {
    report: {
      summary,
      issues: sortedIssues,
      stats,
      rules,
      deviations: allDeviations,
      candidates: finalCandidates,
      deviationGroups: deviationAnalysis.groups,
    },
    configPath,
  };
}
