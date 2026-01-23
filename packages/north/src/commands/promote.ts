import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import chalk from "chalk";
import { resolveConfigPath, resolveNorthPaths } from "../config/env.ts";
import { writeFileAtomic } from "../generation/file-writer.ts";
import { type IndexDatabase, openIndexDatabase } from "../index/db.ts";
import { checkIndexFresh, getIndexStatus } from "../index/queries.ts";
import { getUtilitySegment } from "../lib/utility-classification.ts";

// ============================================================================
// Error Types
// ============================================================================

export class PromoteError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "PromoteError";
  }
}

// ============================================================================
// Promote Command
// ============================================================================

export interface PromoteOptions {
  cwd?: string;
  config?: string;
  pattern?: string;
  as?: string;
  similar?: boolean;
  threshold?: number;
  limit?: number;
  dryRun?: boolean;
  apply?: boolean;
  json?: boolean;
  quiet?: boolean;
}

export interface PromoteResult {
  success: boolean;
  message: string;
  error?: Error;
}

interface PatternLocation {
  file: string;
  line: number;
  component: string | null;
}

interface PatternRow {
  hash: string;
  classes: string[];
  count: number;
  locations: PatternLocation[];
}

interface SimilarPattern extends PatternRow {
  similarity: number;
}

interface ThemeAddition {
  name: string;
  value: string;
}

interface PromoteReport {
  name: string;
  pattern: string;
  normalizedClasses: string[];
  exact?: PatternRow;
  similar: SimilarPattern[];
  themeAdditions: ThemeAddition[];
  utilityBlock: string;
  codemods: Array<{ file: string; line: number; replacement: string }>;
}

const DEFAULT_THRESHOLD = 0.8;
const DEFAULT_LIMIT = 10;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clampLimit(limit?: number): number {
  if (!limit || Number.isNaN(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.max(1, Math.floor(limit));
}

function parseThreshold(value?: number): number {
  if (value === undefined || Number.isNaN(value)) {
    return DEFAULT_THRESHOLD;
  }

  return Math.min(1, Math.max(0, value));
}

function splitPattern(pattern: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let bracketDepth = 0;
  let parenDepth = 0;

  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
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

    if (/\s/.test(char) && bracketDepth === 0 && parenDepth === 0) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens.filter(Boolean);
}

function normalizeClasses(classes: string[]): string[] {
  return Array.from(new Set(classes.filter(Boolean))).sort();
}

function hashPattern(classes: string[]): string {
  return createHash("sha256").update(classes.join(" ")).digest("hex");
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

async function openIndex(cwd: string, configOverride?: string): Promise<IndexDatabase> {
  const status = await getIndexStatus(cwd, configOverride);
  if (!status.exists) {
    throw new PromoteError("Index not found. Run 'north index' to build it.");
  }

  const freshness = await checkIndexFresh(cwd, configOverride);
  if (!freshness.fresh) {
    throw new PromoteError("Index is stale. Run 'north index' to refresh it.");
  }

  return await openIndexDatabase(status.indexPath);
}

function parsePatternRow(row: {
  hash: string;
  classes: string;
  count: number;
  locations: string;
}): PatternRow {
  let classes: string[] = [];
  let locations: PatternLocation[] = [];

  try {
    classes = JSON.parse(row.classes) as string[];
  } catch {
    classes = [];
  }

  try {
    locations = JSON.parse(row.locations) as PatternLocation[];
  } catch {
    locations = [];
  }

  return {
    hash: row.hash,
    classes,
    count: row.count,
    locations,
  };
}

function getPatternByHash(db: IndexDatabase, hash: string): PatternRow | undefined {
  const row = db
    .prepare("SELECT hash, classes, count, locations FROM patterns WHERE hash = ?")
    .get(hash) as
    | {
        hash: string;
        classes: string;
        count: number;
        locations: string;
      }
    | undefined;

  if (!row) {
    return undefined;
  }

  return parsePatternRow(row);
}

function getSimilarPatterns(
  db: IndexDatabase,
  target: Set<string>,
  threshold: number,
  limit: number,
  targetHash: string
): SimilarPattern[] {
  const rows = db.prepare("SELECT hash, classes, count, locations FROM patterns").all() as Array<{
    hash: string;
    classes: string;
    count: number;
    locations: string;
  }>;

  const matches: SimilarPattern[] = [];

  for (const row of rows) {
    if (row.hash === targetHash) {
      continue;
    }

    const pattern = parsePatternRow(row);
    const similarity = jaccardSimilarity(target, new Set(pattern.classes));

    if (similarity < threshold) {
      continue;
    }

    matches.push({ ...pattern, similarity });
  }

  matches.sort((a, b) => {
    if (a.similarity !== b.similarity) {
      return b.similarity - a.similarity;
    }
    if (a.count !== b.count) {
      return b.count - a.count;
    }
    return a.hash.localeCompare(b.hash);
  });

  return matches.slice(0, limit);
}

function resolveTokenCandidates(classes: string[]): Set<string> {
  const tokens = new Set<string>();

  for (const className of classes) {
    const utility = getUtilitySegment(className);

    const tokenMatch = utility.match(/^[A-Za-z-]+-\((--[A-Za-z0-9-_]+)\)$/);
    if (tokenMatch?.[1]) {
      tokens.add(tokenMatch[1]);
      continue;
    }

    const colorMatch = utility.match(
      /^(bg|text|border|ring|fill|stroke)-([A-Za-z0-9-_]+)(?:\/[\d.]+)?$/
    );
    if (colorMatch?.[2]) {
      tokens.add(`--color-${colorMatch[2]}`);
    }
  }

  return tokens;
}

function getTokenValues(db: IndexDatabase, tokenNames: string[]): Map<string, string> {
  if (tokenNames.length === 0) {
    return new Map();
  }

  const placeholders = tokenNames.map(() => "?").join(", ");
  const stmt = db.prepare(`SELECT name, value FROM tokens WHERE name IN (${placeholders})`);
  const rows = stmt.all(...tokenNames) as Array<{ name: string; value: string }>;

  return new Map(rows.map((row) => [row.name, row.value]));
}

function buildThemeAdditions(db: IndexDatabase, classes: string[]): ThemeAddition[] {
  const candidates = Array.from(resolveTokenCandidates(classes));
  const tokenValues = getTokenValues(db, candidates);
  const additions: ThemeAddition[] = [];

  for (const token of candidates) {
    const value = tokenValues.get(token);
    if (!value) {
      continue;
    }

    if (value.includes("var(--")) {
      continue;
    }

    additions.push({ name: token, value });
  }

  return additions.sort((a, b) => a.name.localeCompare(b.name));
}

function buildUtilityBlock(name: string, pattern: string): string {
  return `@utility ${name} {\n  @apply ${pattern};\n}`;
}

function buildCodemods(
  pattern: PatternRow | undefined,
  replacement: string
): Array<{
  file: string;
  line: number;
  replacement: string;
}> {
  if (!pattern) {
    return [];
  }

  return pattern.locations.map((location) => ({
    file: location.file,
    line: location.line,
    replacement,
  }));
}

function formatLocations(locations: PatternLocation[], limit: number): string[] {
  return locations.slice(0, limit).map((location) => `  - ${location.file}:${location.line}`);
}

async function applyPromotion(
  cwd: string,
  name: string,
  pattern: string,
  themeAdditions: ThemeAddition[],
  configOverride?: string
): Promise<void> {
  const configPath = await resolveConfigPath(cwd, configOverride);
  if (!configPath) {
    throw new PromoteError("Config file not found. Run 'north init' to initialize.");
  }
  const paths = resolveNorthPaths(configPath, cwd);
  const basePath = paths.baseTokensPath;
  const content = await readFile(basePath, "utf-8");

  const utilityRegex = new RegExp(`@utility\\s+${escapeRegExp(name)}\\b`);
  if (utilityRegex.test(content)) {
    throw new PromoteError(`Utility '${name}' already exists in ${basePath}.`);
  }

  const sections: string[] = [];

  if (themeAdditions.length > 0) {
    const themeLines = themeAdditions.map((addition) => `  ${addition.name}: ${addition.value};`);
    sections.push(`@theme {\n${themeLines.join("\n")}\n}`);
  }

  sections.push(buildUtilityBlock(name, pattern));

  const next = `${content.trimEnd()}\n\n/* north promote: ${name} */\n${sections.join("\n\n")}\n`;

  await writeFileAtomic(basePath, next);
}

export async function promote(options: PromoteOptions = {}): Promise<PromoteResult> {
  const cwd = options.cwd ?? process.cwd();
  const pattern = options.pattern?.trim();
  const name = options.as?.trim();
  const quiet = options.quiet ?? false;
  const apply = options.apply === true;
  const dryRun = options.dryRun ?? !apply;

  if (!pattern || pattern.length === 0) {
    return {
      success: false,
      message: "Pattern is required",
      error: new PromoteError("Pattern is required."),
    };
  }

  if (!name || name.length === 0) {
    return {
      success: false,
      message: "--as is required",
      error: new PromoteError("Promotion name is required."),
    };
  }

  if (apply && options.dryRun) {
    return {
      success: false,
      message: "Use either --apply or --dry-run, not both",
      error: new PromoteError("Conflicting flags."),
    };
  }

  let db: IndexDatabase | null = null;

  try {
    const indexDb = await openIndex(cwd, options.config);
    db = indexDb;

    const classes = splitPattern(pattern);
    const normalizedClasses = normalizeClasses(classes);
    const patternHash = hashPattern(normalizedClasses);

    const exact = getPatternByHash(indexDb, patternHash);
    const threshold = parseThreshold(options.threshold);
    const limit = clampLimit(options.limit);

    const similar = options.similar
      ? getSimilarPatterns(indexDb, new Set(normalizedClasses), threshold, limit, patternHash)
      : [];

    const themeAdditions = buildThemeAdditions(indexDb, classes);
    const utilityBlock = buildUtilityBlock(name, pattern);
    const codemods = buildCodemods(exact, name);

    const report: PromoteReport = {
      name,
      pattern,
      normalizedClasses,
      exact,
      similar,
      themeAdditions,
      utilityBlock,
      codemods,
    };

    if (apply) {
      await applyPromotion(cwd, name, pattern, themeAdditions, options.config);
    }

    if (options.json) {
      console.log(JSON.stringify({ kind: "promote", applied: apply, ...report }, null, 2));
    } else if (!quiet) {
      console.log(chalk.bold(`Promote: ${name}\n`));
      console.log(chalk.dim(`Pattern: ${pattern}`));

      if (exact) {
        console.log(chalk.dim(`Occurrences: ${exact.count}`));
        const locations = formatLocations(exact.locations, limit);
        if (locations.length > 0) {
          console.log(chalk.dim("Locations:"));
          for (const line of locations) {
            console.log(chalk.dim(line));
          }
        }
      } else {
        console.log(chalk.yellow("Pattern not found in index."));
      }

      if (options.similar) {
        console.log(chalk.dim(`\nSimilar patterns (threshold ${threshold}):`));
        if (similar.length === 0) {
          console.log(chalk.dim("  none"));
        } else {
          for (const entry of similar) {
            const prefix = chalk.dim(`  ${(entry.similarity * 100).toFixed(0)}% (${entry.count}x)`);
            console.log(`${prefix} ${entry.classes.join(" ")}`);
          }
        }
      }

      if (themeAdditions.length > 0) {
        console.log(chalk.dim("\nSuggested @theme additions:"));
        for (const addition of themeAdditions) {
          console.log(chalk.dim(`  ${addition.name}: ${addition.value};`));
        }
      }

      console.log(chalk.dim("\nSuggested @utility:"));
      console.log(utilityBlock);

      if (codemods.length > 0) {
        console.log(chalk.dim("\nCodemod suggestions:"));
        for (const codemod of codemods.slice(0, limit)) {
          console.log(`  ${codemod.file}:${codemod.line} → ${codemod.replacement}`);
        }
      }

      if (apply) {
        console.log(chalk.green("\nApplied promotion to .north/tokens/base.css"));
      } else if (dryRun) {
        console.log(chalk.dim("\nDry run only. Use --apply to write base.css."));
      }
    }

    return {
      success: true,
      message: apply ? "Promotion applied" : "Promotion previewed",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!quiet) {
      console.log(chalk.red("\nPromotion failed"));
      console.log(chalk.dim(message));
    }

    return {
      success: false,
      message: `Promote failed: ${message}`,
      error: error instanceof Error ? error : new PromoteError(message),
    };
  } finally {
    if (db) {
      db.close();
    }
  }
}
