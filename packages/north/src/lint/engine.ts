import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { glob } from "glob";
import { minimatch } from "minimatch";
import { findConfigFile, loadConfig } from "../config/loader.ts";
import type { NorthConfig } from "../config/schema.ts";
import { extractClassTokens } from "./extract.ts";
import { getIgnorePatterns } from "./ignores.ts";
import { loadRules } from "./rules.ts";
import type {
  ClassToken,
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

  return severity;
}

function splitByDelimiter(input: string, delimiter: string): string[] {
  const parts: string[] = [];
  let current = "";
  let bracketDepth = 0;
  let parenDepth = 0;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (char === "[") {
      bracketDepth += 1;
    } else if (char === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
    } else if (char === "(") {
      parenDepth += 1;
    } else if (char === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
    }

    if (char === delimiter && bracketDepth === 0 && parenDepth === 0) {
      parts.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  parts.push(current);
  return parts;
}

function getUtilitySegment(className: string): string {
  const parts = splitByDelimiter(className, ":");
  return parts[parts.length - 1] ?? className;
}

function isArbitraryColorUtility(className: string): boolean {
  const utility = getUtilitySegment(className);
  return /^(bg|text|border|ring|fill|stroke)-\[(#|rgb|rgba|hsl|hsla|oklch|lab|lch)/.test(utility);
}

function isArbitraryValueViolation(className: string): boolean {
  const utility = getUtilitySegment(className);
  if (!utility.includes("[")) {
    return false;
  }

  if (!utility.includes("]")) {
    return false;
  }

  if (utility.includes("var(--")) {
    return false;
  }

  return true;
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
  if (configOverride) {
    const configPath = resolve(cwd, configOverride);
    const result = await loadConfig(configPath);
    if (!result.success) {
      throw new LintError(result.error.message, result.error);
    }

    return { config: result.config, configPath };
  }

  const configPath = await findConfigFile(cwd);
  if (!configPath) {
    throw new LintError("Config file not found. Run 'north init' to initialize.");
  }

  const result = await loadConfig(configPath);
  if (!result.success) {
    throw new LintError(result.error.message, result.error);
  }

  return { config: result.config, configPath };
}

async function listFiles(
  cwd: string,
  config: NorthConfig,
  fileOverrides?: string[]
): Promise<string[]> {
  if (fileOverrides && fileOverrides.length > 0) {
    return fileOverrides.map((file) => (isAbsolute(file) ? file : resolve(cwd, file)));
  }

  const ignorePatterns = getIgnorePatterns(config);
  const files = await glob("**/*.{tsx,jsx}", {
    cwd,
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

export async function runLint(options: LintOptions = {}): Promise<LintRun> {
  const cwd = options.cwd ?? process.cwd();
  const { config, configPath } = await loadProjectConfig(cwd, options.configPath);

  const rulesDir = resolve(configPath, "..", "rules");
  const rules = await loadRules(rulesDir, config);

  const files = await listFiles(cwd, config, options.files);
  const extractionResults: ExtractionResult[] = [];
  const issues: LintIssue[] = [];

  for (const file of files) {
    const displayPath = relative(cwd, file) || file;
    try {
      const source = await readFile(file, "utf-8");
      const extraction = extractClassTokens(source, displayPath, {
        classFunctions: config.lint?.classFunctions,
      });

      extractionResults.push(extraction);

      if (options.collectIssues !== false) {
        for (const token of extraction.tokens) {
          for (const rule of rules) {
            const issue = evaluateRule(rule, token);
            if (issue) {
              issues.push(issue);
            }
          }
        }

        issues.push(...buildNonLiteralIssues(extraction.nonLiteralSites));
      }
    } catch (error) {
      issues.push({
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

  const stats = computeStats(extractionResults, files.length);
  const sortedIssues = sortIssues(issues);
  const summary = createSummary(sortedIssues);

  return {
    report: {
      summary,
      issues: sortedIssues,
      stats,
      rules,
    },
    configPath,
  };
}
