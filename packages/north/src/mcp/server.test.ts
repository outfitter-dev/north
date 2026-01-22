import { describe, expect, test } from "bun:test";
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
