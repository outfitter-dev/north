/**
 * north adopt - Discover patterns worth tokenizing
 *
 * @see .scratch/mcp-server/13-cli-adopt-spec.md for full specification
 */

import chalk from "chalk";
import { type IndexDatabase, openIndexDatabase } from "../index/db.ts";
import { checkIndexFresh, getIndexStatus } from "../index/queries.ts";
import {
  categorizePattern,
  getUtilitySegment,
} from "../lib/utility-classification.ts";

// Re-export for backwards compatibility with existing API
export { categorizePattern } from "../lib/utility-classification.ts";

// ============================================================================
// Types
// ============================================================================

export interface AdoptOptions {
  cwd?: string;
  config?: string;
  minCount?: number;
  minFiles?: number;
  maxClasses?: number;
  category?: "colors" | "spacing" | "typography" | "all";
  sort?: "count" | "files" | "impact";
  limit?: number;
  json?: boolean;
  quiet?: boolean;
}

export interface AdoptCandidate {
  hash: string;
  classes: string[];
  count: number;
  fileCount: number;
  components: string[];
  suggestedName: string;
  category: "color" | "spacing" | "typography" | "mixed";
  impactScore: number;
  tokenizable: boolean;
  locations: Array<{
    file: string;
    line: number;
    component: string | null;
  }>;
}

export interface AdoptReport {
  kind: "adopt";
  candidates: AdoptCandidate[];
  summary: {
    totalPatterns: number;
    eligiblePatterns: number;
    byCategory: {
      color: number;
      spacing: number;
      typography: number;
      mixed: number;
    };
    estimatedReduction: number;
  };
  filters: {
    minCount: number;
    minFiles: number;
    maxClasses: number;
    category: string;
  };
}

export class AdoptError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "AdoptError";
  }
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MIN_COUNT = 3;
const DEFAULT_MIN_FILES = 2;
const DEFAULT_MAX_CLASSES = 6;
const DEFAULT_LIMIT = 10;

// ============================================================================
// Impact Score Calculation
// ============================================================================

export function computeImpactScore(
  count: number,
  fileCount: number,
  uniqueComponents: number
): number {
  const raw = count * fileCount * (1 + uniqueComponents * 0.1);
  return Math.round(raw);
}

// ============================================================================
// Name Generation
// ============================================================================

export function generateSuggestedName(
  classes: string[],
  components: string[],
  category: "color" | "spacing" | "typography" | "mixed"
): string {
  // Use first component as prefix if available
  const componentPrefix = components.length > 0 ? toKebabCase(components[0] ?? "") : "";

  // Category-based suffix
  const categorySuffix = category === "mixed" ? "utility" : category;

  // Try to extract semantic hints from classes
  const semanticHint = extractSemanticHint(classes, category);

  if (componentPrefix && semanticHint) {
    return `${componentPrefix}-${semanticHint}`;
  }

  if (componentPrefix) {
    return `${componentPrefix}-${categorySuffix}`;
  }

  if (semanticHint) {
    return `${semanticHint}-${categorySuffix}`;
  }

  return `pattern-${categorySuffix}`;
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

function extractSemanticHint(
  classes: string[],
  category: "color" | "spacing" | "typography" | "mixed"
): string | null {
  // Look for common semantic patterns in class names
  for (const className of classes) {
    const utility = getUtilitySegment(className);

    // Check for color semantic hints
    if (category === "color" || category === "mixed") {
      if (utility.includes("primary")) return "primary";
      if (utility.includes("secondary")) return "secondary";
      if (utility.includes("accent")) return "accent";
      if (utility.includes("muted")) return "muted";
      if (utility.includes("success")) return "success";
      if (utility.includes("warning")) return "warning";
      if (utility.includes("error") || utility.includes("danger")) return "error";
    }

    // Check for surface-related patterns
    if (utility.startsWith("bg-white") || utility.startsWith("bg-gray")) {
      return "surface";
    }

    // Check for rounded patterns
    if (utility.startsWith("rounded")) {
      return "rounded";
    }
  }

  return null;
}

// ============================================================================
// Database Access
// ============================================================================

async function openIndex(cwd: string, configOverride?: string): Promise<IndexDatabase> {
  const status = await getIndexStatus(cwd, configOverride);
  if (!status.exists) {
    throw new AdoptError("No index found. Run 'north index' first.");
  }

  const freshness = await checkIndexFresh(cwd, configOverride);
  if (!freshness.fresh) {
    throw new AdoptError("Index is stale. Run 'north index' to refresh it.");
  }

  return await openIndexDatabase(status.indexPath);
}

interface PatternRow {
  hash: string;
  classes: string;
  count: number;
  locations: string;
}

interface PatternLocation {
  file: string;
  line: number;
  component: string | null;
}

function parsePatternRow(row: PatternRow): {
  hash: string;
  classes: string[];
  count: number;
  locations: PatternLocation[];
} {
  let classes: string[] = [];
  let locations: PatternLocation[] = [];

  try {
    classes = JSON.parse(row.classes) as string[];
  } catch {
    classes = [];
  }

  try {
    locations = JSON.parse(row.locations) as PatternLocation[];
  } catch {
    locations = [];
  }

  return { hash: row.hash, classes, count: row.count, locations };
}

// ============================================================================
// Main Command
// ============================================================================

export async function adopt(options: AdoptOptions = {}): Promise<AdoptReport> {
  const cwd = options.cwd ?? process.cwd();
  const minCount = options.minCount ?? DEFAULT_MIN_COUNT;
  const minFiles = options.minFiles ?? DEFAULT_MIN_FILES;
  const maxClasses = options.maxClasses ?? DEFAULT_MAX_CLASSES;
  const categoryFilter = options.category ?? "all";
  const sortBy = options.sort ?? "impact";
  const limit = options.limit ?? DEFAULT_LIMIT;
  const quiet = options.quiet ?? false;

  let db: IndexDatabase | null = null;

  try {
    db = await openIndex(cwd, options.config);

    // Query all patterns with minimum count
    const rows = db
      .prepare(
        "SELECT hash, classes, count, locations FROM patterns WHERE count >= ? ORDER BY count DESC"
      )
      .all(minCount) as PatternRow[];

    const totalPatterns = (
      db.prepare("SELECT COUNT(*) as count FROM patterns").get() as { count: number }
    ).count;

    // Process patterns
    const candidates: AdoptCandidate[] = [];
    const byCategory = { color: 0, spacing: 0, typography: 0, mixed: 0 };

    for (const row of rows) {
      const pattern = parsePatternRow(row);

      // Filter by maxClasses
      if (pattern.classes.length > maxClasses) continue;

      // Compute unique files
      const uniqueFiles = new Set(pattern.locations.map((loc) => loc.file));
      const fileCount = uniqueFiles.size;

      // Filter by minFiles
      if (fileCount < minFiles) continue;

      // Categorize
      const category = categorizePattern(pattern.classes);

      // Filter by category
      if (categoryFilter !== "all") {
        const filterMap: Record<string, "color" | "spacing" | "typography"> = {
          colors: "color",
          spacing: "spacing",
          typography: "typography",
        };
        if (category !== filterMap[categoryFilter] && category !== "mixed") continue;
      }

      // Count by category
      byCategory[category] += 1;

      // Extract unique components
      const components = Array.from(
        new Set(
          pattern.locations.map((loc) => loc.component).filter((c): c is string => c !== null)
        )
      );

      // Generate suggested name
      const suggestedName = generateSuggestedName(pattern.classes, components, category);

      // Compute impact score
      const impactScore = computeImpactScore(pattern.count, fileCount, components.length);

      // Determine tokenizable (consistent across usages)
      const tokenizable = pattern.count >= minCount && fileCount >= minFiles;

      candidates.push({
        hash: pattern.hash,
        classes: pattern.classes,
        count: pattern.count,
        fileCount,
        components,
        suggestedName,
        category,
        impactScore,
        tokenizable,
        locations: pattern.locations,
      });
    }

    // Sort
    candidates.sort((a, b) => {
      switch (sortBy) {
        case "count":
          return b.count - a.count || b.impactScore - a.impactScore;
        case "files":
          return b.fileCount - a.fileCount || b.impactScore - a.impactScore;
        default:
          return b.impactScore - a.impactScore || b.count - a.count;
      }
    });

    // Limit results
    const limited = candidates.slice(0, limit);

    // Estimate LOC reduction: each adoption saves (count - 1) lines per pattern
    const estimatedReduction = limited.reduce(
      (sum, c) => sum + (c.count - 1) * c.classes.length,
      0
    );

    const report: AdoptReport = {
      kind: "adopt",
      candidates: limited,
      summary: {
        totalPatterns,
        eligiblePatterns: candidates.length,
        byCategory,
        estimatedReduction,
      },
      filters: {
        minCount,
        minFiles,
        maxClasses,
        category: categoryFilter,
      },
    };

    // Output
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else if (!quiet) {
      printHumanReport(report);
    }

    return report;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!quiet) {
      console.log(chalk.red("\nAdopt command failed"));
      console.log(chalk.dim(message));
    }

    throw error instanceof AdoptError ? error : new AdoptError(message, error);
  } finally {
    if (db) db.close();
  }
}

// ============================================================================
// Human Output
// ============================================================================

function printHumanReport(report: AdoptReport): void {
  const { candidates, summary, filters } = report;

  if (candidates.length === 0) {
    if (summary.totalPatterns === 0) {
      console.log(chalk.yellow("No patterns indexed. Run 'north index' to scan codebase."));
    } else {
      console.log(
        chalk.yellow("No patterns meet the criteria. Try lowering --min-count or --min-files.")
      );
    }
    return;
  }

  console.log(
    chalk.bold(
      `Adoption Candidates (${candidates.length} of ${summary.eligiblePatterns} eligible patterns)\n`
    )
  );

  for (let i = 0; i < candidates.length; i += 1) {
    const c = candidates[i];
    if (!c) continue;

    const rank = i + 1;
    const categoryLabel = chalk.dim(`(${c.category})`);
    const impactLabel = chalk.cyan(`[IMPACT: ${c.impactScore}]`);

    console.log(`${rank}. ${impactLabel} "${c.suggestedName}" ${categoryLabel}`);
    console.log(chalk.dim(`   Classes: ${c.classes.join(" ")}`));
    console.log(chalk.dim(`   Found: ${c.count} times across ${c.fileCount} files`));

    if (c.components.length > 0) {
      console.log(chalk.dim(`   Components: ${c.components.join(", ")}`));
    }

    console.log(
      chalk.green(`   → Suggested: @utility ${c.suggestedName} { @apply ${c.classes.join(" ")}; }`)
    );
    console.log();
  }

  console.log(chalk.bold("Summary:"));
  console.log(chalk.dim(`  Total patterns: ${summary.totalPatterns}`));
  console.log(chalk.dim(`  Eligible: ${summary.eligiblePatterns}`));
  console.log(
    chalk.dim(
      `  By category: color (${summary.byCategory.color}), spacing (${summary.byCategory.spacing}), typography (${summary.byCategory.typography}), mixed (${summary.byCategory.mixed})`
    )
  );
  console.log(chalk.dim(`  Est. LOC reduction: ~${summary.estimatedReduction} lines`));
  console.log();
  console.log(
    chalk.dim(
      `Filters: --min-count ${filters.minCount} --min-files ${filters.minFiles} --max-classes ${filters.maxClasses} --category ${filters.category}`
    )
  );
}
