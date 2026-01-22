import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import type { IndexDatabase } from "../index/db.ts";
import { TYPOGRAPHY_PREFIXES, buildCascade, buildTypographyUsage, parseTypographyUtility } from "./find.ts";

describe("parseTypographyUtility", () => {
  test("parses text size utilities", () => {
    expect(parseTypographyUtility("text-xs")).toEqual({ utility: "text", value: "xs" });
    expect(parseTypographyUtility("text-sm")).toEqual({ utility: "text", value: "sm" });
    expect(parseTypographyUtility("text-base")).toEqual({ utility: "text", value: "base" });
    expect(parseTypographyUtility("text-lg")).toEqual({ utility: "text", value: "lg" });
    expect(parseTypographyUtility("text-xl")).toEqual({ utility: "text", value: "xl" });
    expect(parseTypographyUtility("text-2xl")).toEqual({ utility: "text", value: "2xl" });
    expect(parseTypographyUtility("text-3xl")).toEqual({ utility: "text", value: "3xl" });
  });

  test("parses font weight utilities", () => {
    expect(parseTypographyUtility("font-thin")).toEqual({ utility: "font", value: "thin" });
    expect(parseTypographyUtility("font-light")).toEqual({ utility: "font", value: "light" });
    expect(parseTypographyUtility("font-normal")).toEqual({ utility: "font", value: "normal" });
    expect(parseTypographyUtility("font-medium")).toEqual({ utility: "font", value: "medium" });
    expect(parseTypographyUtility("font-semibold")).toEqual({ utility: "font", value: "semibold" });
    expect(parseTypographyUtility("font-bold")).toEqual({ utility: "font", value: "bold" });
  });

  test("parses leading (line-height) utilities", () => {
    expect(parseTypographyUtility("leading-none")).toEqual({ utility: "leading", value: "none" });
    expect(parseTypographyUtility("leading-tight")).toEqual({ utility: "leading", value: "tight" });
    expect(parseTypographyUtility("leading-normal")).toEqual({
      utility: "leading",
      value: "normal",
    });
    expect(parseTypographyUtility("leading-relaxed")).toEqual({
      utility: "leading",
      value: "relaxed",
    });
    expect(parseTypographyUtility("leading-loose")).toEqual({ utility: "leading", value: "loose" });
  });

  test("parses tracking (letter-spacing) utilities", () => {
    expect(parseTypographyUtility("tracking-tighter")).toEqual({
      utility: "tracking",
      value: "tighter",
    });
    expect(parseTypographyUtility("tracking-tight")).toEqual({
      utility: "tracking",
      value: "tight",
    });
    expect(parseTypographyUtility("tracking-normal")).toEqual({
      utility: "tracking",
      value: "normal",
    });
    expect(parseTypographyUtility("tracking-wide")).toEqual({ utility: "tracking", value: "wide" });
    expect(parseTypographyUtility("tracking-wider")).toEqual({
      utility: "tracking",
      value: "wider",
    });
    expect(parseTypographyUtility("tracking-widest")).toEqual({
      utility: "tracking",
      value: "widest",
    });
  });

  test("handles responsive prefixes", () => {
    expect(parseTypographyUtility("md:text-lg")).toEqual({ utility: "text", value: "lg" });
    expect(parseTypographyUtility("lg:font-bold")).toEqual({ utility: "font", value: "bold" });
    expect(parseTypographyUtility("sm:leading-tight")).toEqual({
      utility: "leading",
      value: "tight",
    });
  });

  test("handles state prefixes", () => {
    expect(parseTypographyUtility("hover:text-xl")).toEqual({ utility: "text", value: "xl" });
    expect(parseTypographyUtility("focus:font-medium")).toEqual({
      utility: "font",
      value: "medium",
    });
  });

  test("handles arbitrary values", () => {
    expect(parseTypographyUtility("text-[14px]")).toEqual({ utility: "text", value: "[14px]" });
    expect(parseTypographyUtility("leading-[1.5]")).toEqual({ utility: "leading", value: "[1.5]" });
    expect(parseTypographyUtility("tracking-[0.05em]")).toEqual({
      utility: "tracking",
      value: "[0.05em]",
    });
  });

  test("handles token shorthand syntax", () => {
    expect(parseTypographyUtility("text-(--text-body)")).toEqual({
      utility: "text",
      value: "(--text-body)",
    });
    expect(parseTypographyUtility("font-(--font-weight-heading)")).toEqual({
      utility: "font",
      value: "(--font-weight-heading)",
    });
  });

  test("returns null for non-typography utilities", () => {
    expect(parseTypographyUtility("bg-blue-500")).toBeNull();
    expect(parseTypographyUtility("p-4")).toBeNull();
    expect(parseTypographyUtility("flex")).toBeNull();
    expect(parseTypographyUtility("text-blue-500")).toBeNull(); // color, not typography
  });
});

describe("TYPOGRAPHY_PREFIXES", () => {
  test("includes all typography prefixes", () => {
    expect(TYPOGRAPHY_PREFIXES).toContain("text");
    expect(TYPOGRAPHY_PREFIXES).toContain("font");
    expect(TYPOGRAPHY_PREFIXES).toContain("leading");
    expect(TYPOGRAPHY_PREFIXES).toContain("tracking");
  });
});

describe("buildTypographyUsage", () => {
  test("aggregates typography values", () => {
    const classStats = [
      { className: "text-sm", resolvedToken: null, count: 5 },
      { className: "text-base", resolvedToken: null, count: 3 },
      { className: "text-sm", resolvedToken: null, count: 2 },
      { className: "font-medium", resolvedToken: null, count: 4 },
    ];

    const result = buildTypographyUsage(classStats);

    expect(result.values).toContainEqual({ value: "sm", count: 7 });
    expect(result.values).toContainEqual({ value: "base", count: 3 });
    expect(result.values).toContainEqual({ value: "medium", count: 4 });
  });

  test("aggregates by utility type", () => {
    const classStats = [
      { className: "text-sm", resolvedToken: null, count: 5 },
      { className: "text-lg", resolvedToken: null, count: 3 },
      { className: "font-bold", resolvedToken: null, count: 4 },
      { className: "leading-tight", resolvedToken: null, count: 2 },
    ];

    const result = buildTypographyUsage(classStats);

    expect(result.utilities).toContainEqual({ utility: "text", count: 8 });
    expect(result.utilities).toContainEqual({ utility: "font", count: 4 });
    expect(result.utilities).toContainEqual({ utility: "leading", count: 2 });
  });

  test("categorizes tokenized vs scale vs arbitrary", () => {
    const classStats = [
      { className: "text-sm", resolvedToken: null, count: 3 }, // scale
      { className: "text-(--text-body)", resolvedToken: null, count: 2 }, // tokenized
      { className: "text-[14px]", resolvedToken: null, count: 1 }, // arbitrary
    ];

    const result = buildTypographyUsage(classStats);

    expect(result.categories.scale).toBe(3);
    expect(result.categories.tokenized).toBe(2);
    expect(result.categories.arbitrary).toBe(1);
  });

  test("sorts values by count descending", () => {
    const classStats = [
      { className: "text-sm", resolvedToken: null, count: 1 },
      { className: "text-lg", resolvedToken: null, count: 10 },
      { className: "text-base", resolvedToken: null, count: 5 },
    ];

    const result = buildTypographyUsage(classStats);

    expect(result.values[0]).toEqual({ value: "lg", count: 10 });
    expect(result.values[1]).toEqual({ value: "base", count: 5 });
    expect(result.values[2]).toEqual({ value: "sm", count: 1 });
  });
});


function createTestDb(): IndexDatabase {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE tokens (
      name TEXT PRIMARY KEY,
      value TEXT,
      file TEXT,
      line INTEGER,
      layer INTEGER,
      computed_value TEXT
    );

    CREATE TABLE token_themes (
      token_name TEXT,
      theme TEXT,
      value TEXT,
      source TEXT,
      PRIMARY KEY (token_name, theme)
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

    CREATE TABLE token_graph (
      ancestor TEXT,
      descendant TEXT,
      depth INTEGER,
      path TEXT,
      PRIMARY KEY (ancestor, descendant)
    );

    CREATE TABLE meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE INDEX usages_file_idx ON usages (file);
    CREATE INDEX usages_token_idx ON usages (resolved_token);
    CREATE INDEX token_graph_ancestor_idx ON token_graph (ancestor);
    CREATE INDEX token_graph_descendant_idx ON token_graph (descendant);
    CREATE INDEX token_themes_name_idx ON token_themes (token_name);

    INSERT INTO meta (key, value) VALUES ('schema_version', '2');
  `);
  return db as unknown as IndexDatabase;
}

describe("buildCascade - downstream dependencies", () => {
  test("returns downstream dependencies for a token with dependents", () => {
    const db = createTestDb();

    // Insert a base token
    db.exec(
      `INSERT INTO tokens (name, value, file, line) VALUES ('--color-primary', '#3b82f6', 'tokens.css', 10)`
    );

    // Insert dependent tokens that reference the base token
    db.exec(
      `INSERT INTO tokens (name, value, file, line) VALUES ('--button-bg', 'var(--color-primary)', 'tokens.css', 20)`
    );
    db.exec(
      `INSERT INTO tokens (name, value, file, line) VALUES ('--link-color', 'var(--color-primary)', 'tokens.css', 30)`
    );

    // Insert token graph relationships (ancestor -> descendant)
    db.exec(
      `INSERT INTO token_graph (ancestor, descendant, depth, path) VALUES ('--color-primary', '--button-bg', 1, '["--color-primary", "--button-bg"]')`
    );
    db.exec(
      `INSERT INTO token_graph (ancestor, descendant, depth, path) VALUES ('--color-primary', '--link-color', 1, '["--color-primary", "--link-color"]')`
    );

    const result = buildCascade(db, "--color-primary", 10);

    expect(result.tokenDependencies).toBeDefined();
    expect(result.tokenDependencies?.downstream).toEqual(["--button-bg", "--link-color"]);

    db.close();
  });

  test("returns undefined tokenDependencies when no downstream deps exist", () => {
    const db = createTestDb();

    // Insert a token with no dependents
    db.exec(
      `INSERT INTO tokens (name, value, file, line) VALUES ('--spacing-sm', '0.5rem', 'tokens.css', 10)`
    );

    const result = buildCascade(db, "--spacing-sm", 10);

    expect(result.tokenDependencies).toBeUndefined();

    db.close();
  });

  test("returns undefined tokenDependencies for non-existent token", () => {
    const db = createTestDb();

    const result = buildCascade(db, "--nonexistent", 10);

    expect(result.tokenDependencies).toBeUndefined();

    db.close();
  });

  test("returns downstream dependencies sorted alphabetically", () => {
    const db = createTestDb();

    db.exec(
      `INSERT INTO tokens (name, value, file, line) VALUES ('--base-color', '#000', 'tokens.css', 10)`
    );

    // Insert in non-alphabetical order
    db.exec(
      `INSERT INTO token_graph (ancestor, descendant, depth, path) VALUES ('--base-color', '--zebra-color', 1, '["--base-color", "--zebra-color"]')`
    );
    db.exec(
      `INSERT INTO token_graph (ancestor, descendant, depth, path) VALUES ('--base-color', '--apple-color', 1, '["--base-color", "--apple-color"]')`
    );
    db.exec(
      `INSERT INTO token_graph (ancestor, descendant, depth, path) VALUES ('--base-color', '--middle-color', 1, '["--base-color", "--middle-color"]')`
    );

    const result = buildCascade(db, "--base-color", 10);

    expect(result.tokenDependencies?.downstream).toEqual([
      "--apple-color",
      "--middle-color",
      "--zebra-color",
    ]);

    db.close();
  });

  test("returns unique downstream dependencies (no duplicates)", () => {
    const db = createTestDb();

    db.exec(
      `INSERT INTO tokens (name, value, file, line) VALUES ('--base-token', '#fff', 'tokens.css', 10)`
    );

    // The DISTINCT in SQL should handle duplicates, but let's verify
    db.exec(
      `INSERT INTO token_graph (ancestor, descendant, depth, path) VALUES ('--base-token', '--child-token', 1, '["--base-token", "--child-token"]')`
    );

    const result = buildCascade(db, "--base-token", 10);

    expect(result.tokenDependencies?.downstream).toEqual(["--child-token"]);

    db.close();
  });
});

describe("buildCascade - confidence limits", () => {
  test("returns full confidence when all data is present", () => {
    const db = createTestDb();

    // Insert token with definition
    db.exec(
      `INSERT INTO tokens (name, value, file, line) VALUES ('--color-primary', '#007bff', 'tokens.css', 10)`
    );

    // Insert theme variants
    db.exec(
      `INSERT INTO token_themes (token_name, theme, value, source) VALUES ('--color-primary', 'light', '#007bff', 'tokens.css:10')`
    );
    db.exec(
      `INSERT INTO token_themes (token_name, theme, value, source) VALUES ('--color-primary', 'dark', '#0056b3', 'tokens.css:15')`
    );

    // Insert downstream dependency
    db.exec(
      `INSERT INTO token_graph (ancestor, descendant, depth, path) VALUES ('--color-primary', '--color-button', 1, '["--color-primary"]')`
    );

    const result = buildCascade(db, "--color-primary", 10);

    expect(result.limits.confidence).toBe("full");
    expect(result.limits.missing).toBeUndefined();

    db.close();
  });

  test("returns partial confidence when token definition is missing", () => {
    const db = createTestDb();

    // Query for a token that doesn't exist
    const result = buildCascade(db, "--color-unknown", 10);

    expect(result.limits.confidence).toBe("partial");
    expect(result.limits.missing).toContain("token_definition");

    db.close();
  });

  test("returns partial confidence when theme variants are missing", () => {
    const db = createTestDb();

    // Insert token without theme variants
    db.exec(
      `INSERT INTO tokens (name, value, file, line) VALUES ('--spacing-md', '1rem', 'tokens.css', 20)`
    );

    const result = buildCascade(db, "--spacing-md", 10);

    expect(result.limits.confidence).toBe("partial");
    expect(result.limits.missing).toContain("theme_variants");

    db.close();
  });

  test("returns partial confidence when downstream dependencies are missing", () => {
    const db = createTestDb();

    // Insert token with theme variants but no dependencies
    db.exec(
      `INSERT INTO tokens (name, value, file, line) VALUES ('--color-accent', '#ff0000', 'tokens.css', 30)`
    );
    db.exec(
      `INSERT INTO token_themes (token_name, theme, value, source) VALUES ('--color-accent', 'light', '#ff0000', 'tokens.css:30')`
    );
    db.exec(
      `INSERT INTO token_themes (token_name, theme, value, source) VALUES ('--color-accent', 'dark', '#cc0000', 'tokens.css:35')`
    );

    const result = buildCascade(db, "--color-accent", 10);

    expect(result.limits.confidence).toBe("partial");
    expect(result.limits.missing).toContain("token_dependencies");

    db.close();
  });

  test("tracks multiple missing fields", () => {
    const db = createTestDb();

    // Insert token without theme variants or dependencies
    db.exec(
      `INSERT INTO tokens (name, value, file, line) VALUES ('--size-sm', '0.5rem', 'tokens.css', 40)`
    );

    const result = buildCascade(db, "--size-sm", 10);

    expect(result.limits.confidence).toBe("partial");
    expect(result.limits.missing).toContain("theme_variants");
    expect(result.limits.missing).toContain("token_dependencies");
    expect(result.limits.missing).not.toContain("token_definition");

    db.close();
  });

  test("limits field is always present", () => {
    const db = createTestDb();

    const result = buildCascade(db, "--nonexistent", 10);

    expect(result.limits).toBeDefined();
    expect(result.limits.confidence).toBeDefined();

    db.close();
  });
});
