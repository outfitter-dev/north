/**
 * north classify - Set component context classifications
 *
 * @see .scratch/mcp-server/12-cli-classify-spec.md for full specification
 */

import { access } from "node:fs/promises";
import { minimatch } from "minimatch";
import { resolveConfigPath, resolveNorthPaths } from "../config/env.ts";
import { loadConfig } from "../config/loader.ts";
import { openIndexDatabase } from "../index/db.ts";
import type { IndexDatabase } from "../index/db.ts";
import { resolveIndexPath } from "../index/sources.ts";
import { getContext } from "../lint/context.ts";
import type { LintContext } from "../lint/types.ts";

export class ClassifyError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "ClassifyError";
  }
}

export interface ClassifyOptions {
  cwd?: string;
  config?: string;
  files?: string[];
  context?: LintContext;
  auto?: boolean;
  comment?: boolean;
  dryRun?: boolean;
  apply?: boolean;
  json?: boolean;
  quiet?: boolean;
  /** Internal: test database injection */
  _testDb?: IndexDatabase;
}

export interface ClassifyFileEntry {
  file: string;
  from: LintContext | null;
  to: LintContext;
  source: "explicit" | "auto" | "path" | "default";
  commentWritten?: boolean;
}

export interface ClassifyReport {
  kind: "classify";
  applied: boolean;
  files: ClassifyFileEntry[];
  summary: {
    total: number;
    primitive: number;
    composed: number;
    layout: number;
    changed: number;
  };
}

interface UsageRow {
  file: string;
  context: string | null;
}

/**
 * Checks if a file path matches any of the provided glob patterns
 */
function matchesGlob(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => minimatch(filePath, pattern));
}

/**
 * Determines context source based on options
 */
function getContextSource(options: ClassifyOptions): "explicit" | "auto" | "path" {
  if (options.context) return "explicit";
  if (options.auto) return "auto";
  return "path";
}

/**
 * Classifies files and optionally updates their context in the index
 */
export async function classify(options: ClassifyOptions = {}): Promise<ClassifyReport> {
  let db = options._testDb;
  let shouldCloseDb = false;

  if (!db) {
    // Open database from config
    const cwd = options.cwd ?? process.cwd();
    const configFile = await resolveConfigPath(cwd, options.config);

    if (!configFile) {
      throw new ClassifyError("No .north/config.yaml found. Run 'north init' to create one.");
    }

    const configResult = await loadConfig(configFile);
    if (!configResult.success) {
      throw new ClassifyError(`Failed to load config: ${configResult.error}`, configResult.error);
    }

    const paths = resolveNorthPaths(configFile, cwd);
    const indexPath = resolveIndexPath(paths, configResult.config);

    // Check if index exists
    try {
      await access(indexPath);
    } catch {
      throw new ClassifyError(
        `Index not found at ${indexPath}. Run 'north index' first to build the index.`
      );
    }

    db = await openIndexDatabase(indexPath);
    shouldCloseDb = true;
  }

  // Query unique files with their current context
  const rows = db
    .prepare<[], UsageRow>("SELECT DISTINCT file, context FROM usages")
    .all() as UsageRow[];

  // Build map of file -> existing context (handle duplicates by taking first non-null)
  const fileContextMap = new Map<string, LintContext | null>();
  for (const row of rows) {
    const existing = fileContextMap.get(row.file);
    // Update if file not seen yet, or if current is null and new row has context
    if (existing === undefined || (existing === null && row.context)) {
      fileContextMap.set(row.file, row.context ? (row.context as LintContext) : null);
    }
  }

  // Get unique files
  let files = Array.from(fileContextMap.keys());

  // Filter by glob patterns if provided
  if (options.files && options.files.length > 0) {
    files = files.filter((f) => matchesGlob(f, options.files as string[]));
  }

  // Determine source type
  const source = getContextSource(options);

  // Build file entries with classification
  const fileEntries: ClassifyFileEntry[] = files.map((file) => {
    const from = fileContextMap.get(file) ?? null;
    const to = options.context ?? getContext(file);

    return {
      file,
      from,
      to,
      source,
    };
  });

  // Apply changes if requested
  const shouldApply = options.apply === true;

  if (shouldApply) {
    const updateStmt = db.prepare<[string, string]>("UPDATE usages SET context = ? WHERE file = ?");
    for (const entry of fileEntries) {
      updateStmt.run(entry.to, entry.file);
    }
  }

  // Build summary
  const summary = {
    total: fileEntries.length,
    primitive: fileEntries.filter((f) => f.to === "primitive").length,
    composed: fileEntries.filter((f) => f.to === "composed").length,
    layout: fileEntries.filter((f) => f.to === "layout").length,
    changed: fileEntries.filter((f) => f.from !== f.to).length,
  };

  // Close database if we opened it
  if (shouldCloseDb) {
    db.close();
  }

  return {
    kind: "classify",
    applied: shouldApply,
    files: fileEntries,
    summary,
  };
}
