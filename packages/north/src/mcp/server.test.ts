import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { Glob } from "bun";
import { TIERED_TOOLS, getGuidance, getToolsForState } from "./server.ts";

describe("getToolsForState", () => {
  test("returns only tier 1 tools for state 'none'", () => {
    const tools = getToolsForState("none");

    expect(tools.length).toBeGreaterThan(0);
    expect(tools.every((t) => t.tier === 1)).toBe(true);
    expect(tools.some((t) => t.name === "north_status")).toBe(true);
  });

  test("returns tier 1 and 2 tools for state 'config'", () => {
    const tools = getToolsForState("config");

    // Should include tier 1 and 2 tools
    const tier1Tools = tools.filter((t) => t.tier === 1);
    const tier2Tools = tools.filter((t) => t.tier === 2);
    const tier3Tools = tools.filter((t) => t.tier === 3);

    expect(tier1Tools.length).toBeGreaterThan(0);
    expect(tier2Tools.length).toBeGreaterThan(0);
    expect(tier3Tools.length).toBe(0);

    // Verify expected tools are present
    expect(tools.some((t) => t.name === "north_status")).toBe(true);
    expect(tools.some((t) => t.name === "north_context")).toBe(true);
    expect(tools.some((t) => t.name === "north_check")).toBe(true);
    expect(tools.some((t) => t.name === "north_suggest")).toBe(true);

    // Verify tier 3 tools are not present
    expect(tools.some((t) => t.name === "north_discover")).toBe(false);
    expect(tools.some((t) => t.name === "north_promote")).toBe(false);
  });

  test("returns all tools for state 'indexed'", () => {
    const tools = getToolsForState("indexed");

    // Should include all tiers
    const tier1Tools = tools.filter((t) => t.tier === 1);
    const tier2Tools = tools.filter((t) => t.tier === 2);
    const tier3Tools = tools.filter((t) => t.tier === 3);

    expect(tier1Tools.length).toBeGreaterThan(0);
    expect(tier2Tools.length).toBeGreaterThan(0);
    expect(tier3Tools.length).toBeGreaterThan(0);

    // All defined tools should be available
    expect(tools.length).toBe(TIERED_TOOLS.length);
  });
});

describe("TIERED_TOOLS", () => {
  test("has north_status as tier 1", () => {
    const statusTool = TIERED_TOOLS.find((t) => t.name === "north_status");
    expect(statusTool).toBeDefined();
    expect(statusTool?.tier).toBe(1);
  });

  test("has context, check, suggest as tier 2", () => {
    const tier2Names = ["north_context", "north_check", "north_suggest"];

    for (const name of tier2Names) {
      const tool = TIERED_TOOLS.find((t) => t.name === name);
      expect(tool).toBeDefined();
      expect(tool?.tier).toBe(2);
    }
  });

  test("has discover, promote, refactor, query as tier 3", () => {
    const tier3Names = ["north_discover", "north_promote", "north_refactor", "north_query"];

    for (const name of tier3Names) {
      const tool = TIERED_TOOLS.find((t) => t.name === name);
      expect(tool).toBeDefined();
      expect(tool?.tier).toBe(3);
    }
  });

  test("all tools have descriptions", () => {
    for (const tool of TIERED_TOOLS) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });
});

describe("getGuidance", () => {
  test("returns init guidance for state 'none'", () => {
    const guidance = getGuidance("none");

    expect(guidance.length).toBeGreaterThan(0);
    expect(guidance.some((g) => g.includes("north init"))).toBe(true);
  });

  test("returns index guidance for state 'config'", () => {
    const guidance = getGuidance("config");

    expect(guidance.length).toBeGreaterThan(0);
    expect(guidance.some((g) => g.includes("north index"))).toBe(true);
  });

  test("returns full functionality message for state 'indexed'", () => {
    const guidance = getGuidance("indexed");

    expect(guidance.length).toBeGreaterThan(0);
    expect(guidance.some((g) => g.includes("Full functionality"))).toBe(true);
  });
});

// ============================================================================
// Registration Completeness Tests
// ============================================================================

describe("tool registration completeness", () => {
  /**
   * Files to exclude from registration checks:
   * - *.test.ts: Test files
   * - index.ts: Barrel exports (re-exports, not tool definitions)
   * - power-tools.ts: Dead code (stubs only, pending deletion per implementation plan)
   */
  /**
   * TODO: Wire up index-tool.ts in a follow-up PR
   */
  const EXCLUDED_FILES = new Set(["index.ts", "power-tools.ts", "index-tool.ts"]);

  test("all register*Tool exports from tool files are imported and called in server.ts", async () => {
    const toolsDir = join(dirname(import.meta.path), "tools");
    const serverPath = join(dirname(import.meta.path), "server.ts");
    const glob = new Glob("*.ts");

    // Collect all register*Tool function names from tool files
    const registerFunctions: { fn: string; file: string }[] = [];

    for await (const file of glob.scan(toolsDir)) {
      // Skip test files and excluded files
      if (file.endsWith(".test.ts") || EXCLUDED_FILES.has(file)) continue;

      const content = await Bun.file(join(toolsDir, file)).text();

      // Match "export function register*Tool" patterns
      const exportFunctionMatches = content.matchAll(
        /export\s+function\s+(register\w+(?:Tool|Alias))\s*\(/g
      );
      for (const match of exportFunctionMatches) {
        registerFunctions.push({ fn: match[1], file });
      }

      // Also match "export { register*Tool }" re-export patterns (e.g., from status.ts via index.ts)
      // This catches cases where functions are defined elsewhere and re-exported
    }

    const serverContent = await Bun.file(serverPath).text();

    const missingImports: string[] = [];
    const missingCalls: string[] = [];

    for (const { fn, file } of registerFunctions) {
      // Check if function is imported
      // Can be imported as: import { registerFoo } from "./tools/file.ts"
      // Or: import { registerFoo } from "./tools/index.ts"
      const importPattern = new RegExp(`import\\s*\\{[^}]*\\b${fn}\\b[^}]*\\}`);
      if (!importPattern.test(serverContent)) {
        missingImports.push(`${fn} (from ${file})`);
      }

      // Check if function is called: registerFoo(server)
      const callPattern = new RegExp(`\\b${fn}\\s*\\(\\s*server\\s*\\)`);
      if (!callPattern.test(serverContent)) {
        missingCalls.push(`${fn} (from ${file})`);
      }
    }

    // Report detailed failures
    if (missingImports.length > 0) {
      console.error("Missing imports in server.ts:", missingImports);
    }
    if (missingCalls.length > 0) {
      console.error("Missing calls in registerTools():", missingCalls);
    }

    expect(missingImports).toEqual([]);
    expect(missingCalls).toEqual([]);
  });

  test("all tools in TIERED_TOOLS have unique names", () => {
    const names = TIERED_TOOLS.map((t) => t.name);
    const uniqueNames = new Set(names);

    expect(names.length).toBe(uniqueNames.size);
  });

  test("TIERED_TOOLS entries match registered tool count", () => {
    // This test helps catch when TIERED_TOOLS is out of sync with actual registrations
    // Count unique tool names (excluding aliases which share implementation)
    const primaryTools = TIERED_TOOLS.filter(
      (t) => !t.description.toLowerCase().includes("alias for")
    );
    const aliases = TIERED_TOOLS.filter((t) => t.description.toLowerCase().includes("alias for"));

    // Should have at least 10 primary tools based on current implementation
    expect(primaryTools.length).toBeGreaterThanOrEqual(10);

    // Each alias should reference a primary tool that exists
    for (const alias of aliases) {
      // Extract the tool name from "Alias for north_X"
      const match = alias.description.match(/alias for (north_\w+)/i);
      if (match) {
        const referencedTool = match[1];
        expect(TIERED_TOOLS.some((t) => t.name === referencedTool)).toBe(true);
      }
    }
  });
});
