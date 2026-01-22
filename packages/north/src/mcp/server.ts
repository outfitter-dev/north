/**
 * North MCP Server
 *
 * MCP server exposing North design system tools to Claude Code.
 * Uses stdio transport for communication.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { findConfigFile } from "../config/loader.ts";
import { getIndexStatus } from "../index/queries.ts";
import type { NorthMcpContext, ServerState } from "./types.ts";

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
// Context Detection
// ============================================================================

/**
 * Detect the current server state by checking for config and index files.
 */
async function detectContext(cwd: string): Promise<NorthMcpContext> {
  const configPath = await findConfigFile(cwd);

  if (!configPath) {
    return { state: "none", cwd };
  }

  const indexStatus = await getIndexStatus(cwd, configPath);

  if (indexStatus.exists) {
    return {
      state: "indexed",
      configPath,
      indexPath: indexStatus.indexPath,
      cwd,
    };
  }

  return { state: "config", configPath, cwd };
}

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Register all North tools with the MCP server.
 * Tools are registered once; context is detected per-call.
 */
function registerTools(server: McpServer): void {
  // Status tool - always available, reports current state
  server.registerTool(
    "north_status",
    {
      description:
        "Get North design system status. Returns current state (none/config/indexed), " +
        "available capabilities, and guidance on next steps.",
    },
    async () => {
      const cwd = process.cwd();
      const ctx = await detectContext(cwd);

      const status = {
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

/**
 * Get guidance based on current server state.
 */
function getGuidance(state: ServerState): string[] {
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
