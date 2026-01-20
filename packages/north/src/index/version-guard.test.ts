import { describe, expect, test } from "bun:test";
import {
  FEATURE_VERSIONS,
  SchemaVersionError,
  checkSchemaVersion,
  featureAvailable,
  getSchemaVersion,
  requireSchemaVersion,
} from "./version-guard.ts";

// Mock database helper
function createMockDb(schemaVersion: number | null | "invalid") {
  const metaTable = new Map<string, string>();
  if (schemaVersion === "invalid") {
    metaTable.set("schema_version", "not-a-number");
  } else if (schemaVersion !== null) {
    metaTable.set("schema_version", String(schemaVersion));
  }

  return {
    prepare: (sql: string) => ({
      get: () => {
        if (sql.includes("schema_version") && metaTable.has("schema_version")) {
          return { value: metaTable.get("schema_version") };
        }
        return undefined;
      },
      all: () => [],
      run: () => {},
    }),
    exec: () => {},
    close: () => {},
  };
}

function createThrowingDb() {
  return {
    prepare: () => {
      throw new Error("no such table: meta");
    },
    exec: () => {},
    close: () => {},
  };
}

describe("checkSchemaVersion", () => {
  test("returns valid for current schema version", () => {
    const db = createMockDb(2);
    const result = checkSchemaVersion(db as never);

    expect(result.valid).toBe(true);
    expect(result.currentVersion).toBe(2);
    expect(result.requiredVersion).toBe(2);
    expect(result.message).toBeUndefined();
  });

  test("returns valid for schema version higher than required", () => {
    const db = createMockDb(3);
    const result = checkSchemaVersion(db as never, 2);

    expect(result.valid).toBe(true);
    expect(result.currentVersion).toBe(3);
    expect(result.requiredVersion).toBe(2);
  });

  test("returns invalid for outdated schema version", () => {
    const db = createMockDb(1);
    const result = checkSchemaVersion(db as never, 2);

    expect(result.valid).toBe(false);
    expect(result.currentVersion).toBe(1);
    expect(result.requiredVersion).toBe(2);
    expect(result.message).toContain("v1 is outdated");
    expect(result.message).toContain("Required: v2");
    expect(result.message).toContain("north index");
  });

  test("returns invalid with version 0 when no version found", () => {
    const db = createMockDb(null);
    const result = checkSchemaVersion(db as never);

    expect(result.valid).toBe(false);
    expect(result.currentVersion).toBe(0);
    // Treated as outdated v0
    expect(result.message).toContain("v0 is outdated");
  });

  test("returns invalid with version 0 when meta table does not exist", () => {
    const db = createThrowingDb();
    const result = checkSchemaVersion(db as never);

    expect(result.valid).toBe(false);
    expect(result.currentVersion).toBe(0);
    expect(result.message).toContain("no schema version");
  });

  test("returns invalid for non-numeric schema version", () => {
    const db = createMockDb("invalid");
    const result = checkSchemaVersion(db as never);

    expect(result.valid).toBe(false);
    expect(result.currentVersion).toBe(0);
    expect(result.message).toContain("invalid schema version");
  });
});

describe("requireSchemaVersion", () => {
  test("does not throw for valid schema version", () => {
    const db = createMockDb(2);
    expect(() => requireSchemaVersion(db as never)).not.toThrow();
  });

  test("throws SchemaVersionError for outdated schema", () => {
    const db = createMockDb(1);

    try {
      requireSchemaVersion(db as never, 2);
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaVersionError);
      const schemaError = error as SchemaVersionError;
      expect(schemaError.check.currentVersion).toBe(1);
      expect(schemaError.check.requiredVersion).toBe(2);
      expect(schemaError.message).toContain("outdated");
    }
  });

  test("throws SchemaVersionError for missing schema", () => {
    const db = createMockDb(null);

    try {
      requireSchemaVersion(db as never);
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaVersionError);
    }
  });
});

describe("featureAvailable", () => {
  test("returns true for v1 features on v1 schema", () => {
    expect(featureAvailable(1, "tokens")).toBe(true);
    expect(featureAvailable(1, "usages")).toBe(true);
    expect(featureAvailable(1, "patterns")).toBe(true);
    expect(featureAvailable(1, "tokenGraph")).toBe(true);
  });

  test("returns false for v2 features on v1 schema", () => {
    expect(featureAvailable(1, "tokenThemes")).toBe(false);
    expect(featureAvailable(1, "componentGraph")).toBe(false);
  });

  test("returns true for all features on v2 schema", () => {
    expect(featureAvailable(2, "tokens")).toBe(true);
    expect(featureAvailable(2, "usages")).toBe(true);
    expect(featureAvailable(2, "patterns")).toBe(true);
    expect(featureAvailable(2, "tokenGraph")).toBe(true);
    expect(featureAvailable(2, "tokenThemes")).toBe(true);
    expect(featureAvailable(2, "componentGraph")).toBe(true);
  });

  test("returns true for v2 features on v3+ schema", () => {
    expect(featureAvailable(3, "tokenThemes")).toBe(true);
    expect(featureAvailable(3, "componentGraph")).toBe(true);
  });

  test("returns false for any feature on v0 schema", () => {
    expect(featureAvailable(0, "tokens")).toBe(false);
    expect(featureAvailable(0, "tokenThemes")).toBe(false);
  });
});

describe("getSchemaVersion", () => {
  test("returns correct version for valid database", () => {
    const db = createMockDb(2);
    expect(getSchemaVersion(db as never)).toBe(2);
  });

  test("returns 0 when version not found", () => {
    const db = createMockDb(null);
    expect(getSchemaVersion(db as never)).toBe(0);
  });

  test("returns 0 when meta table does not exist", () => {
    const db = createThrowingDb();
    expect(getSchemaVersion(db as never)).toBe(0);
  });

  test("returns 0 for invalid version value", () => {
    const db = createMockDb("invalid");
    expect(getSchemaVersion(db as never)).toBe(0);
  });
});

describe("FEATURE_VERSIONS", () => {
  test("has correct version mappings", () => {
    expect(FEATURE_VERSIONS.tokens).toBe(1);
    expect(FEATURE_VERSIONS.usages).toBe(1);
    expect(FEATURE_VERSIONS.patterns).toBe(1);
    expect(FEATURE_VERSIONS.tokenGraph).toBe(1);
    expect(FEATURE_VERSIONS.tokenThemes).toBe(2);
    expect(FEATURE_VERSIONS.componentGraph).toBe(2);
  });
});
