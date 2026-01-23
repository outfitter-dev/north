/**
 * North MCP Server
 *
 * MCP server exposing North design system tools to Claude Code.
 * Uses stdio transport for communication.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { version } from "../version.ts";
import { detectProjectState } from "./state.ts";
import { registerAdoptTool } from "./tools/adopt-tool.ts";
import { registerCheckTool } from "./tools/check.ts";
import { registerClassifyTool } from "./tools/classify-tool.ts";
import { registerContextTool } from "./tools/context.ts";
import { registerDiscoverTool } from "./tools/discover.ts";
import {
  getGuidance,
  registerDiscoverAlias,
  registerStatusAlias,
  registerStatusTool,
} from "./tools/index.ts";
import { registerMigrateTool } from "./tools/migrate-tool.ts";
import { registerPromoteTool } from "./tools/promote.ts";
import { registerProposeTool } from "./tools/propose-tool.ts";
import { registerQueryTool } from "./tools/query.ts";
import { registerRefactorTool } from "./tools/refactor.ts";
import { registerSuggestTool } from "./tools/suggest.ts";
import type { ServerState } from "./types.ts";

// Re-export getGuidance for backward compatibility with tests
export { getGuidance };

// ============================================================================
// Server Configuration
// ============================================================================

const SERVER_NAME = "north";

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
 * - Tier 2: Requires config (.north/config.yaml)
 * - Tier 3: Requires index (.north/state/index.db)
 */
export interface TieredTool {
  name: string;
  description: string;
  tier: 1 | 2 | 3;
}

// CLI parity aliases for discoverability (#86)
// These aliases match the CLI command names:
// | MCP Tool (primary) | MCP Alias | CLI Command |
// |--------------------|-----------|-------------|
// | north_discover | north_find | north find |
// | north_status | north_doctor | north doctor |
// | north_check | (none) | north check |

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
  {
    name: "north_doctor",
    description: "Alias for north_status. Matches 'north doctor' CLI command for discoverability.",
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
    name: "north_find",
    description: "Alias for north_discover. Matches 'north find' CLI command for discoverability.",
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
  {
    name: "north_classify",
    description:
      "Classify component files by context (primitive, composed, layout). " +
      "Enables context-aware linting rules with different complexity thresholds.",
    tier: 3,
  },
  {
    name: "north_adopt",
    description:
      "Discover patterns worth tokenizing. Analyzes indexed class usage to find " +
      "repeated patterns that could be extracted into design tokens or utilities.",
    tier: 3,
  },

  // Tier 2: Migration tools
  {
    name: "north_propose",
    description:
      "Generate a migration plan from lint violations. Analyzes design system violations " +
      "and creates actionable steps to fix them.",
    tier: 2,
  },
  {
    name: "north_migrate",
    description:
      "Execute a migration plan to apply design system fixes. Transforms code based on " +
      "steps generated by 'north propose'. Defaults to dry-run for safety.",
    tier: 2,
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

type ToolRegistry = Map<string, RegisteredTool>;

interface ToolRefreshOptions {
  forceNotify?: boolean;
}

function applyToolState(registry: ToolRegistry, state: ServerState): boolean {
  const allowed = new Set(getToolsForState(state).map((tool) => tool.name));
  let changed = false;

  for (const [name, tool] of registry) {
    const shouldEnable = allowed.has(name);
    if (tool.enabled !== shouldEnable) {
      tool.update({ enabled: shouldEnable });
      changed = true;
    }
  }

  return changed;
}

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Register all North tools with the MCP server.
 * Tools are registered once; context is detected per-call.
 */
function registerTools(server: McpServer, onRefresh: () => void): ToolRegistry {
  const registry: ToolRegistry = new Map();
  const track = (name: string, tool: RegisteredTool) => {
    registry.set(name, tool);
    return tool;
  };

  // Tier 1: Always available
  track("north_status", registerStatusTool(server, { onRefresh }));
  track("north_doctor", registerStatusAlias(server, { onRefresh })); // north_doctor alias

  // Tier 2: Config-dependent tools
  track("north_context", registerContextTool(server));
  track("north_check", registerCheckTool(server));
  track("north_suggest", registerSuggestTool(server));
  track("north_propose", registerProposeTool(server));
  track("north_migrate", registerMigrateTool(server));

  // Tier 3: Index-dependent tools
  track("north_discover", registerDiscoverTool(server));
  track("north_find", registerDiscoverAlias(server)); // north_find alias
  track("north_promote", registerPromoteTool(server));
  track("north_query", registerQueryTool(server));
  track("north_refactor", registerRefactorTool(server));
  track("north_classify", registerClassifyTool(server));
  track("north_adopt", registerAdoptTool(server));

  return registry;
}

// ============================================================================
// Server Factory
// ============================================================================

/**
 * Create and configure the North MCP server.
 */
export function createServerWithTools(): {
  server: McpServer;
  refreshTools: (options?: ToolRefreshOptions) => Promise<ServerState>;
} {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version,
    },
    {
      capabilities: {
        tools: {},
      },
      instructions: SERVER_INSTRUCTIONS,
    }
  );

  let currentState: ServerState = "none";
  const registry = registerTools(server, () => {
    void refreshTools({ forceNotify: true });
  });
  applyToolState(registry, currentState);

  async function refreshTools(options: ToolRefreshOptions = {}): Promise<ServerState> {
    const nextState = await detectProjectState(process.cwd());
    const stateChanged = nextState !== currentState;

    if (stateChanged) {
      currentState = nextState;
      const toolsChanged = applyToolState(registry, nextState);
      if (!toolsChanged && options.forceNotify) {
        server.sendToolListChanged();
      }
      return currentState;
    }

    if (options.forceNotify) {
      server.sendToolListChanged();
    }

    return currentState;
  }

  return { server, refreshTools };
}

export function createServer(): McpServer {
  return createServerWithTools().server;
}

/**
 * Start the MCP server with stdio transport.
 * This is the main entry point for the north-mcp binary.
 */
export async function startServer(): Promise<void> {
  const { server, refreshTools } = createServerWithTools();
  const transport = new StdioServerTransport();

  await server.connect(transport);
  await refreshTools({ forceNotify: true });

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
