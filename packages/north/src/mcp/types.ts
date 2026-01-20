/**
 * MCP Server Types
 *
 * Core types for the North MCP server.
 */

/**
 * Server state representing the initialization level.
 * - 'none': No configuration found
 * - 'config': Configuration loaded but no index
 * - 'indexed': Full index available
 */
export type ServerState = "none" | "config" | "indexed";

/**
 * Context passed to MCP tool handlers.
 */
export interface NorthMcpContext {
  /** Current server state */
  state: ServerState;
  /** Resolved path to north.config.yaml */
  configPath?: string;
  /** Resolved path to north.db index */
  indexPath?: string;
  /** Current working directory */
  cwd: string;
}

/**
 * Tool registration metadata.
 */
export interface ToolDefinition {
  /** Tool name (snake_case, prefixed with north_) */
  name: string;
  /** Tool description for LLM */
  description: string;
  /** JSON Schema for tool input */
  inputSchema: Record<string, unknown>;
}

/**
 * Result from a tool handler.
 */
export interface ToolResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Result data or error message */
  content: unknown;
}
