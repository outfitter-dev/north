import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { findConfigFile, loadConfig } from "../config/loader.ts";
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
  if (configOverride) {
    const configPath = resolve(cwd, configOverride);
    const result = await loadConfig(configPath);
    if (!result.success) {
      throw new Error(result.error.message);
    }

    return { config: result.config, configPath };
  }

  const configPath = await findConfigFile(cwd);
  if (!configPath) {
    throw new Error("Config file not found. Run 'north init' to initialize.");
  }

  const result = await loadConfig(configPath);
  if (!result.success) {
    throw new Error(result.error.message);
  }

  return { config: result.config, configPath };
}

export async function getIndexStatus(cwd: string, configOverride?: string): Promise<IndexStatus> {
  const { config } = await loadProjectConfig(cwd, configOverride);
  const indexPath = resolveIndexPath(cwd, config);

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

export async function checkIndexFresh(
  cwd: string,
  configOverride?: string
): Promise<IndexFreshness> {
  const { config, configPath } = await loadProjectConfig(cwd, configOverride);
  const indexPath = resolveIndexPath(cwd, config);

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

  const { allFiles } = await collectSourceFiles(cwd, configPath);
  const actual = await computeSourceHash(allFiles, cwd);

  return {
    fresh: expected === actual,
    expected,
    actual,
  };
}
