import { readdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { type Expectation, compareExpectations, summarizeViolations } from "../../utils/diff.ts";
import { runCommand } from "../../utils/exec.ts";
import { emptyDir, pathExists, readJson, writeJson, writeText } from "../../utils/fs.ts";
import { applyPatch, checkoutRef, cloneRepo, stageAll } from "../../utils/git.ts";
import { type NorthJsonReport, parseNorthJson, runNorth } from "../../utils/north.ts";
import { harnessPath, repoPath } from "../../utils/paths.ts";
import { readRepoRegistry, resolveRepo } from "../../utils/repos.ts";

interface MutationConfig {
  repo: string;
  basePatch?: string;
  timeoutMs?: number;
}

interface MutationRunOptions {
  suite?: string;
}

interface MutationCommandConfig {
  cmd: string;
  args?: string[];
  timeoutMs?: number;
}

interface SuiteResult {
  name: string;
  ok: boolean;
  errors: string[];
}

export async function runMutationSuite(options: MutationRunOptions = {}) {
  const configPath = harnessPath("suites", "mutations", "config.json");
  const config = await readJson<MutationConfig>(configPath);
  const registry = await readRepoRegistry();
  const repo = resolveRepo(registry, config.repo);
  const suitesDir = harnessPath("suites", "mutations");
  const entries = await readdir(suitesDir, { withFileTypes: true });

  const suites = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("."));

  const targetSuites = options.suite ? suites.filter((suite) => suite === options.suite) : suites;

  if (targetSuites.length === 0) {
    throw new Error(
      options.suite ? `Suite '${options.suite}' not found.` : "No mutation suites found."
    );
  }

  const results: SuiteResult[] = [];

  for (const suite of targetSuites) {
    const suiteDir = join(suitesDir, suite);
    const patchPath = join(suiteDir, "patch.diff");
    const expectPath = join(suiteDir, "expect.json");
    const commandPath = join(suiteDir, "command.json");
    const artifactDir = harnessPath("artifacts", "mutations", suite);
    const workDir = harnessPath(".cache", "mutations", suite);

    await emptyDir(workDir);

    const cloneResult = await cloneRepo(repo.url, workDir);
    if (cloneResult.code !== 0) {
      await writeText(join(artifactDir, "command.log"), formatCommandLog("git clone", cloneResult));
      results.push({ name: suite, ok: false, errors: ["git clone failed"] });
      continue;
    }

    const checkoutResult = await checkoutRef(workDir, repo.sha);
    if (checkoutResult.code !== 0) {
      await writeText(
        join(artifactDir, "command.log"),
        formatCommandLog("git checkout", checkoutResult)
      );
      results.push({ name: suite, ok: false, errors: ["git checkout failed"] });
      continue;
    }

    if (config.basePatch) {
      const basePatchPath = join(suitesDir, config.basePatch);
      const baseResult = await applyPatch(workDir, basePatchPath);
      if (baseResult.code !== 0) {
        await writeText(
          join(artifactDir, "command.log"),
          formatCommandLog("git apply base", baseResult)
        );
        results.push({ name: suite, ok: false, errors: ["base patch failed"] });
        continue;
      }
    }

    const patchResult = await applyPatch(workDir, patchPath);
    if (patchResult.code !== 0) {
      await writeText(join(artifactDir, "command.log"), formatCommandLog("git apply", patchResult));
      results.push({ name: suite, ok: false, errors: ["patch apply failed"] });
      continue;
    }

    await stageAll(workDir);

    let commandLabel = "north check --json --staged";
    let northResult: { code: number | null; stdout: string; stderr: string; timedOut: boolean };

    if (await pathExists(commandPath)) {
      const commandConfig = await readJson<MutationCommandConfig>(commandPath);
      const args = commandConfig.args ?? [];
      const resolvedArgs =
        args.length > 0 && !isAbsolute(args[0] ?? "")
          ? [repoPath(args[0] ?? ""), ...args.slice(1)]
          : args;
      commandLabel = [commandConfig.cmd, ...resolvedArgs].join(" ");
      const commandResult = await runCommand(commandConfig.cmd, resolvedArgs, {
        cwd: workDir,
        timeoutMs: commandConfig.timeoutMs ?? config.timeoutMs ?? 60_000,
      });
      northResult = {
        code: commandResult.code,
        stdout: commandResult.stdout,
        stderr: commandResult.stderr,
        timedOut: commandResult.timedOut,
      };
    } else {
      northResult = await runNorth(["check", "--json", "--staged"], workDir, {
        timeoutMs: config.timeoutMs ?? 60_000,
      });
    }

    const commandLog = formatCommandLog(commandLabel, northResult);
    await writeText(join(artifactDir, "command.log"), commandLog);

    if (northResult.timedOut || northResult.code === null) {
      results.push({ name: suite, ok: false, errors: ["north check timed out"] });
      continue;
    }

    let report: NorthJsonReport;
    try {
      report = parseNorthJson(northResult.stdout.trim());
    } catch (_error) {
      results.push({ name: suite, ok: false, errors: ["failed to parse north output"] });
      continue;
    }

    await writeJson(join(artifactDir, "actual.json"), report);

    const expectation = await readJson<Expectation>(expectPath);
    const filteredViolations = report.violations.filter(
      (violation) => violation.ruleId !== "north/missing-semantic-comment"
    );
    const summary = summarizeViolations(
      filteredViolations.map((violation) => ({
        ruleId: violation.ruleId,
        severity: violation.severity,
        filePath: violation.filePath,
        line: violation.line,
      }))
    );

    const comparison = compareExpectations(expectation, summary);
    await writeJson(join(artifactDir, "diff.json"), comparison);

    results.push({
      name: suite,
      ok: comparison.ok,
      errors: comparison.errors,
    });
  }

  return results;
}

function formatCommandLog(
  command: string,
  result: { code: number | null; stdout: string; stderr: string }
) {
  return [
    `command: ${command}`,
    `exitCode: ${result.code ?? "null"}`,
    "stdout:",
    result.stdout.trim(),
    "",
    "stderr:",
    result.stderr.trim(),
    "",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}
