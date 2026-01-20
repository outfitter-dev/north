import { describe, expect, test } from "bun:test";
import {
  type AdoptCandidate,
  type AdoptReport,
  categorizePattern,
  computeImpactScore,
  generateSuggestedName,
} from "./adopt.ts";

// ============================================================================
// categorizePattern Tests
// ============================================================================

describe("categorizePattern", () => {
  test("returns 'color' for all color utilities", () => {
    expect(categorizePattern(["bg-blue-500", "text-white", "border-gray-200"])).toBe("color");
    expect(categorizePattern(["bg-red-100"])).toBe("color");
  });

  test("returns 'spacing' for all spacing utilities", () => {
    expect(categorizePattern(["p-4", "m-2", "gap-4"])).toBe("spacing");
    expect(categorizePattern(["px-4", "py-2"])).toBe("spacing");
    expect(categorizePattern(["mt-4", "mb-2", "mx-auto"])).toBe("spacing");
  });

  test("returns 'typography' for all typography utilities", () => {
    expect(categorizePattern(["text-sm", "font-bold", "leading-tight"])).toBe("typography");
    expect(categorizePattern(["text-lg", "font-medium"])).toBe("typography");
  });

  test("returns 'mixed' for mixed utilities", () => {
    expect(categorizePattern(["bg-blue-500", "p-4", "text-sm"])).toBe("mixed");
    expect(categorizePattern(["flex", "items-center", "justify-between"])).toBe("mixed");
  });

  test("handles responsive and state prefixes", () => {
    expect(categorizePattern(["md:bg-blue-500", "hover:bg-blue-600"])).toBe("color");
    expect(categorizePattern(["sm:p-4", "lg:p-6"])).toBe("spacing");
  });
});

// ============================================================================
// computeImpactScore Tests
// ============================================================================

describe("computeImpactScore", () => {
  test("computes basic impact score", () => {
    // count * fileCount * (1 + uniqueComponents * 0.1)
    // 10 * 5 * (1 + 2 * 0.1) = 10 * 5 * 1.2 = 60
    expect(computeImpactScore(10, 5, 2)).toBe(60);
  });

  test("handles zero components", () => {
    // 10 * 5 * (1 + 0 * 0.1) = 10 * 5 * 1 = 50
    expect(computeImpactScore(10, 5, 0)).toBe(50);
  });

  test("handles single occurrence", () => {
    // 1 * 1 * (1 + 1 * 0.1) = 1 * 1 * 1.1 = 1.1 rounded to 1
    expect(computeImpactScore(1, 1, 1)).toBe(1);
  });

  test("handles many components", () => {
    // 20 * 10 * (1 + 5 * 0.1) = 20 * 10 * 1.5 = 300
    expect(computeImpactScore(20, 10, 5)).toBe(300);
  });
});

// ============================================================================
// generateSuggestedName Tests
// ============================================================================

describe("generateSuggestedName", () => {
  test("generates name from component context", () => {
    const name = generateSuggestedName(
      ["bg-white", "rounded-lg", "shadow-sm"],
      ["Card", "Panel"],
      "color"
    );
    expect(name).toMatch(/card|panel/i);
  });

  test("generates name from category when no components", () => {
    const name = generateSuggestedName(["p-4", "m-2"], [], "spacing");
    expect(name).toContain("spacing");
  });

  test("generates name for color patterns", () => {
    const name = generateSuggestedName(["bg-blue-500", "text-white"], ["Button"], "color");
    expect(name).toMatch(/button|surface|color/i);
  });

  test("generates name for typography patterns", () => {
    const name = generateSuggestedName(["text-lg", "font-bold"], ["Heading"], "typography");
    expect(name).toMatch(/heading|text|typography/i);
  });

  test("handles mixed patterns", () => {
    const name = generateSuggestedName(["bg-white", "p-4", "text-sm"], ["Card"], "mixed");
    expect(name).toBeTruthy();
    expect(name.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// AdoptReport Structure Tests
// ============================================================================

describe("AdoptReport structure", () => {
  test("has required fields", () => {
    const report: AdoptReport = {
      kind: "adopt",
      candidates: [],
      summary: {
        totalPatterns: 0,
        eligiblePatterns: 0,
        byCategory: {
          color: 0,
          spacing: 0,
          typography: 0,
          mixed: 0,
        },
        estimatedReduction: 0,
      },
      filters: {
        minCount: 3,
        minFiles: 2,
        maxClasses: 6,
        category: "all",
      },
    };

    expect(report.kind).toBe("adopt");
    expect(report.candidates).toBeInstanceOf(Array);
    expect(report.summary).toBeDefined();
    expect(report.filters).toBeDefined();
  });
});

// ============================================================================
// AdoptCandidate Structure Tests
// ============================================================================

describe("AdoptCandidate structure", () => {
  test("has required fields", () => {
    const candidate: AdoptCandidate = {
      hash: "abc123",
      classes: ["bg-white", "rounded-lg"],
      count: 10,
      fileCount: 5,
      components: ["Card", "Panel"],
      suggestedName: "card-surface",
      category: "color",
      impactScore: 60,
      tokenizable: true,
      locations: [{ file: "Card.tsx", line: 10, component: "Card" }],
    };

    expect(candidate.hash).toBe("abc123");
    expect(candidate.classes).toEqual(["bg-white", "rounded-lg"]);
    expect(candidate.count).toBe(10);
    expect(candidate.fileCount).toBe(5);
    expect(candidate.components).toEqual(["Card", "Panel"]);
    expect(candidate.suggestedName).toBe("card-surface");
    expect(candidate.category).toBe("color");
    expect(candidate.impactScore).toBe(60);
    expect(candidate.tokenizable).toBe(true);
    expect(candidate.locations).toHaveLength(1);
  });
});
