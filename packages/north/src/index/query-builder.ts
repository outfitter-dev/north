/**
 * SQL Query Builder - Safe SQL query construction utilities
 *
 * This module provides parameterized query builders to prevent SQL injection
 * and ensure consistent ESCAPE clause handling for LIKE queries.
 *
 * @see PR #101, #106 for context on SQL injection vulnerabilities
 */

import type { Database } from "bun:sqlite";

// ============================================================================
// Insert Builder
// ============================================================================

/**
 * Insert a row with parameterized values.
 *
 * ALWAYS use this instead of string interpolation to prevent SQL injection.
 *
 * @example
 * ```ts
 * insertRow(db, "tokens", { name: "primary", value: "#3B82F6", category: "color" });
 * ```
 *
 * @param db - SQLite database instance
 * @param table - Table name (must be a valid identifier, not user input)
 * @param data - Record of column names to values
 */
export function insertRow(db: Database, table: string, data: Record<string, unknown>): void {
  const columns = Object.keys(data);
  if (columns.length === 0) {
    throw new Error("insertRow: data must have at least one column");
  }

  const placeholders = columns.map(() => "?").join(", ");
  const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;
  db.prepare(sql).run(...Object.values(data));
}

/**
 * Insert multiple rows in a single transaction.
 *
 * @param db - SQLite database instance
 * @param table - Table name
 * @param rows - Array of records to insert
 */
export function insertRows(db: Database, table: string, rows: Record<string, unknown>[]): void {
  if (rows.length === 0) {
    return;
  }

  const firstRow = rows[0];
  if (!firstRow) {
    return; // Already checked rows.length > 0, but TypeScript needs this
  }
  const columns = Object.keys(firstRow);
  const placeholders = columns.map(() => "?").join(", ");
  const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;
  const stmt = db.prepare(sql);

  db.transaction(() => {
    for (const row of rows) {
      stmt.run(...Object.values(row));
    }
  })();
}

// ============================================================================
// LIKE Pattern Escaping
// ============================================================================

/**
 * Escape special characters in LIKE patterns.
 *
 * SQLite LIKE patterns use % (any chars), _ (single char), and \ (escape).
 * This function escapes these characters so they match literally.
 *
 * IMPORTANT: When using this, always include `ESCAPE '\\'` in your query:
 * ```sql
 * WHERE column LIKE ? ESCAPE '\\'
 * ```
 *
 * @example
 * ```ts
 * const search = escapeLikePattern("100%_done");
 * // Returns: "100\\%\\_done"
 * db.prepare("SELECT * FROM t WHERE name LIKE ? ESCAPE '\\\\'").all(`%${search}%`);
 * ```
 *
 * @param search - The literal search string to escape
 * @returns Escaped string safe for LIKE patterns
 */
export function escapeLikePattern(search: string): string {
  return search.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// ============================================================================
// SELECT Query Builder
// ============================================================================

/**
 * Comparison operators supported in WHERE clauses.
 */
export type ComparisonOp =
  | "="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "LIKE"
  | "IN"
  | "IS NULL"
  | "IS NOT NULL";

/**
 * A single WHERE condition.
 */
export interface WhereCondition {
  /** Column name */
  column: string;
  /** Comparison operator */
  op: ComparisonOp;
  /** Value to compare against (not needed for IS NULL/IS NOT NULL) */
  value?: unknown;
}

/**
 * Options for SELECT query building.
 */
export interface SelectOptions {
  /** Maximum rows to return */
  limit?: number;
  /** Number of rows to skip */
  offset?: number;
  /** ORDER BY clause (column name or expression) */
  orderBy?: string;
  /** Sort direction (default: ASC) */
  orderDir?: "ASC" | "DESC";
  /** Use DISTINCT */
  distinct?: boolean;
}

/**
 * Result of building a SELECT query.
 */
export interface BuiltQuery {
  /** The parameterized SQL string */
  sql: string;
  /** Parameter values in order */
  params: unknown[];
}

/**
 * Build a SELECT query with proper parameterization.
 *
 * Automatically handles:
 * - ESCAPE clause for LIKE conditions
 * - IN clause with multiple values
 * - IS NULL / IS NOT NULL without values
 * - Parameterized LIMIT/OFFSET
 *
 * @example
 * ```ts
 * const { sql, params } = buildSelectQuery(
 *   "tokens",
 *   ["name", "value"],
 *   [
 *     { column: "category", op: "=", value: "color" },
 *     { column: "name", op: "LIKE", value: escapeLikePattern("bg-") + "%" },
 *   ],
 *   { limit: 10, orderBy: "name" }
 * );
 * db.prepare(sql).all(...params);
 * ```
 *
 * @param table - Table name
 * @param columns - Columns to select (use ["*"] for all)
 * @param where - Array of WHERE conditions (AND-ed together)
 * @param options - Additional query options
 * @returns Object with SQL string and params array
 */
export function buildSelectQuery(
  table: string,
  columns: string[],
  where: WhereCondition[] = [],
  options: SelectOptions = {}
): BuiltQuery {
  const params: unknown[] = [];
  const whereClauses: string[] = [];

  // Build WHERE clauses
  for (const cond of where) {
    switch (cond.op) {
      case "LIKE": {
        // Always include ESCAPE clause for LIKE
        whereClauses.push(`${cond.column} LIKE ? ESCAPE '\\\\'`);
        params.push(cond.value);
        break;
      }

      case "IN": {
        if (!Array.isArray(cond.value) || cond.value.length === 0) {
          // Empty IN clause matches nothing
          whereClauses.push("0 = 1");
        } else {
          const placeholders = cond.value.map(() => "?").join(", ");
          whereClauses.push(`${cond.column} IN (${placeholders})`);
          params.push(...cond.value);
        }
        break;
      }

      case "IS NULL":
        whereClauses.push(`${cond.column} IS NULL`);
        break;

      case "IS NOT NULL":
        whereClauses.push(`${cond.column} IS NOT NULL`);
        break;

      default: {
        // Standard comparison: =, !=, <, <=, >, >=
        whereClauses.push(`${cond.column} ${cond.op} ?`);
        params.push(cond.value);
      }
    }
  }

  // Build SELECT clause
  const distinctClause = options.distinct ? "DISTINCT " : "";
  let sql = `SELECT ${distinctClause}${columns.join(", ")} FROM ${table}`;

  // Add WHERE
  if (whereClauses.length > 0) {
    sql += ` WHERE ${whereClauses.join(" AND ")}`;
  }

  // Add ORDER BY
  if (options.orderBy) {
    const dir = options.orderDir ?? "ASC";
    sql += ` ORDER BY ${options.orderBy} ${dir}`;
  }

  // Add LIMIT/OFFSET (parameterized for safety)
  if (options.limit !== undefined) {
    sql += " LIMIT ?";
    params.push(options.limit);
  }

  if (options.offset !== undefined) {
    sql += " OFFSET ?";
    params.push(options.offset);
  }

  return { sql, params };
}
