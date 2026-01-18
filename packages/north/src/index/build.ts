import { createHash } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { findConfigFile, loadConfig } from "../config/loader.ts";
import { extractClassTokens } from "../lint/extract.ts";
import type { ClassSite } from "../lint/types.ts";
import { parseCssTokens } from "./css.ts";
import type { IndexDatabase } from "./db.ts";
import { openIndexDatabase } from "./db.ts";
import { SCHEMA_VERSION, createIndexSchema } from "./schema.ts";
import { collectSourceFiles, computeSourceHash, resolveIndexPath } from "./sources.ts";
import type { IndexBuildResult, IndexStats, TokenRecord, UsageRecord } from "./types.ts";

interface TokenGraphEntry {
  ancestor: string;
  descendant: string;
  depth: number;
  path: string[];
}

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

function resolveClassToToken(className: string, tokenNames: Set<string>): string | null {
  const utility = getUtilitySegment(className);

  const shorthandMatch = utility.match(/^[A-Za-z-]+-\((--[A-Za-z0-9-_]+)\)$/);
  if (shorthandMatch?.[1]) {
    return shorthandMatch[1];
  }

  const colorMatch = utility.match(
    /^(bg|text|border|ring|fill|stroke)-([A-Za-z0-9-_]+)(?:\/[\d.]+)?$/
  );
  if (colorMatch?.[2]) {
    const tokenName = `--color-${colorMatch[2]}`;
    if (tokenNames.has(tokenName)) {
      return tokenName;
    }
    return null;
  }

  return null;
}

function buildTokenGraph(dependencies: Map<string, Set<string>>): TokenGraphEntry[] {
  const entries: TokenGraphEntry[] = [];
  const tokens = Array.from(dependencies.keys()).sort();

  for (const descendant of tokens) {
    const directDeps = Array.from(dependencies.get(descendant) ?? []).sort();
    const queue: TokenGraphEntry[] = directDeps.map((ancestor) => ({
      ancestor,
      descendant,
      depth: 1,
      path: [ancestor, descendant],
    }));

    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      if (visited.has(current.ancestor)) {
        continue;
      }

      visited.add(current.ancestor);
      entries.push(current);

      const nextDeps = Array.from(dependencies.get(current.ancestor) ?? []).sort();
      for (const next of nextDeps) {
        queue.push({
          ancestor: next,
          descendant,
          depth: current.depth + 1,
          path: [next, ...current.path],
        });
      }
    }
  }

  return entries.sort((a, b) => {
    if (a.ancestor !== b.ancestor) {
      return a.ancestor.localeCompare(b.ancestor);
    }
    if (a.descendant !== b.descendant) {
      return a.descendant.localeCompare(b.descendant);
    }
    return a.depth - b.depth;
  });
}

function runTransaction(db: IndexDatabase, action: () => void): void {
  db.exec("BEGIN");
  try {
    action();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function hashPattern(classes: string[]): string {
  return createHash("sha256").update(classes.join(" ")).digest("hex");
}

function buildPatterns(sites: ClassSite[]) {
  const patterns = new Map<
    string,
    {
      hash: string;
      classes: string[];
      count: number;
      locations: Array<{ file: string; line: number; component: string | null }>;
    }
  >();

  for (const site of sites) {
    const uniqueClasses = Array.from(new Set(site.classes.filter(Boolean)));
    if (uniqueClasses.length === 0) {
      continue;
    }

    const classes = uniqueClasses.sort();
    const hash = hashPattern(classes);
    const existing = patterns.get(hash) ?? {
      hash,
      classes,
      count: 0,
      locations: [],
    };

    existing.count += 1;
    existing.locations.push({
      file: site.filePath,
      line: site.line,
      component: null,
    });

    patterns.set(hash, existing);
  }

  return Array.from(patterns.values()).sort((a, b) => a.hash.localeCompare(b.hash));
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

export interface BuildIndexOptions {
  cwd?: string;
  configPath?: string;
}

export async function buildIndex(options: BuildIndexOptions = {}): Promise<IndexBuildResult> {
  const cwd = options.cwd ?? process.cwd();
  const { config, configPath } = await loadProjectConfig(cwd, options.configPath);
  const { tsxFiles, cssFiles, allFiles } = await collectSourceFiles(cwd, configPath);

  const sourceHash = await computeSourceHash(allFiles, cwd);
  const indexPath = resolveIndexPath(cwd, config);

  await mkdir(dirname(indexPath), { recursive: true });
  await Promise.all([
    rm(indexPath, { force: true }),
    rm(`${indexPath}-wal`, { force: true }),
    rm(`${indexPath}-shm`, { force: true }),
  ]);

  const db = await openIndexDatabase(indexPath);
  createIndexSchema(db);

  const tokensByName = new Map<string, TokenRecord>();

  for (const cssFile of cssFiles) {
    const content = await readFile(cssFile, "utf-8");
    const relativePath = normalizePath(relative(cwd, cssFile));
    const definitions = parseCssTokens(content, relativePath);

    for (const definition of definitions) {
      tokensByName.set(definition.name, {
        name: definition.name,
        value: definition.value,
        file: definition.filePath,
        line: definition.line,
        layer: null,
        computedValue: null,
        references: definition.references,
      });
    }
  }

  const dependencies = new Map<string, Set<string>>();
  for (const token of tokensByName.values()) {
    dependencies.set(token.name, new Set(token.references));
  }

  const tokenGraphEntries = buildTokenGraph(dependencies);
  const usages: UsageRecord[] = [];
  const classSites: ClassSite[] = [];
  const tokenNames = new Set(tokensByName.keys());

  for (const tsxFile of tsxFiles) {
    const content = await readFile(tsxFile, "utf-8");
    const relativePath = normalizePath(relative(cwd, tsxFile));
    const extraction = extractClassTokens(content, relativePath, {
      classFunctions: config.lint?.classFunctions,
    });

    classSites.push(...extraction.sites);

    for (const token of extraction.tokens) {
      usages.push({
        file: token.filePath,
        line: token.line,
        column: token.column,
        className: token.value,
        resolvedToken: resolveClassToToken(token.value, tokenNames),
        context: token.context,
        component: null,
      });
    }
  }

  const patterns = buildPatterns(classSites);

  const sortedTokens = Array.from(tokensByName.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const sortedUsages = [...usages].sort((a, b) => {
    if (a.file !== b.file) {
      return a.file.localeCompare(b.file);
    }
    if (a.line !== b.line) {
      return a.line - b.line;
    }
    if (a.column !== b.column) {
      return a.column - b.column;
    }
    return a.className.localeCompare(b.className);
  });

  const stats: IndexStats = {
    fileCount: tsxFiles.length,
    cssFileCount: cssFiles.length,
    tokenCount: sortedTokens.length,
    usageCount: sortedUsages.length,
    patternCount: patterns.length,
    tokenGraphCount: tokenGraphEntries.length,
    classSiteCount: classSites.length,
  };

  const insertTokens = db.prepare(
    "INSERT INTO tokens (name, value, file, line, layer, computed_value) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const insertUsage = db.prepare(
    "INSERT INTO usages (file, line, column, class_name, resolved_token, context, component) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  const insertPattern = db.prepare(
    "INSERT INTO patterns (hash, classes, count, locations) VALUES (?, ?, ?, ?)"
  );
  const insertTokenGraph = db.prepare(
    "INSERT INTO token_graph (ancestor, descendant, depth, path) VALUES (?, ?, ?, ?)"
  );
  const insertMeta = db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)");

  runTransaction(db, () => {
    for (const token of sortedTokens) {
      insertTokens.run(
        token.name,
        token.value,
        token.file,
        token.line,
        token.layer,
        token.computedValue
      );
    }

    for (const usage of sortedUsages) {
      insertUsage.run(
        usage.file,
        usage.line,
        usage.column,
        usage.className,
        usage.resolvedToken ?? null,
        usage.context,
        usage.component
      );
    }

    for (const pattern of patterns) {
      insertPattern.run(
        pattern.hash,
        JSON.stringify(pattern.classes),
        pattern.count,
        JSON.stringify(pattern.locations)
      );
    }

    for (const entry of tokenGraphEntries) {
      insertTokenGraph.run(
        entry.ancestor,
        entry.descendant,
        entry.depth,
        JSON.stringify(entry.path)
      );
    }

    const totalFiles = stats.fileCount + stats.cssFileCount;

    insertMeta.run("schema_version", String(SCHEMA_VERSION));
    insertMeta.run("source_tree_hash", sourceHash);
    insertMeta.run("content_hash", sourceHash);
    insertMeta.run("file_count", String(totalFiles));
    insertMeta.run("source_file_count", String(totalFiles));
    insertMeta.run("token_count", String(stats.tokenCount));
    insertMeta.run("created_at", new Date().toISOString());
  });
  db.close();

  return {
    indexPath,
    sourceHash,
    stats,
  };
}
