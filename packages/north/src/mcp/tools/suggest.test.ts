import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { type SuggestResponse, executeSuggestTool } from "./suggest.ts";

describe("executeSuggestTool", () => {
  const testDir = resolve(import.meta.dir, ".test-fixtures-suggest-tool");

  beforeEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  async function setupTestConfig(config: string): Promise<string> {
    const northDir = resolve(testDir, ".north");
    const rulesDir = resolve(northDir, "rules");
    await mkdir(rulesDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(configPath, config);

    // Create a placeholder rule
    await writeFile(
      resolve(rulesDir, "placeholder.yaml"),
      `id: north/placeholder
language: tsx
severity: "off"
message: "Placeholder"
rule:
  kind: string_fragment
  regex: "^$"
`
    );

    return configPath;
  }

  test("suggests semantic color replacement for raw palette class", async () => {
    const configPath = await setupTestConfig(`compatibility:
  tailwind: "4"
`);

    const srcDir = resolve(testDir, "src");
    await mkdir(srcDir, { recursive: true });
    const filePath = resolve(srcDir, "Button.tsx");
    await writeFile(
      filePath,
      `export function Button() {
  return <button className="bg-blue-500 text-white">Click me</button>;
}
`
    );

    const payload = await executeSuggestTool(testDir, configPath, {
      file: filePath,
      category: "colors",
    });

    expect(payload.kind).toBe("suggest");
    expect(payload.file).toBe(filePath);
    expect(payload.suggestions.length).toBeGreaterThan(0);

    const colorSuggestion = payload.suggestions.find((s) => s.current.includes("bg-blue-500"));
    expect(colorSuggestion).toBeDefined();
    expect(colorSuggestion?.category).toBe("color");
    expect(colorSuggestion?.suggested).toContain("primary");
  });

  test("suggests semantic spacing replacement for numeric spacing", async () => {
    const configPath = await setupTestConfig(`compatibility:
  tailwind: "4"
`);

    const srcDir = resolve(testDir, "src");
    await mkdir(srcDir, { recursive: true });
    const filePath = resolve(srcDir, "Card.tsx");
    await writeFile(
      filePath,
      `export function Card() {
  return <div className="p-4 m-2 gap-6">Content</div>;
}
`
    );

    const payload = await executeSuggestTool(testDir, configPath, {
      file: filePath,
      category: "spacing",
    });

    expect(payload.kind).toBe("suggest");
    expect(payload.suggestions.length).toBeGreaterThan(0);

    // Should suggest semantic spacing for p-4, m-2, gap-6
    const spacingSuggestions = payload.suggestions.filter((s) => s.category === "spacing");
    expect(spacingSuggestions.length).toBeGreaterThan(0);
  });

  test("filters by line number when provided", async () => {
    const configPath = await setupTestConfig(`compatibility:
  tailwind: "4"
`);

    const srcDir = resolve(testDir, "src");
    await mkdir(srcDir, { recursive: true });
    const filePath = resolve(srcDir, "Widget.tsx");
    await writeFile(
      filePath,
      `export function Widget() {
  return (
    <div className="bg-red-500">
      <span className="bg-green-500">Line 4</span>
    </div>
  );
}
`
    );

    const payload = await executeSuggestTool(testDir, configPath, {
      file: filePath,
      line: 4, // Line with bg-green-500
      category: "colors",
    });

    expect(payload.kind).toBe("suggest");
    expect(payload.line).toBe(4);
    // Should focus on line 4's classes
    const greenSuggestion = payload.suggestions.find((s) => s.current.includes("bg-green-500"));
    expect(greenSuggestion).toBeDefined();
  });

  test("suggests fix for specific violation when provided", async () => {
    const configPath = await setupTestConfig(`compatibility:
  tailwind: "4"
`);

    const srcDir = resolve(testDir, "src");
    await mkdir(srcDir, { recursive: true });
    const filePath = resolve(srcDir, "Alert.tsx");
    await writeFile(
      filePath,
      `export function Alert() {
  return <div className="bg-red-500 text-red-100">Alert!</div>;
}
`
    );

    const payload = await executeSuggestTool(testDir, configPath, {
      file: filePath,
      violation: "bg-red-500",
      category: "colors",
    });

    expect(payload.kind).toBe("suggest");
    const redSuggestion = payload.suggestions.find((s) => s.current === "bg-red-500");
    expect(redSuggestion).toBeDefined();
    expect(redSuggestion?.suggested).toContain("destructive");
    expect(redSuggestion?.confidence).toBe("high");
  });

  test("returns available tokens from config", async () => {
    const configPath = await setupTestConfig(`compatibility:
  tailwind: "4"
colors:
  primary: "oklch(0.6 0.15 250)"
  secondary: "oklch(0.7 0.1 180)"
  accent: "oklch(0.5 0.2 30)"
`);

    const srcDir = resolve(testDir, "src");
    await mkdir(srcDir, { recursive: true });
    const filePath = resolve(srcDir, "Test.tsx");
    await writeFile(
      filePath,
      `export function Test() {
  return <div className="bg-primary">Test</div>;
}
`
    );

    const payload = await executeSuggestTool(testDir, configPath, {
      file: filePath,
      category: "all",
    });

    // Should include semantic color tokens
    expect(payload.availableTokens.colors).toContain("primary");
    expect(payload.availableTokens.colors).toContain("secondary");
    expect(payload.availableTokens.colors).toContain("accent");
    expect(payload.availableTokens.spacing.length).toBeGreaterThan(0);
    expect(payload.availableTokens.typography.length).toBeGreaterThan(0);
  });

  test("includes guidance in response", async () => {
    const configPath = await setupTestConfig(`compatibility:
  tailwind: "4"
`);

    const srcDir = resolve(testDir, "src");
    await mkdir(srcDir, { recursive: true });
    const filePath = resolve(srcDir, "Empty.tsx");
    await writeFile(
      filePath,
      `export function Empty() {
  return <div>No classes</div>;
}
`
    );

    const payload = await executeSuggestTool(testDir, configPath, {
      file: filePath,
      category: "all",
    });

    expect(payload.guidance).toBeInstanceOf(Array);
    expect(payload.guidance.length).toBeGreaterThan(0);
    expect(payload.guidance.some((g) => g.includes("semantic"))).toBe(true);
  });

  test("handles file with no classes gracefully", async () => {
    const configPath = await setupTestConfig(`compatibility:
  tailwind: "4"
`);

    const srcDir = resolve(testDir, "src");
    await mkdir(srcDir, { recursive: true });
    const filePath = resolve(srcDir, "NoClasses.tsx");
    await writeFile(
      filePath,
      `export function NoClasses() {
  return <div>Plain content</div>;
}
`
    );

    const payload = await executeSuggestTool(testDir, configPath, {
      file: filePath,
      category: "all",
    });

    expect(payload.kind).toBe("suggest");
    expect(payload.suggestions).toHaveLength(0);
    expect(payload.availableTokens).toBeDefined();
  });

  test("suggests success/warning with medium confidence when tokens not in config", async () => {
    const configPath = await setupTestConfig(`compatibility:
  tailwind: "4"
`);

    const srcDir = resolve(testDir, "src");
    await mkdir(srcDir, { recursive: true });
    const filePath = resolve(srcDir, "Status.tsx");
    await writeFile(
      filePath,
      `export function Status() {
  return <div className="bg-green-500 text-yellow-500">Status</div>;
}
`
    );

    const payload = await executeSuggestTool(testDir, configPath, {
      file: filePath,
      category: "colors",
    });

    const successSuggestion = payload.suggestions.find((s) => s.current === "bg-green-500");
    expect(successSuggestion).toBeDefined();
    expect(successSuggestion?.suggested).toContain("success");
    expect(successSuggestion?.confidence).toBe("medium");
    expect(successSuggestion?.reason).toContain("not found in config");

    expect(payload.availableTokens.colors).not.toContain("success");
  });

  test("suggests success with high confidence when token IS in config", async () => {
    const configPath = await setupTestConfig(`compatibility:
  tailwind: "4"
colors:
  success: "oklch(0.65 0.2 145)"
`);

    const srcDir = resolve(testDir, "src");
    await mkdir(srcDir, { recursive: true });
    const filePath = resolve(srcDir, "Status.tsx");
    await writeFile(
      filePath,
      `export function Status() {
  return <div className="bg-green-500">Success</div>;
}
`
    );

    const payload = await executeSuggestTool(testDir, configPath, {
      file: filePath,
      category: "colors",
    });

    const successSuggestion = payload.suggestions.find((s) => s.current === "bg-green-500");
    expect(successSuggestion).toBeDefined();
    expect(successSuggestion?.confidence).toBe("high");
    expect(payload.availableTokens.colors).toContain("success");
  });
});

describe("SuggestResponse structure", () => {
  const testDir = resolve(import.meta.dir, ".test-fixtures-suggest-response");

  beforeEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test("has all required fields", async () => {
    const northDir = resolve(testDir, ".north");
    const rulesDir = resolve(northDir, "rules");
    await mkdir(rulesDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(configPath, "compatibility:\n  tailwind: '4'");

    await writeFile(
      resolve(rulesDir, "placeholder.yaml"),
      `id: north/placeholder
language: tsx
severity: "off"
message: Placeholder
rule:
  kind: string_fragment
  regex: "^$"
`
    );

    const srcDir = resolve(testDir, "src");
    await mkdir(srcDir, { recursive: true });
    const filePath = resolve(srcDir, "Test.tsx");
    await writeFile(
      filePath,
      `export function Test() {
  return <div className="bg-blue-500">Test</div>;
}
`
    );

    const payload: SuggestResponse = await executeSuggestTool(testDir, configPath, {
      file: filePath,
    });

    expect(payload).toHaveProperty("kind");
    expect(payload.kind).toBe("suggest");
    expect(payload).toHaveProperty("file");
    expect(payload).toHaveProperty("suggestions");
    expect(payload).toHaveProperty("guidance");
    expect(payload).toHaveProperty("availableTokens");

    expect(payload.availableTokens).toHaveProperty("colors");
    expect(payload.availableTokens).toHaveProperty("spacing");
    expect(payload.availableTokens).toHaveProperty("typography");
  });
});

describe("TokenSuggestion structure", () => {
  const testDir = resolve(import.meta.dir, ".test-fixtures-token-suggestion");

  beforeEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test("suggestion has all required fields", async () => {
    const northDir = resolve(testDir, ".north");
    const rulesDir = resolve(northDir, "rules");
    await mkdir(rulesDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(configPath, "compatibility:\n  tailwind: '4'");

    await writeFile(
      resolve(rulesDir, "placeholder.yaml"),
      `id: north/placeholder
language: tsx
severity: "off"
message: Placeholder
rule:
  kind: string_fragment
  regex: "^$"
`
    );

    const srcDir = resolve(testDir, "src");
    await mkdir(srcDir, { recursive: true });
    const filePath = resolve(srcDir, "Test.tsx");
    await writeFile(
      filePath,
      `export function Test() {
  return <div className="bg-red-500 p-4">Test</div>;
}
`
    );

    const payload = await executeSuggestTool(testDir, configPath, {
      file: filePath,
    });

    expect(payload.suggestions.length).toBeGreaterThan(0);
    const suggestion = payload.suggestions[0];

    expect(suggestion).toHaveProperty("current");
    expect(suggestion).toHaveProperty("suggested");
    expect(suggestion).toHaveProperty("category");
    expect(suggestion).toHaveProperty("confidence");
    expect(suggestion).toHaveProperty("reason");

    expect(["color", "spacing", "typography", "other"]).toContain(suggestion?.category);
    expect(["high", "medium", "low"]).toContain(suggestion?.confidence);
  });
});
