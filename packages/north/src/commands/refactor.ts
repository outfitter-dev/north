import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import chalk from "chalk";
import { writeFileAtomic } from "../generation/file-writer.ts";
import { type IndexDatabase, openIndexDatabase } from "../index/db.ts";
import { checkIndexFresh, getIndexStatus } from "../index/queries.ts";

// ============================================================================
// Error Types
// ============================================================================

export class RefactorError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "RefactorError";
  }
}

// ============================================================================
// Refactor Command
// ============================================================================

export interface RefactorOptions {
  cwd?: string;
  config?: string;
  token?: string;
  to?: string;
  cascade?: boolean;
  limit?: number;
  dryRun?: boolean;
  apply?: boolean;
  json?: boolean;
  quiet?: boolean;
}

export interface RefactorResult {
  success: boolean;
  message: string;
  error?: Error;
}

interface TokenRow {
  name: string;
  value: string;
  file: string;
  line: number;
}

interface UsageLocation {
  file: string;
  line: number;
  column: number;
  className: string;
}

interface CascadeEntry {
  token: string;
  depth: number;
  path: string[];
  usageCount: number;
}

const DEFAULT_LIMIT = 10;
const BASE_CSS_FILE = "north/tokens/base.css";

function clampLimit(limit?: number): number {
  if (!limit || Number.isNaN(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.max(1, Math.floor(limit));
}

function normalizeTokenName(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("--")) {
    return trimmed;
  }
  return `--${trimmed}`;
}

function normalizeValue(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.endsWith(";")) {
    return trimmed.slice(0, -1).trim();
  }
  return trimmed;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function openIndex(cwd: string, configOverride?: string): Promise<IndexDatabase> {
  const status = await getIndexStatus(cwd, configOverride);
  if (!status.exists) {
    throw new RefactorError("Index not found. Run 'north index' to build it.");
  }

  const freshness = await checkIndexFresh(cwd, configOverride);
  if (!freshness.fresh) {
    throw new RefactorError("Index is stale. Run 'north index' to refresh it.");
  }

  return await openIndexDatabase(status.indexPath);
}

function getTokenRow(db: IndexDatabase, token: string): TokenRow | undefined {
  const row = db.prepare("SELECT name, value, file, line FROM tokens WHERE name = ?").get(token) as
    | TokenRow
    | undefined;

  return row;
}

function getDirectUsages(db: IndexDatabase, token: string): UsageLocation[] {
  const rows = db
    .prepare(
      "SELECT file, line, column, class_name as className FROM usages WHERE resolved_token = ? ORDER BY file, line, column"
    )
    .all(token) as UsageLocation[];

  return rows;
}

function getCascadeRows(
  db: IndexDatabase,
  token: string
): Array<{ descendant: string; depth: number; path: string }> {
  return db
    .prepare(
      "SELECT descendant, depth, path FROM token_graph WHERE ancestor = ? ORDER BY depth ASC, descendant ASC"
    )
    .all(token) as Array<{ descendant: string; depth: number; path: string }>;
}

function getUsageCounts(db: IndexDatabase, tokens: string[]): Map<string, number> {
  if (tokens.length === 0) {
    return new Map();
  }

  const placeholders = tokens.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT resolved_token as token, COUNT(*) as count FROM usages WHERE resolved_token IN (${placeholders}) GROUP BY resolved_token`
    )
    .all(...tokens) as Array<{ token: string; count: number }>;

  return new Map(rows.map((row) => [row.token, row.count]));
}

function parsePath(raw: string): string[] {
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function buildCascadeEntries(db: IndexDatabase, token: string): CascadeEntry[] {
  const rows = getCascadeRows(db, token);
  const descendants = rows.map((row) => row.descendant);
  const usageCounts = getUsageCounts(db, descendants);

  return rows.map((row) => ({
    token: row.descendant,
    depth: row.depth,
    path: parsePath(row.path),
    usageCount: usageCounts.get(row.descendant) ?? 0,
  }));
}

function updateTokenValue(
  content: string,
  token: string,
  nextValue: string
): { nextContent: string; matches: number } {
  const pattern = new RegExp(`(${escapeRegExp(token)}\\s*:\\s*)([^;]+)(;)`, "g");
  let matches = 0;

  const nextContent = content.replace(
    pattern,
    (_match, prefix: string, _value: string, suffix: string) => {
      matches += 1;
      return `${prefix}${nextValue}${suffix}`;
    }
  );

  return { nextContent, matches };
}

async function applyRefactor(cwd: string, token: string, nextValue: string): Promise<void> {
  const basePath = resolve(cwd, BASE_CSS_FILE);
  const content = await readFile(basePath, "utf-8");
  const { nextContent, matches } = updateTokenValue(content, token, nextValue);

  if (matches === 0) {
    throw new RefactorError(`Token '${token}' not found in ${BASE_CSS_FILE}.`);
  }

  if (nextContent !== content) {
    await writeFileAtomic(basePath, nextContent);
  }
}

export async function refactor(options: RefactorOptions = {}): Promise<RefactorResult> {
  const cwd = options.cwd ?? process.cwd();
  const quiet = options.quiet ?? false;
  const apply = options.apply === true;
  const dryRun = options.dryRun ?? !apply;

  if (apply && options.dryRun) {
    return {
      success: false,
      message: "Use either --apply or --dry-run, not both",
      error: new RefactorError("Conflicting flags."),
    };
  }

  const tokenInput = options.token?.trim();
  if (!tokenInput) {
    return {
      success: false,
      message: "Token is required",
      error: new RefactorError("Token is required."),
    };
  }

  const toInput = options.to?.trim();
  if (!toInput) {
    return {
      success: false,
      message: "--to is required",
      error: new RefactorError("Replacement value is required."),
    };
  }

  const token = normalizeTokenName(tokenInput);
  const nextValue = normalizeValue(toInput);
  if (!nextValue) {
    return {
      success: false,
      message: "--to is required",
      error: new RefactorError("Replacement value is required."),
    };
  }

  let db: IndexDatabase | null = null;

  try {
    const indexDb = await openIndex(cwd, options.config);
    db = indexDb;

    const tokenRow = getTokenRow(indexDb, token);
    if (!tokenRow) {
      return {
        success: false,
        message: `Token '${token}' not found`,
        error: new RefactorError(`Token '${token}' not found in index.`),
      };
    }

    const limit = clampLimit(options.limit);
    const directUsages = getDirectUsages(indexDb, token);
    const cascadeEnabled = options.cascade !== false;
    const cascadeEntries = cascadeEnabled ? buildCascadeEntries(indexDb, token) : [];

    const applyable = tokenRow.file === BASE_CSS_FILE;

    if (apply) {
      if (!applyable) {
        throw new RefactorError(
          `Token '${token}' is defined in ${tokenRow.file}. Update that file or run 'north gen'.`
        );
      }

      await applyRefactor(cwd, token, nextValue);
    }

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            kind: "refactor",
            applied: apply,
            token,
            from: tokenRow.value,
            to: nextValue,
            definition: { file: tokenRow.file, line: tokenRow.line },
            directUsages: {
              total: directUsages.length,
              entries: directUsages.slice(0, limit),
            },
            cascade: {
              enabled: cascadeEnabled,
              total: cascadeEntries.length,
              entries: cascadeEntries.slice(0, limit),
            },
            applyable,
          },
          null,
          2
        )
      );
    } else if (!quiet) {
      console.log(chalk.bold(`Refactor: ${token}\n`));
      console.log(chalk.dim(`Value: ${tokenRow.value} -> ${nextValue}`));
      console.log(chalk.dim(`Defined in: ${tokenRow.file}:${tokenRow.line}`));

      if (!applyable) {
        console.log(
          chalk.yellow(
            `Note: token is defined in ${tokenRow.file}; --apply only updates ${BASE_CSS_FILE}.`
          )
        );
      }

      console.log(chalk.dim(`\nDirect usages: ${directUsages.length}`));
      if (directUsages.length === 0) {
        console.log(chalk.dim("  none"));
      } else {
        for (const usage of directUsages.slice(0, limit)) {
          console.log(`  - ${usage.file}:${usage.line}:${usage.column} ${usage.className}`);
        }
      }

      if (cascadeEnabled) {
        console.log(chalk.dim("\nCascade dependencies:"));
        if (cascadeEntries.length === 0) {
          console.log(chalk.dim("  none"));
        } else {
          for (const entry of cascadeEntries.slice(0, limit)) {
            const usageInfo = entry.usageCount > 0 ? ` (${entry.usageCount} usages)` : "";
            const pathInfo = entry.path.length > 0 ? ` ${entry.path.join(" -> ")}` : "";
            console.log(
              chalk.dim(`  - ${entry.token} depth ${entry.depth}${usageInfo}${pathInfo}`)
            );
          }
        }
      } else {
        console.log(chalk.dim("\nCascade dependencies: skipped (--no-cascade)"));
      }

      if (apply) {
        console.log(chalk.green(`\nUpdated ${BASE_CSS_FILE}`));
      } else if (dryRun) {
        console.log(chalk.dim("\nDry run only. Use --apply to update base.css."));
      }
    }

    return {
      success: true,
      message: apply ? "Refactor applied" : "Refactor previewed",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!quiet) {
      console.log(chalk.red("\nRefactor failed"));
      console.log(chalk.dim(message));
    }

    return {
      success: false,
      message: `Refactor failed: ${message}`,
      error: error instanceof Error ? error : new RefactorError(message),
    };
  } finally {
    if (db) {
      db.close();
    }
  }
}
