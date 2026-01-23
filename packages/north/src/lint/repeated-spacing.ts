import { Lang, parse } from "@ast-grep/napi";
import type { LintIssue, RuleSeverity } from "./types.ts";

export interface RepeatedSpacingOptions {
  minConsecutiveSpaces: number;
  allowInStrings: boolean;
  allowInComments: boolean;
  allowAfterLineStart: boolean;
  allowBeforeLineEnd: boolean;
  allowPatterns: RegExp[];
}

const DEFAULT_OPTIONS: RepeatedSpacingOptions = {
  minConsecutiveSpaces: 2,
  allowInStrings: false,
  allowInComments: true,
  allowAfterLineStart: true,
  allowBeforeLineEnd: true,
  allowPatterns: [],
};

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const strings = value.filter((entry) => typeof entry === "string") as string[];
  return strings.length > 0 ? strings : [];
}

function toRegexList(patterns: string[]): RegExp[] {
  const results: RegExp[] = [];
  for (const pattern of patterns) {
    try {
      results.push(new RegExp(pattern));
    } catch {
      // Ignore invalid regex patterns
    }
  }
  return results;
}

function resolveOptions(raw: Record<string, unknown>): RepeatedSpacingOptions {
  const minConsecutiveSpaces =
    readNumber(raw["min-consecutive-spaces"]) ??
    readNumber(raw.minConsecutiveSpaces) ??
    DEFAULT_OPTIONS.minConsecutiveSpaces;
  const allowInStrings =
    readBoolean(raw["allow-in-strings"]) ??
    readBoolean(raw.allowInStrings) ??
    DEFAULT_OPTIONS.allowInStrings;
  const allowInComments =
    readBoolean(raw["allow-in-comments"]) ??
    readBoolean(raw.allowInComments) ??
    DEFAULT_OPTIONS.allowInComments;
  const allowAfterLineStart =
    readBoolean(raw["allow-after-line-start"]) ??
    readBoolean(raw.allowAfterLineStart) ??
    DEFAULT_OPTIONS.allowAfterLineStart;
  const allowBeforeLineEnd =
    readBoolean(raw["allow-before-line-end"]) ??
    readBoolean(raw.allowBeforeLineEnd) ??
    DEFAULT_OPTIONS.allowBeforeLineEnd;
  const allowPatterns =
    readStringArray(raw["allow-patterns"]) ?? readStringArray(raw.allowPatterns) ?? [];

  return {
    minConsecutiveSpaces: Math.max(2, Math.floor(minConsecutiveSpaces)),
    allowInStrings,
    allowInComments,
    allowAfterLineStart,
    allowBeforeLineEnd,
    allowPatterns: toRegexList(allowPatterns),
  };
}

function offsetToLineColumn(text: string, baseLine: number, baseColumn: number, offset: number) {
  const prefix = text.slice(0, offset);
  const lines = prefix.split("\n");
  if (lines.length === 1) {
    return { line: baseLine, column: baseColumn + offset };
  }

  return {
    line: baseLine + lines.length - 1,
    column: (lines[lines.length - 1] ?? "").length,
  };
}

function shouldIgnoreMatch(
  line: string,
  matchStart: number,
  matchEnd: number,
  options: RepeatedSpacingOptions
): boolean {
  if (options.allowAfterLineStart && matchStart === 0) {
    return true;
  }

  if (options.allowBeforeLineEnd && matchEnd === line.length) {
    return true;
  }

  if (options.allowPatterns.length > 0) {
    return options.allowPatterns.some((pattern) => pattern.test(line));
  }

  return false;
}

function collectIssuesForText(
  text: string,
  filePath: string,
  baseLine: number,
  baseColumn: number,
  severity: Exclude<RuleSeverity, "off">,
  options: RepeatedSpacingOptions,
  contextLabel: string
): LintIssue[] {
  if (!text.includes("  ")) {
    return [];
  }

  const issues: LintIssue[] = [];
  const spaceRegex = new RegExp(` {${options.minConsecutiveSpaces},}`, "g");
  const lines = text.split("\n");
  let offset = 0;

  for (const line of lines) {
    let match: RegExpExecArray | null = spaceRegex.exec(line);
    while (match) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (!shouldIgnoreMatch(line, start, end, options)) {
        const pos = offsetToLineColumn(text, baseLine, baseColumn, offset + start);
        const excerpt = line.trim();
        issues.push({
          ruleId: "north/repeated-spacing-pattern",
          ruleKey: "repeated-spacing-pattern",
          severity,
          message: `Avoid ${match[0].length} consecutive spaces in ${contextLabel}`,
          filePath,
          line: pos.line + 1,
          column: pos.column + 1,
          note: excerpt.length > 0 ? `Excerpt: "${excerpt}"` : undefined,
        });
      }

      match = spaceRegex.exec(line);
    }

    offset += line.length + 1;
    spaceRegex.lastIndex = 0;
  }

  return issues;
}

export function extractRepeatedSpacingIssues(
  source: string,
  filePath: string,
  severity: Exclude<RuleSeverity, "off">,
  rawOptions: Record<string, unknown> = {}
): LintIssue[] {
  const options = resolveOptions(rawOptions);
  const root = parse(Lang.Tsx, source).root();
  const issues: LintIssue[] = [];

  if (!options.allowInStrings) {
    const stringFragments = root.findAll({ rule: { kind: "string_fragment" } });
    for (const fragment of stringFragments) {
      const range = fragment.range();
      issues.push(
        ...collectIssuesForText(
          fragment.text(),
          filePath,
          range.start.line,
          range.start.column,
          severity,
          options,
          "string literal"
        )
      );
    }
  }

  const jsxTexts = root.findAll({ rule: { kind: "jsx_text" } });
  for (const textNode of jsxTexts) {
    const range = textNode.range();
    issues.push(
      ...collectIssuesForText(
        textNode.text(),
        filePath,
        range.start.line,
        range.start.column,
        severity,
        options,
        "JSX text"
      )
    );
  }

  if (!options.allowInComments) {
    const comments = root.findAll({ rule: { kind: "comment" } });
    for (const comment of comments) {
      const range = comment.range();
      issues.push(
        ...collectIssuesForText(
          comment.text(),
          filePath,
          range.start.line,
          range.start.column,
          severity,
          options,
          "comment"
        )
      );
    }
  }

  return issues;
}
