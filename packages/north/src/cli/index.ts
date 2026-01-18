#!/usr/bin/env node

import { Command } from "commander";
import { check } from "../commands/check.ts";
import { doctor } from "../commands/doctor.ts";
import { find } from "../commands/find.ts";
import { generateTokens } from "../commands/gen.ts";
import { runIndex } from "../commands/index.ts";
import { init } from "../commands/init.ts";
import { promote } from "../commands/promote.ts";
import { refactor } from "../commands/refactor.ts";

const VERSION = "0.1.0";

const program = new Command();

program
  .name("north")
  .description("Design system enforcement CLI tool")
  .version(VERSION, "-v, --version", "Output the current version");

// ============================================================================
// init - Initialize North in project
// ============================================================================

program
  .command("init")
  .description("Initialize North in your project")
  .option("-f, --force", "Force initialization (overwrite existing files)")
  .action(async (options: { force?: boolean }) => {
    const result = await init({
      cwd: process.cwd(),
      force: options.force,
    });

    if (!result.success) {
      process.exit(1);
    }
  });

// ============================================================================
// gen - Generate tokens from config
// ============================================================================

program
  .command("gen")
  .alias("generate")
  .description("Generate design tokens from configuration")
  .option("-c, --config <path>", "Path to config file")
  .option("-q, --quiet", "Suppress output")
  .action(async (options: { config?: string; quiet?: boolean }) => {
    const result = await generateTokens({
      cwd: process.cwd(),
      config: options.config,
      quiet: options.quiet,
    });

    if (!result.success) {
      process.exit(1);
    }
  });

// ============================================================================
// doctor - Validate setup and configuration
// ============================================================================

program
  .command("doctor")
  .description("Validate North setup and configuration")
  .option("--lint", "Run lint diagnostics (rules + extraction coverage)")
  .action(async (options) => {
    const result = await doctor({
      cwd: process.cwd(),
      lint: options.lint,
    });

    if (!result.success) {
      process.exit(1);
    }
  });

// ============================================================================
// check - Lint for design system violations
// ============================================================================

program
  .command("check")
  .description("Lint for design system violations")
  .option("-c, --config <path>", "Path to config file")
  .option("--json", "Output JSON report")
  .option("--staged", "Only lint staged files")
  .action(async (options) => {
    const result = await check({
      cwd: process.cwd(),
      config: options.config,
      json: options.json,
      staged: options.staged,
    });

    if (!result.success) {
      process.exit(1);
    }
  });

// ============================================================================
// find - Discovery tools
// ============================================================================

program
  .command("find")
  .description("Discover design system usage")
  .option("-c, --config <path>", "Path to config file")
  .option("--colors", "Color usage report")
  .option("--spacing", "Spacing usage report")
  .option("--patterns", "Repeated class patterns")
  .option("--tokens", "Token usage report")
  .option("--cascade <selector>", "Cascade debugger for selector or token")
  .option("--similar <file>", "Find similar components")
  .option("--threshold <number>", "Similarity threshold (0-1)", Number.parseFloat)
  .option("--limit <number>", "Limit results", Number.parseInt)
  .option("--json", "Output JSON")
  .option("-q, --quiet", "Suppress output")
  .action(async (options) => {
    const result = await find({
      cwd: process.cwd(),
      config: options.config,
      json: options.json,
      quiet: options.quiet,
      colors: options.colors,
      spacing: options.spacing,
      patterns: options.patterns,
      tokens: options.tokens,
      cascade: options.cascade,
      similar: options.similar,
      threshold: options.threshold,
      limit: options.limit,
    });

    if (!result.success) {
      process.exit(1);
    }
  });

// ============================================================================
// promote - Promote class pattern to utility/token
// ============================================================================

program
  .command("promote")
  .description("Promote a class pattern into a utility")
  .argument("<pattern>", "Class pattern to promote")
  .option("-c, --config <path>", "Path to config file")
  .requiredOption("--as <name>", "Utility name")
  .option("--similar", "Include similar patterns")
  .option("--threshold <number>", "Similarity threshold (0-1)", Number.parseFloat)
  .option("--limit <number>", "Limit results", Number.parseInt)
  .option("--dry-run", "Preview changes only")
  .option("--apply", "Write changes to north/tokens/base.css")
  .option("--json", "Output JSON")
  .option("-q, --quiet", "Suppress output")
  .action(async (pattern, options) => {
    const result = await promote({
      cwd: process.cwd(),
      config: options.config,
      pattern,
      as: options.as,
      similar: options.similar,
      threshold: options.threshold,
      limit: options.limit,
      dryRun: options.dryRun,
      apply: options.apply,
      json: options.json,
      quiet: options.quiet,
    });

    if (!result.success) {
      process.exit(1);
    }
  });

// ============================================================================
// refactor - Refactor token values
// ============================================================================

program
  .command("refactor")
  .description("Refactor a design token value")
  .argument("[token]", "Token name (use --token if it starts with --)")
  .option("-c, --config <path>", "Path to config file")
  .option("--token <token>", "Token name (use when token starts with --)")
  .requiredOption("--to <value>", "New token value")
  .option("--no-cascade", "Skip cascade analysis")
  .option("--limit <number>", "Limit results", Number.parseInt)
  .option("--dry-run", "Preview changes only")
  .option("--apply", "Write changes to north/tokens/base.css")
  .option("--json", "Output JSON")
  .option("-q, --quiet", "Suppress output")
  .action(async (token, options) => {
    const result = await refactor({
      cwd: process.cwd(),
      config: options.config,
      token: options.token ?? token,
      to: options.to,
      cascade: options.cascade,
      limit: options.limit,
      dryRun: options.dryRun,
      apply: options.apply,
      json: options.json,
      quiet: options.quiet,
    });

    if (!result.success) {
      process.exit(1);
    }
  });

// ============================================================================
// index - Build and inspect the index
// ============================================================================

program
  .command("index")
  .description("Build and inspect the index")
  .option("-c, --config <path>", "Path to config file")
  .option("--status", "Show index status")
  .option("--check-fresh", "Check index freshness")
  .option("-q, --quiet", "Suppress output")
  .action(async (options) => {
    const result = await runIndex({
      cwd: process.cwd(),
      config: options.config,
      status: options.status,
      checkFresh: options.checkFresh,
      quiet: options.quiet,
    });

    if (!result.success) {
      process.exit(1);
    }
  });

program.parse();
