import chalk from "chalk";
import { resolveConfigPath, resolveNorthPaths } from "../config/env.ts";
import { loadConfig } from "../config/loader.ts";
import type { ConfigLoadError, ConfigValidationError } from "../config/loader.ts";
import { generateCSS } from "../generation/css-generator.ts";
import { writeFileAtomic } from "../generation/file-writer.ts";

// ============================================================================
// Error Types
// ============================================================================

export class GenerateError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "GenerateError";
  }
}

// ============================================================================
// File Paths
// ============================================================================

// ============================================================================
// Generate Command
// ============================================================================

export interface GenerateOptions {
  cwd?: string;
  config?: string; // Override config file path
  quiet?: boolean; // Suppress output
}

export interface GenerateResult {
  success: boolean;
  message: string;
  error?: Error;
}

/**
 * Format validation error for display
 */
function formatValidationError(error: ConfigLoadError | ConfigValidationError): string {
  if ("issues" in error) {
    // ConfigValidationError
    const issuesList = error.issues
      .map((issue) => `  • ${issue.path}: ${issue.message}`)
      .join("\n");
    return `Configuration validation failed:\n\n${issuesList}\n\nFile: ${error.filePath}`;
  }

  // ConfigLoadError
  return `${error.message}\n\nFile: ${error.filePath}`;
}

/**
 * Generate tokens from config
 */
export async function generateTokens(options: GenerateOptions = {}): Promise<GenerateResult> {
  const cwd = options.cwd ?? process.cwd();
  const quiet = options.quiet ?? false;

  try {
    if (!quiet) {
      console.log(chalk.bold("Generating tokens...\n"));
    }

    // Find or use specified config file
    const configPath = await resolveConfigPath(cwd, options.config);
    if (!configPath) {
      const error = new GenerateError("Config file not found. Run 'north init' to initialize.");
      if (!quiet) {
        console.log(chalk.red("\n✗ Config file not found"));
        console.log(chalk.dim("Run 'north init' to create .north/config.yaml"));
      }
      return {
        success: false,
        message: error.message,
        error,
      };
    }

    if (!quiet && options.config) {
      console.log(chalk.dim(`Using config: ${options.config}`));
    } else if (!quiet) {
      console.log(chalk.dim(`Found config: ${configPath}`));
    }

    // Load and validate config
    if (!quiet) {
      console.log(chalk.dim("Loading configuration..."));
    }

    const loadResult = await loadConfig(configPath);

    if (!loadResult.success) {
      if (!quiet) {
        console.log(chalk.red("\n✗ Configuration error\n"));
        console.log(formatValidationError(loadResult.error));
      }
      return {
        success: false,
        message: "Configuration error",
        error: loadResult.error,
      };
    }

    if (!quiet) {
      console.log(`${chalk.green("✓")} Configuration loaded`);
    }

    // Generate CSS
    if (!quiet) {
      console.log(chalk.dim("Generating CSS tokens..."));
    }

    const { content, checksum } = generateCSS(loadResult.config);

    // Write to file
    const paths = resolveNorthPaths(configPath, cwd);
    await writeFileAtomic(paths.generatedTokensPath, content);

    if (!quiet) {
      console.log(`${chalk.green("✓")} Tokens generated`);
      console.log(chalk.dim(`  Output: ${paths.generatedTokensPath}`));
      console.log(chalk.dim(`  Checksum: ${checksum.slice(0, 16)}...`));
    }

    if (!quiet) {
      console.log(chalk.bold.green("\n✓ Generation complete!"));
    }

    return {
      success: true,
      message: "Tokens generated successfully",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (!quiet) {
      console.log(chalk.red("\n✗ Generation failed"));
      console.log(chalk.dim(errorMessage));
    }

    return {
      success: false,
      message: `Generation failed: ${errorMessage}`,
      error: error instanceof Error ? error : new GenerateError(errorMessage),
    };
  }
}
