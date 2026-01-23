import { resolve } from "node:path";
import { runCommand } from "../../utils/exec.ts";
import {
  copyDir,
  emptyDir,
  ensureDir,
  pathExists,
  readJson,
  readText,
  writeJson,
  writeText,
} from "../../utils/fs.ts";
import { checkoutRef, cloneRepo } from "../../utils/git.ts";
import { runNorth } from "../../utils/north.ts";
import { harnessPath } from "../../utils/paths.ts";
import { readRepoRegistry, resolveRepo } from "../../utils/repos.ts";

interface PromoteScenario {
  id: string;
  repo: string;
  pattern: string;
  as: string;
  instances: number;
}

interface PromoteConfig {
  scenarios: PromoteScenario[];
}

interface PromoteRunOptions {
  scenario?: string;
}

interface PromoteResult {
  id: string;
  ok: boolean;
  errors: string[];
}

const FIXTURE_DIR = "north_harness_promote";
const TOKEN_NAME = "--color-primary";
const TOKEN_NEXT = "oklch(0.7 0 0)";

export async function runPromoteSuite(options: PromoteRunOptions = {}) {
  const config = await readJson<PromoteConfig>(harnessPath("suites", "promote", "scenarios.json"));
  const registry = await readRepoRegistry();
  const scenarios = options.scenario
    ? config.scenarios.filter((scenario) => scenario.id === options.scenario)
    : config.scenarios;

  if (scenarios.length === 0) {
    throw new Error(
      options.scenario ? `Scenario '${options.scenario}' not found.` : "No scenarios found."
    );
  }

  const results: PromoteResult[] = [];

  for (const scenario of scenarios) {
    const resolvedRepo = resolveRepo(registry, scenario.repo);
    const workDir = harnessPath(".cache", "promote", scenario.id);
    const artifactDir = harnessPath("artifacts", "promote", scenario.id);
    await emptyDir(workDir);

    const cloneResult = await cloneRepo(resolvedRepo.url, workDir);
    if (cloneResult.code !== 0) {
      results.push({ id: scenario.id, ok: false, errors: ["git clone failed"] });
      continue;
    }

    const checkoutResult = await checkoutRef(workDir, resolvedRepo.sha);
    if (checkoutResult.code !== 0) {
      results.push({ id: scenario.id, ok: false, errors: ["git checkout failed"] });
      continue;
    }

    await ensureNorthConfig(workDir);
    await ensureBaseCss(workDir);

    const configPath = resolve(workDir, ".north", "config.yaml");
    const targetFile = await injectPatternFixture(workDir, scenario);

    const errors: string[] = [];

    const installResult = await runCommand("bun", ["install"], {
      cwd: workDir,
      timeoutMs: 300_000,
    });
    if (installResult.code !== 0) {
      errors.push("bun install failed");
    }

    await runBuildAndTypecheck(workDir, errors);

    const indexBefore = await runNorth(["index", "--config", configPath], workDir, {
      timeoutMs: 120_000,
    });
    await writeJson(resolve(artifactDir, "index.json"), indexBefore);
    if (indexBefore.code !== 0) {
      errors.push("north index failed");
    }

    const beforePatterns = await runFindPatterns(workDir, configPath);
    await writeJson(resolve(artifactDir, "patterns-before.json"), beforePatterns);

    if (!beforePatterns.ok) {
      errors.push("north find --patterns failed");
    }

    const beforeCount = findPatternCount(beforePatterns, scenario.pattern);
    if (beforeCount < scenario.instances) {
      errors.push(`pattern count ${beforeCount} below ${scenario.instances}`);
    }

    const baseCssPath = resolve(workDir, ".north", "tokens", "base.css");
    const baseBefore = await readText(baseCssPath);

    const promoteDry = await runNorth(
      [
        "promote",
        "--pattern",
        scenario.pattern,
        "--as",
        scenario.as,
        "--dry-run",
        "--json",
        "--config",
        configPath,
      ],
      workDir
    );
    await writeJson(resolve(artifactDir, "promote-dry-run.json"), parseJsonSafe(promoteDry.stdout));
    if (promoteDry.code !== 0) {
      errors.push("north promote --dry-run failed");
    }

    const promoteApply = await runNorth(
      [
        "promote",
        "--pattern",
        scenario.pattern,
        "--as",
        scenario.as,
        "--apply",
        "--json",
        "--config",
        configPath,
      ],
      workDir
    );
    await writeJson(resolve(artifactDir, "promote-apply.json"), parseJsonSafe(promoteApply.stdout));
    if (promoteApply.code !== 0) {
      errors.push("north promote --apply failed");
    }

    const baseAfter = await readText(baseCssPath);
    await writeText(resolve(artifactDir, "base.before.css"), baseBefore);
    await writeText(resolve(artifactDir, "base.after.css"), baseAfter);

    const diffResult = await runCommand("git", [
      "diff",
      "--no-index",
      resolve(artifactDir, "base.before.css"),
      resolve(artifactDir, "base.after.css"),
    ]);
    await writeText(resolve(artifactDir, "promote.diff"), diffResult.stdout || diffResult.stderr);

    await applyPatternReplacement(targetFile, scenario.pattern, scenario.as);

    const indexAfter = await runNorth(["index", "--config", configPath], workDir, {
      timeoutMs: 120_000,
    });
    if (indexAfter.code !== 0) {
      errors.push("north index (after) failed");
    }

    const afterPatterns = await runFindPatterns(workDir, configPath);
    await writeJson(resolve(artifactDir, "patterns-after.json"), afterPatterns);

    if (!afterPatterns.ok) {
      errors.push("north find --patterns (after) failed");
    }

    const afterCount = findPatternCount(afterPatterns, scenario.pattern);
    if (afterCount >= beforeCount) {
      errors.push(`pattern count not reduced (${beforeCount} -> ${afterCount})`);
    }

    const refactorDry = await runNorth(
      [
        "refactor",
        "--token",
        TOKEN_NAME,
        "--to",
        TOKEN_NEXT,
        "--dry-run",
        "--json",
        "--config",
        configPath,
      ],
      workDir
    );
    await writeJson(
      resolve(artifactDir, "refactor-dry-run.json"),
      parseJsonSafe(refactorDry.stdout)
    );
    if (refactorDry.code !== 0) {
      errors.push("north refactor --dry-run failed");
    }

    const refactorApply = await runNorth(
      [
        "refactor",
        "--token",
        TOKEN_NAME,
        "--to",
        TOKEN_NEXT,
        "--apply",
        "--json",
        "--config",
        configPath,
      ],
      workDir
    );
    await writeJson(
      resolve(artifactDir, "refactor-apply.json"),
      parseJsonSafe(refactorApply.stdout)
    );
    if (refactorApply.code !== 0) {
      errors.push("north refactor --apply failed");
    }

    const strictCheck = await runNorth(
      ["check", "--strict", "--json", "--config", configPath],
      workDir
    );
    const strictReport = parseJsonSafe(strictCheck.stdout) as { summary?: { errors: number } };
    if ((strictReport.summary?.errors ?? 0) > 0) {
      errors.push("north check --strict reported errors");
    }
    if (strictCheck.code !== 0) {
      errors.push("north check --strict failed");
    }

    results.push({ id: scenario.id, ok: errors.length === 0, errors });
  }

  return results;
}

async function ensureNorthConfig(workDir: string) {
  const configPath = resolve(workDir, ".north", "config.yaml");
  const rulesDir = resolve(workDir, ".north", "rules");
  const fixtureDir = harnessPath("fixtures", "north", ".north");

  if (!(await pathExists(configPath))) {
    await copyDir(fixtureDir, resolve(workDir, ".north"));
    return;
  }

  if (!(await pathExists(rulesDir))) {
    await copyDir(resolve(fixtureDir, "rules"), rulesDir);
  }
}

async function ensureBaseCss(workDir: string) {
  const tokensDir = resolve(workDir, ".north", "tokens");
  const basePath = resolve(tokensDir, "base.css");

  if (await pathExists(basePath)) {
    return;
  }

  await ensureDir(tokensDir);
  const content = `:root {\n  ${TOKEN_NAME}: oklch(0.6 0 0);\n  --color-secondary: oklch(0.8 0 0);\n  --spacing-md: 1rem;\n}\n`;
  await writeText(basePath, content);
}

async function injectPatternFixture(workDir: string, scenario: PromoteScenario) {
  const targetDir = resolve(workDir, FIXTURE_DIR);
  await ensureDir(targetDir);
  const targetFile = resolve(targetDir, `${scenario.id}.tsx`);

  const blocks = Array.from({ length: scenario.instances }).map(
    (_, index) => `      <div className=\"${scenario.pattern}\">Item ${index + 1}</div>`
  );

  const content = `export function HarnessPromote${scenario.id.replace(/[^A-Za-z0-9]/g, "")}() {\n  return (\n    <section>\n${blocks.join(
    "\n"
  )}\n    </section>\n  );\n}\n`;

  await writeText(targetFile, content);
  return targetFile;
}

async function applyPatternReplacement(filePath: string, pattern: string, replacement: string) {
  const content = await readText(filePath);
  const next = content.split(pattern).join(replacement);
  await writeText(filePath, next);
}

async function runFindPatterns(workDir: string, configPath: string) {
  const result = await runNorth(["find", "--patterns", "--json", "--config", configPath], workDir);
  const parsed = parseJsonSafe(result.stdout) as {
    patterns?: Array<{ classes: string[]; count: number }>;
  };
  return { ...parsed, ok: result.code === 0 };
}

function findPatternCount(
  report: { patterns?: Array<{ classes: string[]; count: number }> },
  pattern: string
) {
  const normalized = normalizePattern(pattern);
  const matches = report.patterns ?? [];
  for (const entry of matches) {
    if (arraysEqual(normalized, [...entry.classes].sort())) {
      return entry.count;
    }
  }
  return 0;
}

function normalizePattern(pattern: string) {
  return Array.from(new Set(pattern.split(/\s+/).filter(Boolean))).sort();
}

function arraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function parseJson(raw: string) {
  if (!raw.trim()) {
    return {};
  }
  return JSON.parse(raw);
}

function parseJsonSafe(raw: string) {
  try {
    return parseJson(raw);
  } catch {
    return {};
  }
}

async function runBuildAndTypecheck(workDir: string, errors: string[]) {
  const packagePath = resolve(workDir, "package.json");
  if (!(await pathExists(packagePath))) {
    return;
  }

  const pkg = parseJson(await readText(packagePath)) as { scripts?: Record<string, string> };
  const scripts = pkg.scripts ?? {};

  if (scripts.build) {
    const result = await runCommand("bun", ["run", "build"], { cwd: workDir, timeoutMs: 300_000 });
    if (result.code !== 0) {
      errors.push("build failed");
    }
  }

  if (scripts.typecheck) {
    const result = await runCommand("bun", ["run", "typecheck"], {
      cwd: workDir,
      timeoutMs: 300_000,
    });
    if (result.code !== 0) {
      errors.push("typecheck failed");
    }
  }
}
