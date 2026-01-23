import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { detectContext, detectProjectState, getConfigPath, getIndexPath } from "./state.ts";

describe("detectProjectState", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(resolve(tmpdir(), "north-state-"));
  });

  afterEach(async () => {
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });

  test("returns 'none' when no config file exists", async () => {
    const state = await detectProjectState(testDir);
    expect(state).toBe("none");
  });

  test("returns 'config' when config exists but no index", async () => {
    // Create .north/config.yaml
    const northDir = resolve(testDir, ".north");
    await mkdir(northDir, { recursive: true });
    await writeFile(resolve(northDir, "config.yaml"), "compatibility:\n  tailwind: 4\n  shadcn: 2");

    const state = await detectProjectState(testDir);
    expect(state).toBe("config");
  });

  test("returns 'indexed' when both config and index exist", async () => {
    // Create .north/config.yaml
    const northDir = resolve(testDir, ".north");
    await mkdir(northDir, { recursive: true });
    await writeFile(resolve(northDir, "config.yaml"), "compatibility:\n  tailwind: 4\n  shadcn: 2");

    // Create .north/state/index.db
    const indexDir = resolve(testDir, ".north", "state");
    await mkdir(indexDir, { recursive: true });
    await writeFile(resolve(indexDir, "index.db"), "fake-db-content");

    const state = await detectProjectState(testDir);
    expect(state).toBe("indexed");
  });
});

describe("detectContext", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(resolve(tmpdir(), "north-context-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test("returns state 'none' and cwd when no config exists", async () => {
    const ctx = await detectContext(testDir);

    expect(ctx.state).toBe("none");
    expect(ctx.cwd).toBe(testDir);
    expect(ctx.configPath).toBeUndefined();
    expect(ctx.indexPath).toBeUndefined();
  });

  test("returns state 'config' with configPath when config exists", async () => {
    const northDir = resolve(testDir, ".north");
    await mkdir(northDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(configPath, "compatibility:\n  tailwind: 4");

    const ctx = await detectContext(testDir);

    expect(ctx.state).toBe("config");
    expect(ctx.cwd).toBe(testDir);
    expect(ctx.configPath).toBe(configPath);
    expect(ctx.indexPath).toBeUndefined();
  });

  test("returns state 'indexed' with both paths when both exist", async () => {
    // Create config
    const northDir = resolve(testDir, ".north");
    await mkdir(northDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(configPath, "compatibility:\n  tailwind: 4");

    // Create index
    const indexDir = resolve(testDir, ".north", "state");
    await mkdir(indexDir, { recursive: true });
    const indexPath = resolve(indexDir, "index.db");
    await writeFile(indexPath, "fake-db-content");

    const ctx = await detectContext(testDir);

    expect(ctx.state).toBe("indexed");
    expect(ctx.cwd).toBe(testDir);
    expect(ctx.configPath).toBe(configPath);
    expect(ctx.indexPath).toBe(indexPath);
  });
});

describe("path helpers", () => {
  test("getConfigPath returns expected path", () => {
    const path = getConfigPath("/project");
    expect(path).toBe("/project/.north/config.yaml");
  });

  test("getIndexPath returns expected path", () => {
    const path = getIndexPath("/project");
    expect(path).toBe("/project/.north/state/index.db");
  });
});
