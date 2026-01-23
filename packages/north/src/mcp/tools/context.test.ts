import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { type ContextPayload, executeContextTool } from "./context.ts";

describe("executeContextTool", () => {
  const testDir = resolve(import.meta.dir, ".test-fixtures-context-tool");

  beforeEach(async () => {
    // Create fresh test directory
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });

  test("returns context payload when config exists", async () => {
    // Create .north/config.yaml
    const northDir = resolve(testDir, ".north");
    await mkdir(northDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(
      configPath,
      `
compatibility:
  tailwind: "4"
  shadcn: "2"
dials:
  radius: md
  density: default
`
    );

    const payload = await executeContextTool(testDir, configPath, false);

    expect(payload.kind).toBe("context");
    expect(payload.compact).toBe(false);
    expect(payload.project.configPath).toBe(configPath);
    // Verify dials contains expected values (may have defaults added by config loader)
    expect(payload.dials.radius).toBe("md");
    expect(payload.dials.density).toBe("default");
    expect(payload.compatibility).toEqual({ tailwind: "4", shadcn: "2" });
    expect(payload.guidance).toBeInstanceOf(Array);
    expect(payload.guidance.length).toBeGreaterThan(0);
  });

  test("returns compact payload when compact is true", async () => {
    // Create .north/config.yaml
    const northDir = resolve(testDir, ".north");
    await mkdir(northDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(
      configPath,
      `
compatibility:
  tailwind: "4"
`
    );

    const payload = await executeContextTool(testDir, configPath, true);

    expect(payload.kind).toBe("context");
    expect(payload.compact).toBe(true);
  });

  test("includes rule summary from config", async () => {
    // Create .north/config.yaml with rules
    const northDir = resolve(testDir, ".north");
    await mkdir(northDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(
      configPath,
      `
compatibility:
  tailwind: "4"
rules:
  no-raw-palette:
    level: error
  no-arbitrary-colors:
    level: warn
`
    );

    const payload = await executeContextTool(testDir, configPath, false);

    expect(payload.rules).toBeInstanceOf(Array);
    expect(payload.rules.length).toBe(2);
    expect(payload.rules).toContainEqual({ rule: "no-raw-palette", level: "error" });
    expect(payload.rules).toContainEqual({ rule: "no-arbitrary-colors", level: "warn" });
  });

  test("includes deviation tracking guidance when rule is enabled", async () => {
    // Create .north/config.yaml with deviation-tracking rule
    const northDir = resolve(testDir, ".north");
    await mkdir(northDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(
      configPath,
      `
compatibility:
  tailwind: "4"
rules:
  deviation-tracking:
    level: warn
`
    );

    const payload = await executeContextTool(testDir, configPath, false);

    expect(payload.guidance).toContain("Document deviations with @north-deviation comments.");
  });

  test("includes index status in payload", async () => {
    // Create .north/config.yaml
    const northDir = resolve(testDir, ".north");
    await mkdir(northDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(
      configPath,
      `
compatibility:
  tailwind: "4"
`
    );

    const payload = await executeContextTool(testDir, configPath, false);

    expect(payload.index).toBeDefined();
    expect(payload.index.path).toContain(".north/state/index.db");
    expect(payload.index.exists).toBe(false);
    expect(payload.index.fresh).toBe(false);
    // Verify index counts has expected zero values
    expect(payload.index.counts.tokens).toBe(0);
    expect(payload.index.counts.usages).toBe(0);
    expect(payload.index.counts.patterns).toBe(0);
  });

  test("includes project paths in payload", async () => {
    // Create .north/config.yaml
    const northDir = resolve(testDir, ".north");
    await mkdir(northDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(
      configPath,
      `
compatibility:
  tailwind: "4"
`
    );

    const payload = await executeContextTool(testDir, configPath, false);

    expect(payload.project.configPath).toBe(configPath);
    expect(payload.project.generatedTokens).toContain(".north/tokens/generated.css");
    expect(payload.project.baseTokens).toContain(".north/tokens/base.css");
    expect(payload.project.generatedExists).toBe(false);
    expect(payload.project.baseExists).toBe(false);
  });

  test("detects generated token files when they exist", async () => {
    // Create .north/config.yaml
    const northDir = resolve(testDir, ".north");
    const tokensDir = resolve(northDir, "tokens");
    await mkdir(tokensDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(
      configPath,
      `
compatibility:
  tailwind: "4"
`
    );

    // Create token files
    await writeFile(resolve(tokensDir, "generated.css"), ":root { --color-primary: blue; }");
    await writeFile(resolve(tokensDir, "base.css"), ":root { --spacing-1: 0.25rem; }");

    const payload = await executeContextTool(testDir, configPath, false);

    expect(payload.project.generatedExists).toBe(true);
    expect(payload.project.baseExists).toBe(true);
  });

  test("throws error when config file is invalid", async () => {
    // Create .north/config.yaml with invalid content
    const northDir = resolve(testDir, ".north");
    await mkdir(northDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(configPath, "invalid: yaml: content:");

    await expect(executeContextTool(testDir, configPath, false)).rejects.toThrow();
  });
});

describe("ContextPayload structure", () => {
  const testDir = resolve(import.meta.dir, ".test-fixtures-context-payload");

  beforeEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test("has all required fields", async () => {
    const northDir = resolve(testDir, ".north");
    await mkdir(northDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(configPath, "compatibility:\n  tailwind: '4'");

    const payload: ContextPayload = await executeContextTool(testDir, configPath, false);

    // Verify all required fields exist
    expect(payload).toHaveProperty("kind");
    expect(payload).toHaveProperty("compact");
    expect(payload).toHaveProperty("project");
    expect(payload).toHaveProperty("dials");
    expect(payload).toHaveProperty("typography");
    expect(payload).toHaveProperty("policy");
    expect(payload).toHaveProperty("compatibility");
    expect(payload).toHaveProperty("rules");
    expect(payload).toHaveProperty("index");
    expect(payload).toHaveProperty("guidance");

    // Verify nested structure
    expect(payload.project).toHaveProperty("configPath");
    expect(payload.project).toHaveProperty("generatedTokens");
    expect(payload.project).toHaveProperty("baseTokens");
    expect(payload.project).toHaveProperty("generatedExists");
    expect(payload.project).toHaveProperty("baseExists");

    expect(payload.index).toHaveProperty("path");
    expect(payload.index).toHaveProperty("exists");
    expect(payload.index).toHaveProperty("fresh");
    expect(payload.index).toHaveProperty("counts");
  });
});
