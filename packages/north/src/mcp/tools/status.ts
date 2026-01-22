/**
 * North Status Tool
 *
 * MCP tool that reports the current North design system status.
 * Always available (Tier 1) - works without any configuration.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { detectContext } from "../state.ts";
import type { ServerState } from "../types.ts";

/**
 * Get guidance based on current server state.
 */
export function getGuidance(state: ServerState): string[] {
  switch (state) {
    case "none":
      return [
        "No North configuration found.",
        "Run 'north init' to initialize the project.",
        "Then run 'north gen' to generate design tokens.",
      ];
    case "config":
      return [
        "Configuration found but no index.",
        "Run 'north index' to build the token index for full functionality.",
        "Use 'north check' to lint for design system violations.",
        "Use 'north context' to get design system context for LLMs.",
      ];
    case "indexed":
      return [
        "Full functionality available.",
        "Use 'north check' to lint for violations.",
        "Use 'north find' to discover token usage patterns.",
        "Use 'north context' for design system context.",
      ];
  }
}

/**
 * Status response structure returned by north_status tool.
 */
export interface StatusResponse {
  /** Current server state (none/config/indexed) */
  state: ServerState;
  /** Current working directory */
  cwd: string;
  /** Path to north.config.yaml if found */
  configPath: string | null;
  /** Path to index.db if found */
  indexPath: string | null;
  /** Capability flags based on state */
  capabilities: {
    check: boolean;
    find: boolean;
    context: boolean;
    generate: boolean;
  };
  /** Guidance messages for the user */
  guidance: string[];
}

/**
 * Execute the north_status tool handler.
 *
 * Detects the current project state and returns a status report
 * including available capabilities and guidance for next steps.
 */
export async function executeStatusTool(): Promise<StatusResponse> {
  const cwd = process.cwd();
  const ctx = await detectContext(cwd);

  return {
    state: ctx.state,
    cwd: ctx.cwd,
    configPath: ctx.configPath ?? null,
    indexPath: ctx.indexPath ?? null,
    capabilities: {
      check: ctx.state !== "none",
      find: ctx.state === "indexed",
      context: ctx.state !== "none",
      generate: ctx.state !== "none",
    },
    guidance: getGuidance(ctx.state),
  };
}

/**
 * Register the north_status tool with the MCP server.
 *
 * This is a Tier 1 tool that is always available, regardless of
 * whether North has been configured in the project.
 */
export function registerStatusTool(server: McpServer): void {
  server.registerTool(
    "north_status",
    {
      description:
        "Get North design system status. Returns current state (none/config/indexed), " +
        "available capabilities, and guidance on next steps.",
    },
    async () => {
      const status = await executeStatusTool();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(status, null, 2),
          },
        ],
      };
    }
  );
}
