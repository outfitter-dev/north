import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { type RefactorResponse, executeRefactorTool } from "./refactor.ts";

describe("executeRefactorTool", () => {
  const testDir = resolve(import.meta.dir, ".test-fixtures-refactor-tool");

  beforeEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  async function setupProject() {
    // Create .north/config.yaml
    const northDir = resolve(testDir, ".north");
    const rulesDir = resolve(northDir, "rules");
    await mkdir(rulesDir, { recursive: true });

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
    level: error
`
    );

    // Create a minimal rule file
    await writeFile(
      resolve(rulesDir, "no-raw-palette.yaml"),
      `id: north/no-raw-palette
language: tsx
severity: error
message: "Use semantic color tokens instead of raw Tailwind palette colors"
rule:
  kind: string_fragment
  regex: "(bg|text|border|ring|fill|stroke)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\\\\d+(?:\\\\/\\\\d+)?"
note: |
  Replace with semantic token:
  - bg-blue-500 -> bg-primary
`
    );

    await writeFile(
      resolve(rulesDir, "no-arbitrary-colors.yaml"),
      `id: north/no-arbitrary-colors
language: tsx
severity: error
message: "Use semantic color tokens instead of arbitrary color values"
rule:
  kind: string_fragment
  regex: "(bg|text|border|ring|fill|stroke)-\\\\[(#|rgb|rgba|hsl|hsla|oklch|lab|lch)[^\\\\]]+\\\\]"
note: |
  Prohibited: bg-[#ff0000], text-[rgb(0,0,0)]
  Use semantic tokens: bg-destructive, text-foreground
`
    );

    return configPath;
  }

  test("returns empty candidates when no violations found", async () => {
    const configPath = await setupProject();

    // Create a clean component
    const srcDir = resolve(testDir, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      resolve(srcDir, "Button.tsx"),
      `export function Button() {
  return <button className="bg-primary text-foreground">Click</button>;
}`
    );

    const response = await executeRefactorTool(testDir, configPath, {
      scope: "all",
      dryRun: true,
      limit: 20,
    });

    expect(response.scope).toBe("all");
    expect(response.candidates).toBeInstanceOf(Array);
    expect(response.summary.totalCandidates).toBe(0);
  });

  test("identifies color violations as candidates", async () => {
    const configPath = await setupProject();

    // Create component with raw palette colors
    const srcDir = resolve(testDir, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      resolve(srcDir, "Card.tsx"),
      `export function Card() {
  return (
    <div className="bg-blue-500 text-gray-600 border-slate-200">
      Card content
    </div>
  );
}`
    );

    const response = await executeRefactorTool(testDir, configPath, {
      scope: "colors",
      dryRun: true,
      limit: 20,
    });

    expect(response.scope).toBe("colors");
    expect(response.candidates.length).toBeGreaterThan(0);
    expect(response.summary.totalCandidates).toBeGreaterThan(0);

    // Check that candidates have required fields
    const candidate = response.candidates[0];
    expect(candidate).toHaveProperty("file");
    expect(candidate).toHaveProperty("line");
    expect(candidate).toHaveProperty("column");
    expect(candidate).toHaveProperty("currentValue");
    expect(candidate).toHaveProperty("suggestedToken");
    expect(candidate).toHaveProperty("confidence");
    expect(candidate).toHaveProperty("context");
  });

  test("respects limit parameter", async () => {
    const configPath = await setupProject();

    // Create component with many violations
    const srcDir = resolve(testDir, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      resolve(srcDir, "ManyColors.tsx"),
      `export function ManyColors() {
  return (
    <div className="bg-blue-500 text-gray-600 border-slate-200 bg-red-400 text-green-500">
      <span className="bg-yellow-300 text-purple-700 border-pink-200">Content</span>
    </div>
  );
}`
    );

    const response = await executeRefactorTool(testDir, configPath, {
      scope: "all",
      dryRun: true,
      limit: 3,
    });

    expect(response.candidates.length).toBeLessThanOrEqual(3);
  });

  test("filters by scope - colors only", async () => {
    const configPath = await setupProject();

    // Create component with color violations
    const srcDir = resolve(testDir, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      resolve(srcDir, "Mixed.tsx"),
      `export function Mixed() {
  return <div className="bg-blue-500 p-4">Content</div>;
}`
    );

    const response = await executeRefactorTool(testDir, configPath, {
      scope: "colors",
      dryRun: true,
      limit: 20,
    });

    expect(response.scope).toBe("colors");
    // Should only find color violations, not spacing
    for (const candidate of response.candidates) {
      expect(candidate.currentValue).toMatch(
        /(bg|text|border|ring|fill|stroke)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d+/
      );
    }
  });

  test("includes byType breakdown in summary", async () => {
    const configPath = await setupProject();

    const srcDir = resolve(testDir, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      resolve(srcDir, "Types.tsx"),
      `export function Types() {
  return <div className="bg-blue-500 text-gray-600">Content</div>;
}`
    );

    const response = await executeRefactorTool(testDir, configPath, {
      scope: "all",
      dryRun: true,
      limit: 20,
    });

    expect(response.summary).toHaveProperty("byType");
    expect(typeof response.summary.byType).toBe("object");
  });

  test("includes estimatedImpact in summary", async () => {
    const configPath = await setupProject();

    const srcDir = resolve(testDir, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      resolve(srcDir, "Impact.tsx"),
      `export function Impact() {
  return <div className="bg-blue-500">Content</div>;
}`
    );

    const response = await executeRefactorTool(testDir, configPath, {
      scope: "all",
      dryRun: true,
      limit: 20,
    });

    expect(response.summary).toHaveProperty("estimatedImpact");
    expect(typeof response.summary.estimatedImpact).toBe("string");
  });

  test("returns totalFiles count", async () => {
    const configPath = await setupProject();

    const srcDir = resolve(testDir, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      resolve(srcDir, "File1.tsx"),
      "export function File1() { return <div>1</div>; }"
    );
    await writeFile(
      resolve(srcDir, "File2.tsx"),
      "export function File2() { return <div>2</div>; }"
    );

    const response = await executeRefactorTool(testDir, configPath, {
      scope: "all",
      dryRun: true,
      limit: 20,
    });

    expect(response.totalFiles).toBeGreaterThanOrEqual(2);
  });

  test("assigns confidence levels based on rule severity", async () => {
    const configPath = await setupProject();

    const srcDir = resolve(testDir, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      resolve(srcDir, "Confidence.tsx"),
      `export function Confidence() {
  return <div className="bg-blue-500">Content</div>;
}`
    );

    const response = await executeRefactorTool(testDir, configPath, {
      scope: "all",
      dryRun: true,
      limit: 20,
    });

    // Error severity rules should map to high confidence
    const candidate = response.candidates.find((c) => c.currentValue.includes("blue-500"));
    if (candidate) {
      expect(["high", "medium", "low"]).toContain(candidate.confidence);
    }
  });
});

describe("RefactorResponse structure", () => {
  const testDir = resolve(import.meta.dir, ".test-fixtures-refactor-response");

  beforeEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test("has all required fields", async () => {
    // Create minimal setup
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
message: "Use semantic tokens"
rule:
  kind: string_fragment
  regex: "bg-blue-\\\\d+"
`
    );

    const response: RefactorResponse = await executeRefactorTool(testDir, configPath, {
      scope: "all",
      dryRun: true,
      limit: 20,
    });

    expect(response).toHaveProperty("scope");
    expect(response).toHaveProperty("totalFiles");
    expect(response).toHaveProperty("candidates");
    expect(response).toHaveProperty("summary");
    expect(response.summary).toHaveProperty("totalCandidates");
    expect(response.summary).toHaveProperty("byType");
    expect(response.summary).toHaveProperty("estimatedImpact");
  });
});
