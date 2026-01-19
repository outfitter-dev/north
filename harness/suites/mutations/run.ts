import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { type Expectation, compareExpectations, summarizeViolations } from "../../utils/diff.ts";
import { emptyDir, readJson, writeJson, writeText } from "../../utils/fs.ts";
import { applyPatch, checkoutRef, cloneRepo, stageAll } from "../../utils/git.ts";
import { type NorthJsonReport, parseNorthJson, runNorth } from "../../utils/north.ts";
import { harnessPath } from "../../utils/paths.ts";

interface MutationConfig {
  repo: {
    name: string;
    url: string;
    sha: string;
  };
  basePatch?: string;
  timeoutMs?: number;
}

interface MutationRunOptions {
  suite?: string;
}

interface SuiteResult {
  name: string;
  ok: boolean;
  errors: string[];
}

export async function runMutationSuite(options: MutationRunOptions = {}) {
  const configPath = harnessPath("suites", "mutations", "config.json");
  const config = await readJson<MutationConfig>(configPath);
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
    const artifactDir = harnessPath("artifacts", "mutations", suite);
    const workDir = harnessPath(".cache", "mutations", suite);

    await emptyDir(workDir);

    const cloneResult = await cloneRepo(config.repo.url, workDir);
    if (cloneResult.code !== 0) {
      await writeText(join(artifactDir, "command.log"), formatCommandLog("git clone", cloneResult));
      results.push({ name: suite, ok: false, errors: ["git clone failed"] });
      continue;
    }

    const checkoutResult = await checkoutRef(workDir, config.repo.sha);
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

    const northResult = await runNorth(["check", "--json", "--staged"], workDir, {
      timeoutMs: config.timeoutMs ?? 60_000,
    });

    const commandLog = formatCommandLog("north check --json --staged", northResult);
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
    const summary = summarizeViolations(
      report.violations.map((violation) => ({
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
