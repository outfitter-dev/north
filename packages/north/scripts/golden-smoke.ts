import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { check } from "../src/commands/check.ts";
import { doctor } from "../src/commands/doctor.ts";
import { generateTokens } from "../src/commands/gen.ts";
import { runIndex } from "../src/commands/index.ts";
import { executeCheckTool } from "../src/mcp/tools/check.ts";
import { executeContextTool } from "../src/mcp/tools/context.ts";

const fixtureDir = resolve(import.meta.dir, "..", "fixtures", "golden-project");
const configPath = resolve(fixtureDir, ".north", "config.yaml");
const stateDir = resolve(fixtureDir, ".north", "state");

function fail(message: string): never {
  throw new Error(message);
}

async function run() {
  await rm(stateDir, { recursive: true, force: true });

  const genResult = await generateTokens({
    cwd: fixtureDir,
    config: configPath,
    quiet: true,
  });
  if (!genResult.success) {
    fail(`north gen failed: ${genResult.message}`);
  }

  const indexResult = await runIndex({
    cwd: fixtureDir,
    config: configPath,
    quiet: true,
  });
  if (!indexResult.success) {
    fail(`north index failed: ${indexResult.message}`);
  }

  const checkResult = await check({
    cwd: fixtureDir,
    config: configPath,
    json: true,
  });
  if (!checkResult.success) {
    fail(`north check failed: ${checkResult.message}`);
  }

  const doctorResult = await doctor({
    cwd: fixtureDir,
    failOnDrift: true,
    quiet: true,
  });
  if (!doctorResult.success) {
    fail(`north doctor failed: ${doctorResult.message}`);
  }

  const mcpCheck = await executeCheckTool(fixtureDir, configPath, {
    files: ["src/ui/*.tsx"],
  });
  if (!mcpCheck.passed) {
    fail(`MCP check failed: ${JSON.stringify(mcpCheck.summary)}`);
  }

  const context = await executeContextTool(fixtureDir, configPath, true);
  if (!context.project.generatedExists || !context.project.baseExists) {
    fail("MCP context missing generated or base tokens");
  }
  if (!context.index.exists || !context.index.fresh) {
    fail("MCP context index is missing or stale");
  }

  console.log("Golden project smoke test passed.");
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
