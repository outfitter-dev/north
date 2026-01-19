import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  copyDir,
  emptyDir,
  ensureDir,
  pathExists,
  readText,
  writeJson,
  writeText,
} from "../../utils/fs.ts";
import { checkoutRef, cloneRepo } from "../../utils/git.ts";
import { hashJson } from "../../utils/hash.ts";
import { type NorthJsonReport, parseNorthJson, runNorth } from "../../utils/north.ts";
import { harnessPath } from "../../utils/paths.ts";

interface CorpusDefaults {
  timeBudgetMs?: number;
  coverageThreshold?: number;
  determinismRuns?: number;
}

interface CorpusRepo {
  name: string;
  url: string;
  sha: string;
  type: string;
  paths?: string[];
  index?: boolean;
  timeBudgetMs?: number;
  coverageThreshold?: number;
  determinismRuns?: number;
}

interface CorpusConfig {
  defaults?: CorpusDefaults;
  repos: CorpusRepo[];
}

interface CorpusRunOptions {
  repo?: string;
}

interface CorpusResult {
  name: string;
  status: "ok" | "warn" | "fail";
  warnings: string[];
  errors: string[];
}

const INJECTED_DIR = "north_harness_injected";
const INJECTED_FILE = "Probe.tsx";

export async function runCorpusSuite(options: CorpusRunOptions = {}) {
  const config = await loadCorpusConfig();
  const repos = options.repo
    ? config.repos.filter((repo) => repo.name === options.repo)
    : config.repos;

  if (repos.length === 0) {
    throw new Error(options.repo ? `Repo '${options.repo}' not found.` : "No corpus repos found.");
  }

  const results: CorpusResult[] = [];

  for (const repo of repos) {
    const workDir = harnessPath(".cache", "corpus", repo.name);
    const artifactDir = harnessPath("artifacts", "corpus", repo.name);
    await emptyDir(workDir);

    const cloneResult = await cloneRepo(repo.url, workDir);
    if (cloneResult.code !== 0) {
      await writeText(joinLogPath(artifactDir), formatCommandLog("git clone", cloneResult));
      results.push({ name: repo.name, status: "fail", warnings: [], errors: ["git clone failed"] });
      continue;
    }

    const checkoutResult = await checkoutRef(workDir, repo.sha);
    if (checkoutResult.code !== 0) {
      await writeText(joinLogPath(artifactDir), formatCommandLog("git checkout", checkoutResult));
      results.push({
        name: repo.name,
        status: "fail",
        warnings: [],
        errors: ["git checkout failed"],
      });
      continue;
    }

    await ensureNorthConfig(workDir);
    const configPath = resolve(workDir, "north", "north.config.yaml");
    await injectProbe(workDir, repo.paths);

    const warnings: string[] = [];
    const errors: string[] = [];

    if (repo.index) {
      const indexResult = await runNorth(["index", "--config", configPath], workDir, {
        timeoutMs: repo.timeBudgetMs ?? config.defaults?.timeBudgetMs ?? 120_000,
      });
      if (indexResult.code !== 0) {
        warnings.push("north index failed");
      }
      await appendCommandLog(artifactDir, "north index", indexResult);
    }

    const determinismRuns = repo.determinismRuns ?? config.defaults?.determinismRuns ?? 2;
    const runCount = Math.max(2, determinismRuns);
    const reports: NorthJsonReport[] = [];
    const hashes: string[] = [];
    const durations: number[] = [];

    for (let i = 0; i < runCount; i += 1) {
      const checkResult = await runNorthCheck(
        workDir,
        repo.paths,
        configPath,
        repo.timeBudgetMs,
        config.defaults
      );
      durations.push(checkResult.durationMs);
      await appendCommandLog(artifactDir, `north check (run ${i + 1})`, checkResult.command);

      if (checkResult.report) {
        const normalized = normalizeReport(checkResult.report);
        reports.push(normalized);
        hashes.push(hashJson(normalized));
      } else {
        warnings.push(`north check output missing (run ${i + 1})`);
      }

      if (checkResult.command.code !== 0) {
        warnings.push(`north check exited non-zero (run ${i + 1})`);
      }
    }

    if (reports.length > 0) {
      const reportPath = resolve(artifactDir, "report.json");
      const secondPath = resolve(artifactDir, "report-2.json");
      await writeJson(reportPath, reports[0]);
      if (reports[1]) {
        await writeJson(secondPath, reports[1]);
      }

      const coverageThreshold = repo.coverageThreshold ?? config.defaults?.coverageThreshold ?? 10;
      const coverage = reports[0]?.stats.coveragePercent ?? 0;
      if (coverage < coverageThreshold) {
        errors.push(`coverage ${coverage}% below ${coverageThreshold}%`);
      }

      if (!allEqual(hashes)) {
        errors.push("non-deterministic output across runs");
      }

      if (!hasInjectedViolation(reports[0])) {
        errors.push("injected probe not detected");
      }
    } else {
      errors.push("no successful north check output");
    }

    const timeBudget = repo.timeBudgetMs ?? config.defaults?.timeBudgetMs ?? 120_000;
    if (durations.some((duration) => duration > timeBudget)) {
      errors.push(`north check exceeded time budget (${timeBudget}ms)`);
    }

    const status: CorpusResult["status"] =
      errors.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "ok";
    results.push({ name: repo.name, status, warnings, errors });

    await ensureDir(artifactDir);
    await writeJson(resolve(artifactDir, "summary.json"), {
      repo: repo.name,
      status,
      warnings,
      errors,
      durations,
    });
  }

  return results;
}

async function loadCorpusConfig(): Promise<CorpusConfig> {
  const corpusPath = harnessPath("corpus.yaml");
  const raw = await readText(corpusPath);
  return parseYaml(raw) as CorpusConfig;
}

async function ensureNorthConfig(workDir: string) {
  const configPath = resolve(workDir, "north", "north.config.yaml");
  const rulesDir = resolve(workDir, "north", "rules");
  const fixtureDir = harnessPath("fixtures", "north", "north");

  if (!(await pathExists(configPath))) {
    await copyDir(fixtureDir, resolve(workDir, "north"));
    return;
  }

  if (!(await pathExists(rulesDir))) {
    await copyDir(resolve(fixtureDir, "rules"), rulesDir);
  }
}

async function injectProbe(workDir: string, paths?: string[]) {
  const targets = paths && paths.length > 0 ? paths : [""];
  const content =
    'export function HarnessProbe() {\n  return <div className="bg-red-500 p-[13px]">Injected</div>;\n}\n';

  for (const path of targets) {
    const base = path ? resolve(workDir, path) : workDir;
    const injectDir = resolve(base, INJECTED_DIR);
    await ensureDir(injectDir);
    await writeText(resolve(injectDir, INJECTED_FILE), content);
  }
}

async function runNorthCheck(
  workDir: string,
  paths: string[] | undefined,
  configPath: string,
  repoBudget: number | undefined,
  defaults: CorpusDefaults | undefined
) {
  const timeBudget = repoBudget ?? defaults?.timeBudgetMs ?? 120_000;

  if (!paths || paths.length === 0) {
    const command = await runNorth(["check", "--json", "--config", configPath], workDir, {
      timeoutMs: timeBudget,
    });
    const report = parseReport(command.stdout);
    return { report, durationMs: command.durationMs, command };
  }

  const reports: NorthJsonReport[] = [];
  const commands: Array<{
    code: number | null;
    stdout: string;
    stderr: string;
    durationMs: number;
  }> = [];

  for (const path of paths) {
    const cwd = resolve(workDir, path);
    const command = await runNorth(["check", "--json", "--config", configPath], cwd, {
      timeoutMs: timeBudget,
    });
    commands.push(command);
    const report = parseReport(command.stdout);
    if (report) {
      reports.push(prefixReportPaths(report, path));
    }
  }

  const merged = mergeReports(reports);
  const duration = commands.reduce((acc, entry) => acc + entry.durationMs, 0);
  if (commands.length === 0) {
    return {
      report: merged,
      durationMs: duration,
      command: { code: 1, stdout: "", stderr: "No commands executed", durationMs: duration },
    };
  }

  const failureIndex = commands.findIndex((entry) => entry.code !== 0);
  const baseCommand = failureIndex >= 0 ? commands[failureIndex] : commands[0];
  const command = { ...baseCommand, durationMs: duration };
  if (failureIndex >= 0 && paths?.[failureIndex]) {
    command.stderr = [baseCommand.stderr, `Path: ${paths[failureIndex]}`].filter(Boolean).join("\n");
  }

  return { report: merged, durationMs: duration, command };
}

function parseReport(raw: string): NorthJsonReport | null {
  try {
    return parseNorthJson(raw.trim());
  } catch {
    return null;
  }
}

function prefixReportPaths(report: NorthJsonReport, prefix: string): NorthJsonReport {
  if (!prefix) {
    return report;
  }
  const normalizedPrefix = prefix.replace(/\\/g, "/").replace(/\/$/, "");
  return {
    ...report,
    violations: report.violations.map((violation) => ({
      ...violation,
      filePath: `${normalizedPrefix}/${violation.filePath}`,
    })),
  };
}

function mergeReports(reports: NorthJsonReport[]): NorthJsonReport | null {
  if (reports.length === 0) {
    return null;
  }

  if (reports.length === 1) {
    return reports[0];
  }

  const summary = { errors: 0, warnings: 0, info: 0 };
  const stats = {
    totalFiles: 0,
    filesWithClasses: 0,
    filesWithNonLiteral: 0,
    extractedClassCount: 0,
    classSites: 0,
    coveragePercent: 0,
  };

  const violations = reports.flatMap((report) => report.violations);
  const rules = new Map<string, NorthJsonReport["rules"][number]>();

  for (const report of reports) {
    summary.errors += report.summary.errors;
    summary.warnings += report.summary.warnings;
    summary.info += report.summary.info;

    stats.totalFiles += report.stats.totalFiles;
    stats.filesWithClasses += report.stats.filesWithClasses;
    stats.filesWithNonLiteral += report.stats.filesWithNonLiteral;
    stats.extractedClassCount += report.stats.extractedClassCount;
    stats.classSites += report.stats.classSites;

    for (const rule of report.rules) {
      if (!rules.has(rule.id)) {
        rules.set(rule.id, rule);
      }
    }
  }

  stats.coveragePercent =
    stats.totalFiles === 0 ? 100 : Math.round((stats.filesWithClasses / stats.totalFiles) * 100);

  return {
    summary,
    violations,
    stats,
    rules: Array.from(rules.values()),
  };
}

function normalizeReport(report: NorthJsonReport): NorthJsonReport {
  const sortedViolations = [...report.violations].sort((a, b) => {
    if (a.filePath !== b.filePath) {
      return a.filePath.localeCompare(b.filePath);
    }
    if (a.line !== b.line) {
      return a.line - b.line;
    }
    if (a.column !== b.column) {
      return a.column - b.column;
    }
    return a.ruleId.localeCompare(b.ruleId);
  });

  const sortedRules = [...report.rules].sort((a, b) => a.id.localeCompare(b.id));

  return {
    ...report,
    violations: sortedViolations,
    rules: sortedRules,
  };
}

function hasInjectedViolation(report: NorthJsonReport): boolean {
  return report.violations.some((violation) =>
    violation.filePath.replace(/\\/g, "/").includes(`${INJECTED_DIR}/${INJECTED_FILE}`)
  );
}

function allEqual(values: string[]): boolean {
  if (values.length <= 1) {
    return true;
  }
  return values.every((value) => value === values[0]);
}

function joinLogPath(artifactDir: string) {
  return resolve(artifactDir, "command.log");
}

async function appendCommandLog(
  artifactDir: string,
  label: string,
  result: { code: number | null; stdout: string; stderr: string }
) {
  const path = joinLogPath(artifactDir);
  const entry = formatCommandLog(label, result);
  const current = (await pathExists(path)) ? await readText(path) : "";
  const next = current.length > 0 ? `${current}\n\n${entry}` : entry;
  await writeText(path, next);
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
