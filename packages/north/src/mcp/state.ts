/**
 * MCP Server State Detection
 *
 * Detects the current project state based on configuration and index files.
 * Used to determine which MCP tools should be available.
 */

import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { findConfigFile } from "../config/loader.ts";
import type { NorthMcpContext, ServerState } from "./types.ts";

/**
 * Check if a file exists at the given path.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect the current server state by checking for config and index files.
 *
 * States:
 * - 'none': No north.config.yaml found
 * - 'config': Config exists, but no index.db
 * - 'indexed': Both config and index exist
 */
export async function detectProjectState(cwd: string): Promise<ServerState> {
  const configPath = await findConfigFile(cwd);
  if (!configPath) return "none";

  const indexPath = resolve(cwd, ".north/index.db");
  const indexExists = await fileExists(indexPath);

  if (indexExists) return "indexed";
  return "config";
}

/**
 * Detect full context including paths to config and index files.
 */
export async function detectContext(cwd: string): Promise<NorthMcpContext> {
  const configPath = await findConfigFile(cwd);

  if (!configPath) {
    return { state: "none", cwd };
  }

  const indexPath = resolve(cwd, ".north/index.db");
  const indexExists = await fileExists(indexPath);

  if (indexExists) {
    return { state: "indexed", configPath, indexPath, cwd };
  }

  return { state: "config", configPath, cwd };
}

/**
 * Get the expected config file path for a project directory.
 */
export function getConfigPath(cwd: string): string {
  return resolve(cwd, "north/north.config.yaml");
}

/**
 * Get the expected index file path for a project directory.
 */
export function getIndexPath(cwd: string): string {
  return resolve(cwd, ".north/index.db");
}
