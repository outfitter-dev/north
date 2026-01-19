import chalk from "chalk";
import { buildIndex } from "../index/build.ts";
import { checkIndexFresh, getIndexStatus } from "../index/queries.ts";

// ============================================================================
// Error Types
// ============================================================================

export class IndexError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "IndexError";
  }
}

// ============================================================================
// Index Command
// ============================================================================

export interface IndexOptions {
  cwd?: string;
  config?: string;
  status?: boolean;
  checkFresh?: boolean;
  quiet?: boolean;
}

export interface IndexResult {
  success: boolean;
  message: string;
  error?: Error;
}

function formatMeta(meta: Record<string, string>): string[] {
  const lines: string[] = [];

  if (meta.schema_version) {
    lines.push(`Schema: ${meta.schema_version}`);
  }

  const hash = meta.source_tree_hash ?? meta.content_hash;
  if (hash) {
    lines.push(`Hash: ${hash.slice(0, 16)}...`);
  }

  if (meta.created_at) {
    lines.push(`Created: ${meta.created_at}`);
  }

  return lines;
}

export async function runIndex(options: IndexOptions = {}): Promise<IndexResult> {
  const cwd = options.cwd ?? process.cwd();
  const quiet = options.quiet ?? false;

  try {
    if (options.status) {
      const status = await getIndexStatus(cwd, options.config);

      if (!quiet) {
        console.log(chalk.bold("Index status\n"));
        console.log(chalk.dim(`Path: ${status.indexPath}`));
        console.log(
          status.exists ? `${chalk.green("ok")} Index exists` : `${chalk.red("x")} Index missing`
        );

        if (status.exists) {
          console.log(chalk.dim(`Tokens: ${status.counts.tokens}`));
          console.log(chalk.dim(`Usages: ${status.counts.usages}`));
          console.log(chalk.dim(`Patterns: ${status.counts.patterns}`));
          console.log(chalk.dim(`Token graph: ${status.counts.tokenGraph}`));

          const metaLines = formatMeta(status.meta);
          if (metaLines.length > 0) {
            console.log(chalk.dim("\nMeta:"));
            for (const line of metaLines) {
              console.log(chalk.dim(`  ${line}`));
            }
          }
        }
      }

      return {
        success: status.exists,
        message: status.exists ? "Index status retrieved" : "Index missing",
      };
    }

    if (options.checkFresh) {
      const freshness = await checkIndexFresh(cwd, options.config);

      if (!quiet) {
        console.log(chalk.bold("Index freshness\n"));
      }

      if (!freshness.fresh) {
        if (!quiet) {
          if (!freshness.expected) {
            console.log(`${chalk.red("x")} Index missing or missing metadata`);
          } else {
            console.log(`${chalk.yellow("warn")} Index is stale`);
            if (freshness.expected && freshness.actual) {
              console.log(chalk.dim(`Expected: ${freshness.expected.slice(0, 16)}...`));
              console.log(chalk.dim(`Actual:   ${freshness.actual.slice(0, 16)}...`));
            }
          }
        }

        return {
          success: false,
          message: "Index is stale or missing",
        };
      }

      if (!quiet) {
        console.log(`${chalk.green("ok")} Index is fresh`);
      }

      return {
        success: true,
        message: "Index is fresh",
      };
    }

    if (!quiet) {
      console.log(chalk.bold("Building index...\n"));
    }

    const result = await buildIndex({ cwd, configPath: options.config });

    if (!quiet) {
      console.log(`${chalk.green("ok")} Index built`);
      console.log(chalk.dim(`Path: ${result.indexPath}`));
      console.log(chalk.dim(`Source hash: ${result.sourceHash.slice(0, 16)}...`));
      console.log(chalk.dim(`Files: ${result.stats.fileCount + result.stats.cssFileCount}`));
      console.log(chalk.dim(`Tokens: ${result.stats.tokenCount}`));
      console.log(chalk.dim(`Usages: ${result.stats.usageCount}`));
      console.log(chalk.dim(`Patterns: ${result.stats.patternCount}`));
    }

    return {
      success: true,
      message: "Index built successfully",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!quiet) {
      console.log(chalk.red("\nIndex command failed"));
      console.log(chalk.dim(message));
    }

    return {
      success: false,
      message: `Index command failed: ${message}`,
      error: error instanceof Error ? error : new IndexError(message),
    };
  }
}
