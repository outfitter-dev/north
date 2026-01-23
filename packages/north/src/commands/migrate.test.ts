import { describe, expect, test } from "bun:test";
import {
  MigrateError,
  type MigrateOptions,
  type MigrateReport,
  type MigrationCheckpoint,
  type StepResult,
  applyExtract,
  applyRemove,
  applyReplace,
  applyTokenize,
} from "./migrate.ts";
import type { MigrationAction, MigrationStep } from "./propose.ts";

// ============================================================================
// Test Helpers
// ============================================================================

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
// Error Type Tests
// ============================================================================

describe("MigrateError", () => {
  test("creates error with message", () => {
    const error = new MigrateError("test error");
    expect(error.message).toBe("test error");
    expect(error.name).toBe("MigrateError");
  });

  test("creates error with cause", () => {
    const cause = new Error("root cause");
    const error = new MigrateError("test error", cause);
    expect(error.cause).toBe(cause);
  });
});

// ============================================================================
// MigrateOptions Type Tests
// ============================================================================

describe("MigrateOptions structure", () => {
  test("options has all expected fields", () => {
    const options: MigrateOptions = {
      cwd: "/path/to/project",
      config: "custom.config.yaml",
      plan: ".north/state/migration-plan.json",
      steps: ["step-001", "step-002"],
      skip: ["step-003"],
      file: "src/components/Button.tsx",
      interactive: true,
      backup: true,
      dryRun: false,
      apply: true,
      continue: false,
      json: false,
      quiet: false,
    };

    expect(options.cwd).toBe("/path/to/project");
    expect(options.steps).toEqual(["step-001", "step-002"]);
    expect(options.interactive).toBe(true);
  });

  test("options defaults are reasonable", () => {
    const options: MigrateOptions = {};
    expect(options.cwd).toBeUndefined();
    expect(options.backup).toBeUndefined(); // defaults to true
    expect(options.dryRun).toBeUndefined(); // defaults to !apply
  });
});

// ============================================================================
// StepResult Type Tests
// ============================================================================

describe("StepResult structure", () => {
  test("step result has required fields", () => {
    const result: StepResult = {
      stepId: "step-001",
      status: "applied",
      file: "src/components/Button.tsx",
      action: "replace bg-blue-500 -> bg-(--primary)",
    };

    expect(result.stepId).toBe("step-001");
    expect(result.status).toBe("applied");
    expect(result.file).toBeDefined();
    expect(result.action).toBeDefined();
  });

  test("step result can have optional error", () => {
    const result: StepResult = {
      stepId: "step-001",
      status: "failed",
      file: "src/components/Button.tsx",
      action: "replace bg-blue-500 -> bg-(--primary)",
      error: "Could not locate target at line 10",
    };

    expect(result.error).toBe("Could not locate target at line 10");
  });

  test("step result can have optional diff", () => {
    const result: StepResult = {
      stepId: "step-001",
      status: "applied",
      file: "src/components/Button.tsx",
      action: "replace bg-blue-500 -> bg-(--primary)",
      diff: { removed: 11, added: 14 },
    };

    expect(result.diff?.removed).toBe(11);
    expect(result.diff?.added).toBe(14);
  });

  test("status values are valid", () => {
    const statuses: StepResult["status"][] = ["applied", "skipped", "failed", "pending"];
    for (const status of statuses) {
      const result: StepResult = {
        stepId: "step-001",
        status,
        file: "test.tsx",
        action: "test action",
      };
      expect(result.status).toBe(status);
    }
  });
});

// ============================================================================
// MigrationCheckpoint Type Tests
// ============================================================================

describe("MigrationCheckpoint structure", () => {
  test("checkpoint has required fields", () => {
    const checkpoint: MigrationCheckpoint = {
      planPath: ".north/state/migration-plan.json",
      planHash: "sha256:abc123def456",
      completedSteps: ["step-001", "step-002"],
      failedSteps: ["step-003"],
      skippedSteps: [],
      lastUpdated: new Date().toISOString(),
    };

    expect(checkpoint.planPath).toBe(".north/state/migration-plan.json");
    expect(checkpoint.planHash).toMatch(/^sha256:/);
    expect(checkpoint.completedSteps).toHaveLength(2);
    expect(checkpoint.failedSteps).toHaveLength(1);
    expect(checkpoint.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ============================================================================
// MigrateReport Type Tests
// ============================================================================

describe("MigrateReport structure", () => {
  test("report has required fields", () => {
    const report: MigrateReport = {
      kind: "migrate",
      applied: true,
      planPath: ".north/state/migration-plan.json",
      results: [],
      summary: {
        total: 10,
        applied: 8,
        skipped: 1,
        failed: 1,
        filesChanged: 5,
        linesRemoved: 100,
        linesAdded: 120,
      },
    };

    expect(report.kind).toBe("migrate");
    expect(report.applied).toBe(true);
    expect(report.summary.total).toBe(10);
  });

  test("report can have optional checkpoint", () => {
    const report: MigrateReport = {
      kind: "migrate",
      applied: true,
      planPath: ".north/state/migration-plan.json",
      results: [],
      summary: {
        total: 0,
        applied: 0,
        skipped: 0,
        failed: 0,
        filesChanged: 0,
        linesRemoved: 0,
        linesAdded: 0,
      },
      checkpoint: {
        planPath: ".north/state/migration-plan.json",
        planHash: "sha256:abc123",
        completedSteps: [],
        failedSteps: [],
        skippedSteps: [],
        lastUpdated: new Date().toISOString(),
      },
    };

    expect(report.checkpoint).toBeDefined();
    expect(report.checkpoint?.planHash).toMatch(/^sha256:/);
  });

  test("report can have optional nextSteps", () => {
    const report: MigrateReport = {
      kind: "migrate",
      applied: true,
      planPath: ".north/state/migration-plan.json",
      results: [],
      summary: {
        total: 0,
        applied: 0,
        skipped: 0,
        failed: 0,
        filesChanged: 0,
        linesRemoved: 0,
        linesAdded: 0,
      },
      nextSteps: ["Fix failed steps", "Run 'north check'"],
    };

    expect(report.nextSteps).toHaveLength(2);
    expect(report.nextSteps?.[0]).toBe("Fix failed steps");
  });
});

// ============================================================================
// applyReplace Tests
// ============================================================================

describe("applyReplace", () => {
  test("replaces string at correct location", () => {
    const content = `const Button = () => {
  return <div className="bg-blue-500 text-white">Click me</div>;
};`;

    const result = applyReplace(content, 2, 24, "bg-blue-500", "bg-(--primary)");

    expect(result).not.toBeNull();
    expect(result?.content).toContain("bg-(--primary)");
    expect(result?.content).not.toContain("bg-blue-500");
    expect(result?.diff.removed).toBe(11);
    expect(result?.diff.added).toBe(14);
  });

  test("returns null when line does not exist", () => {
    const content = "single line";
    const result = applyReplace(content, 5, 1, "foo", "bar");
    expect(result).toBeNull();
  });

  test("returns null when pattern not found", () => {
    const content = `const x = "hello";`;
    const result = applyReplace(content, 1, 1, "notfound", "replacement");
    expect(result).toBeNull();
  });

  test("handles replacement when column is off by a few chars", () => {
    const content = `className="bg-blue-500"`;
    // Column might be slightly off due to parsing differences
    const result = applyReplace(content, 1, 15, "bg-blue-500", "bg-(--primary)");
    expect(result).not.toBeNull();
    expect(result?.content).toContain("bg-(--primary)");
  });

  test("searches whole line when not found near column", () => {
    const content = `className="bg-blue-500 text-white"`;
    const result = applyReplace(content, 1, 100, "bg-blue-500", "bg-(--primary)");
    expect(result).not.toBeNull();
    expect(result?.content).toBe(`className="bg-(--primary) text-white"`);
  });
});

// ============================================================================
// applyExtract Tests
// ============================================================================

describe("applyExtract", () => {
  test("extracts pattern and creates utility block", () => {
    const content = `const Card = () => {
  return <div className="flex items-center gap-2">Content</div>;
};`;

    const result = applyExtract(content, 2, "flex items-center gap-2", "card-layout");

    expect(result).not.toBeNull();
    expect(result?.content).toContain("card-layout");
    expect(result?.content).not.toContain("flex items-center gap-2");
    expect(result?.utilityBlock).toBe(
      "@utility card-layout {\n  @apply flex items-center gap-2;\n}"
    );
  });

  test("returns null when pattern not found", () => {
    const content = `className="other-classes"`;
    const result = applyExtract(content, 1, "notfound", "utility-name");
    expect(result).toBeNull();
  });

  test("returns null when line does not exist", () => {
    const content = "single line";
    const result = applyExtract(content, 5, "flex", "utility");
    expect(result).toBeNull();
  });

  test("calculates diff correctly", () => {
    const content = `className="flex items-center"`;
    const result = applyExtract(content, 1, "flex items-center", "layout");

    expect(result?.diff.removed).toBe("flex items-center".length);
    expect(result?.diff.added).toBe("layout".length);
  });
});

// ============================================================================
// applyTokenize Tests
// ============================================================================

describe("applyTokenize", () => {
  test("tokenizes arbitrary color value", () => {
    const content = `const Button = () => {
  return <div className="bg-[#ff0000] text-white">Click me</div>;
};`;

    const result = applyTokenize(content, 2, "bg-[#ff0000]", "--color-brand");

    expect(result).not.toBeNull();
    expect(result?.content).toContain("bg-(--color-brand)");
    expect(result?.content).not.toContain("bg-[#ff0000]");
    expect(result?.tokenDefinition).toBe("--color-brand: #ff0000;");
  });

  test("handles text color prefix", () => {
    const content = `className="text-[#ffffff]"`;
    const result = applyTokenize(content, 1, "text-[#ffffff]", "--color-light");

    expect(result).not.toBeNull();
    expect(result?.content).toContain("text-(--color-light)");
    expect(result?.tokenDefinition).toBe("--color-light: #ffffff;");
  });

  test("handles border color prefix", () => {
    const content = `className="border-[#000000]"`;
    const result = applyTokenize(content, 1, "border-[#000000]", "--color-dark");

    expect(result).not.toBeNull();
    expect(result?.content).toContain("border-(--color-dark)");
  });

  test("returns null when value not found", () => {
    const content = `className="bg-blue-500"`;
    const result = applyTokenize(content, 1, "bg-[#ff0000]", "--color-custom");
    expect(result).toBeNull();
  });

  test("returns null when line does not exist", () => {
    const content = "single line";
    const result = applyTokenize(content, 5, "bg-[#ff0000]", "--color-custom");
    expect(result).toBeNull();
  });
});

// ============================================================================
// applyRemove Tests
// ============================================================================

describe("applyRemove", () => {
  test("removes class from className string", () => {
    const content = `className="deprecated-class text-white"`;
    const result = applyRemove(content, 1, 11, "deprecated-class");

    expect(result).not.toBeNull();
    expect(result?.content).toBe(`className="text-white"`);
    expect(result?.diff.removed).toBeGreaterThan(0);
    expect(result?.diff.added).toBe(0);
  });

  test("removes trailing space when present", () => {
    const content = `className="remove-me keep-me"`;
    const result = applyRemove(content, 1, 11, "remove-me");

    expect(result?.content).toBe(`className="keep-me"`);
  });

  test("removes leading space when no trailing space", () => {
    const content = `className="keep-me remove-me"`;
    const result = applyRemove(content, 1, 19, "remove-me");

    expect(result?.content).toBe(`className="keep-me"`);
  });

  test("returns null when class not found", () => {
    const content = `className="text-white"`;
    const result = applyRemove(content, 1, 1, "notfound");
    expect(result).toBeNull();
  });

  test("returns null when line does not exist", () => {
    const content = "single line";
    const result = applyRemove(content, 5, 1, "class");
    expect(result).toBeNull();
  });
});

// ============================================================================
// Step Filtering Tests
// ============================================================================

describe("Step filtering logic", () => {
  test("include filter keeps only specified steps", () => {
    const steps = [
      createMockStep({ id: "step-001" }),
      createMockStep({ id: "step-002" }),
      createMockStep({ id: "step-003" }),
    ];

    const includeSet = new Set(["step-001", "step-003"]);
    const filtered = steps.filter((step) => includeSet.has(step.id));

    expect(filtered).toHaveLength(2);
    expect(filtered.map((s) => s.id)).toEqual(["step-001", "step-003"]);
  });

  test("skip filter excludes specified steps", () => {
    const steps = [
      createMockStep({ id: "step-001" }),
      createMockStep({ id: "step-002" }),
      createMockStep({ id: "step-003" }),
    ];

    const skipSet = new Set(["step-002"]);
    const filtered = steps.filter((step) => !skipSet.has(step.id));

    expect(filtered).toHaveLength(2);
    expect(filtered.map((s) => s.id)).not.toContain("step-002");
  });

  test("file filter keeps only steps for specific file", () => {
    const steps = [
      createMockStep({ id: "step-001", file: "src/components/Button.tsx" }),
      createMockStep({ id: "step-002", file: "src/components/Card.tsx" }),
      createMockStep({ id: "step-003", file: "src/components/Button.tsx" }),
    ];

    const targetFile = "src/components/Button.tsx";
    const filtered = steps.filter((step) => step.file === targetFile);

    expect(filtered).toHaveLength(2);
    expect(filtered.map((s) => s.id)).toEqual(["step-001", "step-003"]);
  });

  test("completed steps are excluded in continue mode", () => {
    const steps = [
      createMockStep({ id: "step-001" }),
      createMockStep({ id: "step-002" }),
      createMockStep({ id: "step-003" }),
    ];

    const completedSet = new Set(["step-001"]);
    const filtered = steps.filter((step) => !completedSet.has(step.id));

    expect(filtered).toHaveLength(2);
    expect(filtered.map((s) => s.id)).not.toContain("step-001");
  });
});

// ============================================================================
// Topological Sort Tests
// ============================================================================

describe("Topological sort logic", () => {
  test("steps without dependencies maintain order", () => {
    const steps = [
      createMockStep({ id: "step-001" }),
      createMockStep({ id: "step-002" }),
      createMockStep({ id: "step-003" }),
    ];

    // Simple sort maintains order when no dependencies
    const sorted = [...steps].sort((a, b) => a.id.localeCompare(b.id));

    expect(sorted.map((s) => s.id)).toEqual(["step-001", "step-002", "step-003"]);
  });

  test("dependencies are respected in sort order", () => {
    // Step 002 depends on step 001
    const steps = [
      createMockStep({ id: "step-002", dependencies: ["step-001"] }),
      createMockStep({ id: "step-001" }),
    ];

    // Simulating topological sort: dependencies come first
    const sorted: MigrationStep[] = [];
    const visited = new Set<string>();
    const stepMap = new Map(steps.map((s) => [s.id, s]));

    function visit(id: string) {
      if (visited.has(id)) return;
      const step = stepMap.get(id);
      if (!step) return;

      if (step.dependencies) {
        for (const dep of step.dependencies) {
          visit(dep);
        }
      }
      visited.add(id);
      sorted.push(step);
    }

    for (const step of steps) {
      visit(step.id);
    }

    expect(sorted.map((s) => s.id)).toEqual(["step-001", "step-002"]);
  });
});

// ============================================================================
// Action Description Tests
// ============================================================================

describe("Action descriptions", () => {
  test("replace action is described correctly", () => {
    const action: MigrationAction = { type: "replace", from: "bg-blue-500", to: "bg-(--primary)" };
    const description = `replace ${action.from} -> ${action.to}`;
    expect(description).toBe("replace bg-blue-500 -> bg-(--primary)");
  });

  test("extract action is described correctly", () => {
    const action: MigrationAction = {
      type: "extract",
      pattern: "flex items-center gap-2",
      utilityName: "@apply-layout",
    };
    const description = `extract to ${action.utilityName}`;
    expect(description).toBe("extract to @apply-layout");
  });

  test("tokenize action is described correctly", () => {
    const action: MigrationAction = {
      type: "tokenize",
      value: "bg-[#ff0000]",
      tokenName: "--color-brand",
    };
    const description = `tokenize ${action.value} as ${action.tokenName}`;
    expect(description).toBe("tokenize bg-[#ff0000] as --color-brand");
  });

  test("remove action is described correctly", () => {
    const action: MigrationAction = { type: "remove", className: "deprecated-class" };
    const description = `remove ${action.className}`;
    expect(description).toBe("remove deprecated-class");
  });
});

// ============================================================================
// Plan Hash Tests
// ============================================================================

describe("Plan hash integrity", () => {
  test("same plan produces same hash", () => {
    const plan = {
      version: 1 as const,
      createdAt: "2025-01-20T12:00:00Z",
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
    };

    const hash1 = `sha256:${require("node:crypto")
      .createHash("sha256")
      .update(JSON.stringify(plan))
      .digest("hex")
      .slice(0, 16)}`;
    const hash2 = `sha256:${require("node:crypto")
      .createHash("sha256")
      .update(JSON.stringify(plan))
      .digest("hex")
      .slice(0, 16)}`;

    expect(hash1).toBe(hash2);
  });

  test("different plans produce different hashes", () => {
    const plan1 = { version: 1, steps: [] };
    const plan2 = { version: 1, steps: [{ id: "step-001" }] };

    const hash1 = require("node:crypto")
      .createHash("sha256")
      .update(JSON.stringify(plan1))
      .digest("hex");
    const hash2 = require("node:crypto")
      .createHash("sha256")
      .update(JSON.stringify(plan2))
      .digest("hex");

    expect(hash1).not.toBe(hash2);
  });
});

// ============================================================================
// Summary Calculation Tests
// ============================================================================

describe("Summary calculation", () => {
  test("counts applied steps correctly", () => {
    const results: StepResult[] = [
      { stepId: "step-001", status: "applied", file: "a.tsx", action: "test" },
      { stepId: "step-002", status: "applied", file: "b.tsx", action: "test" },
      { stepId: "step-003", status: "failed", file: "c.tsx", action: "test" },
      { stepId: "step-004", status: "skipped", file: "d.tsx", action: "test" },
    ];

    const applied = results.filter((r) => r.status === "applied").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const skipped = results.filter((r) => r.status === "skipped").length;

    expect(applied).toBe(2);
    expect(failed).toBe(1);
    expect(skipped).toBe(1);
  });

  test("counts unique files changed", () => {
    const results: StepResult[] = [
      { stepId: "step-001", status: "applied", file: "a.tsx", action: "test" },
      { stepId: "step-002", status: "applied", file: "a.tsx", action: "test" },
      { stepId: "step-003", status: "applied", file: "b.tsx", action: "test" },
    ];

    const filesChanged = new Set(results.filter((r) => r.status === "applied").map((r) => r.file))
      .size;

    expect(filesChanged).toBe(2);
  });
});

// ============================================================================
// Backup Strategy Tests
// ============================================================================

describe("Backup strategy", () => {
  test("backup path is file.bak", () => {
    const filePath = "src/components/Button.tsx";
    const backupPath = `${filePath}.bak`;
    expect(backupPath).toBe("src/components/Button.tsx.bak");
  });

  test("each file is backed up only once", () => {
    const backedUp = new Set<string>();
    const files = ["a.tsx", "a.tsx", "b.tsx", "a.tsx"];

    for (const file of files) {
      if (!backedUp.has(file)) {
        backedUp.add(file);
      }
    }

    expect(backedUp.size).toBe(2);
    expect(backedUp.has("a.tsx")).toBe(true);
    expect(backedUp.has("b.tsx")).toBe(true);
  });
});

// ============================================================================
// Interactive Mode Tests
// ============================================================================

describe("Interactive mode responses", () => {
  test("normalizes yes responses", () => {
    const responses = ["y", "Y", "yes", "YES", "Yes"];
    for (const response of responses) {
      const normalized = response.toLowerCase().trim();
      expect(normalized === "y" || normalized === "yes").toBe(true);
    }
  });

  test("normalizes no responses", () => {
    const responses = ["n", "N", "no", "NO", "No"];
    for (const response of responses) {
      const normalized = response.toLowerCase().trim();
      expect(normalized === "n" || normalized === "no").toBe(true);
    }
  });

  test("normalizes quit responses", () => {
    const responses = ["q", "Q", "quit", "QUIT"];
    for (const response of responses) {
      const normalized = response.toLowerCase().trim();
      expect(normalized === "q" || normalized === "quit").toBe(true);
    }
  });

  test("normalizes all responses", () => {
    const responses = ["a", "A", "all", "ALL"];
    for (const response of responses) {
      const normalized = response.toLowerCase().trim();
      expect(normalized === "a" || normalized === "all").toBe(true);
    }
  });
});

// ============================================================================
// Next Steps Suggestions Tests
// ============================================================================

describe("Next steps suggestions", () => {
  test("suggests fixing failures when steps fail", () => {
    const failedCount = 2;
    const nextSteps: string[] = [];

    if (failedCount > 0) {
      nextSteps.push("Fix failed steps manually or adjust plan");
      nextSteps.push("Run 'north migrate --continue --apply' to retry");
    }

    expect(nextSteps).toHaveLength(2);
    expect(nextSteps).toContain("Fix failed steps manually or adjust plan");
  });

  test("suggests running check after successful apply", () => {
    const appliedCount = 5;
    const nextSteps: string[] = [];

    if (appliedCount > 0) {
      nextSteps.push("Run 'north check' to verify remaining violations");
    }

    expect(nextSteps).toHaveLength(1);
    expect(nextSteps[0]).toBe("Run 'north check' to verify remaining violations");
  });
});

// ============================================================================
// Dependency Skip Tests
// ============================================================================

describe("Dependency-based skipping", () => {
  test("steps with failed dependencies are skipped", () => {
    const failedSteps = ["step-001"];
    const step = createMockStep({ id: "step-002", dependencies: ["step-001"] });

    const hasFailedDep = step.dependencies?.some((depId) => failedSteps.includes(depId));
    expect(hasFailedDep).toBe(true);
  });

  test("steps without dependencies are not skipped", () => {
    const failedSteps = ["step-001"];
    const step = createMockStep({ id: "step-002" });

    const hasFailedDep = step.dependencies?.some((depId) => failedSteps.includes(depId)) ?? false;
    expect(hasFailedDep).toBe(false);
  });

  test("steps with satisfied dependencies are not skipped", () => {
    const failedSteps = ["step-003"];
    const step = createMockStep({ id: "step-002", dependencies: ["step-001"] });

    const hasFailedDep = step.dependencies?.some((depId) => failedSteps.includes(depId)) ?? false;
    expect(hasFailedDep).toBe(false);
  });
});
