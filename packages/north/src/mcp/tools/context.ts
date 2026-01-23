/**
 * North Context MCP Tool
 *
 * Exposes design system context to LLMs via MCP.
 * Returns token catalog, semantic mappings, and component guidance.
 *
 * This is a Tier 2 tool - requires config (.north/config.yaml) to be present.
 */

import { access } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveNorthPaths } from "../../config/env.ts";
import { loadConfig } from "../../config/loader.ts";
import type { NorthConfig } from "../../config/schema.ts";
import { checkIndexFresh, getIndexStatus, getTopPatterns } from "../../index/queries.ts";
import { detectContext } from "../state.ts";

// ============================================================================
// Input Schema
// ============================================================================

const ContextInputSchema = z.object({
  compact: z.boolean().optional().describe("Return compact output format"),
  cwd: z.string().optional().describe("Working directory (defaults to process.cwd())"),
});

type ContextInput = z.infer<typeof ContextInputSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

interface RuleSummary {
  rule: string;
  level: string;
}

const RULE_KEYS = [
  "no-raw-palette",
  "no-arbitrary-colors",
  "no-arbitrary-values",
  "repeated-spacing-pattern",
  "non-literal-classname",
  "no-inline-color",
  "component-complexity",
  "missing-semantic-comment",
  "parse-error",
  "deviation-tracking",
] as const;

function extractRuleLevel(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && "level" in value) {
    const level = (value as { level?: string }).level;
    return level ?? null;
  }

  return null;
}

function summarizeRules(config: NorthConfig): RuleSummary[] {
  const rules = config.rules ?? {};
  const summary: RuleSummary[] = [];

  for (const key of RULE_KEYS) {
    const value = rules[key];
    const level = extractRuleLevel(value);
    if (level && level !== "off") {
      summary.push({ rule: key, level });
    }
  }

  return summary;
}

function buildGuidance(rules: RuleSummary[]): string[] {
  const guidance: string[] = [
    "Use North tokens instead of raw Tailwind palette values.",
    "Avoid arbitrary values unless explicitly allowed.",
    "Prefer semantic tokens for colors, spacing, and radii.",
    "Run 'north check' before committing UI changes.",
  ];

  if (rules.find((rule) => rule.rule === "deviation-tracking")) {
    guidance.push("Document deviations with @north-deviation comments.");
  }

  return guidance;
}

// ============================================================================
// Context Payload Types
// ============================================================================

export interface ContextPayload {
  kind: "context";
  compact: boolean;
  project: {
    configPath: string;
    generatedTokens: string;
    baseTokens: string;
    generatedExists: boolean;
    baseExists: boolean;
  };
  dials: Record<string, unknown>;
  typography: Record<string, unknown>;
  policy: Record<string, unknown>;
  compatibility: Record<string, unknown>;
  rules: RuleSummary[];
  index: {
    path: string;
    exists: boolean;
    fresh: boolean;
    counts: {
      tokens: number;
      usages: number;
      patterns: number;
    };
  };
  guidance: string[];
  /** Pattern discovery enhancement from #88 */
  patterns?: Array<{
    name: string;
    count: number;
    exampleClasses: string[];
  }>;
}

// ============================================================================
// Core Logic
// ============================================================================

/**
 * Execute the north_context tool handler.
 *
 * Builds the context payload with token catalog, semantic mappings,
 * and component guidance for LLMs.
 */
export async function executeContextTool(
  workingDir: string,
  configPath: string,
  compact = false
): Promise<ContextPayload> {
  const loadResult = await loadConfig(configPath);
  if (!loadResult.success) {
    throw new Error(loadResult.error.message);
  }

  const config = loadResult.config;
  const rules = summarizeRules(config);
  const guidance = buildGuidance(rules);

  const paths = resolveNorthPaths(configPath, workingDir);
  const generatedPath = paths.generatedTokensPath;
  const basePath = paths.baseTokensPath;

  const [generatedExists, baseExists] = await Promise.all([
    fileExists(generatedPath),
    fileExists(basePath),
  ]);

  const indexStatus = await getIndexStatus(workingDir, configPath);
  const indexFreshness = indexStatus.exists
    ? await checkIndexFresh(workingDir, configPath)
    : { fresh: false };

  // PR-110 Enhancement (#88): Query patterns from index when available
  let patterns: ContextPayload["patterns"];
  if (indexStatus.exists && indexStatus.counts.patterns > 0) {
    const topPatterns = await getTopPatterns(workingDir, configPath, 10);
    patterns = topPatterns;
  }

  return {
    kind: "context",
    compact,
    project: {
      configPath,
      generatedTokens: generatedPath,
      baseTokens: basePath,
      generatedExists,
      baseExists,
    },
    dials: config.dials ?? {},
    typography: config.typography ?? {},
    policy: config.policy ?? {},
    compatibility: config.compatibility ?? {},
    rules,
    index: {
      path: indexStatus.indexPath,
      exists: indexStatus.exists,
      fresh: indexFreshness.fresh,
      counts: indexStatus.counts,
    },
    guidance,
    patterns,
  };
}

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Register the north_context tool with the MCP server.
 *
 * This is a Tier 2 tool - requires config (.north/config.yaml) to be present.
 */
export function registerContextTool(server: McpServer): void {
  server.registerTool(
    "north_context",
    {
      description:
        "Get design system context for LLMs. Returns token catalog, semantic mappings, " +
        "and component guidance for implementing UI features. " +
        "Optional parameters: compact (boolean) - return compact format, cwd (string) - working directory.",
    },
    async (args: unknown) => {
      const cwd = process.cwd();

      // Validate input
      const parseResult = ContextInputSchema.safeParse(args);
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

      const input: ContextInput = parseResult.data;
      const workingDir = input.cwd ?? cwd;

      // Check context state - this tool requires at least config state
      const ctx = await detectContext(workingDir);
      if (ctx.state === "none") {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: "No North configuration found",
                  guidance: [
                    "Run 'north init' to initialize the project.",
                    "Then run 'north gen' to generate design tokens.",
                  ],
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
        // configPath is guaranteed to exist when state !== 'none'
        const configPath = ctx.configPath as string;
        const payload = await executeContextTool(workingDir, configPath, input.compact);

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
