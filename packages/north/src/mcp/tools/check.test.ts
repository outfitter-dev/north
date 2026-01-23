import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { type CheckResponse, executeCheckTool } from "./check.ts";

/**
 * Create a minimal placeholder rule for tests that don't need specific rules.
 */
async function createPlaceholderRule(rulesDir: string): Promise<void> {
  await writeFile(
    resolve(rulesDir, "placeholder.yaml"),
    `id: north/placeholder
language: tsx
severity: "off"
message: "Placeholder rule for testing"
rule:
  kind: string_fragment
  regex: "^$"
`
  );
}

/**
 * Create the no-raw-palette rule for testing.
 * Note: In YAML double-quoted strings, backslashes need to be escaped.
 * So \\d in the file requires \\\\d in the JS template literal.
 */
async function createNoRawPaletteRule(rulesDir: string): Promise<void> {
  await writeFile(
    resolve(rulesDir, "no-raw-palette.yaml"),
    `id: north/no-raw-palette
language: tsx
severity: error
message: "Use semantic color tokens instead of raw Tailwind palette colors"
rule:
  kind: string_fragment
  regex: "(bg|text|border|ring|fill|stroke)-(red|blue|green|yellow|gray|slate)-\\\\d+"
`
  );
}

describe("executeCheckTool", () => {
  const testDir = resolve(import.meta.dir, ".test-fixtures-check-tool");

  beforeEach(async () => {
    // Create fresh test directory
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });

  test("returns check response when config exists and no violations", async () => {
    // Create .north/config.yaml
    const northDir = resolve(testDir, ".north");
    const rulesDir = resolve(northDir, "rules");
    await mkdir(rulesDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(
      configPath,
      `compatibility:
  tailwind: "4"
  shadcn: "2"
`
    );

    // Create a placeholder rule
    await createPlaceholderRule(rulesDir);

    // Create a clean component file (no violations)
    const srcDir = resolve(testDir, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      resolve(srcDir, "Button.tsx"),
      `export function Button({ children }: { children: React.ReactNode }) {
  return <button className="bg-primary text-primary-foreground">{children}</button>;
}
`
    );

    const payload = await executeCheckTool(testDir, configPath, {
      files: [resolve(srcDir, "Button.tsx")],
    });

    expect(payload.kind).toBe("check");
    expect(payload.passed).toBe(true);
    expect(payload.violations).toBeInstanceOf(Array);
    expect(payload.summary.errors).toBe(0);
  });

  test("detects no-raw-palette violation", async () => {
    // Create .north/config.yaml and rules
    const northDir = resolve(testDir, ".north");
    const rulesDir = resolve(northDir, "rules");
    await mkdir(rulesDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(
      configPath,
      `compatibility:
  tailwind: "4"
`
    );

    // Create the no-raw-palette rule
    await createNoRawPaletteRule(rulesDir);

    // Create a component with a violation
    const srcDir = resolve(testDir, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      resolve(srcDir, "Card.tsx"),
      `export function Card() {
  return <div className="bg-blue-500 p-4">Content</div>;
}
`
    );

    const payload = await executeCheckTool(testDir, configPath, {
      files: [resolve(srcDir, "Card.tsx")],
    });

    expect(payload.kind).toBe("check");
    expect(payload.passed).toBe(false);
    expect(payload.summary.errors).toBeGreaterThan(0);
    expect(payload.violations.some((v) => v.ruleKey === "no-raw-palette")).toBe(true);
  });

  test("filters violations by rules parameter", async () => {
    // Create .north/config.yaml and rules
    const northDir = resolve(testDir, ".north");
    const rulesDir = resolve(northDir, "rules");
    await mkdir(rulesDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(
      configPath,
      `compatibility:
  tailwind: "4"
`
    );

    // Create multiple rules
    await createNoRawPaletteRule(rulesDir);

    await writeFile(
      resolve(rulesDir, "numeric-spacing-in-component.yaml"),
      `id: north/numeric-spacing-in-component
language: tsx
severity: warn
message: "Avoid numeric Tailwind spacing in components"
rule:
  kind: string_fragment
  regex: "(p|m|gap)-\\\\d+"
`
    );

    // Create a component with multiple violations
    const srcDir = resolve(testDir, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      resolve(srcDir, "Widget.tsx"),
      `export function Widget() {
  return <div className="bg-gray-500 p-4 m-2">Content</div>;
}
`
    );

    const payload = await executeCheckTool(testDir, configPath, {
      files: [resolve(srcDir, "Widget.tsx")],
      rules: ["no-raw-palette"],
    });

    expect(payload.filteredRules).toEqual(["no-raw-palette"]);
    // Should only have no-raw-palette violations
    expect(payload.violations.every((v) => v.ruleKey === "no-raw-palette")).toBe(true);
  });

  test("includes fix suggestions when fix=true", async () => {
    // Create .north/config.yaml and rules
    const northDir = resolve(testDir, ".north");
    const rulesDir = resolve(northDir, "rules");
    await mkdir(rulesDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(
      configPath,
      `compatibility:
  tailwind: "4"
`
    );

    await createNoRawPaletteRule(rulesDir);

    // Create a component with a violation
    const srcDir = resolve(testDir, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      resolve(srcDir, "Alert.tsx"),
      `export function Alert() {
  return <div className="bg-red-500">Alert!</div>;
}
`
    );

    const payload = await executeCheckTool(testDir, configPath, {
      files: [resolve(srcDir, "Alert.tsx")],
      fix: true,
    });

    const violation = payload.violations.find((v) => v.ruleKey === "no-raw-palette");
    expect(violation).toBeDefined();
    expect(violation?.fix).toBeDefined();
    expect(violation?.fix?.description).toContain("Replace raw Tailwind palette color");
  });

  test("does not include fix suggestions when fix=false", async () => {
    // Create .north/config.yaml and rules
    const northDir = resolve(testDir, ".north");
    const rulesDir = resolve(northDir, "rules");
    await mkdir(rulesDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(
      configPath,
      `compatibility:
  tailwind: "4"
`
    );

    await createNoRawPaletteRule(rulesDir);

    // Create a component with a violation
    const srcDir = resolve(testDir, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      resolve(srcDir, "Alert.tsx"),
      `export function Alert() {
  return <div className="bg-red-500">Alert!</div>;
}
`
    );

    const payload = await executeCheckTool(testDir, configPath, {
      files: [resolve(srcDir, "Alert.tsx")],
      fix: false,
    });

    const violation = payload.violations.find((v) => v.ruleKey === "no-raw-palette");
    expect(violation).toBeDefined();
    expect(violation?.fix).toBeUndefined();
  });

  test("returns response when no files are provided", async () => {
    // Create .north/config.yaml
    const northDir = resolve(testDir, ".north");
    const rulesDir = resolve(northDir, "rules");
    await mkdir(rulesDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(
      configPath,
      `compatibility:
  tailwind: "4"
`
    );

    // Create a placeholder rule
    await createPlaceholderRule(rulesDir);

    // Don't create any TSX/JSX files
    const payload = await executeCheckTool(testDir, configPath, {});

    expect(payload.kind).toBe("check");
    // No files means no errors
    expect(payload.violations).toHaveLength(0);
    expect(payload.stats.totalFiles).toBe(0);
  });
});

describe("CheckResponse structure", () => {
  const testDir = resolve(import.meta.dir, ".test-fixtures-check-response");

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

    // Create placeholder rule
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

    const payload: CheckResponse = await executeCheckTool(testDir, configPath, {});

    // Verify all required fields exist
    expect(payload).toHaveProperty("kind");
    expect(payload).toHaveProperty("summary");
    expect(payload).toHaveProperty("violations");
    expect(payload).toHaveProperty("stats");
    expect(payload).toHaveProperty("passed");

    // Verify summary structure
    expect(payload.summary).toHaveProperty("errors");
    expect(payload.summary).toHaveProperty("warnings");
    expect(payload.summary).toHaveProperty("info");

    // Verify stats structure
    expect(payload.stats).toHaveProperty("totalFiles");
    expect(payload.stats).toHaveProperty("filesWithClasses");
    expect(payload.stats).toHaveProperty("extractedClassCount");
    expect(payload.stats).toHaveProperty("coveragePercent");
  });
});

describe("CheckViolation structure", () => {
  const testDir = resolve(import.meta.dir, ".test-fixtures-check-violation");

  beforeEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test("violation has all required fields", async () => {
    const northDir = resolve(testDir, ".north");
    const rulesDir = resolve(northDir, "rules");
    await mkdir(rulesDir, { recursive: true });
    const configPath = resolve(northDir, "config.yaml");
    await writeFile(configPath, "compatibility:\n  tailwind: '4'");

    await writeFile(
      resolve(rulesDir, "no-raw-palette.yaml"),
      `id: north/no-raw-palette
language: tsx
severity: error
message: "Use semantic color tokens instead of raw Tailwind palette colors"
rule:
  kind: string_fragment
  regex: "(bg|text|border|ring|fill|stroke)-(red|blue|green|yellow|gray|slate)-\\\\d+"
`
    );

    const srcDir = resolve(testDir, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      resolve(srcDir, "Test.tsx"),
      `export function Test() {
  return <div className="bg-blue-500">Test</div>;
}
`
    );

    const payload = await executeCheckTool(testDir, configPath, {
      files: [resolve(srcDir, "Test.tsx")],
    });

    expect(payload.violations.length).toBeGreaterThan(0);
    const violation = payload.violations[0];

    // Verify violation structure
    expect(violation).toHaveProperty("ruleId");
    expect(violation).toHaveProperty("ruleKey");
    expect(violation).toHaveProperty("severity");
    expect(violation).toHaveProperty("message");
    expect(violation).toHaveProperty("file");
    expect(violation).toHaveProperty("line");
    expect(violation).toHaveProperty("column");

    // Verify severity is one of the expected values
    expect(["error", "warn", "info"]).toContain(violation?.severity);
  });
});
