import { relative, resolve } from "node:path";
import chalk from "chalk";
import { type IndexDatabase, openIndexDatabase } from "../index/db.ts";
import { checkIndexFresh, getIndexStatus } from "../index/queries.ts";

// ============================================================================
// Error Types
// ============================================================================

export class FindError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "FindError";
  }
}

// ============================================================================
// Find Command
// ============================================================================

export interface FindOptions {
  cwd?: string;
  config?: string;
  json?: boolean;
  quiet?: boolean;
  colors?: boolean;
  spacing?: boolean;
  patterns?: boolean;
  tokens?: boolean;
  cascade?: string;
  similar?: string;
  threshold?: number;
  limit?: number;
}

export interface FindResult {
  success: boolean;
  message: string;
  error?: Error;
}

interface ClassStat {
  className: string;
  resolvedToken: string | null;
  count: number;
}

interface ColorUsageResult {
  resolved: Array<{ token: string; count: number }>;
  unresolved: Array<{ className: string; count: number }>;
}

interface SpacingUsageResult {
  values: Array<{ value: string; count: number }>;
  utilities: Array<{ utility: string; count: number }>;
  categories: {
    tokenized: number;
    arbitrary: number;
    scale: number;
  };
}

interface TokenUsageResult {
  totalTokens: number;
  usedTokens: number;
  unusedTokens: string[];
  usage: Array<{ token: string; count: number }>;
}

interface PatternResult {
  hash: string;
  classes: string[];
  count: number;
  locations: Array<{ file: string; line: number; component: string | null }>;
}

interface SimilarityResult {
  file: string;
  classSimilarity: number;
  tokenSimilarity: number;
  sharedClasses: string[];
  sharedTokens: string[];
}

interface CascadeResult {
  selector: string;
  className?: string;
  resolvedToken?: string;
  tokenDefinition?: { name: string; value: string; file: string; line: number };
  tokenChain: Array<{ ancestor: string; depth: number; path: string[] }>;
  usages: Array<{ file: string; line: number; column: number; className: string | null }>;
}

const DEFAULT_LIMIT = 10;
const DEFAULT_SIMILARITY_THRESHOLD = 0.8;

const SPACING_PREFIXES = [
  "space-x",
  "space-y",
  "gap-x",
  "gap-y",
  "px",
  "py",
  "pt",
  "pr",
  "pb",
  "pl",
  "mx",
  "my",
  "mt",
  "mr",
  "mb",
  "ml",
  "p",
  "m",
  "gap",
];

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function splitByDelimiter(input: string, delimiter: string): string[] {
  const parts: string[] = [];
  let current = "";
  let bracketDepth = 0;
  let parenDepth = 0;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (!char) {
      continue;
    }

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

function parseSpacingUtility(className: string): { utility: string; value: string } | null {
  const utility = getUtilitySegment(className);
  for (const prefix of SPACING_PREFIXES) {
    if (utility.startsWith(`${prefix}-`)) {
      return {
        utility: prefix,
        value: utility.slice(prefix.length + 1),
      };
    }
  }

  return null;
}

function parseColorUtility(className: string): { utility: string; value: string } | null {
  const utility = getUtilitySegment(className);
  const match = utility.match(/^(bg|text|border|ring|fill|stroke)-(.+)$/);
  if (!match?.[1] || !match?.[2]) {
    return null;
  }

  return { utility: match[1], value: match[2] };
}

function resolveClassToToken(className: string): string | null {
  const utility = getUtilitySegment(className);

  const shorthandMatch = utility.match(/^[A-Za-z-]+-\((--[A-Za-z0-9-_]+)\)$/);
  if (shorthandMatch?.[1]) {
    return shorthandMatch[1];
  }

  const colorMatch = utility.match(
    /^(bg|text|border|ring|fill|stroke)-([A-Za-z0-9-_]+)(?:\/[\d.]+)?$/
  );
  if (colorMatch?.[2]) {
    return `--color-${colorMatch[2]}`;
  }

  return null;
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const item of left) {
    if (right.has(item)) {
      intersection += 1;
    }
  }

  const union = left.size + right.size - intersection;
  if (union === 0) {
    return 0;
  }

  return intersection / union;
}

function clampLimit(limit?: number): number {
  if (!limit || Number.isNaN(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.max(1, Math.floor(limit));
}

function parseThreshold(value?: number): number {
  if (value === undefined || Number.isNaN(value)) {
    return DEFAULT_SIMILARITY_THRESHOLD;
  }

  return Math.min(1, Math.max(0, value));
}

async function openIndex(cwd: string, configOverride?: string): Promise<IndexDatabase> {
  const status = await getIndexStatus(cwd, configOverride);
  if (!status.exists) {
    throw new FindError("Index not found. Run 'north index' to build it.");
  }

  const freshness = await checkIndexFresh(cwd, configOverride);
  if (!freshness.fresh) {
    throw new FindError("Index is stale. Run 'north index' to refresh it.");
  }

  return await openIndexDatabase(status.indexPath);
}

function getClassStats(db: IndexDatabase): ClassStat[] {
  const rows = db
    .prepare(
      "SELECT class_name as className, resolved_token as resolvedToken, COUNT(*) as count FROM usages GROUP BY class_name, resolved_token"
    )
    .all() as Array<{ className: string; resolvedToken: string | null; count: number }>;

  return rows;
}

function getColorTokenSet(db: IndexDatabase): Set<string> {
  const rows = db.prepare("SELECT name FROM tokens WHERE name LIKE '--color-%'").all() as Array<{
    name: string;
  }>;
  return new Set(rows.map((row) => row.name));
}

const RAW_COLOR_VALUES = new Set(["transparent", "current", "black", "white"]);
const PALETTE_VALUE_REGEX = /^[a-z-]+-\d{2,3}$/i;
const VAR_COLOR_TOKEN_REGEX = /var\(\s*(--color-[A-Za-z0-9-_]+)\s*(?:,[^)]+)?\)/i;

function isColorLiteralValue(value: string): boolean {
  if (RAW_COLOR_VALUES.has(value)) {
    return true;
  }

  if (value.startsWith("[")) {
    const inner = value.slice(1, -1).toLowerCase();
    return /#|rgb|rgba|hsl|hsla|oklch|lab|lch|color|var\(--/.test(inner);
  }

  return PALETTE_VALUE_REGEX.test(value);
}

function extractVarColorToken(value: string): string | null {
  const inner = value.startsWith("[") ? value.slice(1, -1) : value;
  const match = inner.match(VAR_COLOR_TOKEN_REGEX);
  return match?.[1] ?? null;
}

function buildColorUsage(classStats: ClassStat[], colorTokens: Set<string>): ColorUsageResult {
  const resolved = new Map<string, number>();
  const unresolved = new Map<string, number>();

  for (const stat of classStats) {
    const token = stat.resolvedToken;
    if (token?.startsWith("--color-")) {
      resolved.set(token, (resolved.get(token) ?? 0) + stat.count);
      continue;
    }

    const colorUtility = parseColorUtility(stat.className);
    if (!colorUtility) {
      continue;
    }

    const varToken = extractVarColorToken(colorUtility.value);
    if (varToken) {
      if (colorTokens.has(varToken)) {
        resolved.set(varToken, (resolved.get(varToken) ?? 0) + stat.count);
        continue;
      }
    }

    const tokenName = `--color-${colorUtility.value}`;
    if (colorTokens.has(tokenName)) {
      continue;
    }

    if (!isColorLiteralValue(colorUtility.value)) {
      continue;
    }

    const utility = `${colorUtility.utility}-${colorUtility.value}`;
    unresolved.set(utility, (unresolved.get(utility) ?? 0) + stat.count);
  }

  const resolvedList = Array.from(resolved.entries())
    .map(([token, count]) => ({ token, count }))
    .sort((a, b) => b.count - a.count || a.token.localeCompare(b.token));
  const unresolvedList = Array.from(unresolved.entries())
    .map(([className, count]) => ({ className, count }))
    .sort((a, b) => b.count - a.count || a.className.localeCompare(b.className));

  return { resolved: resolvedList, unresolved: unresolvedList };
}

function buildSpacingUsage(classStats: ClassStat[]): SpacingUsageResult {
  const values = new Map<string, number>();
  const utilities = new Map<string, number>();
  const categories = { tokenized: 0, arbitrary: 0, scale: 0 };

  for (const stat of classStats) {
    const spacing = parseSpacingUtility(stat.className);
    if (!spacing) {
      continue;
    }

    values.set(spacing.value, (values.get(spacing.value) ?? 0) + stat.count);
    utilities.set(spacing.utility, (utilities.get(spacing.utility) ?? 0) + stat.count);

    if (spacing.value.includes("--")) {
      categories.tokenized += stat.count;
    } else if (spacing.value.includes("[")) {
      categories.arbitrary += stat.count;
    } else {
      categories.scale += stat.count;
    }
  }

  const valuesList = Array.from(values.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

  const utilitiesList = Array.from(utilities.entries())
    .map(([utility, count]) => ({ utility, count }))
    .sort((a, b) => b.count - a.count || a.utility.localeCompare(b.utility));

  return {
    values: valuesList,
    utilities: utilitiesList,
    categories,
  };
}

function buildTokenUsage(db: IndexDatabase): TokenUsageResult {
  const tokens = db.prepare("SELECT name FROM tokens ORDER BY name").all() as Array<{
    name: string;
  }>;

  const usageRows = db
    .prepare(
      "SELECT resolved_token as token, COUNT(*) as count FROM usages WHERE resolved_token IS NOT NULL GROUP BY resolved_token ORDER BY count DESC"
    )
    .all() as Array<{ token: string; count: number }>;

  const used = new Set(usageRows.map((row) => row.token));
  const unusedTokens = tokens.map((row) => row.name).filter((name) => !used.has(name));

  return {
    totalTokens: tokens.length,
    usedTokens: used.size,
    unusedTokens,
    usage: usageRows,
  };
}

function buildPatterns(db: IndexDatabase, limit: number): PatternResult[] {
  const rows = db
    .prepare(
      "SELECT hash, classes, count, locations FROM patterns ORDER BY count DESC, hash ASC LIMIT ?"
    )
    .all(limit) as Array<{
    hash: string;
    classes: string;
    count: number;
    locations: string;
  }>;

  const results: PatternResult[] = [];
  for (const row of rows) {
    let classes: string[] = [];
    let locations: Array<{ file: string; line: number; component: string | null }> = [];

    try {
      classes = JSON.parse(row.classes) as string[];
    } catch {
      classes = [];
    }

    try {
      locations = JSON.parse(row.locations) as Array<{
        file: string;
        line: number;
        component: string | null;
      }>;
    } catch {
      locations = [];
    }

    results.push({
      hash: row.hash,
      classes,
      count: row.count,
      locations,
    });
  }

  return results;
}

function resolveTargetFile(cwd: string, input: string): string {
  const resolved = resolve(cwd, input);
  if (resolved.startsWith(cwd)) {
    return normalizePath(relative(cwd, resolved));
  }

  return normalizePath(input);
}

function buildSimilarity(
  db: IndexDatabase,
  target: string,
  threshold: number,
  limit: number
): { target: string; results: SimilarityResult[] } {
  const rows = db
    .prepare("SELECT file, class_name as className, resolved_token as resolvedToken FROM usages")
    .all() as Array<{ file: string; className: string; resolvedToken: string | null }>;

  const fileMap = new Map<string, { classes: Set<string>; tokens: Set<string> }>();

  for (const row of rows) {
    const file = row.file;
    const entry = fileMap.get(file) ?? { classes: new Set<string>(), tokens: new Set<string>() };
    entry.classes.add(row.className);
    if (row.resolvedToken) {
      entry.tokens.add(row.resolvedToken);
    }
    fileMap.set(file, entry);
  }

  const normalizedTarget = normalizePath(target);
  const targetData = fileMap.get(normalizedTarget);
  if (!targetData) {
    throw new FindError(`No index data found for ${target}.`);
  }

  const results: SimilarityResult[] = [];

  for (const [file, data] of fileMap.entries()) {
    if (file === normalizedTarget) {
      continue;
    }

    const classSimilarity = jaccardSimilarity(targetData.classes, data.classes);
    const tokenSimilarity = jaccardSimilarity(targetData.tokens, data.tokens);

    if (classSimilarity < threshold && tokenSimilarity < threshold) {
      continue;
    }

    const sharedClasses: string[] = [];
    for (const item of targetData.classes) {
      if (data.classes.has(item)) {
        sharedClasses.push(item);
      }
      if (sharedClasses.length >= 10) {
        break;
      }
    }

    const sharedTokens: string[] = [];
    for (const item of targetData.tokens) {
      if (data.tokens.has(item)) {
        sharedTokens.push(item);
      }
      if (sharedTokens.length >= 10) {
        break;
      }
    }

    results.push({
      file,
      classSimilarity,
      tokenSimilarity,
      sharedClasses,
      sharedTokens,
    });
  }

  results.sort((a, b) => {
    const scoreA = Math.max(a.classSimilarity, a.tokenSimilarity);
    const scoreB = Math.max(b.classSimilarity, b.tokenSimilarity);
    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }
    return a.file.localeCompare(b.file);
  });

  return {
    target: normalizedTarget,
    results: results.slice(0, limit),
  };
}

function buildCascade(db: IndexDatabase, selector: string, limit: number): CascadeResult {
  const trimmed = selector.trim();
  const isTokenSelector = trimmed.startsWith("--");
  const className = isTokenSelector
    ? undefined
    : trimmed.startsWith(".")
      ? trimmed.slice(1)
      : trimmed;
  let resolvedToken: string | undefined;

  if (isTokenSelector) {
    resolvedToken = trimmed;
  } else if (className) {
    resolvedToken = resolveClassToToken(className) ?? undefined;
  }

  const classLookup = className;

  let tokenDefinition: CascadeResult["tokenDefinition"];
  if (resolvedToken) {
    const tokenRow = db
      .prepare("SELECT name, value, file, line FROM tokens WHERE name = ?")
      .get(resolvedToken) as
      | { name: string; value: string; file: string; line: number }
      | undefined;

    if (tokenRow) {
      tokenDefinition = tokenRow;
    } else {
      resolvedToken = undefined;
    }
  }

  const chainRows = resolvedToken
    ? (db
        .prepare(
          "SELECT ancestor, depth, path FROM token_graph WHERE descendant = ? ORDER BY depth ASC"
        )
        .all(resolvedToken) as Array<{ ancestor: string; depth: number; path: string }>)
    : [];

  const tokenChain = chainRows.map((row) => {
    let path: string[] = [];
    try {
      path = JSON.parse(row.path) as string[];
    } catch {
      path = [];
    }

    return {
      ancestor: row.ancestor,
      depth: row.depth,
      path,
    };
  });

  const usages: Array<{ file: string; line: number; column: number; className: string | null }> =
    [];

  if (classLookup) {
    const rows = db
      .prepare(
        "SELECT file, line, column, class_name as className FROM usages WHERE class_name = ? ORDER BY file, line"
      )
      .all(classLookup) as Array<{ file: string; line: number; column: number; className: string }>;

    for (const row of rows.slice(0, limit)) {
      usages.push({
        file: row.file,
        line: row.line,
        column: row.column,
        className: row.className,
      });
    }
  }

  if (usages.length === 0 && resolvedToken) {
    const rows = db
      .prepare(
        "SELECT file, line, column, class_name as className FROM usages WHERE resolved_token = ? ORDER BY file, line"
      )
      .all(resolvedToken) as Array<{
      file: string;
      line: number;
      column: number;
      className: string;
    }>;

    for (const row of rows.slice(0, limit)) {
      usages.push({
        file: row.file,
        line: row.line,
        column: row.column,
        className: row.className,
      });
    }
  }

  return {
    selector: trimmed,
    className,
    resolvedToken,
    tokenDefinition,
    tokenChain,
    usages,
  };
}

function formatCountList(items: Array<{ label: string; count: number }>, limit: number): string[] {
  return items.slice(0, limit).map((item) => `  ${item.label}: ${item.count}`);
}

export async function find(options: FindOptions = {}): Promise<FindResult> {
  const cwd = options.cwd ?? process.cwd();
  const quiet = options.quiet ?? false;

  const modes = [
    { key: "colors", active: options.colors === true },
    { key: "spacing", active: options.spacing === true },
    { key: "patterns", active: options.patterns === true },
    { key: "tokens", active: options.tokens === true },
    { key: "cascade", active: Boolean(options.cascade) },
    { key: "similar", active: Boolean(options.similar) },
  ].filter((mode) => mode.active);

  if (modes.length === 0) {
    return {
      success: false,
      message:
        "Select a finder: --colors, --spacing, --patterns, --tokens, --cascade, or --similar",
      error: new FindError("No finder option provided."),
    };
  }

  if (modes.length > 1) {
    return {
      success: false,
      message: "Select only one finder at a time.",
      error: new FindError("Multiple finder options provided."),
    };
  }

  const mode = modes[0]?.key ?? "";

  let db: IndexDatabase | null = null;

  try {
    const indexDb = await openIndex(cwd, options.config);
    db = indexDb;

    if (mode === "colors") {
      const classStats = getClassStats(indexDb);
      const colorTokens = getColorTokenSet(indexDb);
      const result = buildColorUsage(classStats, colorTokens);

      if (options.json) {
        console.log(JSON.stringify({ kind: "colors", ...result }, null, 2));
      } else if (!quiet) {
        console.log(chalk.bold("Color usage\n"));

        if (result.resolved.length === 0) {
          console.log(chalk.dim("No resolved color tokens found."));
        } else {
          console.log(chalk.dim("Resolved tokens:"));
          for (const line of formatCountList(
            result.resolved.map((item) => ({ label: item.token, count: item.count })),
            clampLimit(options.limit)
          )) {
            console.log(line);
          }
        }

        if (result.unresolved.length > 0) {
          console.log(chalk.dim("\nUnresolved color classes:"));
          for (const line of formatCountList(
            result.unresolved.map((item) => ({ label: item.className, count: item.count })),
            clampLimit(options.limit)
          )) {
            console.log(line);
          }
        }
      }

      return { success: true, message: "Color usage reported" };
    }

    if (mode === "spacing") {
      const classStats = getClassStats(indexDb);
      const result = buildSpacingUsage(classStats);

      if (options.json) {
        console.log(JSON.stringify({ kind: "spacing", ...result }, null, 2));
      } else if (!quiet) {
        console.log(chalk.bold("Spacing usage\n"));
        console.log(chalk.dim("Top values:"));
        for (const line of formatCountList(
          result.values.map((item) => ({ label: item.value, count: item.count })),
          clampLimit(options.limit)
        )) {
          console.log(line);
        }

        console.log(chalk.dim("\nUtilities:"));
        for (const line of formatCountList(
          result.utilities.map((item) => ({ label: item.utility, count: item.count })),
          clampLimit(options.limit)
        )) {
          console.log(line);
        }

        console.log(chalk.dim("\nCategories:"));
        console.log(`  tokenized: ${result.categories.tokenized}`);
        console.log(`  scale: ${result.categories.scale}`);
        console.log(`  arbitrary: ${result.categories.arbitrary}`);
      }

      return { success: true, message: "Spacing usage reported" };
    }

    if (mode === "patterns") {
      const limit = clampLimit(options.limit);
      const patterns = buildPatterns(indexDb, limit);

      if (options.json) {
        console.log(JSON.stringify({ kind: "patterns", patterns }, null, 2));
      } else if (!quiet) {
        console.log(chalk.bold("Patterns\n"));

        if (patterns.length === 0) {
          console.log(chalk.dim("No patterns recorded."));
        } else {
          for (const pattern of patterns) {
            console.log(chalk.dim(`${pattern.count}x ${pattern.classes.join(" ")}`));
            const locations = pattern.locations.slice(0, 3);
            for (const location of locations) {
              console.log(chalk.dim(`  - ${location.file}:${location.line}`));
            }
          }
        }
      }

      return { success: true, message: "Patterns reported" };
    }

    if (mode === "tokens") {
      const result = buildTokenUsage(indexDb);

      if (options.json) {
        console.log(JSON.stringify({ kind: "tokens", ...result }, null, 2));
      } else if (!quiet) {
        console.log(chalk.bold("Token usage\n"));
        console.log(chalk.dim(`Used tokens: ${result.usedTokens} / ${result.totalTokens}`));

        if (result.usage.length > 0) {
          console.log(chalk.dim("\nTop tokens:"));
          for (const line of formatCountList(
            result.usage.map((item) => ({ label: item.token, count: item.count })),
            clampLimit(options.limit)
          )) {
            console.log(line);
          }
        }

        if (result.unusedTokens.length > 0) {
          console.log(chalk.dim("\nUnused tokens:"));
          for (const token of result.unusedTokens.slice(0, clampLimit(options.limit))) {
            console.log(`  ${token}`);
          }
        }
      }

      return { success: true, message: "Token usage reported" };
    }

    if (mode === "similar") {
      const target = options.similar ?? "";
      const threshold = parseThreshold(options.threshold);
      const limit = clampLimit(options.limit);
      const resolvedTarget = resolveTargetFile(cwd, target);

      const result = buildSimilarity(indexDb, resolvedTarget, threshold, limit);

      if (options.json) {
        console.log(JSON.stringify({ kind: "similar", ...result, threshold }, null, 2));
      } else if (!quiet) {
        console.log(chalk.bold(`Similar to: ${result.target}\n`));
        console.log(chalk.dim(`Threshold: ${threshold}`));

        if (result.results.length === 0) {
          console.log(chalk.dim("No similar files found."));
        } else {
          for (const match of result.results) {
            console.log(
              `${match.file} (${(match.classSimilarity * 100).toFixed(0)}% class, ${(match.tokenSimilarity * 100).toFixed(0)}% token)`
            );

            if (match.sharedClasses.length > 0) {
              console.log(chalk.dim(`  shared classes: ${match.sharedClasses.join(", ")}`));
            }

            if (match.sharedTokens.length > 0) {
              console.log(chalk.dim(`  shared tokens: ${match.sharedTokens.join(", ")}`));
            }
          }
        }
      }

      return { success: true, message: "Similarity reported" };
    }

    if (mode === "cascade") {
      const selector = options.cascade ?? "";
      const limit = clampLimit(options.limit);
      const result = buildCascade(indexDb, selector, limit);

      if (options.json) {
        console.log(JSON.stringify({ kind: "cascade", ...result }, null, 2));
      } else if (!quiet) {
        console.log(chalk.bold(`Cascade trace for: ${result.selector}\n`));

        if (result.resolvedToken) {
          console.log(chalk.dim(`Resolved token: ${result.resolvedToken}`));
        } else {
          console.log(chalk.dim("Resolved token: none"));
        }

        if (result.tokenDefinition) {
          console.log(
            chalk.dim(
              `Token value: ${result.tokenDefinition.value} (${result.tokenDefinition.file}:${result.tokenDefinition.line})`
            )
          );
        }

        if (result.tokenChain.length > 0) {
          console.log(chalk.dim("\nToken chain:"));
          for (const entry of result.tokenChain) {
            const path = entry.path.length > 0 ? ` (${entry.path.join(" -> ")})` : "";
            console.log(chalk.dim(`  - ${entry.ancestor} depth ${entry.depth}${path}`));
          }
        }

        console.log(chalk.dim("\nUsed in:"));
        if (result.usages.length === 0) {
          console.log(chalk.dim("  No usages found."));
        } else {
          for (const usage of result.usages) {
            const classInfo = usage.className ? ` ${usage.className}` : "";
            console.log(`  - ${usage.file}:${usage.line}:${usage.column}${classInfo}`);
          }
        }
      }

      return { success: true, message: "Cascade trace reported" };
    }

    return { success: false, message: "Unknown finder", error: new FindError("Unknown finder") };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!quiet) {
      console.log(chalk.red("\nFind command failed"));
      console.log(chalk.dim(message));
    }

    return {
      success: false,
      message: `Find failed: ${message}`,
      error: error instanceof Error ? error : new FindError(message),
    };
  } finally {
    if (db) {
      db.close();
    }
  }
}
