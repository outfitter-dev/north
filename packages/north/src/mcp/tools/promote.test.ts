import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  type PromoteResponse,
  detectTokenType,
  executePromoteTool,
  generateSuggestedName,
} from "./promote.ts";

// ============================================================================
// Type Detection Tests
// ============================================================================

describe("detectTokenType", () => {
  test("detects hex colors", () => {
    expect(detectTokenType("#3b82f6")).toBe("color");
    expect(detectTokenType("#fff")).toBe("color");
    expect(detectTokenType("#FFFFFF")).toBe("color");
    expect(detectTokenType("#00000080")).toBe("color"); // with alpha
  });

  test("detects rgb/rgba colors", () => {
    expect(detectTokenType("rgb(59, 130, 246)")).toBe("color");
    expect(detectTokenType("rgba(59, 130, 246, 0.5)")).toBe("color");
    expect(detectTokenType("RGB(255, 255, 255)")).toBe("color");
  });

  test("detects hsl/hsla colors", () => {
    expect(detectTokenType("hsl(217, 91%, 60%)")).toBe("color");
    expect(detectTokenType("hsla(217, 91%, 60%, 0.5)")).toBe("color");
  });

  test("detects oklch colors", () => {
    expect(detectTokenType("oklch(0.7 0.15 240)")).toBe("color");
  });

  test("detects px spacing values", () => {
    expect(detectTokenType("16px")).toBe("spacing");
    expect(detectTokenType("4px")).toBe("spacing");
    expect(detectTokenType("24.5px")).toBe("spacing");
  });

  test("detects rem spacing values", () => {
    expect(detectTokenType("1rem")).toBe("spacing");
    expect(detectTokenType("0.5rem")).toBe("spacing");
    expect(detectTokenType("2.5rem")).toBe("spacing");
  });

  test("detects em spacing values", () => {
    expect(detectTokenType("1em")).toBe("spacing");
    expect(detectTokenType("0.875em")).toBe("spacing");
  });

  test("detects shadow values", () => {
    expect(detectTokenType("0px 4px 6px rgba(0,0,0,0.1)")).toBe("shadow");
    expect(detectTokenType("shadow-lg")).toBe("shadow");
    expect(detectTokenType("box-shadow: 0 1px 2px")).toBe("shadow");
  });

  test("detects numeric values as spacing", () => {
    expect(detectTokenType("16")).toBe("spacing");
    expect(detectTokenType("4")).toBe("spacing");
  });

  test("returns color as default for unknown values", () => {
    expect(detectTokenType("unknown-value")).toBe("color");
  });
});

// ============================================================================
// Name Generation Tests
// ============================================================================

describe("generateSuggestedName", () => {
  test("generates name for known hex colors", () => {
    expect(generateSuggestedName("#3b82f6", "color")).toBe("--color-blue-500");
    expect(generateSuggestedName("#ef4444", "color")).toBe("--color-red-500");
    expect(generateSuggestedName("#22c55e", "color")).toBe("--color-green-500");
  });

  test("generates name for unknown hex colors", () => {
    expect(generateSuggestedName("#abc123", "color")).toBe("--color-custom-abc123");
    expect(generateSuggestedName("#ABC123", "color")).toBe("--color-custom-abc123");
  });

  test("generates name for px spacing values", () => {
    expect(generateSuggestedName("4px", "spacing")).toBe("--spacing-xs");
    expect(generateSuggestedName("8px", "spacing")).toBe("--spacing-sm");
    expect(generateSuggestedName("16px", "spacing")).toBe("--spacing-md");
    expect(generateSuggestedName("24px", "spacing")).toBe("--spacing-lg");
    expect(generateSuggestedName("32px", "spacing")).toBe("--spacing-xl");
    expect(generateSuggestedName("48px", "spacing")).toBe("--spacing-2xl");
  });

  test("generates name for rem spacing values", () => {
    expect(generateSuggestedName("0.25rem", "spacing")).toBe("--spacing-xs");
    expect(generateSuggestedName("0.5rem", "spacing")).toBe("--spacing-sm");
    expect(generateSuggestedName("1rem", "spacing")).toBe("--spacing-md");
    expect(generateSuggestedName("1.5rem", "spacing")).toBe("--spacing-lg");
    expect(generateSuggestedName("2rem", "spacing")).toBe("--spacing-xl");
  });

  test("generates name for radius values", () => {
    expect(generateSuggestedName("2px", "radius")).toBe("--radius-sm");
    expect(generateSuggestedName("4px", "radius")).toBe("--radius-md");
    expect(generateSuggestedName("8px", "radius")).toBe("--radius-lg");
    expect(generateSuggestedName("16px", "radius")).toBe("--radius-xl");
  });

  test("generates fallback names for other types", () => {
    expect(generateSuggestedName("Inter", "font")).toBe("--font-custom");
    expect(generateSuggestedName("0 4px 6px", "shadow")).toBe("--shadow-custom");
  });
});

// ============================================================================
// executePromoteTool Tests
// ============================================================================

describe("executePromoteTool", () => {
  const testDir = resolve(import.meta.dir, ".test-fixtures-promote-tool");

  beforeEach(async () => {
    // Create fresh test directory
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });

  test("returns promote response for color value", async () => {
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

    const response = await executePromoteTool(testDir, configPath, {
      value: "#3b82f6",
    });

    expect(response.kind).toBe("promote");
    expect(response.value).toBe("#3b82f6");
    expect(response.type).toBe("color");
    expect(response.suggestedName).toBe("--color-blue-500");
    expect(response.recommendation).toBeDefined();
    expect(response.recommendation.action).toBe("create");
  });

  test("returns promote response for spacing value", async () => {
    const northDir = resolve(testDir, ".north");
    await mkdir(northDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(configPath, "compatibility:\n  tailwind: '4'");

    const response = await executePromoteTool(testDir, configPath, {
      value: "16px",
    });

    expect(response.kind).toBe("promote");
    expect(response.value).toBe("16px");
    expect(response.type).toBe("spacing");
    expect(response.suggestedName).toBe("--spacing-md");
  });

  test("uses provided type hint over detection", async () => {
    const northDir = resolve(testDir, ".north");
    await mkdir(northDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(configPath, "compatibility:\n  tailwind: '4'");

    const response = await executePromoteTool(testDir, configPath, {
      value: "4px",
      type: "radius",
    });

    expect(response.type).toBe("radius");
    expect(response.suggestedName).toBe("--radius-md");
  });

  test("uses provided suggested name over generation", async () => {
    const northDir = resolve(testDir, ".north");
    await mkdir(northDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(configPath, "compatibility:\n  tailwind: '4'");

    const response = await executePromoteTool(testDir, configPath, {
      value: "#3b82f6",
      suggestedName: "--color-primary",
    });

    expect(response.suggestedName).toBe("--color-primary");
  });

  test("includes empty existingUsage when analyze is false", async () => {
    const northDir = resolve(testDir, ".north");
    await mkdir(northDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(configPath, "compatibility:\n  tailwind: '4'");

    const response = await executePromoteTool(testDir, configPath, {
      value: "#3b82f6",
      analyze: false,
    });

    expect(response.existingUsage).toEqual({ files: [], count: 0 });
  });

  test("includes empty similarTokens when no index exists", async () => {
    const northDir = resolve(testDir, ".north");
    await mkdir(northDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(configPath, "compatibility:\n  tailwind: '4'");

    const response = await executePromoteTool(testDir, configPath, {
      value: "#3b82f6",
      analyze: true,
    });

    expect(response.similarTokens).toEqual([]);
  });
});

// ============================================================================
// PromoteResponse Structure Tests
// ============================================================================

describe("PromoteResponse structure", () => {
  const testDir = resolve(import.meta.dir, ".test-fixtures-promote-response");

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

    const response: PromoteResponse = await executePromoteTool(testDir, configPath, {
      value: "#3b82f6",
    });

    // Verify all required fields exist
    expect(response).toHaveProperty("kind");
    expect(response).toHaveProperty("value");
    expect(response).toHaveProperty("type");
    expect(response).toHaveProperty("suggestedName");
    expect(response).toHaveProperty("existingUsage");
    expect(response).toHaveProperty("similarTokens");
    expect(response).toHaveProperty("recommendation");

    // Verify nested structure
    expect(response.existingUsage).toHaveProperty("files");
    expect(response.existingUsage).toHaveProperty("count");

    expect(response.recommendation).toHaveProperty("action");
    expect(response.recommendation).toHaveProperty("tokenName");
    expect(response.recommendation).toHaveProperty("rationale");
    expect(response.recommendation).toHaveProperty("implementation");
  });

  test("recommendation action is valid enum value", async () => {
    const northDir = resolve(testDir, ".north");
    await mkdir(northDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(configPath, "compatibility:\n  tailwind: '4'");

    const response = await executePromoteTool(testDir, configPath, {
      value: "#3b82f6",
    });

    expect(["create", "use-existing", "extend"]).toContain(response.recommendation.action);
  });

  test("recommendation includes implementation guidance", async () => {
    const northDir = resolve(testDir, ".north");
    await mkdir(northDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(configPath, "compatibility:\n  tailwind: '4'");

    const response = await executePromoteTool(testDir, configPath, {
      value: "#3b82f6",
    });

    expect(response.recommendation.implementation).toBeTruthy();
    expect(response.recommendation.implementation.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Input Validation Tests
// ============================================================================

describe("PromoteInputSchema validation", () => {
  const testDir = resolve(import.meta.dir, ".test-fixtures-promote-validation");

  beforeEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test("accepts valid color value", async () => {
    const northDir = resolve(testDir, ".north");
    await mkdir(northDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(configPath, "compatibility:\n  tailwind: '4'");

    // Should not throw
    const response = await executePromoteTool(testDir, configPath, {
      value: "#3b82f6",
    });

    expect(response.kind).toBe("promote");
  });

  test("accepts valid spacing value", async () => {
    const northDir = resolve(testDir, ".north");
    await mkdir(northDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(configPath, "compatibility:\n  tailwind: '4'");

    const response = await executePromoteTool(testDir, configPath, {
      value: "16px",
    });

    expect(response.kind).toBe("promote");
  });

  test("accepts all valid token types", async () => {
    const northDir = resolve(testDir, ".north");
    await mkdir(northDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(configPath, "compatibility:\n  tailwind: '4'");

    const types = ["color", "spacing", "radius", "font", "shadow"] as const;

    for (const type of types) {
      const response = await executePromoteTool(testDir, configPath, {
        value: "test-value",
        type,
      });

      expect(response.type).toBe(type);
    }
  });
});
