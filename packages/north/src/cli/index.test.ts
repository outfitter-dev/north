/**
 * CLI Command Registration Completeness Tests
 *
 * Verifies that all command files in src/commands/ are properly imported
 * and registered in the CLI entry point (cli/index.ts).
 *
 * This test catches a common error where a new command is created but
 * never wired into the CLI, making it inaccessible to users.
 */

import { describe, expect, test } from "bun:test";
import { basename, dirname, join } from "node:path";
import { Glob } from "bun";

describe("CLI command registration completeness", () => {
  /**
   * Commands that are intentionally not registered in the CLI.
   *
   * Add entries here with justification when a command file exists
   * but should not be exposed via CLI (e.g., internal utilities,
   * deprecated commands pending removal, etc.)
   *
   * Format: { name: "command-name", reason: "Why it's not registered" }
   */
  const INTENTIONALLY_UNREGISTERED: Array<{ name: string; reason: string }> = [
    // TODO: Wire these up in a follow-up PR
    { name: "propose", reason: "MCP tool exists, CLI registration pending follow-up" },
    { name: "adopt", reason: "MCP tool exists, CLI registration pending follow-up" },
    { name: "classify", reason: "MCP tool exists, CLI registration pending follow-up" },
  ];

  const unregisteredNames = new Set(INTENTIONALLY_UNREGISTERED.map((c) => c.name));

  test("all command files are imported in cli/index.ts", async () => {
    const commandsDir = join(dirname(import.meta.path), "..", "commands");
    const cliIndexPath = join(dirname(import.meta.path), "index.ts");
    const glob = new Glob("*.ts");

    // Collect all command file names (excluding test files)
    const commandFiles: string[] = [];
    for await (const file of glob.scan(commandsDir)) {
      if (file.endsWith(".test.ts")) continue;
      // Skip index.ts if it exists (barrel exports)
      if (file === "index.ts") continue;

      const commandName = basename(file, ".ts");
      commandFiles.push(commandName);
    }

    const cliContent = await Bun.file(cliIndexPath).text();

    const missingImports: string[] = [];

    for (const cmd of commandFiles) {
      // Skip intentionally unregistered commands
      if (unregisteredNames.has(cmd)) continue;

      // Check for import from "../commands/{cmd}"
      // Handles various import patterns:
      // - import { foo } from "../commands/foo.ts"
      // - import { foo } from "../commands/foo"
      const importPattern = new RegExp(`from\\s+["']\\.\\.\/commands\/${cmd}(?:\\.ts)?["']`);

      if (!importPattern.test(cliContent)) {
        missingImports.push(cmd);
      }
    }

    if (missingImports.length > 0) {
      console.error("\nMissing command imports in cli/index.ts:", missingImports);
      console.error(
        "\nTo fix: Import and register each command, or add to INTENTIONALLY_UNREGISTERED with justification.\n"
      );
    }

    expect(missingImports).toEqual([]);
  });

  test("imported command functions are called in action handlers", async () => {
    const cliIndexPath = join(dirname(import.meta.path), "index.ts");
    const cliContent = await Bun.file(cliIndexPath).text();

    // Extract all function imports from commands directory
    const importMatches = cliContent.matchAll(
      /import\s*\{([^}]+)\}\s*from\s*["']\.\.\/commands\/(\w+)(?:\.ts)?["']/g
    );

    const importedFunctions: { fn: string; from: string }[] = [];
    for (const match of importMatches) {
      const functions = match[1]
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith("type "));
      const fromFile = match[2];

      for (const fn of functions) {
        // Handle aliased imports: originalName as aliasName
        const actualFn = fn.includes(" as ") ? fn.split(" as ")[1].trim() : fn;
        importedFunctions.push({ fn: actualFn, from: fromFile });
      }
    }

    const unusedImports: string[] = [];

    for (const { fn, from } of importedFunctions) {
      // Skip type imports
      if (fn.startsWith("type ")) continue;

      // Skip intentionally unregistered
      if (unregisteredNames.has(from)) continue;

      // Check if the function is called somewhere in an action handler
      // Pattern: .action(async ... { ... fn( ... }
      // Simplified check: just verify the function name appears after import
      const functionCallPattern = new RegExp(`\\b${fn}\\s*\\(`);

      if (!functionCallPattern.test(cliContent)) {
        unusedImports.push(`${fn} (from ${from})`);
      }
    }

    if (unusedImports.length > 0) {
      console.error("\nImported but unused command functions:", unusedImports);
      console.error("\nTo fix: Use the function in a .action() handler, or remove the import.\n");
    }

    expect(unusedImports).toEqual([]);
  });

  test("intentionally unregistered commands have valid justifications", () => {
    for (const { name, reason } of INTENTIONALLY_UNREGISTERED) {
      // Name should not be empty
      expect(name.length).toBeGreaterThan(0);
      // Reason should be meaningful (more than just a few characters)
      expect(reason.length).toBeGreaterThan(10);
    }
  });
});
