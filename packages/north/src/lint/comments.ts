import type { Deviation } from "./types.ts";

// ============================================================================
// Comment Parsing for @north-deviation
// ============================================================================

/**
 * Regex to match @north-deviation block comments.
 * Format:
 * /* @north-deviation
 *  * rule: rule-name
 *  * reason: explanation
 *  * ticket: JIRA-123 (optional)
 *  * count: 3 (optional, defaults to 1)
 * *\/
 */
const DEVIATION_BLOCK_REGEX = /\/\*\s*@north-deviation\s*\n([\s\S]*?)(?:\*\/)/g;

/**
 * Regex to match single-line @north-deviation comments.
 * Format: // @north-deviation rule=rule-name reason="explanation"
 */
const DEVIATION_LINE_REGEX =
  /\/\/\s*@north-deviation\s+rule=(\S+)\s+reason="([^"]+)"(?:\s+ticket=(\S+))?(?:\s+count=(\d+))?/g;

interface DeviationField {
  rule?: string;
  reason?: string;
  ticket?: string;
  count?: number;
}

function parseBlockFields(content: string): DeviationField {
  const fields: DeviationField = {};

  // Parse YAML-like fields from block comment content
  const lines = content.split("\n");
  for (const line of lines) {
    // Remove leading asterisks and whitespace
    const cleaned = line.replace(/^\s*\*?\s*/, "").trim();
    if (!cleaned) continue;

    const colonIndex = cleaned.indexOf(":");
    if (colonIndex === -1) continue;

    const key = cleaned.slice(0, colonIndex).trim().toLowerCase();
    const value = cleaned.slice(colonIndex + 1).trim();

    switch (key) {
      case "rule":
        fields.rule = value;
        break;
      case "reason":
        fields.reason = value;
        break;
      case "ticket":
        fields.ticket = value;
        break;
      case "count":
        fields.count = Number.parseInt(value, 10) || 1;
        break;
    }
  }

  return fields;
}

function getLineNumber(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

/**
 * Parse @north-deviation comments from source code.
 * Supports both block comments and single-line comments.
 *
 * A deviation on line N covers violations on lines N+1 through N+count.
 */
export function parseDeviations(source: string, filePath: string): Deviation[] {
  const deviations: Deviation[] = [];

  // Parse block comments using matchAll (modern pattern that avoids assignment in expression)
  for (const match of source.matchAll(DEVIATION_BLOCK_REGEX)) {
    const fields = parseBlockFields(match[1] ?? "");
    if (fields.rule && fields.reason) {
      // Calculate end line by counting newlines in the block comment
      const startLine = getLineNumber(source, match.index ?? 0);
      const newlinesInMatch = (match[0].match(/\n/g) || []).length;
      const endLine = startLine + newlinesInMatch;
      deviations.push({
        rule: fields.rule,
        reason: fields.reason,
        ticket: fields.ticket,
        count: fields.count ?? 1,
        line: endLine,
        filePath,
      });
    }
  }

  // Parse single-line comments
  for (const match of source.matchAll(DEVIATION_LINE_REGEX)) {
    const line = getLineNumber(source, match.index ?? 0);
    deviations.push({
      rule: match[1] ?? "",
      reason: match[2] ?? "",
      ticket: match[3],
      count: match[4] ? Number.parseInt(match[4], 10) : 1,
      line,
      filePath,
    });
  }

  return deviations;
}

/**
 * Check if an issue is covered by a deviation.
 * A deviation on line N covers issues on lines N+1 through N+count.
 */
export function isIssueCoveredByDeviation(
  issueRule: string,
  issueLine: number,
  deviations: Deviation[]
): Deviation | null {
  for (const deviation of deviations) {
    const startLine = deviation.line + 1;
    const endLine = deviation.line + deviation.count;

    // Normalize rule names for comparison (strip north/ prefix)
    const normalizedIssueRule = issueRule.replace(/^north\//, "");
    const normalizedDeviationRule = deviation.rule.replace(/^north\//, "");

    if (
      normalizedIssueRule === normalizedDeviationRule &&
      issueLine >= startLine &&
      issueLine <= endLine
    ) {
      return deviation;
    }
  }

  return null;
}
