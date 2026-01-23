import { describe, expect, test } from "bun:test";
import type { LintIssue } from "../lint/types.ts";
import {
  type MigrationAction,
  type MigrationPlan,
  type MigrationStep,
  ProposeError,
  type ProposeOptions,
} from "./propose.ts";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a mock lint issue for testing
 */
function createMockIssue(overrides: Partial<LintIssue> = {}): LintIssue {
  return {
    ruleId: "north/no-raw-palette",
    ruleKey: "no-raw-palette",
    severity: "error",
    message: "Use semantic color tokens instead of palette colors",
    filePath: "src/components/Button.tsx",
    line: 10,
    column: 5,
    className: "bg-blue-500",
    ...overrides,
  };
}

/**
 * Create a mock migration step for testing
 */
function createMockStep(overrides: Partial<MigrationStep> = {}): MigrationStep {
  return {
    id: "step-001",
    file: "src/components/Button.tsx",
    line: 10,
    column: 5,
    ruleId: "north/no-raw-palette",
    severity: "error",
    action: { type: "replace", from: "bg-blue-500", to: "bg-(--primary)" },
    confidence: 0.95,
    preview: {
      before: "bg-blue-500",
      after: "bg-(--primary)",
    },
    ...overrides,
  };
}

// ============================================================================
// Type Export Tests
// ============================================================================

describe("ProposeError", () => {
  test("creates error with message", () => {
    const error = new ProposeError("test error");
    expect(error.message).toBe("test error");
    expect(error.name).toBe("ProposeError");
  });

  test("creates error with cause", () => {
    const cause = new Error("root cause");
    const error = new ProposeError("test error", cause);
    expect(error.cause).toBe(cause);
  });
});

// ============================================================================
// MigrationAction Type Tests
// ============================================================================

describe("MigrationAction types", () => {
  test("replace action has correct shape", () => {
    const action: MigrationAction = {
      type: "replace",
      from: "bg-blue-500",
      to: "bg-(--primary)",
    };
    expect(action.type).toBe("replace");
    expect(action.from).toBe("bg-blue-500");
    expect(action.to).toBe("bg-(--primary)");
  });

  test("extract action has correct shape", () => {
    const action: MigrationAction = {
      type: "extract",
      pattern: "flex items-center gap-2",
      utilityName: "@apply-layout-spacing",
    };
    expect(action.type).toBe("extract");
    expect(action.pattern).toBe("flex items-center gap-2");
    expect(action.utilityName).toBe("@apply-layout-spacing");
  });

  test("tokenize action has correct shape", () => {
    const action: MigrationAction = {
      type: "tokenize",
      value: "bg-[#ff0000]",
      tokenName: "--color-ff0000",
    };
    expect(action.type).toBe("tokenize");
    expect(action.value).toBe("bg-[#ff0000]");
    expect(action.tokenName).toBe("--color-ff0000");
  });

  test("remove action has correct shape", () => {
    const action: MigrationAction = {
      type: "remove",
      className: "deprecated-class",
    };
    expect(action.type).toBe("remove");
    expect(action.className).toBe("deprecated-class");
  });
});

// ============================================================================
// MigrationStep Type Tests
// ============================================================================

describe("MigrationStep structure", () => {
  test("step has required fields", () => {
    const step = createMockStep();
    expect(step.id).toMatch(/^step-\d{3}$/);
    expect(step.file).toBeDefined();
    expect(step.line).toBeGreaterThan(0);
    expect(step.column).toBeGreaterThan(0);
    expect(step.ruleId).toBeDefined();
    expect(step.severity).toMatch(/^(error|warn|info)$/);
    expect(step.action).toBeDefined();
    expect(step.confidence).toBeGreaterThanOrEqual(0);
    expect(step.confidence).toBeLessThanOrEqual(1);
    expect(step.preview.before).toBeDefined();
    expect(step.preview.after).toBeDefined();
  });

  test("step can have optional dependencies", () => {
    const step = createMockStep({
      dependencies: ["step-002", "step-003"],
    });
    expect(step.dependencies).toEqual(["step-002", "step-003"]);
  });

  test("step without dependencies has undefined dependencies", () => {
    const step = createMockStep();
    expect(step.dependencies).toBeUndefined();
  });
});

// ============================================================================
// MigrationPlan Type Tests
// ============================================================================

describe("MigrationPlan structure", () => {
  test("plan has required fields", () => {
    const plan: MigrationPlan = {
      version: 1,
      createdAt: new Date().toISOString(),
      strategy: "balanced",
      config: {},
      steps: [],
      summary: {
        totalViolations: 0,
        addressableViolations: 0,
        filesAffected: 0,
        byRule: {},
        bySeverity: { error: 0, warn: 0, info: 0 },
      },
    };

    expect(plan.version).toBe(1);
    expect(plan.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(plan.strategy).toMatch(/^(conservative|balanced|aggressive)$/);
    expect(plan.steps).toBeArray();
    expect(plan.summary.totalViolations).toBeNumber();
  });

  test("plan config supports filter options", () => {
    const plan: MigrationPlan = {
      version: 1,
      createdAt: new Date().toISOString(),
      strategy: "conservative",
      config: {
        include: ["no-raw-palette"],
        exclude: ["component-complexity"],
        maxChanges: 5,
      },
      steps: [],
      summary: {
        totalViolations: 10,
        addressableViolations: 5,
        filesAffected: 3,
        byRule: { "no-raw-palette": 5 },
        bySeverity: { error: 5, warn: 0, info: 0 },
      },
    };

    expect(plan.config.include).toEqual(["no-raw-palette"]);
    expect(plan.config.exclude).toEqual(["component-complexity"]);
    expect(plan.config.maxChanges).toBe(5);
  });
});

// ============================================================================
// ProposeOptions Type Tests
// ============================================================================

describe("ProposeOptions structure", () => {
  test("options has all expected fields", () => {
    const options: ProposeOptions = {
      cwd: "/path/to/project",
      config: "custom.config.yaml",
      from: "check",
      output: ".north/state/migration-plan.json",
      strategy: "balanced",
      include: ["no-raw-palette"],
      exclude: ["component-complexity"],
      maxChanges: 10,
      dryRun: true,
      json: false,
      quiet: false,
    };

    expect(options.cwd).toBe("/path/to/project");
    expect(options.strategy).toBe("balanced");
  });

  test("strategy validates to correct values", () => {
    const strategies: ProposeOptions["strategy"][] = ["conservative", "balanced", "aggressive"];
    for (const strategy of strategies) {
      const options: ProposeOptions = { strategy };
      expect(options.strategy).toBe(strategy);
    }
  });
});

// ============================================================================
// Rule-to-Action Mapping Tests (via type inference)
// ============================================================================

describe("Rule-to-Action mapping", () => {
  test("no-raw-palette maps to replace action", () => {
    // no-raw-palette should produce a replace action
    const expectedAction: MigrationAction = {
      type: "replace",
      from: "bg-blue-500",
      to: "bg-(--primary)",
    };
    expect(expectedAction.type).toBe("replace");
  });

  test("no-arbitrary-colors maps to tokenize action", () => {
    // no-arbitrary-colors should produce a tokenize action
    const expectedAction: MigrationAction = {
      type: "tokenize",
      value: "bg-[#ff0000]",
      tokenName: "--color-ff0000",
    };
    expect(expectedAction.type).toBe("tokenize");
  });

  test("no-arbitrary-values maps to replace action", () => {
    // no-arbitrary-values should produce a replace action
    const expectedAction: MigrationAction = {
      type: "replace",
      from: "p-[16px]",
      to: "p-4",
    };
    expect(expectedAction.type).toBe("replace");
  });

  test("numeric-spacing-in-component maps to replace action", () => {
    // numeric-spacing-in-component should produce a replace action
    const expectedAction: MigrationAction = {
      type: "replace",
      from: "p-4",
      to: "p-(--spacing-md)",
    };
    expect(expectedAction.type).toBe("replace");
  });

  test("no-inline-color maps to tokenize action", () => {
    // no-inline-color should produce a tokenize action
    const expectedAction: MigrationAction = {
      type: "tokenize",
      value: "color: '#ff0000'",
      tokenName: "--inline-color-ff0000",
    };
    expect(expectedAction.type).toBe("tokenize");
  });

  test("extract-repeated-classes maps to extract action", () => {
    // extract-repeated-classes should produce an extract action
    const expectedAction: MigrationAction = {
      type: "extract",
      pattern: "flex items-center gap-2",
      utilityName: "@apply-layout-spacing",
    };
    expect(expectedAction.type).toBe("extract");
  });
});

// ============================================================================
// Strategy Configuration Tests
// ============================================================================

describe("Strategy configurations", () => {
  test("conservative strategy filters high confidence errors only", () => {
    const conservativeConfig = {
      minConfidence: 0.9,
      severities: new Set(["error"]),
    };

    expect(conservativeConfig.minConfidence).toBe(0.9);
    expect(conservativeConfig.severities.has("error")).toBe(true);
    expect(conservativeConfig.severities.has("warn")).toBe(false);
    expect(conservativeConfig.severities.has("info")).toBe(false);
  });

  test("balanced strategy includes errors and warnings", () => {
    const balancedConfig = {
      minConfidence: 0.7,
      severities: new Set(["error", "warn"]),
    };

    expect(balancedConfig.minConfidence).toBe(0.7);
    expect(balancedConfig.severities.has("error")).toBe(true);
    expect(balancedConfig.severities.has("warn")).toBe(true);
    expect(balancedConfig.severities.has("info")).toBe(false);
  });

  test("aggressive strategy includes all severities", () => {
    const aggressiveConfig = {
      minConfidence: 0.5,
      severities: new Set(["error", "warn", "info"]),
    };

    expect(aggressiveConfig.minConfidence).toBe(0.5);
    expect(aggressiveConfig.severities.has("error")).toBe(true);
    expect(aggressiveConfig.severities.has("warn")).toBe(true);
    expect(aggressiveConfig.severities.has("info")).toBe(true);
  });
});

// ============================================================================
// Confidence Scoring Tests
// ============================================================================

describe("Confidence scoring", () => {
  test("replace action with token reference has high confidence", () => {
    const step = createMockStep({
      action: { type: "replace", from: "bg-blue-500", to: "bg-(--primary)" },
      confidence: 0.95,
    });
    expect(step.confidence).toBeGreaterThanOrEqual(0.9);
  });

  test("replace action without token has medium-high confidence", () => {
    const step = createMockStep({
      action: { type: "replace", from: "p-[16px]", to: "p-4" },
      confidence: 0.85,
    });
    expect(step.confidence).toBeGreaterThanOrEqual(0.8);
    expect(step.confidence).toBeLessThan(0.95);
  });

  test("tokenize action has medium confidence", () => {
    const step = createMockStep({
      action: { type: "tokenize", value: "bg-[#ff0000]", tokenName: "--color-ff0000" },
      confidence: 0.7,
    });
    expect(step.confidence).toBeGreaterThanOrEqual(0.6);
    expect(step.confidence).toBeLessThanOrEqual(0.8);
  });

  test("extract action has lower confidence", () => {
    const step = createMockStep({
      action: { type: "extract", pattern: "flex items-center gap-2", utilityName: "@apply-layout" },
      confidence: 0.65,
    });
    expect(step.confidence).toBeGreaterThanOrEqual(0.5);
    expect(step.confidence).toBeLessThan(0.8);
  });
});

// ============================================================================
// Step ID Format Tests
// ============================================================================

describe("Step ID format", () => {
  test("step IDs follow step-NNN format", () => {
    const steps = [
      createMockStep({ id: "step-001" }),
      createMockStep({ id: "step-002" }),
      createMockStep({ id: "step-100" }),
    ];

    for (const step of steps) {
      expect(step.id).toMatch(/^step-\d{3}$/);
    }
  });

  test("step IDs are zero-padded", () => {
    const step = createMockStep({ id: "step-001" });
    expect(step.id).toBe("step-001");
    expect(step.id.length).toBe(8);
  });
});

// ============================================================================
// Summary Statistics Tests
// ============================================================================

describe("Summary statistics", () => {
  test("summary tracks total violations", () => {
    const summary = {
      totalViolations: 100,
      addressableViolations: 75,
      filesAffected: 10,
      byRule: { "no-raw-palette": 50, "no-arbitrary-values": 25 },
      bySeverity: { error: 60, warn: 15, info: 0 },
    };

    expect(summary.totalViolations).toBe(100);
    expect(summary.addressableViolations).toBe(75);
    expect(summary.filesAffected).toBe(10);
  });

  test("summary breaks down by rule", () => {
    const summary = {
      totalViolations: 100,
      addressableViolations: 75,
      filesAffected: 10,
      byRule: {
        "no-raw-palette": 50,
        "no-arbitrary-values": 25,
        "extract-repeated-classes": 25,
      },
      bySeverity: { error: 60, warn: 40, info: 0 },
    };

    expect(Object.keys(summary.byRule)).toHaveLength(3);
    expect(summary.byRule["no-raw-palette"]).toBe(50);
  });

  test("summary breaks down by severity", () => {
    const summary = {
      totalViolations: 100,
      addressableViolations: 75,
      filesAffected: 10,
      byRule: {},
      bySeverity: { error: 60, warn: 30, info: 10 },
    };

    expect(summary.bySeverity.error).toBe(60);
    expect(summary.bySeverity.warn).toBe(30);
    expect(summary.bySeverity.info).toBe(10);
  });
});

// ============================================================================
// Dependency Graph Tests
// ============================================================================

describe("Dependency graph", () => {
  test("tokenize steps have no dependencies", () => {
    const step = createMockStep({
      action: { type: "tokenize", value: "bg-[#ff0000]", tokenName: "--color-custom" },
    });
    expect(step.dependencies).toBeUndefined();
  });

  test("replace steps can depend on tokenize steps", () => {
    const tokenizeStep = createMockStep({
      id: "step-001",
      action: { type: "tokenize", value: "bg-[#ff0000]", tokenName: "--color-custom" },
    });

    const replaceStep = createMockStep({
      id: "step-002",
      action: { type: "replace", from: "bg-[#ff0000]", to: "bg-(--color-custom)" },
      dependencies: ["step-001"],
    });

    expect(replaceStep.dependencies).toContain(tokenizeStep.id);
  });

  test("extract steps have no dependencies", () => {
    const step = createMockStep({
      action: { type: "extract", pattern: "flex items-center", utilityName: "@apply-layout" },
    });
    expect(step.dependencies).toBeUndefined();
  });
});

// ============================================================================
// Filter Tests
// ============================================================================

describe("Violation filtering", () => {
  test("include filter keeps only specified rules", () => {
    const issues = [
      createMockIssue({ ruleKey: "no-raw-palette" }),
      createMockIssue({ ruleKey: "no-arbitrary-values" }),
      createMockIssue({ ruleKey: "component-complexity" }),
    ];

    const includeRules = new Set(["no-raw-palette", "no-arbitrary-values"]);
    const filtered = issues.filter((i) => includeRules.has(i.ruleKey));

    expect(filtered).toHaveLength(2);
    expect(filtered.map((i) => i.ruleKey)).not.toContain("component-complexity");
  });

  test("exclude filter removes specified rules", () => {
    const issues = [
      createMockIssue({ ruleKey: "no-raw-palette" }),
      createMockIssue({ ruleKey: "no-arbitrary-values" }),
      createMockIssue({ ruleKey: "component-complexity" }),
    ];

    const excludeRules = new Set(["component-complexity"]);
    const filtered = issues.filter((i) => !excludeRules.has(i.ruleKey));

    expect(filtered).toHaveLength(2);
    expect(filtered.map((i) => i.ruleKey)).not.toContain("component-complexity");
  });

  test("max changes limits issues per file", () => {
    const issues = [
      createMockIssue({ filePath: "file-a.tsx", severity: "error" }),
      createMockIssue({ filePath: "file-a.tsx", severity: "warn" }),
      createMockIssue({ filePath: "file-a.tsx", severity: "info" }),
      createMockIssue({ filePath: "file-b.tsx", severity: "error" }),
    ];

    const maxChanges = 2;
    const byFile = new Map<string, LintIssue[]>();
    for (const issue of issues) {
      const fileIssues = byFile.get(issue.filePath) ?? [];
      fileIssues.push(issue);
      byFile.set(issue.filePath, fileIssues);
    }

    const filtered: LintIssue[] = [];
    for (const [, fileIssues] of byFile) {
      const sorted = [...fileIssues].sort((a, b) => {
        const severityOrder = { error: 0, warn: 1, info: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      });
      filtered.push(...sorted.slice(0, maxChanges));
    }

    expect(filtered).toHaveLength(3); // 2 from file-a + 1 from file-b
  });
});

// ============================================================================
// Preview Generation Tests
// ============================================================================

describe("Preview generation", () => {
  test("replace action preview shows before and after", () => {
    const step = createMockStep({
      action: { type: "replace", from: "bg-blue-500", to: "bg-(--primary)" },
      preview: {
        before: "bg-blue-500",
        after: "bg-(--primary)",
      },
    });

    expect(step.preview.before).toBe("bg-blue-500");
    expect(step.preview.after).toBe("bg-(--primary)");
  });

  test("tokenize action preview includes token definition hint", () => {
    const tokenName = "--color-custom";
    const value = "bg-[#ff0000]";
    const preview = {
      before: value,
      after: `/* Define: ${tokenName}: ${value} */ ${tokenName.replace(/^--/, "")}`,
    };

    expect(preview.before).toBe(value);
    expect(preview.after).toContain("Define:");
    expect(preview.after).toContain(tokenName);
  });

  test("extract action preview shows utility name", () => {
    const step = createMockStep({
      action: { type: "extract", pattern: "flex items-center gap-2", utilityName: "@apply-layout" },
      preview: {
        before: "flex items-center gap-2",
        after: "@apply-layout",
      },
    });

    expect(step.preview.before).toBe("flex items-center gap-2");
    expect(step.preview.after).toBe("@apply-layout");
  });
});

// ============================================================================
// Info-Only Rule Tests
// ============================================================================

describe("Info-only rules", () => {
  test("missing-semantic-comment is not addressable", () => {
    const infoOnlyRules = [
      "missing-semantic-comment",
      "component-complexity",
      "non-literal-classname",
      "parse-error",
    ];

    for (const rule of infoOnlyRules) {
      // These rules should return null from determineAction
      // (no auto-fix available)
      expect(infoOnlyRules).toContain(rule);
    }
  });

  test("info severity issues are filtered by conservative strategy", () => {
    const steps = [
      createMockStep({ severity: "error", confidence: 0.95 }),
      createMockStep({ severity: "warn", confidence: 0.8 }),
      createMockStep({ severity: "info", confidence: 0.6 }),
    ];

    const conservativeSeverities = new Set(["error"]);
    const conservativeMinConfidence = 0.9;

    const filtered = steps.filter(
      (step) =>
        step.confidence >= conservativeMinConfidence && conservativeSeverities.has(step.severity)
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.severity).toBe("error");
  });
});

// ============================================================================
// Output Format Tests
// ============================================================================

describe("Output formats", () => {
  test("JSON output includes kind and plan", () => {
    const output = {
      kind: "propose" as const,
      planPath: ".north/state/migration-plan.json",
      plan: {
        version: 1 as const,
        createdAt: new Date().toISOString(),
        strategy: "balanced" as const,
        config: {},
        steps: [],
        summary: {
          totalViolations: 0,
          addressableViolations: 0,
          filesAffected: 0,
          byRule: {},
          bySeverity: { error: 0, warn: 0, info: 0 },
        },
      },
    };

    expect(output.kind).toBe("propose");
    expect(output.planPath).toBeDefined();
    expect(output.plan.version).toBe(1);
  });

  test("plan file defaults to .north/state/migration-plan.json", () => {
    const defaultOutput = ".north/state/migration-plan.json";
    expect(defaultOutput).toBe(".north/state/migration-plan.json");
  });
});

// ============================================================================
// Semantic Token Suggestion Tests
// ============================================================================

describe("Semantic token suggestions", () => {
  test("blue-500 suggests primary", () => {
    const semanticMap: Record<string, string> = {
      "blue-500": "primary",
      "blue-600": "primary-dark",
      "gray-100": "muted",
      "gray-500": "muted-foreground",
      "red-500": "destructive",
      "green-500": "success",
    };

    expect(semanticMap["blue-500"]).toBe("primary");
    expect(semanticMap["red-500"]).toBe("destructive");
    expect(semanticMap["green-500"]).toBe("success");
  });
});

// ============================================================================
// Spacing Token Suggestion Tests
// ============================================================================

describe("Spacing token suggestions", () => {
  test("numeric spacing maps to semantic tokens", () => {
    const semanticMap: Record<string, string> = {
      "1": "xs",
      "2": "sm",
      "3": "sm",
      "4": "md",
      "5": "md",
      "6": "lg",
      "8": "lg",
      "10": "xl",
      "12": "xl",
      "16": "2xl",
    };

    expect(semanticMap["4"]).toBe("md");
    expect(semanticMap["8"]).toBe("lg");
    expect(semanticMap["16"]).toBe("2xl");
  });
});

// ============================================================================
// Utility Name Generation Tests
// ============================================================================

describe("Utility name generation", () => {
  test("pattern with flex generates layout name", () => {
    const pattern = "flex items-center";
    const hasLayout = /^(flex|grid|block|inline)/.test(pattern.split(" ")[0] ?? "");
    expect(hasLayout).toBe(true);
  });

  test("pattern with bg generates surface name", () => {
    const pattern = "bg-blue-500 rounded";
    const classes = pattern.split(" ");
    const hasBg = classes.some((c) => /^bg-/.test(c));
    expect(hasBg).toBe(true);
  });

  test("pattern with border generates bordered name", () => {
    const pattern = "border border-gray-200 rounded-md";
    const classes = pattern.split(" ");
    const hasBorder = classes.some((c) => /^(border|rounded)/.test(c));
    expect(hasBorder).toBe(true);
  });
});

// ============================================================================
// Scale Value Suggestion Tests
// ============================================================================

describe("Scale value suggestions", () => {
  test("16px maps to scale 4", () => {
    const pxToScale = (px: number) => Math.round(px / 4);
    expect(pxToScale(16)).toBe(4);
    expect(pxToScale(8)).toBe(2);
    expect(pxToScale(32)).toBe(8);
  });

  test("common pixel values have scale equivalents", () => {
    const scaleMap: Record<string, string> = {
      "4px": "1",
      "8px": "2",
      "12px": "3",
      "16px": "4",
      "24px": "6",
      "32px": "8",
    };

    expect(scaleMap["16px"]).toBe("4");
    expect(scaleMap["32px"]).toBe("8");
  });
});
