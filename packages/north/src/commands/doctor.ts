import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import chalk from "chalk";
import { findConfigFile, loadConfig } from "../config/loader.ts";
import { verifyChecksum } from "../generation/css-generator.ts";
import { runLint } from "../lint/engine.ts";

// ============================================================================
// Doctor Command
// ============================================================================

export interface DoctorOptions {
  cwd?: string;
  lint?: boolean;
}

export interface DoctorResult {
  success: boolean;
  message: string;
  checks: Array<{
    name: string;
    passed: boolean;
    message: string;
  }>;
}

interface Check {
  name: string;
  passed: boolean;
  message: string;
}

/**
 * Check if file exists
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run doctor diagnostics
 */
export async function doctor(options: DoctorOptions = {}): Promise<DoctorResult> {
  const cwd = options.cwd ?? process.cwd();
  const checks: Check[] = [];

  console.log(chalk.bold("Running North diagnostics...\n"));

  // ========================================================================
  // Check 1: Config file exists
  // ========================================================================

  console.log(chalk.dim("Checking configuration file..."));

  const configPath = await findConfigFile(cwd);

  if (!configPath) {
    checks.push({
      name: "Config file",
      passed: false,
      message: "north/north.config.yaml not found. Run 'north init' first.",
    });
    console.log(`${chalk.red("✗")} Config file not found`);
  } else {
    checks.push({
      name: "Config file",
      passed: true,
      message: `Found at ${configPath}`,
    });
    console.log(`${chalk.green("✓")} Config file exists`);
  }

  // ========================================================================
  // Check 2: Config loads and validates
  // ========================================================================

  if (configPath) {
    console.log(chalk.dim("Validating configuration..."));

    const loadResult = await loadConfig(configPath);

    if (!loadResult.success) {
      checks.push({
        name: "Config validation",
        passed: false,
        message: loadResult.error.message,
      });
      console.log(`${chalk.red("✗")} Config validation failed`);

      // Show validation errors
      if ("issues" in loadResult.error) {
        for (const issue of loadResult.error.issues) {
          console.log(chalk.dim(`  • ${issue.path}: ${issue.message}`));
        }
      }
    } else {
      checks.push({
        name: "Config validation",
        passed: true,
        message: "Configuration is valid",
      });
      console.log(`${chalk.green("✓")} Configuration is valid`);

      // Show dial settings
      console.log(chalk.dim("\n  Dial settings:"));
      console.log(chalk.dim(`    radius: ${loadResult.config.dials?.radius ?? "default"}`));
      console.log(chalk.dim(`    shadows: ${loadResult.config.dials?.shadows ?? "default"}`));
      console.log(chalk.dim(`    density: ${loadResult.config.dials?.density ?? "default"}`));
      console.log(chalk.dim(`    contrast: ${loadResult.config.dials?.contrast ?? "default"}`));
    }
  }

  // ========================================================================
  // Check 3: Generated tokens file exists
  // ========================================================================

  console.log(chalk.dim("\nChecking generated tokens..."));

  const generatedPath = resolve(cwd, "north/tokens/generated.css");
  const generatedExists = await fileExists(generatedPath);

  if (!generatedExists) {
    checks.push({
      name: "Generated tokens",
      passed: false,
      message: "north/tokens/generated.css not found. Run 'north gen' to generate.",
    });
    console.log(`${chalk.red("✗")} Generated tokens not found`);
  } else {
    checks.push({
      name: "Generated tokens",
      passed: true,
      message: "north/tokens/generated.css exists",
    });
    console.log(`${chalk.green("✓")} Generated tokens exist`);

    // ====================================================================
    // Check 4: Checksum verification
    // ====================================================================

    console.log(chalk.dim("Verifying checksum..."));

    try {
      const cssContent = await readFile(generatedPath, "utf-8");
      const checksumResult = verifyChecksum(cssContent);

      if (checksumResult.valid) {
        checks.push({
          name: "Checksum verification",
          passed: true,
          message: "File has not been modified",
        });
        console.log(`${chalk.green("✓")} Checksum valid`);
        console.log(chalk.dim(`  ${checksumResult.expectedChecksum?.slice(0, 16)}...`));
      } else {
        checks.push({
          name: "Checksum verification",
          passed: false,
          message: checksumResult.message,
        });
        console.log(`${chalk.yellow("⚠")} Checksum mismatch`);
        console.log(chalk.dim(`  ${checksumResult.message}`));
      }
    } catch (error) {
      checks.push({
        name: "Checksum verification",
        passed: false,
        message: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
      });
      console.log(`${chalk.red("✗")} Checksum verification failed`);
    }
  }

  // ========================================================================
  // Check 5: Base tokens file exists
  // ========================================================================

  console.log(chalk.dim("\nChecking base tokens..."));

  const basePath = resolve(cwd, "north/tokens/base.css");
  const baseExists = await fileExists(basePath);

  if (!baseExists) {
    checks.push({
      name: "Base tokens",
      passed: false,
      message: "north/tokens/base.css not found. This file should exist for custom tokens.",
    });
    console.log(`${chalk.yellow("⚠")} Base tokens not found`);
  } else {
    checks.push({
      name: "Base tokens",
      passed: true,
      message: "north/tokens/base.css exists",
    });
    console.log(`${chalk.green("✓")} Base tokens exist`);
  }

  // ========================================================================
  // Check 6: Lint rules & extraction coverage (optional)
  // ========================================================================

  if (options.lint) {
    console.log(chalk.dim("\nChecking lint rules and extraction coverage..."));

    try {
      const { report } = await runLint({
        cwd,
        collectIssues: false,
      });

      checks.push({
        name: "Lint rules",
        passed: report.rules.length > 0,
        message: `Loaded ${report.rules.length} rules`,
      });

      const coverageMessage = `Extracted classes from ${report.stats.filesWithClasses}/${report.stats.totalFiles} files (${report.stats.coveragePercent}%). Non-literal sites: ${report.stats.filesWithNonLiteral}.`;

      checks.push({
        name: "Lint coverage",
        passed: true,
        message: coverageMessage,
      });

      console.log(`${chalk.green("✓")} Loaded ${report.rules.length} rules`);
      console.log(chalk.dim(`  ${coverageMessage}`));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      checks.push({
        name: "Lint diagnostics",
        passed: false,
        message: errorMessage,
      });
      console.log(`${chalk.red("✗")} Lint diagnostics failed`);
      console.log(chalk.dim(`  ${errorMessage}`));
    }
  }

  // ========================================================================
  // Summary
  // ========================================================================

  console.log(chalk.bold("\nDiagnostic Summary:"));

  const passedCount = checks.filter((c) => c.passed).length;
  const totalCount = checks.length;

  if (passedCount === totalCount) {
    console.log(chalk.bold.green(`\n✓ All checks passed (${passedCount}/${totalCount})`));
    console.log(chalk.dim("\nYour North setup is healthy!"));
  } else {
    console.log(chalk.bold.yellow(`\n⚠ ${passedCount}/${totalCount} checks passed`));
    console.log(chalk.dim("\nIssues found:"));

    for (const check of checks.filter((c) => !c.passed)) {
      console.log(chalk.yellow(`  • ${check.name}:`));
      console.log(chalk.dim(`    ${check.message}`));
    }

    console.log(chalk.dim("\nRecommended actions:"));
    console.log(chalk.dim("  1. Fix configuration errors"));
    console.log(chalk.dim("  2. Run 'north gen' to regenerate tokens"));
    console.log(chalk.dim("  3. Run 'north doctor' again to verify"));
  }

  return {
    success: passedCount === totalCount,
    message:
      passedCount === totalCount
        ? "All checks passed"
        : `${passedCount}/${totalCount} checks passed`,
    checks,
  };
}
