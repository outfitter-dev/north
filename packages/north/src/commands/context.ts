import { access, readFile } from "node:fs/promises";
import chalk from "chalk";
import { resolveConfigPath, resolveNorthPaths } from "../config/env.ts";
import { loadConfig } from "../config/loader.ts";
import type { NorthConfig } from "../config/schema.ts";
import {
  type PatternSummary,
  checkIndexFresh,
  getIndexStatus,
  getTopPatterns,
} from "../index/queries.ts";
import { type TokenCategories, parseTokensFromCss } from "../tokens/parse-tokens.ts";

// ============================================================================
// Error Types
// ============================================================================

export class ContextError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "ContextError";
  }
}

// ============================================================================
// Context Command
// ============================================================================

export interface ContextOptions {
  cwd?: string;
  config?: string;
  compact?: boolean;
  json?: boolean;
  quiet?: boolean;
  includeValues?: boolean;
}

export interface ContextResult {
  success: boolean;
  message: string;
  error?: Error;
}

interface RuleSummary {
  rule: string;
  level: string;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
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

export async function context(options: ContextOptions = {}): Promise<ContextResult> {
  const cwd = options.cwd ?? process.cwd();
  const compact = options.compact ?? false;
  const json = options.json ?? false;
  const quiet = options.quiet ?? false;
  const includeValues = options.includeValues ?? false;

  try {
    const configPath = await resolveConfigPath(cwd, options.config);

    if (!configPath) {
      throw new ContextError("Config file not found. Run 'north init' first.");
    }

    const loadResult = await loadConfig(configPath);
    if (!loadResult.success) {
      throw new ContextError(loadResult.error.message, loadResult.error);
    }

    const config = loadResult.config;
    const rules = summarizeRules(config);
    const guidance = buildGuidance(rules);

    const paths = resolveNorthPaths(configPath, cwd);
    const generatedPath = paths.generatedTokensPath;
    const basePath = paths.baseTokensPath;

    const [generatedExists, baseExists] = await Promise.all([
      fileExists(generatedPath),
      fileExists(basePath),
    ]);

    // Parse tokens from generated.css
    let tokenCategories: TokenCategories | null = null;
    if (generatedExists) {
      const generatedCss = await readFile(generatedPath, "utf-8");
      const parsed = parseTokensFromCss(generatedCss, { includeValues });
      tokenCategories = parsed.categories;
    }

    const indexStatus = await getIndexStatus(cwd, configPath);
    const indexFreshness = indexStatus.exists
      ? await checkIndexFresh(cwd, configPath)
      : { fresh: false };

    // PR-110 Enhancement (#88): Query patterns from index when available
    let patterns: PatternSummary[] | undefined;
    if (indexStatus.exists && indexStatus.counts.patterns > 0) {
      patterns = await getTopPatterns(cwd, configPath, 10);
    }

    const payload = {
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
      tokens: tokenCategories,
      guidance,
      patterns,
    };

    if (json) {
      console.log(JSON.stringify(payload, null, 2));
    } else if (!quiet) {
      if (compact) {
        console.log(chalk.bold("North context (compact)"));
        console.log(
          chalk.dim(
            `Dials: radius=${config.dials?.radius ?? "default"}, shadows=${config.dials?.shadows ?? "default"}, density=${config.dials?.density ?? "default"}, contrast=${config.dials?.contrast ?? "default"}`
          )
        );
        console.log(
          chalk.dim(
            `Typography: scale=${config.typography?.scale ?? "default"}, measure=${config.typography?.measure?.min ?? "-"}-${config.typography?.measure?.max ?? "-"}`
          )
        );
        if (rules.length > 0) {
          console.log(
            chalk.dim(`Rules: ${rules.map((rule) => `${rule.rule}=${rule.level}`).join(", ")}`)
          );
        }
        if (tokenCategories) {
          const nonEmpty = Object.entries(tokenCategories).filter(
            ([, tokens]) => tokens.length > 0
          );
          const summary = nonEmpty.map(([cat, tokens]) => `${cat}=${tokens.length}`).join(", ");
          console.log(chalk.dim(`Tokens: ${summary}`));
        }
        if (guidance.length > 0) {
          console.log(chalk.dim(`Guidance: ${guidance.join(" ")}`));
        }
        if (patterns && patterns.length > 0) {
          const patternSummary = patterns
            .slice(0, 3)
            .map((p) => `${p.name}(${p.count})`)
            .join(", ");
          console.log(chalk.dim(`Patterns: ${patternSummary}${patterns.length > 3 ? "..." : ""}`));
        }
      } else {
        console.log(chalk.bold("North context\n"));
        console.log(chalk.dim(`Config: ${configPath}`));

        console.log(chalk.dim("\nDials:"));
        console.log(chalk.dim(`  radius: ${config.dials?.radius ?? "default"}`));
        console.log(chalk.dim(`  shadows: ${config.dials?.shadows ?? "default"}`));
        console.log(chalk.dim(`  density: ${config.dials?.density ?? "default"}`));
        console.log(chalk.dim(`  contrast: ${config.dials?.contrast ?? "default"}`));

        console.log(chalk.dim("\nTypography:"));
        console.log(chalk.dim(`  scale: ${config.typography?.scale ?? "default"}`));
        console.log(
          chalk.dim(
            `  measure: ${config.typography?.measure?.min ?? "-"} - ${
              config.typography?.measure?.max ?? "-"
            }`
          )
        );

        console.log(chalk.dim("\nPolicy:"));
        console.log(chalk.dim(`  complexity: ${config.policy?.complexity ?? "default"}`));

        if (config.compatibility) {
          console.log(chalk.dim("\nCompatibility:"));
          console.log(chalk.dim(`  shadcn: ${config.compatibility.shadcn ?? "-"}`));
          console.log(chalk.dim(`  tailwind: ${config.compatibility.tailwind ?? "-"}`));
        }

        if (rules.length > 0) {
          console.log(chalk.dim("\nRules:"));
          for (const rule of rules) {
            console.log(chalk.dim(`  ${rule.rule}: ${rule.level}`));
          }
        }

        console.log(chalk.dim("\nIndex:"));
        console.log(chalk.dim(`  path: ${indexStatus.indexPath}`));
        console.log(chalk.dim(`  exists: ${indexStatus.exists ? "yes" : "no"}`));
        console.log(chalk.dim(`  fresh: ${indexFreshness.fresh ? "yes" : "no"}`));
        console.log(
          chalk.dim(
            `  counts: tokens=${indexStatus.counts.tokens}, usages=${indexStatus.counts.usages}, patterns=${indexStatus.counts.patterns}`
          )
        );

        if (tokenCategories) {
          console.log(chalk.dim("\nTokens (roles not values):"));
          const categoryNames: Array<keyof TokenCategories> = [
            "surfaces",
            "colors",
            "spacing",
            "typography",
            "radii",
            "shadows",
            "layers",
            "controls",
            "breakpoints",
            "containers",
          ];
          for (const category of categoryNames) {
            const tokens = tokenCategories[category];
            if (tokens.length > 0) {
              console.log(chalk.dim(`  ${category}: ${tokens.length} tokens`));
            }
          }
          if (includeValues) {
            console.log(chalk.dim("  (values included)"));
          }
        }

        console.log(chalk.dim("\nGuidance:"));
        for (const line of guidance) {
          console.log(chalk.dim(`  - ${line}`));
        }

        if (patterns && patterns.length > 0) {
          console.log(chalk.dim("\nPatterns (top by frequency):"));
          for (const pattern of patterns) {
            console.log(chalk.dim(`  ${pattern.name}: ${pattern.count} occurrences`));
            if (pattern.exampleClasses.length > 0) {
              console.log(chalk.dim(`    classes: ${pattern.exampleClasses.join(" ")}`));
            }
          }
        }
      }
    }

    return { success: true, message: "Context generated" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (json) {
      console.log(
        JSON.stringify(
          {
            kind: "context",
            success: false,
            message,
          },
          null,
          2
        )
      );
    } else if (!quiet) {
      console.log(chalk.red("\nContext command failed"));
      console.log(chalk.dim(message));
    }

    return {
      success: false,
      message: `Context failed: ${message}`,
      error: error instanceof Error ? error : new ContextError(message),
    };
  }
}
