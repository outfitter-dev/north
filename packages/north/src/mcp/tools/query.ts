/**
 * north_query MCP tool - Direct queries against the token index
 *
 * Provides low-level query access to the index database for tokens,
 * patterns, and usage data. This is a Tier 3 tool - requires index.
 *
 * @see .scratch/mcp-server/11-remaining-issues-execution-plan.md for specification
 * @issue #83
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type IndexDatabase, openIndexDatabase } from "../../index/db.ts";
import { checkIndexFresh, getIndexStatus } from "../../index/queries.ts";
import { detectContext } from "../state.ts";

// ============================================================================
// Input Schema
// ============================================================================

const QUERY_TYPES = ["tokens", "patterns", "usage"] as const;

export const QueryInputSchema = z.object({
  type: z.enum(QUERY_TYPES).describe("Query type: tokens, patterns, or usage"),
  search: z
    .string()
    .optional()
    .describe("Search string to filter results (matches name/class_name)"),
  filter: z
    .record(z.string(), z.string())
    .optional()
    .describe("Key-value filters to apply (e.g., { file: 'src/components' })"),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .default(50)
    .describe("Maximum number of results to return (default 50)"),
  cwd: z.string().optional().describe("Working directory (defaults to process.cwd())"),
});

export type QueryInput = z.infer<typeof QueryInputSchema>;

// Re-export the interface for compatibility
export interface NorthQueryParams {
  type: "tokens" | "patterns" | "usage";
  search?: string;
  filter?: Record<string, string>;
  limit?: number;
}

// ============================================================================
// Response Types
// ============================================================================

export interface TokenRow {
  name: string;
  value: string;
  file: string;
  line: number;
}

export interface PatternRow {
  hash: string;
  classes: string[];
  count: number;
  locations: Array<{ file: string; line: number; component: string | null }>;
}

export interface UsageRow {
  file: string;
  line: number;
  column: number;
  className: string;
  resolvedToken: string | null;
}

export interface QueryResponse {
  kind: "query";
  type: "tokens" | "patterns" | "usage";
  count: number;
  results: TokenRow[] | PatternRow[] | UsageRow[];
  truncated: boolean;
  summary: string;
}

// ============================================================================
// Query Functions
// ============================================================================

const DEFAULT_LIMIT = 50;

function escapeSearchPattern(search: string): string {
  // Escape SQL LIKE special characters
  return search.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function queryTokens(
  db: IndexDatabase,
  search: string | undefined,
  filter: Record<string, string> | undefined,
  limit: number
): { rows: TokenRow[]; total: number } {
  let sql = "SELECT name, value, file, line FROM tokens";
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (search) {
    conditions.push("name LIKE ? ESCAPE '\\'");
    params.push(`%${escapeSearchPattern(search)}%`);
  }

  if (filter?.file) {
    conditions.push("file LIKE ? ESCAPE '\\'");
    params.push(`%${escapeSearchPattern(filter.file)}%`);
  }

  if (filter?.name) {
    conditions.push("name LIKE ? ESCAPE '\\'");
    params.push(`%${escapeSearchPattern(filter.name)}%`);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(" AND ")}`;
  }

  // Count total
  const countSql = sql.replace(
    "SELECT name, value, file, line FROM",
    "SELECT COUNT(*) as count FROM"
  );
  const totalResult = db.prepare(countSql).get(...params) as { count: number } | undefined;
  const total = totalResult?.count ?? 0;

  sql += " ORDER BY name ASC LIMIT ?";
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as TokenRow[];
  return { rows, total };
}

function queryPatterns(
  db: IndexDatabase,
  search: string | undefined,
  filter: Record<string, string> | undefined,
  limit: number
): { rows: PatternRow[]; total: number } {
  let sql = "SELECT hash, classes, count, locations FROM patterns";
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (search) {
    conditions.push("classes LIKE ? ESCAPE '\\'");
    params.push(`%${escapeSearchPattern(search)}%`);
  }

  if (filter?.minCount) {
    const minCount = Number.parseInt(filter.minCount, 10);
    if (!Number.isNaN(minCount)) {
      conditions.push("count >= ?");
      params.push(minCount);
    }
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(" AND ")}`;
  }

  // Count total
  const countSql = sql.replace(
    "SELECT hash, classes, count, locations FROM",
    "SELECT COUNT(*) as count FROM"
  );
  const totalResult = db.prepare(countSql).get(...params) as { count: number } | undefined;
  const total = totalResult?.count ?? 0;

  sql += " ORDER BY count DESC, hash ASC LIMIT ?";
  params.push(limit);

  const rawRows = db.prepare(sql).all(...params) as Array<{
    hash: string;
    classes: string;
    count: number;
    locations: string;
  }>;

  const rows: PatternRow[] = rawRows.map((row) => {
    let classes: string[] = [];
    let locations: Array<{ file: string; line: number; component: string | null }> = [];

    try {
      classes = JSON.parse(row.classes) as string[];
    } catch {
      classes = [];
    }

    try {
      locations = JSON.parse(row.locations) as Array<{
        file: string;
        line: number;
        component: string | null;
      }>;
    } catch {
      locations = [];
    }

    return { hash: row.hash, classes, count: row.count, locations };
  });

  return { rows, total };
}

function queryUsage(
  db: IndexDatabase,
  search: string | undefined,
  filter: Record<string, string> | undefined,
  limit: number
): { rows: UsageRow[]; total: number } {
  let sql =
    "SELECT file, line, column, class_name as className, resolved_token as resolvedToken FROM usages";
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (search) {
    conditions.push("(class_name LIKE ? ESCAPE '\\' OR resolved_token LIKE ? ESCAPE '\\')");
    const pattern = `%${escapeSearchPattern(search)}%`;
    params.push(pattern, pattern);
  }

  if (filter?.file) {
    conditions.push("file LIKE ? ESCAPE '\\'");
    params.push(`%${escapeSearchPattern(filter.file)}%`);
  }

  if (filter?.className) {
    conditions.push("class_name LIKE ? ESCAPE '\\'");
    params.push(`%${escapeSearchPattern(filter.className)}%`);
  }

  if (filter?.token) {
    conditions.push("resolved_token LIKE ? ESCAPE '\\'");
    params.push(`%${escapeSearchPattern(filter.token)}%`);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(" AND ")}`;
  }

  // Count total
  const countSql = sql.replace(
    "SELECT file, line, column, class_name as className, resolved_token as resolvedToken FROM",
    "SELECT COUNT(*) as count FROM"
  );
  const totalResult = db.prepare(countSql).get(...params) as { count: number } | undefined;
  const total = totalResult?.count ?? 0;

  sql += " ORDER BY file ASC, line ASC LIMIT ?";
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as UsageRow[];
  return { rows, total };
}

// ============================================================================
// Summary Generators
// ============================================================================

function summarizeTokens(count: number, total: number, search?: string): string {
  const searchNote = search ? ` matching "${search}"` : "";
  if (count === total) {
    return `Found ${count} token${count !== 1 ? "s" : ""}${searchNote}.`;
  }
  return `Showing ${count} of ${total} token${total !== 1 ? "s" : ""}${searchNote}.`;
}

function summarizePatterns(count: number, total: number, search?: string): string {
  const searchNote = search ? ` matching "${search}"` : "";
  if (count === total) {
    return `Found ${count} pattern${count !== 1 ? "s" : ""}${searchNote}.`;
  }
  return `Showing ${count} of ${total} pattern${total !== 1 ? "s" : ""}${searchNote}.`;
}

function summarizeUsage(count: number, total: number, search?: string): string {
  const searchNote = search ? ` matching "${search}"` : "";
  if (count === total) {
    return `Found ${count} usage${count !== 1 ? "s" : ""}${searchNote}.`;
  }
  return `Showing ${count} of ${total} usage${total !== 1 ? "s" : ""}${searchNote}.`;
}

// ============================================================================
// Core Logic
// ============================================================================

export interface QueryOptions {
  type: "tokens" | "patterns" | "usage";
  search?: string;
  filter?: Record<string, string>;
  limit?: number;
}

/**
 * Execute the north_query tool handler.
 *
 * Performs direct SQL queries against the index database
 * based on the specified query type.
 */
export async function executeQueryTool(
  workingDir: string,
  configPath: string,
  options: QueryOptions
): Promise<QueryResponse> {
  const { type, search, filter, limit = DEFAULT_LIMIT } = options;

  // Check index exists and is fresh
  const status = await getIndexStatus(workingDir, configPath);
  if (!status.exists) {
    throw new Error("Index not found. Run 'north index' to build it.");
  }

  const freshness = await checkIndexFresh(workingDir, configPath);
  if (!freshness.fresh) {
    throw new Error("Index is stale. Run 'north index' to refresh it.");
  }

  let db: IndexDatabase | null = null;

  try {
    db = await openIndexDatabase(status.indexPath);

    switch (type) {
      case "tokens": {
        const { rows, total } = queryTokens(db, search, filter, limit);
        return {
          kind: "query",
          type: "tokens",
          count: rows.length,
          results: rows,
          truncated: rows.length < total,
          summary: summarizeTokens(rows.length, total, search),
        };
      }

      case "patterns": {
        const { rows, total } = queryPatterns(db, search, filter, limit);
        return {
          kind: "query",
          type: "patterns",
          count: rows.length,
          results: rows,
          truncated: rows.length < total,
          summary: summarizePatterns(rows.length, total, search),
        };
      }

      case "usage": {
        const { rows, total } = queryUsage(db, search, filter, limit);
        return {
          kind: "query",
          type: "usage",
          count: rows.length,
          results: rows,
          truncated: rows.length < total,
          summary: summarizeUsage(rows.length, total, search),
        };
      }

      default: {
        // TypeScript exhaustiveness check
        const exhaustiveCheck: never = type;
        throw new Error(`Unknown query type: ${exhaustiveCheck}`);
      }
    }
  } finally {
    if (db) {
      db.close();
    }
  }
}

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Register the north_query tool with the MCP server.
 *
 * This is a Tier 3 tool - requires index (.north/index.db) to be present.
 */
export function registerQueryTool(server: McpServer): void {
  server.registerTool(
    "north_query",
    {
      description:
        "Query the North design token index directly. " +
        "Types: tokens (list design tokens), patterns (repeated class combinations), " +
        "usage (where classes are used). " +
        "Supports search string and filter object for narrowing results.",
    },
    async (args: unknown) => {
      const cwd = process.cwd();

      // Validate input
      const parseResult = QueryInputSchema.safeParse(args);
      if (!parseResult.success) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: "Invalid input parameters",
                  details: parseResult.error.issues,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      const input = parseResult.data;
      const workingDir = input.cwd ?? cwd;

      // Check context state - this tool requires indexed state (Tier 3)
      const ctx = await detectContext(workingDir);
      if (ctx.state !== "indexed") {
        const guidance =
          ctx.state === "none"
            ? [
                "Run 'north init' to initialize the project.",
                "Then run 'north index' to build the token index.",
              ]
            : ["Run 'north index' to build the token index."];

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: ctx.state === "none" ? "No North configuration found" : "Index not found",
                  guidance,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      try {
        const payload = await executeQueryTool(workingDir, ctx.configPath as string, {
          type: input.type,
          search: input.search,
          filter: input.filter,
          limit: input.limit,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(payload, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: message,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );
}
