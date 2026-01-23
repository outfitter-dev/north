import { access } from "node:fs/promises";
import { resolveConfigPath, resolveNorthPaths } from "../config/env.ts";
import { loadConfig } from "../config/loader.ts";
import { openIndexDatabase } from "./db.ts";
import { collectSourceFiles, computeSourceHash, resolveIndexPath } from "./sources.ts";
import type { IndexFreshness, IndexStatus } from "./types.ts";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadProjectConfig(cwd: string, configOverride?: string) {
  const configPath = await resolveConfigPath(cwd, configOverride);
  if (!configPath) {
    throw new Error("Config file not found. Run 'north init' to initialize.");
  }

  const result = await loadConfig(configPath);
  if (!result.success) {
    throw new Error(result.error.message);
  }

  const paths = resolveNorthPaths(configPath, cwd);

  return { config: result.config, configPath, paths };
}

export async function getIndexStatus(cwd: string, configOverride?: string): Promise<IndexStatus> {
  const { config, paths } = await loadProjectConfig(cwd, configOverride);
  const indexPath = resolveIndexPath(paths, config);

  if (!(await fileExists(indexPath))) {
    return {
      indexPath,
      exists: false,
      meta: {},
      counts: {
        tokens: 0,
        usages: 0,
        patterns: 0,
        tokenGraph: 0,
      },
    };
  }

  const db = await openIndexDatabase(indexPath);
  const metaRows = db.prepare("SELECT key, value FROM meta").all() as Array<{
    key: string;
    value: string;
  }>;
  const meta = metaRows.reduce<Record<string, string>>((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});

  const tokens = db.prepare("SELECT COUNT(*) as count FROM tokens").get() as { count: number };
  const usages = db.prepare("SELECT COUNT(*) as count FROM usages").get() as { count: number };
  const patterns = db.prepare("SELECT COUNT(*) as count FROM patterns").get() as { count: number };
  const tokenGraph = db.prepare("SELECT COUNT(*) as count FROM token_graph").get() as {
    count: number;
  };

  db.close();

  return {
    indexPath,
    exists: true,
    meta,
    counts: {
      tokens: tokens?.count ?? 0,
      usages: usages?.count ?? 0,
      patterns: patterns?.count ?? 0,
      tokenGraph: tokenGraph?.count ?? 0,
    },
  };
}

/**
 * Pattern summary returned by getTopPatterns
 */
export interface PatternSummary {
  name: string;
  count: number;
  exampleClasses: string[];
}

/**
 * Get top patterns from the index by occurrence count.
 * Returns pattern name, count, and example classes.
 */
export async function getTopPatterns(
  cwd: string,
  configOverride?: string,
  limit = 10
): Promise<PatternSummary[]> {
  const { config, paths } = await loadProjectConfig(cwd, configOverride);
  const indexPath = resolveIndexPath(paths, config);

  if (!(await fileExists(indexPath))) {
    return [];
  }

  const db = await openIndexDatabase(indexPath);

  // Query top patterns by count
  const rows = db
    .prepare("SELECT hash, classes, count FROM patterns ORDER BY count DESC LIMIT ?")
    .all(limit) as Array<{
    hash: string;
    classes: string;
    count: number;
  }>;

  db.close();

  return rows.map((row, index) => {
    const classes = JSON.parse(row.classes) as string[];
    // Generate a readable name based on the classes
    const name = generatePatternName(classes, index + 1);
    return {
      name,
      count: row.count,
      exampleClasses: classes.slice(0, 5), // Limit to 5 example classes
    };
  });
}

/**
 * Generate a human-readable pattern name from its classes.
 */
function generatePatternName(classes: string[], index: number): string {
  // Try to identify the pattern type based on class prefixes
  const hasLayout = classes.some((c) => /^(flex|grid|block|inline|hidden)/.test(c));
  const hasSpacing = classes.some((c) => /^(p-|m-|gap-|space-)/.test(c));
  const hasColor = classes.some((c) => /^(bg-|text-|border-)/.test(c));
  const hasSize = classes.some((c) => /^(w-|h-|min-|max-)/.test(c));

  const parts: string[] = [];
  if (hasLayout) parts.push("layout");
  if (hasSpacing) parts.push("spacing");
  if (hasColor) parts.push("color");
  if (hasSize) parts.push("sizing");

  if (parts.length === 0) {
    return `pattern-${index}`;
  }

  return `${parts.join("-")}-${index}`;
}

export async function checkIndexFresh(
  cwd: string,
  configOverride?: string
): Promise<IndexFreshness> {
  const { config, configPath, paths } = await loadProjectConfig(cwd, configOverride);
  const indexPath = resolveIndexPath(paths, config);

  if (!(await fileExists(indexPath))) {
    return { fresh: false };
  }

  const db = await openIndexDatabase(indexPath);
  const metaRows = db.prepare("SELECT key, value FROM meta").all() as Array<{
    key: string;
    value: string;
  }>;
  db.close();

  const meta = metaRows.reduce<Record<string, string>>((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});

  const expected = meta.source_tree_hash ?? meta.content_hash;
  if (!expected) {
    return { fresh: false };
  }

  const { allFiles } = await collectSourceFiles(paths.projectRoot, configPath);
  const actual = await computeSourceHash(allFiles, paths.projectRoot);

  return {
    fresh: expected === actual,
    expected,
    actual,
  };
}
