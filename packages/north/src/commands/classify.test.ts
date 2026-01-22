import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import type { IndexDatabase } from "../index/db.ts";
import type { LintContext } from "../lint/types.ts";
import { type ClassifyOptions, classify } from "./classify.ts";

function createTestDb(): IndexDatabase {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE tokens (
      name TEXT PRIMARY KEY,
      value TEXT,
      file TEXT,
      line INTEGER,
      layer INTEGER,
      computed_value TEXT
    );

    CREATE TABLE usages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file TEXT,
      line INTEGER,
      column INTEGER,
      class_name TEXT,
      resolved_token TEXT,
      context TEXT,
      component TEXT
    );

    CREATE TABLE patterns (
      hash TEXT PRIMARY KEY,
      classes TEXT,
      count INTEGER,
      locations TEXT
    );

    CREATE TABLE token_graph (
      ancestor TEXT,
      descendant TEXT,
      depth INTEGER,
      path TEXT,
      PRIMARY KEY (ancestor, descendant)
    );

    CREATE INDEX usages_file_idx ON usages (file);
  `);
  return db as unknown as IndexDatabase;
}

function insertUsage(
  db: IndexDatabase,
  file: string,
  className: string,
  context: LintContext | null = null
): void {
  db.exec(
    `INSERT INTO usages (file, line, column, class_name, context) VALUES ('${file}', 1, 1, '${className}', ${context ? `'${context}'` : "NULL"})`
  );
}

describe("classify", () => {
  describe("context detection", () => {
    test("auto-detects primitive context from ui/ directory", async () => {
      const db = createTestDb();
      insertUsage(db, "src/components/ui/button.tsx", "flex");
      insertUsage(db, "src/components/ui/input.tsx", "border");

      const report = await classify({ _testDb: db } as ClassifyOptions & {
        _testDb: IndexDatabase;
      });

      expect(report.files).toHaveLength(2);
      expect(report.files.every((f) => f.to === "primitive")).toBe(true);
      expect(report.files.every((f) => f.source === "path")).toBe(true);

      db.close();
    });

    test("auto-detects primitive context from primitives/ directory", async () => {
      const db = createTestDb();
      insertUsage(db, "src/primitives/text.tsx", "font-bold");

      const report = await classify({ _testDb: db } as ClassifyOptions & {
        _testDb: IndexDatabase;
      });

      expect(report.files[0].to).toBe("primitive");

      db.close();
    });

    test("auto-detects layout context from layouts/ directory", async () => {
      const db = createTestDb();
      insertUsage(db, "src/layouts/main.tsx", "min-h-screen");

      const report = await classify({ _testDb: db } as ClassifyOptions & {
        _testDb: IndexDatabase;
      });

      expect(report.files[0].to).toBe("layout");

      db.close();
    });

    test("auto-detects layout context from templates/ directory", async () => {
      const db = createTestDb();
      insertUsage(db, "src/templates/blog.tsx", "container");

      const report = await classify({ _testDb: db } as ClassifyOptions & {
        _testDb: IndexDatabase;
      });

      expect(report.files[0].to).toBe("layout");

      db.close();
    });

    test("defaults to composed context for other paths", async () => {
      const db = createTestDb();
      insertUsage(db, "src/components/dashboard.tsx", "grid");

      const report = await classify({ _testDb: db } as ClassifyOptions & {
        _testDb: IndexDatabase;
      });

      expect(report.files[0].to).toBe("composed");

      db.close();
    });
  });

  describe("explicit context option", () => {
    test("assigns explicit context to all files", async () => {
      const db = createTestDb();
      insertUsage(db, "src/components/a.tsx", "flex");
      insertUsage(db, "src/components/b.tsx", "grid");

      const report = await classify({
        _testDb: db,
        context: "primitive",
      } as ClassifyOptions & { _testDb: IndexDatabase });

      expect(report.files.every((f) => f.to === "primitive")).toBe(true);
      expect(report.files.every((f) => f.source === "explicit")).toBe(true);

      db.close();
    });
  });

  describe("file filtering", () => {
    test("filters by provided glob patterns", async () => {
      const db = createTestDb();
      insertUsage(db, "src/components/ui/button.tsx", "flex");
      insertUsage(db, "src/components/dashboard.tsx", "grid");
      insertUsage(db, "src/pages/home.tsx", "container");

      const report = await classify({
        _testDb: db,
        files: ["src/components/ui/**/*.tsx"],
      } as ClassifyOptions & { _testDb: IndexDatabase });

      expect(report.files).toHaveLength(1);
      expect(report.files[0].file).toBe("src/components/ui/button.tsx");

      db.close();
    });
  });

  describe("from tracking", () => {
    test("tracks existing context as from value", async () => {
      const db = createTestDb();
      insertUsage(db, "src/ui/button.tsx", "flex", "composed");

      const report = await classify({ _testDb: db } as ClassifyOptions & {
        _testDb: IndexDatabase;
      });

      expect(report.files[0].from).toBe("composed");
      expect(report.files[0].to).toBe("primitive");

      db.close();
    });

    test("tracks null when no existing context", async () => {
      const db = createTestDb();
      insertUsage(db, "src/ui/button.tsx", "flex");

      const report = await classify({ _testDb: db } as ClassifyOptions & {
        _testDb: IndexDatabase;
      });

      expect(report.files[0].from).toBeNull();

      db.close();
    });
  });

  describe("summary", () => {
    test("counts contexts correctly", async () => {
      const db = createTestDb();
      insertUsage(db, "src/ui/a.tsx", "a");
      insertUsage(db, "src/ui/b.tsx", "b");
      insertUsage(db, "src/layouts/c.tsx", "c");
      insertUsage(db, "src/components/d.tsx", "d");
      insertUsage(db, "src/components/e.tsx", "e");

      const report = await classify({ _testDb: db } as ClassifyOptions & {
        _testDb: IndexDatabase;
      });

      expect(report.summary.total).toBe(5);
      expect(report.summary.primitive).toBe(2);
      expect(report.summary.layout).toBe(1);
      expect(report.summary.composed).toBe(2);

      db.close();
    });

    test("counts changed files when from differs from to", async () => {
      const db = createTestDb();
      insertUsage(db, "src/ui/a.tsx", "a", "composed"); // will change to primitive
      insertUsage(db, "src/ui/b.tsx", "b", "primitive"); // no change
      insertUsage(db, "src/layouts/c.tsx", "c"); // no existing, will be set

      const report = await classify({ _testDb: db } as ClassifyOptions & {
        _testDb: IndexDatabase;
      });

      expect(report.summary.changed).toBe(2); // a changes, c is new (null -> layout)

      db.close();
    });
  });

  describe("apply mode", () => {
    test("does not modify database in dry-run mode (default)", async () => {
      const db = createTestDb();
      insertUsage(db, "src/ui/button.tsx", "flex", "composed");

      const report = await classify({ _testDb: db } as ClassifyOptions & {
        _testDb: IndexDatabase;
      });

      expect(report.applied).toBe(false);

      // Verify database unchanged
      const row = db
        .prepare("SELECT context FROM usages WHERE file = ?")
        .get("src/ui/button.tsx") as {
        context: string | null;
      };
      expect(row.context).toBe("composed");

      db.close();
    });

    test("updates database when apply is true", async () => {
      const db = createTestDb();
      insertUsage(db, "src/ui/button.tsx", "flex", "composed");

      const report = await classify({
        _testDb: db,
        apply: true,
      } as ClassifyOptions & { _testDb: IndexDatabase });

      expect(report.applied).toBe(true);

      // Verify database updated
      const row = db
        .prepare("SELECT context FROM usages WHERE file = ?")
        .get("src/ui/button.tsx") as {
        context: string | null;
      };
      expect(row.context).toBe("primitive");

      db.close();
    });
  });

  describe("output format", () => {
    test("returns correct report structure", async () => {
      const db = createTestDb();
      insertUsage(db, "src/ui/button.tsx", "flex");

      const report = await classify({ _testDb: db } as ClassifyOptions & {
        _testDb: IndexDatabase;
      });

      expect(report.kind).toBe("classify");
      expect(report.applied).toBe(false);
      expect(Array.isArray(report.files)).toBe(true);
      expect(report.summary).toBeDefined();
      expect(report.summary.total).toBeGreaterThan(0);

      db.close();
    });

    test("file entries have required fields", async () => {
      const db = createTestDb();
      insertUsage(db, "src/ui/button.tsx", "flex");

      const report = await classify({ _testDb: db } as ClassifyOptions & {
        _testDb: IndexDatabase;
      });
      const file = report.files[0];

      expect(file.file).toBe("src/ui/button.tsx");
      expect(file.from).toBeNull();
      expect(file.to).toBe("primitive");
      expect(file.source).toBe("path");

      db.close();
    });
  });

  describe("unique files", () => {
    test("returns unique files even with multiple usages", async () => {
      const db = createTestDb();
      insertUsage(db, "src/ui/button.tsx", "flex");
      insertUsage(db, "src/ui/button.tsx", "items-center");
      insertUsage(db, "src/ui/button.tsx", "justify-center");

      const report = await classify({ _testDb: db } as ClassifyOptions & {
        _testDb: IndexDatabase;
      });

      expect(report.files).toHaveLength(1);
      expect(report.files[0].file).toBe("src/ui/button.tsx");

      db.close();
    });
  });

  describe("empty index", () => {
    test("returns empty report when no usages", async () => {
      const db = createTestDb();

      const report = await classify({ _testDb: db } as ClassifyOptions & {
        _testDb: IndexDatabase;
      });

      expect(report.files).toHaveLength(0);
      expect(report.summary.total).toBe(0);

      db.close();
    });
  });
});
