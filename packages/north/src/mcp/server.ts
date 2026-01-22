/**
 * North MCP Server
 *
 * MCP server exposing North design system tools to Claude Code.
 * Uses stdio transport for communication.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getGuidance, registerStatusTool } from "./tools/index.ts";
import { registerContextTool } from "./tools/context.ts";
import { registerDiscoverTool } from "./tools/discover.ts";
import { registerPromoteTool } from "./tools/promote.ts";
import { registerRefactorTool } from "./tools/refactor.ts";
import type { ServerState } from "./types.ts";

// Re-export getGuidance for backward compatibility with tests
export { getGuidance };

// ============================================================================
// Server Configuration
// ============================================================================

const SERVER_NAME = "north";
const SERVER_VERSION = "0.1.0";

/**
 * Server instructions for Claude Code Tool Search discovery.
 * These help the LLM understand when to use North tools.
 */
const SERVER_INSTRUCTIONS = `
North is a design system toolkit for TypeScript/React projects. Use these tools to:

- Discover design tokens and their usage patterns
- Understand token cascade and dependencies
- Find appropriate tokens for UI components
- Check design system compliance and lint violations
- Generate and manage design token files

Start with north_status to understand available capabilities and the current project state.

North works best when:
1. The project has been initialized with 'north init'
2. Design tokens have been generated with 'north gen'
3. The index has been built with 'north index'

If north_status shows state='none', suggest running 'north init' first.
`;

// ============================================================================
// Tool Tiers
// ============================================================================

/**
 * Tool tier definition.
 * - Tier 1: Always available (no config needed)
 * - Tier 2: Requires config (north.config.yaml)
 * - Tier 3: Requires index (.north/index.db)
 */
export interface TieredTool {
  name: string;
  description: string;
  tier: 1 | 2 | 3;
}

/**
 * All North MCP tools with their tier assignments.
 */
export const TIERED_TOOLS: TieredTool[] = [
  // Tier 1: Always available
  {
    name: "north_status",
    description:
      "Get North design system status. Returns current state (none/config/indexed), " +
      "available capabilities, and guidance on next steps.",
    tier: 1,
  },

  // Tier 2: Requires config
  {
    name: "north_context",
    description:
      "Get design system context for LLMs. Returns token catalog, semantic mappings, " +
      "and component guidance for implementing UI features.",
    tier: 2,
  },
  {
    name: "north_check",
    description:
      "Lint files for design system violations. Reports issues like magic colors, " +
      "inline spacing, and missing semantic tokens.",
    tier: 2,
  },
  {
    name: "north_suggest",
    description:
      "Suggest appropriate design tokens for a given use case. Helps find the right " +
      "token for colors, spacing, typography, etc.",
    tier: 2,
  },

  // Tier 3: Requires index
  {
    name: "north_discover",
    description:
      "Discover token usage patterns in the codebase. Find where tokens are used, " +
      "explore cascade chains, and understand token dependencies.",
    tier: 3,
  },
  {
    name: "north_promote",
    description:
      "Promote a magic value to a design token. Analyzes usage, suggests token name, " +
      "and provides implementation guidance.",
    tier: 3,
  },
  {
    name: "north_refactor",
    description:
      "Refactor code to use design tokens. Identifies candidates for token promotion " +
      "and generates migration plans.",
    tier: 3,
  },
  {
    name: "north_query",
    description:
      "Query the token index directly. Run custom queries against token definitions, " +
      "usages, and the token graph.",
    tier: 3,
  },
];

/**
 * Get tools available for a given server state.
 */
export function getToolsForState(state: ServerState): TieredTool[] {
  switch (state) {
    case "none":
      return TIERED_TOOLS.filter((t) => t.tier === 1);
    case "config":
      return TIERED_TOOLS.filter((t) => t.tier <= 2);
    case "indexed":
      return TIERED_TOOLS;
  }
}

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Register all North tools with the MCP server.
 * Tools are registered once; context is detected per-call.
 */
function registerTools(server: McpServer): void {
  // Tier 1: Always available
  registerStatusTool(server);

  // Tier 2: Config-dependent tools
  registerContextTool(server);

  // Tier 3: Index-dependent tools
  registerDiscoverTool(server);
  registerPromoteTool(server);
  registerRefactorTool(server);
}

// ============================================================================
// Server Factory
// ============================================================================

/**
 * Create and configure the North MCP server.
 */
export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
      instructions: SERVER_INSTRUCTIONS,
    }
  );

  registerTools(server);

  return server;
}

/**
 * Start the MCP server with stdio transport.
 * This is the main entry point for the north-mcp binary.
 */
export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await server.close();
    process.exit(0);
  });
}
