import type { IndexDatabase } from "./db.ts";

export const SCHEMA_VERSION = 2;

export function createIndexSchema(db: IndexDatabase): void {
  db.exec(`
    DROP TABLE IF EXISTS tokens;
    DROP TABLE IF EXISTS token_themes;
    DROP TABLE IF EXISTS usages;
    DROP TABLE IF EXISTS patterns;
    DROP TABLE IF EXISTS token_graph;
    DROP TABLE IF EXISTS component_graph;
    DROP TABLE IF EXISTS meta;

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

    CREATE TABLE component_graph (
      parent_file TEXT,
      parent_component TEXT,
      child_file TEXT,
      child_component TEXT,
      line INTEGER,
      PRIMARY KEY (parent_file, parent_component, child_file, child_component)
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
  `);
}
