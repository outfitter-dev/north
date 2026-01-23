import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import chalk from "chalk";
import { resolveConfigPath, resolveNorthPaths } from "../config/env.ts";
import { loadConfig } from "../config/loader.ts";
import type { NorthConfig } from "../config/schema.ts";
import { generateShadcnAliases } from "../generation/colors.ts";
import { verifyChecksum } from "../generation/css-generator.ts";
import { parseCssTokens } from "../index/css.ts";
import { openIndexDatabase } from "../index/db.ts";
import { checkIndexFresh, getIndexStatus } from "../index/queries.ts";
import { runLint } from "../lint/engine.ts";

// ============================================================================
// Doctor Command
// ============================================================================

export interface DoctorOptions {
  cwd?: string;
  lint?: boolean;
  failOnDrift?: boolean;
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
}

export interface DoctorResult {
  success: boolean;
  message: string;
  summary: {
    ok: number;
    warn: number;
    error: number;
    total: number;
  };
  checks: Array<{
    name: string;
    status: CheckStatus;
    passed: boolean;
    message: string;
    details?: string[];
  }>;
}

type CheckStatus = "ok" | "warn" | "error";

interface Check {
  name: string;
  status: CheckStatus;
  message: string;
  details?: string[];
}

interface PackageVersionInfo {
  declared?: string;
  installed?: string;
  packageJsonPath?: string;
}

const CHECK_DETAILS_LIMIT = 6;

// ============================================================================
// Helpers
// ============================================================================

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findUpFile(startDir: string, fileName: string): Promise<string | null> {
  let currentDir = resolve(startDir);
  const root = resolve("/");

  while (currentDir !== root) {
    const candidate = resolve(currentDir, fileName);
    if (await fileExists(candidate)) {
      return candidate;
    }
    currentDir = dirname(currentDir);
  }

  return null;
}

async function readJsonFile(path: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function splitPackagePath(packageName: string): string[] {
  if (packageName.startsWith("@")) {
    const [scope, name] = packageName.split("/");
    if (scope && name) {
      return [scope, name];
    }
  }
  return [packageName];
}

async function detectPackageVersion(
  startDir: string,
  packageName: string
): Promise<PackageVersionInfo> {
  const packageJsonPath = await findUpFile(startDir, "package.json");
  if (!packageJsonPath) {
    return {};
  }

  const packageJson = await readJsonFile(packageJsonPath);
  const dependencies = (packageJson?.dependencies ?? {}) as Record<string, string>;
  const devDependencies = (packageJson?.devDependencies ?? {}) as Record<string, string>;
  const peerDependencies = (packageJson?.peerDependencies ?? {}) as Record<string, string>;

  const declared =
    dependencies[packageName] ??
    devDependencies[packageName] ??
    peerDependencies[packageName] ??
    undefined;

  const packageRoot = dirname(packageJsonPath);
  const modulePath = resolve(packageRoot, "node_modules", ...splitPackagePath(packageName));
  const modulePackageJson = resolve(modulePath, "package.json");
  const moduleJson = (await readJsonFile(modulePackageJson)) ?? {};

  const installed = typeof moduleJson.version === "string" ? moduleJson.version : undefined;

  return { declared, installed, packageJsonPath };
}

function parseMajorVersion(version?: string): number | null {
  if (!version) {
    return null;
  }

  const clean = version.trim().replace(/^[^0-9]*/, "");
  const match = clean.match(/^(\d+)/);
  if (!match) {
    return null;
  }

  const major = Number.parseInt(match[1] ?? "", 10);
  return Number.isNaN(major) ? null : major;
}

function driftStatus(failOnDrift: boolean): CheckStatus {
  return failOnDrift ? "error" : "warn";
}

function statusIcon(status: CheckStatus): string {
  switch (status) {
    case "ok":
      return chalk.green("✓");
    case "warn":
      return chalk.yellow("⚠");
    case "error":
      return chalk.red("✗");
    default:
      return "-";
  }
}

function pushCheck(checks: DoctorResult["checks"], check: Check): void {
  checks.push({
    ...check,
    passed: check.status !== "error",
  });
}

function summarizeChecks(checks: DoctorResult["checks"]): DoctorResult["summary"] {
  return checks.reduce(
    (acc, check) => {
      acc[check.status] += 1;
      acc.total += 1;
      return acc;
    },
    { ok: 0, warn: 0, error: 0, total: 0 }
  );
}

function logCheck(log: (message: string) => void, check: Check): void {
  log(`${statusIcon(check.status)} ${check.name}: ${check.message}`);
  if (check.details && check.details.length > 0) {
    for (const detail of check.details) {
      log(chalk.dim(`  ${detail}`));
    }
  }
}

// ============================================================================
// Doctor
// ============================================================================

export async function doctor(options: DoctorOptions = {}): Promise<DoctorResult> {
  const cwd = options.cwd ?? process.cwd();
  const failOnDrift = options.failOnDrift ?? false;
  const json = options.json ?? false;
  const quiet = options.quiet ?? false;
  const verbose = options.verbose ?? false;

  const checks: DoctorResult["checks"] = [];
  const log = (message: string) => {
    if (!quiet && !json) {
      console.log(message);
    }
  };

  log(chalk.bold("North Doctor\n"));

  let configPath: string | null = null;
  let config: NorthConfig | null = null;

  // ========================================================================
  // Check 1: Config file exists
  // ========================================================================

  log(chalk.dim("Checking configuration file..."));

  configPath = await resolveConfigPath(cwd);

  if (!configPath) {
    const check = {
      name: "Config file",
      status: "error",
      message: ".north/config.yaml not found. Run 'north init' first.",
    } satisfies Check;
    pushCheck(checks, check);
    logCheck(log, check);
  } else {
    const check = {
      name: "Config file",
      status: "ok",
      message: `Found at ${configPath}`,
    } satisfies Check;
    pushCheck(checks, check);
    logCheck(log, check);
  }

  // ========================================================================
  // Check 2: Config loads and validates
  // ========================================================================

  if (configPath) {
    log(chalk.dim("\nValidating configuration..."));

    const loadResult = await loadConfig(configPath);

    if (!loadResult.success) {
      const details =
        "issues" in loadResult.error
          ? loadResult.error.issues.map((issue) => `${issue.path}: ${issue.message}`)
          : [];

      const check = {
        name: "Config validation",
        status: "error",
        message: loadResult.error.message,
        details,
      } satisfies Check;
      pushCheck(checks, check);
      logCheck(log, check);
    } else {
      config = loadResult.config;
      const check = {
        name: "Config validation",
        status: "ok",
        message: "Configuration is valid",
      } satisfies Check;
      pushCheck(checks, check);
      logCheck(log, check);

      if (verbose && config) {
        log(chalk.dim("\nDial settings:"));
        log(chalk.dim(`  radius: ${config.dials?.radius ?? "default"}`));
        log(chalk.dim(`  shadows: ${config.dials?.shadows ?? "default"}`));
        log(chalk.dim(`  density: ${config.dials?.density ?? "default"}`));
        log(chalk.dim(`  contrast: ${config.dials?.contrast ?? "default"}`));
      }
    }
  }

  // ========================================================================
  // Check 3: Generated tokens file exists
  // ========================================================================

  log(chalk.dim("\nChecking generated tokens..."));

  const paths = configPath ? resolveNorthPaths(configPath, cwd) : null;
  const generatedPath = paths?.generatedTokensPath ?? resolve(cwd, ".north/tokens/generated.css");
  const generatedExists = await fileExists(generatedPath);

  if (!generatedExists) {
    const check = {
      name: "Generated tokens",
      status: "error",
      message: ".north/tokens/generated.css not found. Run 'north gen' to generate.",
    } satisfies Check;
    pushCheck(checks, check);
    logCheck(log, check);
  } else {
    const check = {
      name: "Generated tokens",
      status: "ok",
      message: ".north/tokens/generated.css exists",
    } satisfies Check;
    pushCheck(checks, check);
    logCheck(log, check);

    // ====================================================================
    // Check 4: Checksum verification
    // ====================================================================

    log(chalk.dim("Verifying checksum..."));

    try {
      const cssContent = await readFile(generatedPath, "utf-8");
      const checksumResult = verifyChecksum(cssContent);

      if (checksumResult.valid) {
        const checksumCheck = {
          name: "Checksum verification",
          status: "ok",
          message: "Generated tokens checksum is valid",
          details: checksumResult.expectedChecksum
            ? [`${checksumResult.expectedChecksum.slice(0, 16)}...`]
            : undefined,
        } satisfies Check;
        pushCheck(checks, checksumCheck);
        logCheck(log, checksumCheck);
      } else {
        const checksumCheck = {
          name: "Checksum verification",
          status: driftStatus(failOnDrift),
          message: checksumResult.message,
        } satisfies Check;
        pushCheck(checks, checksumCheck);
        logCheck(log, checksumCheck);
      }
    } catch (error) {
      const checksumCheck = {
        name: "Checksum verification",
        status: "error",
        message: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
      } satisfies Check;
      pushCheck(checks, checksumCheck);
      logCheck(log, checksumCheck);
    }
  }

  // ========================================================================
  // Check 5: Base tokens file exists
  // ========================================================================

  log(chalk.dim("\nChecking base tokens..."));

  const basePath = paths?.baseTokensPath ?? resolve(cwd, ".north/tokens/base.css");
  const baseExists = await fileExists(basePath);

  if (!baseExists) {
    const check = {
      name: "Base tokens",
      status: "warn",
      message: ".north/tokens/base.css not found. This file should exist for custom tokens.",
    } satisfies Check;
    pushCheck(checks, check);
    logCheck(log, check);
  } else {
    const check = {
      name: "Base tokens",
      status: "ok",
      message: ".north/tokens/base.css exists",
    } satisfies Check;
    pushCheck(checks, check);
    logCheck(log, check);
  }

  // ========================================================================
  // Check 6: Index status + freshness
  // ========================================================================

  let indexFresh = false;
  let indexPath: string | null = null;

  if (configPath) {
    log(chalk.dim("\nChecking index..."));

    try {
      const status = await getIndexStatus(cwd, configPath);
      indexPath = status.indexPath;

      if (!status.exists) {
        const check = {
          name: "Index",
          status: driftStatus(failOnDrift),
          message: "Index not found. Run 'north index' to build it.",
        } satisfies Check;
        pushCheck(checks, check);
        logCheck(log, check);
      } else {
        const freshness = await checkIndexFresh(cwd, configPath);
        indexFresh = freshness.fresh;

        if (!freshness.fresh) {
          const details = [] as string[];
          if (freshness.expected && freshness.actual) {
            details.push(`expected ${freshness.expected.slice(0, 16)}...`);
            details.push(`actual ${freshness.actual.slice(0, 16)}...`);
          }

          const check = {
            name: "Index freshness",
            status: driftStatus(failOnDrift),
            message: "Index is stale. Run 'north index' to refresh it.",
            details,
          } satisfies Check;
          pushCheck(checks, check);
          logCheck(log, check);
        } else {
          const check = {
            name: "Index freshness",
            status: "ok",
            message: "Index is fresh",
            details: verbose ? [`${status.indexPath}`] : undefined,
          } satisfies Check;
          pushCheck(checks, check);
          logCheck(log, check);
        }
      }
    } catch (error) {
      const check = {
        name: "Index",
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      } satisfies Check;
      pushCheck(checks, check);
      logCheck(log, check);
    }
  }

  // ========================================================================
  // Check 7: Compatibility tracking
  // ========================================================================

  if (config) {
    log(chalk.dim("\nChecking compatibility..."));

    const declaredTailwind = config.compatibility?.tailwind;
    if (!declaredTailwind) {
      const check = {
        name: "Compatibility (Tailwind)",
        status: "warn",
        message: "No Tailwind version declared in .north/config.yaml.",
      } satisfies Check;
      pushCheck(checks, check);
      logCheck(log, check);
    } else {
      const detected = await detectPackageVersion(cwd, "tailwindcss");
      const installedMajor = parseMajorVersion(detected.installed ?? detected.declared);
      const declaredMajor = parseMajorVersion(declaredTailwind);

      if (!detected.installed && !detected.declared) {
        const check = {
          name: "Compatibility (Tailwind)",
          status: "warn",
          message: `Declared ${declaredTailwind}, but tailwindcss not detected in package.json.`,
        } satisfies Check;
        pushCheck(checks, check);
        logCheck(log, check);
      } else if (
        declaredMajor !== null &&
        installedMajor !== null &&
        declaredMajor !== installedMajor
      ) {
        const check = {
          name: "Compatibility (Tailwind)",
          status: "warn",
          message: `Declared ${declaredTailwind}, detected ${detected.installed ?? detected.declared}.`,
        } satisfies Check;
        pushCheck(checks, check);
        logCheck(log, check);
      } else {
        const check = {
          name: "Compatibility (Tailwind)",
          status: "ok",
          message: `Declared ${declaredTailwind}${detected.installed ? `, installed ${detected.installed}` : ""}.`,
        } satisfies Check;
        pushCheck(checks, check);
        logCheck(log, check);
      }
    }

    const declaredShadcn = config.compatibility?.shadcn;
    if (!declaredShadcn) {
      const check = {
        name: "Compatibility (shadcn)",
        status: "warn",
        message: "No shadcn version declared in .north/config.yaml.",
      } satisfies Check;
      pushCheck(checks, check);
      logCheck(log, check);
    } else {
      const shadcnPackages = ["shadcn-ui", "@shadcn/ui", "shadcn"];
      let detected: PackageVersionInfo | null = null;

      for (const pkg of shadcnPackages) {
        const info = await detectPackageVersion(cwd, pkg);
        if (info.installed || info.declared) {
          detected = info;
          break;
        }
      }

      if (!detected) {
        const check = {
          name: "Compatibility (shadcn)",
          status: "warn",
          message: `Declared ${declaredShadcn}, but shadcn package not detected in package.json.`,
        } satisfies Check;
        pushCheck(checks, check);
        logCheck(log, check);
      } else {
        const check = {
          name: "Compatibility (shadcn)",
          status: "ok",
          message: `Declared ${declaredShadcn}${detected.installed ? `, installed ${detected.installed}` : ""}.`,
        } satisfies Check;
        pushCheck(checks, check);
        logCheck(log, check);
      }
    }
  }

  // ========================================================================
  // Check 8: Token sync validation
  // ========================================================================

  if (generatedExists) {
    log(chalk.dim("\nChecking token sync..."));

    try {
      const cssContent = await readFile(generatedPath, "utf-8");
      const tokenDefinitions = parseCssTokens(cssContent, ".north/tokens/generated.css");
      const tokenMap = new Map(tokenDefinitions.map((def) => [def.name, def.value]));

      const expectedAliases = generateShadcnAliases();
      const missingAliases: string[] = [];
      const mismatchedAliases: string[] = [];

      for (const [alias, expectedValue] of Object.entries(expectedAliases)) {
        const actual = tokenMap.get(alias);
        if (!actual) {
          missingAliases.push(alias);
        } else if (actual !== expectedValue) {
          mismatchedAliases.push(`${alias} (expected ${expectedValue}, got ${actual})`);
        }
      }

      if (missingAliases.length === 0 && mismatchedAliases.length === 0) {
        const check = {
          name: "Token sync",
          status: "ok",
          message: "Shadcn alias tokens are aligned with --color-* tokens.",
        } satisfies Check;
        pushCheck(checks, check);
        logCheck(log, check);
      } else {
        const details = [
          ...missingAliases.slice(0, CHECK_DETAILS_LIMIT).map((alias) => `missing ${alias}`),
          ...mismatchedAliases.slice(0, CHECK_DETAILS_LIMIT),
        ];
        const check = {
          name: "Token sync",
          status: driftStatus(failOnDrift),
          message: `Found ${missingAliases.length} missing and ${mismatchedAliases.length} mismatched aliases.`,
          details,
        } satisfies Check;
        pushCheck(checks, check);
        logCheck(log, check);
      }
    } catch (error) {
      const check = {
        name: "Token sync",
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      } satisfies Check;
      pushCheck(checks, check);
      logCheck(log, check);
    }
  }

  // ========================================================================
  // Check 9: Orphan tokens (requires fresh index)
  // ========================================================================

  if (indexPath && indexFresh) {
    log(chalk.dim("\nChecking token usage..."));

    let db = null as Awaited<ReturnType<typeof openIndexDatabase>> | null;
    try {
      db = await openIndexDatabase(indexPath);
      const tokenRows = db.prepare("SELECT name FROM tokens").all() as Array<{ name: string }>;
      const usedRows = db
        .prepare(
          "SELECT DISTINCT resolved_token as token FROM usages WHERE resolved_token IS NOT NULL"
        )
        .all() as Array<{ token: string }>;

      const tokenSet = new Set(tokenRows.map((row) => row.name));
      const usedSet = new Set(usedRows.map((row) => row.token));

      const unused = Array.from(tokenSet)
        .filter((token) => !usedSet.has(token))
        .sort();
      const undefinedTokens = Array.from(usedSet)
        .filter((token) => !tokenSet.has(token))
        .sort();

      if (unused.length === 0 && undefinedTokens.length === 0) {
        const check = {
          name: "Orphan tokens",
          status: "ok",
          message: "No unused or undefined tokens detected.",
        } satisfies Check;
        pushCheck(checks, check);
        logCheck(log, check);
      } else {
        const details: string[] = [];
        if (unused.length > 0) {
          details.push(
            `unused: ${unused.slice(0, CHECK_DETAILS_LIMIT).join(", ")}${
              unused.length > CHECK_DETAILS_LIMIT ? "..." : ""
            }`
          );
        }
        if (undefinedTokens.length > 0) {
          details.push(
            `undefined: ${undefinedTokens.slice(0, CHECK_DETAILS_LIMIT).join(", ")}${
              undefinedTokens.length > CHECK_DETAILS_LIMIT ? "..." : ""
            }`
          );
        }

        const check = {
          name: "Orphan tokens",
          status: "warn",
          message: `Found ${unused.length} unused and ${undefinedTokens.length} undefined tokens.`,
          details,
        } satisfies Check;
        pushCheck(checks, check);
        logCheck(log, check);
      }
    } catch (error) {
      const check = {
        name: "Orphan tokens",
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      } satisfies Check;
      pushCheck(checks, check);
      logCheck(log, check);
    } finally {
      if (db) {
        db.close();
      }
    }
  } else if (configPath) {
    const check = {
      name: "Orphan tokens",
      status: "warn",
      message: "Index missing or stale; run 'north index' to check for orphan tokens.",
    } satisfies Check;
    pushCheck(checks, check);
    logCheck(log, check);
  }

  // ========================================================================
  // Check 10: Lint rules & extraction coverage (optional)
  // ========================================================================

  if (options.lint) {
    log(chalk.dim("\nChecking lint rules and extraction coverage..."));

    try {
      const { report } = await runLint({
        cwd,
        collectIssues: false,
      });

      const rulesCheck = {
        name: "Lint rules",
        status: report.rules.length > 0 ? "ok" : "warn",
        message: `Loaded ${report.rules.length} rules`,
      } satisfies Check;
      pushCheck(checks, rulesCheck);
      logCheck(log, rulesCheck);

      const coverageMessage = `Extracted classes from ${report.stats.filesWithClasses}/${report.stats.totalFiles} files (${report.stats.coveragePercent}%). Non-literal sites: ${report.stats.filesWithNonLiteral}.`;
      const coverageCheck = {
        name: "Lint coverage",
        status: "ok",
        message: coverageMessage,
      } satisfies Check;
      pushCheck(checks, coverageCheck);
      logCheck(log, coverageCheck);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const check = {
        name: "Lint diagnostics",
        status: "error",
        message: errorMessage,
      } satisfies Check;
      pushCheck(checks, check);
      logCheck(log, check);
    }
  }

  // ========================================================================
  // Summary
  // ========================================================================

  const summary = summarizeChecks(checks);
  const success = summary.error === 0;

  if (json) {
    console.log(
      JSON.stringify(
        {
          kind: "doctor",
          success,
          summary,
          checks,
        },
        null,
        2
      )
    );
  } else if (!quiet) {
    log(chalk.bold("\nDiagnostic Summary:"));

    if (summary.error === 0 && summary.warn === 0) {
      log(chalk.bold.green(`\n✓ All checks passed (${summary.ok}/${summary.total})`));
      log(chalk.dim("\nYour North setup is healthy!"));
    } else if (summary.error === 0) {
      log(chalk.bold.yellow(`\n⚠ Completed with warnings (${summary.ok}/${summary.total})`));
      log(chalk.dim("\nWarnings:"));
      for (const check of checks.filter((c) => c.status === "warn")) {
        log(chalk.yellow(`  • ${check.name}:`));
        log(chalk.dim(`    ${check.message}`));
      }
    } else {
      log(chalk.bold.red(`\n✗ ${summary.error} error(s) detected`));
      log(chalk.dim("\nIssues found:"));

      for (const check of checks.filter((c) => c.status === "error")) {
        log(chalk.red(`  • ${check.name}:`));
        log(chalk.dim(`    ${check.message}`));
      }

      log(chalk.dim("\nRecommended actions:"));
      log(chalk.dim("  1. Fix configuration errors"));
      log(chalk.dim("  2. Run 'north gen' to regenerate tokens"));
      log(chalk.dim("  3. Run 'north index' to refresh the index"));
      log(chalk.dim("  4. Run 'north doctor' again to verify"));
    }
  }

  return {
    success,
    message: success ? "Doctor completed" : "Doctor found issues",
    summary,
    checks,
  };
}
