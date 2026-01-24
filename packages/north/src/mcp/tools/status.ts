/**
 * North Status Tool
 *
 * MCP tool that reports the current North design system status.
 * Always available (Tier 1) - works without any configuration.
 */

import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TIERED_TOOLS, getToolsForState } from "../server.ts";
import { detectContext } from "../state.ts";
import type { ServerState } from "../types.ts";

// ============================================================================
// Input Schema
// ============================================================================

/**
 * Input schema for the north_status tool.
 */
export const StatusInputSchema = z.object({
  refresh: z
    .boolean()
    .optional()
    .describe("Re-detect state and notify clients of tool list changes"),
});

export type StatusInput = z.infer<typeof StatusInputSchema>;

export interface StatusToolOptions {
  onRefresh?: () => void | Promise<void>;
}

// ============================================================================
// Guidance
// ============================================================================

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

// ============================================================================
// Response Types
// ============================================================================

/**
 * Status response structure returned by north_status tool.
 */
export interface StatusResponse {
  /** Current server state (none/config/indexed) */
  state: ServerState;
  /** Current working directory */
  cwd: string;
  /** Path to .north/config.yaml if found */
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
  /** Tools available at current tier */
  availableTools: string[];
  /** Tools unavailable at current tier with lock reasons */
  lockedTools: Record<string, string>;
}

// ============================================================================
// Core Logic
// ============================================================================

/**
 * Execute the north_status tool handler.
 *
 * Detects the current project state and returns a status report
 * including available capabilities, available tools, and guidance for next steps.
 */
export async function executeStatusTool(): Promise<StatusResponse> {
  const cwd = process.cwd();
  const ctx = await detectContext(cwd);

  // Get tools available at current tier
  const availableTools = getToolsForState(ctx.state).map((t) => t.name);
  const availableSet = new Set(availableTools);
  const lockedTools: Record<string, string> = {};

  for (const tool of TIERED_TOOLS) {
    if (availableSet.has(tool.name)) continue;

    if (ctx.state === "none") {
      lockedTools[tool.name] =
        tool.tier === 2
          ? "Requires project config (.north/config.yaml)."
          : "Requires project config and a built index.";
    } else if (ctx.state === "config") {
      lockedTools[tool.name] = "Requires a built index (.north/state/index.db).";
    }
  }

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
    availableTools,
    lockedTools,
  };
}

// ============================================================================
// Tool Registration
// ============================================================================

const STATUS_DESCRIPTION =
  "Get North design system status. Returns current state (none/config/indexed), " +
  "available capabilities, available tools, and guidance on next steps. " +
  "Pass refresh=true to re-detect state and notify clients of tool list changes.";

/**
 * Handler for north_status and its alias north_doctor.
 */
function createStatusHandler(onRefresh?: () => void | Promise<void>) {
  return async (args: unknown) => {
    // Parse and validate input
    const parseResult = StatusInputSchema.safeParse(args);
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

    const input: StatusInput = parseResult.data;
    const status = await executeStatusTool();

    // When refresh is requested, notify clients that tool list may have changed
    if (input.refresh && onRefresh) {
      await onRefresh();
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(status, null, 2),
        },
      ],
    };
  };
}

/**
 * Register the north_status tool with the MCP server.
 *
 * This is a Tier 1 tool that is always available, regardless of
 * whether North has been configured in the project.
 *
 * When called with `refresh: true`, re-detects state and sends
 * `notifications/tools/list_changed` to notify clients of potential
 * tool availability changes.
 */
export function registerStatusTool(
  server: McpServer,
  options: StatusToolOptions = {}
): RegisteredTool {
  const onRefresh = options.onRefresh ?? (() => server.sendToolListChanged());
  return server.registerTool(
    "north_status",
    {
      description: STATUS_DESCRIPTION,
      inputSchema: StatusInputSchema,
    },
    createStatusHandler(onRefresh)
  );
}

/**
 * Register the north_doctor alias for north_status.
 * This matches the 'north doctor' CLI command for discoverability.
 */
export function registerStatusAlias(
  server: McpServer,
  options: StatusToolOptions = {}
): RegisteredTool {
  const onRefresh = options.onRefresh ?? (() => server.sendToolListChanged());
  return server.registerTool(
    "north_doctor",
    {
      description: `${STATUS_DESCRIPTION} (Alias for north_status, matches 'north doctor' CLI command.)`,
      inputSchema: StatusInputSchema,
    },
    createStatusHandler(onRefresh)
  );
}
