import { type Expectation, compareExpectations, summarizeViolations } from "../../utils/diff.ts";
import { readJson } from "../../utils/fs.ts";
import { type NorthJsonReport, parseNorthJson, runNorth } from "../../utils/north.ts";
import { harnessPath } from "../../utils/paths.ts";

interface FuzzManifestCase {
  id: string;
  file: string;
  expect: Expectation;
}

interface FuzzManifest {
  cases: FuzzManifestCase[];
}

interface FuzzRunOptions {
  limit?: number;
}

interface FuzzResult {
  id: string;
  ok: boolean;
  errors: string[];
}

export async function runFuzzSuite(options: FuzzRunOptions = {}) {
  const fixturesDir = harnessPath("fixtures", "fuzz");
  const manifest = await readJson<FuzzManifest>(harnessPath("fixtures", "fuzz", "manifest.json"));
  const configPath = harnessPath("fixtures", "fuzz", ".north", "config.yaml");

  const northResult = await runNorth(["check", "--json", "--config", configPath], fixturesDir, {
    timeoutMs: 60_000,
  });

  if (northResult.code === null) {
    throw new Error("north check crashed");
  }

  let report: NorthJsonReport;
  try {
    report = parseNorthJson(northResult.stdout.trim());
  } catch {
    throw new Error("failed to parse north output");
  }

  const filteredViolations = report.violations.filter(
    (violation) => violation.ruleId !== "north/missing-semantic-comment"
  );

  const cases = options.limit ? manifest.cases.slice(0, options.limit) : manifest.cases;
  const results: FuzzResult[] = [];
  const seenFiles = new Set<string>();

  for (const entry of cases) {
    const violations = filteredViolations.filter((violation) => violation.filePath === entry.file);
    const summary = summarizeViolations(
      violations.map((violation) => ({
        ruleId: violation.ruleId,
        severity: violation.severity,
        filePath: violation.filePath,
        line: violation.line,
      }))
    );

    const comparison = compareExpectations(entry.expect, summary);
    results.push({ id: entry.id, ok: comparison.ok, errors: comparison.errors });
    seenFiles.add(entry.file);
  }

  if (!options.limit) {
    const unexpectedFiles = new Set(
      filteredViolations
        .map((violation) => violation.filePath)
        .filter((file) => !seenFiles.has(file))
    );

    if (unexpectedFiles.size > 0) {
      results.push({
        id: "unexpected-fixtures",
        ok: false,
        errors: Array.from(unexpectedFiles).map((file) => `Unexpected violations in ${file}`),
      });
    }
  }

  return results;
}
