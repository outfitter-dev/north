import { resolve } from "node:path";
import chalk from "chalk";
import { findConfigFile, loadConfig } from "../config/loader.ts";
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

const GENERATED_CSS_FILE = "north/tokens/generated.css";

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
    let configPath: string;

    if (options.config) {
      configPath = resolve(cwd, options.config);
      if (!quiet) {
        console.log(chalk.dim(`Using config: ${options.config}`));
      }
    } else {
      const foundPath = await findConfigFile(cwd);
      if (!foundPath) {
        const error = new GenerateError("Config file not found. Run 'north init' to initialize.");
        if (!quiet) {
          console.log(chalk.red("\n✗ Config file not found"));
          console.log(chalk.dim("Run 'north init' to create north/north.config.yaml"));
        }
        return {
          success: false,
          message: error.message,
          error,
        };
      }
      configPath = foundPath;
      if (!quiet) {
        console.log(chalk.dim(`Found config: ${configPath}`));
      }
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
    const outputPath = resolve(cwd, GENERATED_CSS_FILE);
    await writeFileAtomic(outputPath, content);

    if (!quiet) {
      console.log(`${chalk.green("✓")} Tokens generated`);
      console.log(chalk.dim(`  Output: ${GENERATED_CSS_FILE}`));
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
