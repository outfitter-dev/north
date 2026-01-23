import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { DiscoverInputSchema, type DiscoverPayload, executeDiscoverTool } from "./discover.ts";

/**
 * Compute the source tree hash for test fixtures.
 * This mimics the hash computation in index/sources.ts
 */
async function computeTestHash(files: string[], cwd: string): Promise<string> {
  const hash = createHash("sha256");
  const sorted = [...files].sort();

  for (const file of sorted) {
    const content = await readFile(file, "utf-8");
    const relPath = relative(cwd, file).replace(/\\/g, "/");
    hash.update(relPath);
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }

  return `sha256:${hash.digest("hex")}`;
}

describe("DiscoverInputSchema validation", () => {
  test("validates colors mode without selector", () => {
    const result = DiscoverInputSchema.safeParse({ mode: "colors" });
    expect(result.success).toBe(true);
  });

  test("validates spacing mode without selector", () => {
    const result = DiscoverInputSchema.safeParse({ mode: "spacing" });
    expect(result.success).toBe(true);
  });

  test("validates typography mode without selector", () => {
    const result = DiscoverInputSchema.safeParse({ mode: "typography" });
    expect(result.success).toBe(true);
  });

  test("validates patterns mode without selector", () => {
    const result = DiscoverInputSchema.safeParse({ mode: "patterns" });
    expect(result.success).toBe(true);
  });

  test("validates tokens mode without selector", () => {
    const result = DiscoverInputSchema.safeParse({ mode: "tokens" });
    expect(result.success).toBe(true);
  });

  test("validates cascade mode with selector", () => {
    const result = DiscoverInputSchema.safeParse({
      mode: "cascade",
      selector: "bg-primary",
    });
    expect(result.success).toBe(true);
  });

  test("validates similar mode with selector and threshold", () => {
    const result = DiscoverInputSchema.safeParse({
      mode: "similar",
      selector: "src/components/Button.tsx",
      threshold: 0.7,
    });
    expect(result.success).toBe(true);
  });

  test("validates optional limit parameter", () => {
    const result = DiscoverInputSchema.safeParse({
      mode: "colors",
      limit: 20,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
    }
  });

  test("validates optional format parameter", () => {
    const result = DiscoverInputSchema.safeParse({
      mode: "colors",
      format: "detailed",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.format).toBe("detailed");
    }
  });

  test("rejects invalid mode", () => {
    const result = DiscoverInputSchema.safeParse({ mode: "invalid" });
    expect(result.success).toBe(false);
  });

  test("rejects threshold outside valid range", () => {
    const result = DiscoverInputSchema.safeParse({
      mode: "similar",
      selector: "file.tsx",
      threshold: 1.5,
    });
    expect(result.success).toBe(false);
  });

  test("rejects negative limit", () => {
    const result = DiscoverInputSchema.safeParse({
      mode: "colors",
      limit: -5,
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid format", () => {
    const result = DiscoverInputSchema.safeParse({
      mode: "colors",
      format: "invalid",
    });
    expect(result.success).toBe(false);
  });

  test("uses default limit of 10 when not specified", () => {
    const result = DiscoverInputSchema.safeParse({ mode: "colors" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(10);
    }
  });

  test("uses default format of compact when not specified", () => {
    const result = DiscoverInputSchema.safeParse({ mode: "colors" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.format).toBe("compact");
    }
  });
});

describe("executeDiscoverTool", () => {
  const testDir = resolve(import.meta.dir, ".test-fixtures-discover-tool");

  beforeEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test("returns error when index does not exist", async () => {
    // Create config but no index
    const northDir = resolve(testDir, ".north");
    await mkdir(northDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(configPath, "compatibility:\n  tailwind: '4'");

    const result = await executeDiscoverTool(testDir, configPath, {
      mode: "colors",
      limit: 10,
      format: "compact",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("index");
  });

  test("returns payload with mode and summary", async () => {
    // Create config and index
    const northDir = resolve(testDir, ".north");
    const northHiddenDir = resolve(testDir, ".north", "state");
    await mkdir(northDir, { recursive: true });
    await mkdir(northHiddenDir, { recursive: true });

    const configPath = resolve(northDir, "config.yaml");
    await writeFile(configPath, "compatibility:\n  tailwind: '4'");

    // Create a minimal index database
    const indexPath = resolve(northHiddenDir, "index.db");
    const { Database } = await import("bun:sqlite");
    const db = new Database(indexPath);
    db.run("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    db.run(
      "CREATE TABLE IF NOT EXISTS tokens (name TEXT PRIMARY KEY, value TEXT NOT NULL, file TEXT NOT NULL, line INTEGER NOT NULL)"
    );
    db.run(
      "CREATE TABLE IF NOT EXISTS usages (id INTEGER PRIMARY KEY, file TEXT NOT NULL, line INTEGER NOT NULL, column INTEGER NOT NULL, class_name TEXT NOT NULL, resolved_token TEXT)"
    );
    db.run(
      "CREATE TABLE IF NOT EXISTS patterns (hash TEXT PRIMARY KEY, classes TEXT NOT NULL, count INTEGER NOT NULL, locations TEXT NOT NULL)"
    );
    db.run(
      "CREATE TABLE IF NOT EXISTS token_graph (descendant TEXT NOT NULL, ancestor TEXT NOT NULL, depth INTEGER NOT NULL, path TEXT NOT NULL, PRIMARY KEY (descendant, ancestor))"
    );

    // Insert meta to mark as fresh - compute the actual source hash
    const sourceHash = await computeTestHash([configPath], testDir);
    db.run("INSERT INTO meta (key, value) VALUES ('source_tree_hash', ?)", [sourceHash]);
    db.run("INSERT INTO meta (key, value) VALUES ('indexed_at', ?)", [new Date().toISOString()]);

    // Insert test data
    db.run(
      "INSERT INTO tokens (name, value, file, line) VALUES ('--color-primary', 'blue', 'tokens.css', 1)"
    );
    db.run(
      "INSERT INTO usages (file, line, column, class_name, resolved_token) VALUES ('Button.tsx', 10, 5, 'bg-primary', '--color-primary')"
    );

    db.close();

    const result = await executeDiscoverTool(testDir, configPath, {
      mode: "colors",
      limit: 10,
      format: "compact",
    });

    expect(result.success).toBe(true);
    expect(result.mode).toBe("colors");
    expect(result.summary).toBeDefined();
    expect(typeof result.summary).toBe("string");
  });

  test("returns results for tokens mode", async () => {
    const northDir = resolve(testDir, ".north");
    const northHiddenDir = resolve(testDir, ".north", "state");
    await mkdir(northDir, { recursive: true });
    await mkdir(northHiddenDir, { recursive: true });

    const configPath = resolve(northDir, "config.yaml");
    await writeFile(configPath, "compatibility:\n  tailwind: '4'");

    const indexPath = resolve(northHiddenDir, "index.db");
    const { Database } = await import("bun:sqlite");
    const db = new Database(indexPath);

    db.run("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    db.run(
      "CREATE TABLE IF NOT EXISTS tokens (name TEXT PRIMARY KEY, value TEXT NOT NULL, file TEXT NOT NULL, line INTEGER NOT NULL)"
    );
    db.run(
      "CREATE TABLE IF NOT EXISTS usages (id INTEGER PRIMARY KEY, file TEXT NOT NULL, line INTEGER NOT NULL, column INTEGER NOT NULL, class_name TEXT NOT NULL, resolved_token TEXT)"
    );
    db.run(
      "CREATE TABLE IF NOT EXISTS patterns (hash TEXT PRIMARY KEY, classes TEXT NOT NULL, count INTEGER NOT NULL, locations TEXT NOT NULL)"
    );
    db.run(
      "CREATE TABLE IF NOT EXISTS token_graph (descendant TEXT NOT NULL, ancestor TEXT NOT NULL, depth INTEGER NOT NULL, path TEXT NOT NULL, PRIMARY KEY (descendant, ancestor))"
    );

    const sourceHash = await computeTestHash([configPath], testDir);
    db.run("INSERT INTO meta (key, value) VALUES ('source_tree_hash', ?)", [sourceHash]);
    db.run("INSERT INTO meta (key, value) VALUES ('indexed_at', ?)", [new Date().toISOString()]);

    db.run(
      "INSERT INTO tokens (name, value, file, line) VALUES ('--color-primary', 'blue', 'tokens.css', 1)"
    );
    db.run(
      "INSERT INTO tokens (name, value, file, line) VALUES ('--color-secondary', 'green', 'tokens.css', 2)"
    );
    db.run(
      "INSERT INTO usages (file, line, column, class_name, resolved_token) VALUES ('Button.tsx', 10, 5, 'bg-primary', '--color-primary')"
    );

    db.close();

    const result = await executeDiscoverTool(testDir, configPath, {
      mode: "tokens",
      limit: 10,
      format: "compact",
    });

    expect(result.success).toBe(true);
    expect(result.mode).toBe("tokens");
    expect(result.results).toBeDefined();
  });

  test("returns results for cascade mode with selector", async () => {
    const northDir = resolve(testDir, ".north");
    const northHiddenDir = resolve(testDir, ".north", "state");
    await mkdir(northDir, { recursive: true });
    await mkdir(northHiddenDir, { recursive: true });

    const configPath = resolve(northDir, "config.yaml");
    await writeFile(configPath, "compatibility:\n  tailwind: '4'");

    const indexPath = resolve(northHiddenDir, "index.db");
    const { Database } = await import("bun:sqlite");
    const db = new Database(indexPath);

    db.run("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    db.run(
      "CREATE TABLE IF NOT EXISTS tokens (name TEXT PRIMARY KEY, value TEXT NOT NULL, file TEXT NOT NULL, line INTEGER NOT NULL)"
    );
    db.run(
      "CREATE TABLE IF NOT EXISTS usages (id INTEGER PRIMARY KEY, file TEXT NOT NULL, line INTEGER NOT NULL, column INTEGER NOT NULL, class_name TEXT NOT NULL, resolved_token TEXT)"
    );
    db.run(
      "CREATE TABLE IF NOT EXISTS patterns (hash TEXT PRIMARY KEY, classes TEXT NOT NULL, count INTEGER NOT NULL, locations TEXT NOT NULL)"
    );
    db.run(
      "CREATE TABLE IF NOT EXISTS token_graph (descendant TEXT NOT NULL, ancestor TEXT NOT NULL, depth INTEGER NOT NULL, path TEXT NOT NULL, PRIMARY KEY (descendant, ancestor))"
    );

    const sourceHash = await computeTestHash([configPath], testDir);
    db.run("INSERT INTO meta (key, value) VALUES ('source_tree_hash', ?)", [sourceHash]);
    db.run("INSERT INTO meta (key, value) VALUES ('indexed_at', ?)", [new Date().toISOString()]);

    db.run(
      "INSERT INTO tokens (name, value, file, line) VALUES ('--color-primary', 'blue', 'tokens.css', 1)"
    );
    db.run(
      "INSERT INTO usages (file, line, column, class_name, resolved_token) VALUES ('Button.tsx', 10, 5, 'bg-primary', '--color-primary')"
    );

    db.close();

    const result = await executeDiscoverTool(testDir, configPath, {
      mode: "cascade",
      selector: "bg-primary",
      limit: 10,
      format: "compact",
    });

    expect(result.success).toBe(true);
    expect(result.mode).toBe("cascade");
  });

  test("returns error for cascade mode without selector", async () => {
    const northDir = resolve(testDir, ".north");
    const northHiddenDir = resolve(testDir, ".north", "state");
    await mkdir(northDir, { recursive: true });
    await mkdir(northHiddenDir, { recursive: true });

    const configPath = resolve(northDir, "config.yaml");
    await writeFile(configPath, "compatibility:\n  tailwind: '4'");

    const indexPath = resolve(northHiddenDir, "index.db");
    const { Database } = await import("bun:sqlite");
    const db = new Database(indexPath);

    db.run("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    db.run(
      "CREATE TABLE IF NOT EXISTS tokens (name TEXT PRIMARY KEY, value TEXT NOT NULL, file TEXT NOT NULL, line INTEGER NOT NULL)"
    );
    db.run(
      "CREATE TABLE IF NOT EXISTS usages (id INTEGER PRIMARY KEY, file TEXT NOT NULL, line INTEGER NOT NULL, column INTEGER NOT NULL, class_name TEXT NOT NULL, resolved_token TEXT)"
    );
    db.run(
      "CREATE TABLE IF NOT EXISTS patterns (hash TEXT PRIMARY KEY, classes TEXT NOT NULL, count INTEGER NOT NULL, locations TEXT NOT NULL)"
    );
    db.run(
      "CREATE TABLE IF NOT EXISTS token_graph (descendant TEXT NOT NULL, ancestor TEXT NOT NULL, depth INTEGER NOT NULL, path TEXT NOT NULL, PRIMARY KEY (descendant, ancestor))"
    );

    const sourceHash = await computeTestHash([configPath], testDir);
    db.run("INSERT INTO meta (key, value) VALUES ('source_tree_hash', ?)", [sourceHash]);
    db.run("INSERT INTO meta (key, value) VALUES ('indexed_at', ?)", [new Date().toISOString()]);

    db.close();

    const result = await executeDiscoverTool(testDir, configPath, {
      mode: "cascade",
      limit: 10,
      format: "compact",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("selector");
  });

  test("returns error for similar mode without selector", async () => {
    const northDir = resolve(testDir, ".north");
    const northHiddenDir = resolve(testDir, ".north", "state");
    await mkdir(northDir, { recursive: true });
    await mkdir(northHiddenDir, { recursive: true });

    const configPath = resolve(northDir, "config.yaml");
    await writeFile(configPath, "compatibility:\n  tailwind: '4'");

    const indexPath = resolve(northHiddenDir, "index.db");
    const { Database } = await import("bun:sqlite");
    const db = new Database(indexPath);

    db.run("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    db.run(
      "CREATE TABLE IF NOT EXISTS tokens (name TEXT PRIMARY KEY, value TEXT NOT NULL, file TEXT NOT NULL, line INTEGER NOT NULL)"
    );
    db.run(
      "CREATE TABLE IF NOT EXISTS usages (id INTEGER PRIMARY KEY, file TEXT NOT NULL, line INTEGER NOT NULL, column INTEGER NOT NULL, class_name TEXT NOT NULL, resolved_token TEXT)"
    );
    db.run(
      "CREATE TABLE IF NOT EXISTS patterns (hash TEXT PRIMARY KEY, classes TEXT NOT NULL, count INTEGER NOT NULL, locations TEXT NOT NULL)"
    );
    db.run(
      "CREATE TABLE IF NOT EXISTS token_graph (descendant TEXT NOT NULL, ancestor TEXT NOT NULL, depth INTEGER NOT NULL, path TEXT NOT NULL, PRIMARY KEY (descendant, ancestor))"
    );

    const sourceHash = await computeTestHash([configPath], testDir);
    db.run("INSERT INTO meta (key, value) VALUES ('source_tree_hash', ?)", [sourceHash]);
    db.run("INSERT INTO meta (key, value) VALUES ('indexed_at', ?)", [new Date().toISOString()]);

    db.close();

    const result = await executeDiscoverTool(testDir, configPath, {
      mode: "similar",
      limit: 10,
      format: "compact",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("selector");
  });
});

describe("DiscoverPayload structure", () => {
  const testDir = resolve(import.meta.dir, ".test-fixtures-discover-payload");

  beforeEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test("has all required fields on success", async () => {
    const northDir = resolve(testDir, ".north");
    const northHiddenDir = resolve(testDir, ".north", "state");
    await mkdir(northDir, { recursive: true });
    await mkdir(northHiddenDir, { recursive: true });

    const configPath = resolve(northDir, "config.yaml");
    await writeFile(configPath, "compatibility:\n  tailwind: '4'");

    const indexPath = resolve(northHiddenDir, "index.db");
    const { Database } = await import("bun:sqlite");
    const db = new Database(indexPath);

    db.run("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    db.run(
      "CREATE TABLE IF NOT EXISTS tokens (name TEXT PRIMARY KEY, value TEXT NOT NULL, file TEXT NOT NULL, line INTEGER NOT NULL)"
    );
    db.run(
      "CREATE TABLE IF NOT EXISTS usages (id INTEGER PRIMARY KEY, file TEXT NOT NULL, line INTEGER NOT NULL, column INTEGER NOT NULL, class_name TEXT NOT NULL, resolved_token TEXT)"
    );
    db.run(
      "CREATE TABLE IF NOT EXISTS patterns (hash TEXT PRIMARY KEY, classes TEXT NOT NULL, count INTEGER NOT NULL, locations TEXT NOT NULL)"
    );
    db.run(
      "CREATE TABLE IF NOT EXISTS token_graph (descendant TEXT NOT NULL, ancestor TEXT NOT NULL, depth INTEGER NOT NULL, path TEXT NOT NULL, PRIMARY KEY (descendant, ancestor))"
    );

    const sourceHash = await computeTestHash([configPath], testDir);
    db.run("INSERT INTO meta (key, value) VALUES ('source_tree_hash', ?)", [sourceHash]);
    db.run("INSERT INTO meta (key, value) VALUES ('indexed_at', ?)", [new Date().toISOString()]);

    db.close();

    const payload: DiscoverPayload = await executeDiscoverTool(testDir, configPath, {
      mode: "colors",
      limit: 10,
      format: "compact",
    });

    expect(payload).toHaveProperty("success");
    expect(payload).toHaveProperty("mode");
    expect(payload).toHaveProperty("summary");
  });

  test("has error field on failure", async () => {
    const northDir = resolve(testDir, ".north");
    await mkdir(northDir, { recursive: true });

    const configPath = resolve(northDir, "config.yaml");
    await writeFile(configPath, "compatibility:\n  tailwind: '4'");

    const payload: DiscoverPayload = await executeDiscoverTool(testDir, configPath, {
      mode: "colors",
      limit: 10,
      format: "compact",
    });

    expect(payload.success).toBe(false);
    expect(payload).toHaveProperty("error");
  });
});
