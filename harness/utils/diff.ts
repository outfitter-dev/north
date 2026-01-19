export interface Expectation {
  rules: Record<string, number>;
  severities?: Record<string, Record<string, number>>;
  files?: Record<
    string,
    {
      rules?: Record<string, number>;
      lines?: Record<string, number[]>;
    }
  >;
  options?: {
    allowExtraRules?: boolean;
    allowExtraFiles?: boolean;
    allowLineMismatch?: boolean;
  };
}

export interface ViolationEntry {
  ruleId: string;
  severity: string;
  filePath: string;
  line: number;
}

export interface ViolationSummary {
  ruleCounts: Record<string, number>;
  severityCounts: Record<string, Record<string, number>>;
  fileRuleCounts: Record<string, Record<string, number>>;
  fileLineRules: Record<string, Record<string, number[]>>;
}

export interface ComparisonResult {
  ok: boolean;
  errors: string[];
  summary: ViolationSummary;
}

function increment(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

export function summarizeViolations(entries: ViolationEntry[]): ViolationSummary {
  const ruleCounts: Record<string, number> = {};
  const severityCounts: Record<string, Record<string, number>> = {};
  const fileRuleCounts: Record<string, Record<string, number>> = {};
  const fileLineRules: Record<string, Record<string, number[]>> = {};

  for (const entry of entries) {
    increment(ruleCounts, entry.ruleId);

    if (!severityCounts[entry.ruleId]) {
      severityCounts[entry.ruleId] = {};
    }
    increment(severityCounts[entry.ruleId], entry.severity);

    if (!fileRuleCounts[entry.filePath]) {
      fileRuleCounts[entry.filePath] = {};
    }
    increment(fileRuleCounts[entry.filePath], entry.ruleId);

    if (!fileLineRules[entry.filePath]) {
      fileLineRules[entry.filePath] = {};
    }
    if (!fileLineRules[entry.filePath][entry.ruleId]) {
      fileLineRules[entry.filePath][entry.ruleId] = [];
    }
    fileLineRules[entry.filePath][entry.ruleId].push(entry.line);
  }

  for (const file of Object.keys(fileLineRules)) {
    const fileRules = fileLineRules[file];
    if (!fileRules) {
      continue;
    }
    for (const rule of Object.keys(fileRules)) {
      const lines = fileRules[rule] ?? [];
      fileRules[rule] = Array.from(new Set(lines)).sort((a, b) => a - b);
    }
  }

  return { ruleCounts, severityCounts, fileRuleCounts, fileLineRules };
}

function getCount(map: Record<string, number>, key: string) {
  return map[key] ?? 0;
}

export function compareExpectations(
  expectation: Expectation,
  summary: ViolationSummary
): ComparisonResult {
  const errors: string[] = [];
  const allowExtraRules = expectation.options?.allowExtraRules ?? false;
  const allowExtraFiles = expectation.options?.allowExtraFiles ?? false;
  const allowLineMismatch = expectation.options?.allowLineMismatch ?? false;

  for (const [ruleId, expectedCount] of Object.entries(expectation.rules)) {
    const actual = getCount(summary.ruleCounts, ruleId);
    if (actual !== expectedCount) {
      errors.push(`Rule ${ruleId}: expected ${expectedCount}, got ${actual}`);
    }
  }

  if (!allowExtraRules) {
    for (const ruleId of Object.keys(summary.ruleCounts)) {
      if (!(ruleId in expectation.rules)) {
        errors.push(`Unexpected rule ${ruleId} (${summary.ruleCounts[ruleId]})`);
      }
    }
  }

  if (expectation.severities) {
    for (const [ruleId, expectedSeverities] of Object.entries(expectation.severities)) {
      const actualSeverities = summary.severityCounts[ruleId] ?? {};
      for (const [severity, expectedCount] of Object.entries(expectedSeverities)) {
        const actual = getCount(actualSeverities, severity);
        if (actual !== expectedCount) {
          errors.push(`Severity ${ruleId}/${severity}: expected ${expectedCount}, got ${actual}`);
        }
      }
    }
  }

  if (expectation.files) {
    for (const [filePath, expectedFile] of Object.entries(expectation.files)) {
      const actualRules = summary.fileRuleCounts[filePath] ?? {};

      if (expectedFile.rules) {
        for (const [ruleId, expectedCount] of Object.entries(expectedFile.rules)) {
          const actual = getCount(actualRules, ruleId);
          if (actual !== expectedCount) {
            errors.push(`File ${filePath} ${ruleId}: expected ${expectedCount}, got ${actual}`);
          }
        }
      }

      if (!allowLineMismatch && expectedFile.lines) {
        const actualLines = summary.fileLineRules[filePath] ?? {};
        for (const [ruleId, expectedLines] of Object.entries(expectedFile.lines)) {
          const actual = actualLines[ruleId] ?? [];
          const normalizedExpected = Array.from(new Set(expectedLines)).sort((a, b) => a - b);
          if (normalizedExpected.join(",") !== actual.join(",")) {
            errors.push(
              `File ${filePath} ${ruleId} lines: expected [${normalizedExpected.join(",")}], got [${actual.join(",")}]`
            );
          }
        }
      }
    }

    if (!allowExtraFiles) {
      for (const filePath of Object.keys(summary.fileRuleCounts)) {
        if (!(filePath in expectation.files)) {
          errors.push(`Unexpected file ${filePath} with violations`);
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    summary,
  };
}
