#!/usr/bin/env node

import { Command } from "commander";
import { check } from "../commands/check.ts";
import { doctor } from "../commands/doctor.ts";
import { generateTokens } from "../commands/gen.ts";
import { init } from "../commands/init.ts";

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

program.parse();
