import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { executeStatusTool, getGuidance } from "./status.ts";

// Mock the state module
const mockDetectContext = mock(() =>
  Promise.resolve({
    state: "none" as const,
    cwd: "/test/path",
  })
);

mock.module("../state.ts", () => ({
  detectContext: mockDetectContext,
}));

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

describe("executeStatusTool", () => {
  beforeEach(() => {
    mockDetectContext.mockClear();
  });

  afterEach(() => {
    mockDetectContext.mockReset();
  });

  test("returns status with state 'none' when no config found", async () => {
    mockDetectContext.mockResolvedValue({
      state: "none",
      cwd: "/test/project",
    });

    const status = await executeStatusTool();

    expect(status.state).toBe("none");
    expect(status.cwd).toBe("/test/project");
    expect(status.configPath).toBeNull();
    expect(status.indexPath).toBeNull();
    expect(status.capabilities.check).toBe(false);
    expect(status.capabilities.find).toBe(false);
    expect(status.capabilities.context).toBe(false);
    expect(status.capabilities.generate).toBe(false);
  });

  test("returns status with state 'config' when config exists", async () => {
    mockDetectContext.mockResolvedValue({
      state: "config",
      cwd: "/test/project",
      configPath: "/test/project/.north/config.yaml",
    });

    const status = await executeStatusTool();

    expect(status.state).toBe("config");
    expect(status.configPath).toBe("/test/project/.north/config.yaml");
    expect(status.indexPath).toBeNull();
    expect(status.capabilities.check).toBe(true);
    expect(status.capabilities.find).toBe(false);
    expect(status.capabilities.context).toBe(true);
    expect(status.capabilities.generate).toBe(true);
  });

  test("returns status with state 'indexed' when fully configured", async () => {
    mockDetectContext.mockResolvedValue({
      state: "indexed",
      cwd: "/test/project",
      configPath: "/test/project/.north/config.yaml",
      indexPath: "/test/project/.north/state/index.db",
    });

    const status = await executeStatusTool();

    expect(status.state).toBe("indexed");
    expect(status.configPath).toBe("/test/project/.north/config.yaml");
    expect(status.indexPath).toBe("/test/project/.north/state/index.db");
    expect(status.capabilities.check).toBe(true);
    expect(status.capabilities.find).toBe(true);
    expect(status.capabilities.context).toBe(true);
    expect(status.capabilities.generate).toBe(true);
  });

  test("includes guidance in response", async () => {
    mockDetectContext.mockResolvedValue({
      state: "none",
      cwd: "/test/project",
    });

    const status = await executeStatusTool();

    expect(status.guidance).toBeDefined();
    expect(status.guidance.length).toBeGreaterThan(0);
    expect(status.guidance.some((g) => g.includes("north init"))).toBe(true);
  });
});
