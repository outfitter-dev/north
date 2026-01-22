#!/usr/bin/env node
/**
 * North MCP Server Entry Point
 *
 * This is the main entry point for the north-mcp binary.
 * Starts the MCP server with stdio transport.
 */

import { startServer } from "./server.ts";

startServer().catch((error) => {
  console.error("Failed to start North MCP server:", error);
  process.exit(1);
});
