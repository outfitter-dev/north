import chalk from "chalk";
import type { Candidate, LintIssue, LintReport } from "./types.ts";

function formatLocation(issue: LintIssue): string {
  return `${issue.filePath}:${issue.line}:${issue.column}`;
}

function formatIssueLine(issue: LintIssue): string {
  const symbol = issue.severity === "error" ? chalk.red("✗") : chalk.yellow("⚠");
  const ruleLabel = chalk.dim(`[${issue.ruleId}]`);
  const location = chalk.cyan(formatLocation(issue));
  return `${symbol} ${location} ${ruleLabel} ${issue.message}`;
}

function formatIssueDetail(issue: LintIssue): string[] {
  const lines: string[] = [];

  if (issue.className) {
    lines.push(chalk.dim(`  class: ${issue.className}`));
  }

  if (issue.context) {
    lines.push(chalk.dim(`  context: ${issue.context}`));
  }

  if (issue.note) {
    const noteLines = issue.note.split("\n").map((line) => line.trim());
    if (noteLines.length > 0) {
      lines.push(chalk.dim("  note:"));
      for (const noteLine of noteLines) {
        if (noteLine.length === 0) {
          continue;
        }
        lines.push(chalk.dim(`    ${noteLine}`));
      }
    }
  }

  return lines;
}

function formatCandidates(candidates: Candidate[]): string[] {
  if (candidates.length === 0) {
    return [];
  }

  const lines: string[] = [];
  lines.push(chalk.bold.blue(`Candidates for promotion (${candidates.length}):`));
  lines.push("");

  for (const candidate of candidates) {
    const location = chalk.cyan(`${candidate.filePath}:${candidate.line}`);
    const pattern = chalk.yellow(candidate.pattern);
    lines.push(`  ${location} ${pattern}`);
    if (candidate.occurrences > 0) {
      lines.push(chalk.dim(`    occurrences: ${candidate.occurrences}`));
    }
    lines.push(chalk.dim(`    suggestion: ${candidate.suggestion}`));
    lines.push("");
  }

  return lines;
}

export function formatLintReport(report: LintReport): string {
  const lines: string[] = [];
  const { errors, warnings, info } = report.summary;
  const deviationCount = report.deviations.length;
  const candidateCount = report.candidates.length;

  if (report.issues.length === 0) {
    const successMessage = chalk.bold.green("✓ No lint issues found");
    const annotations: string[] = [];
    if (deviationCount > 0) {
      annotations.push(`${deviationCount} deviations`);
    }
    if (candidateCount > 0) {
      annotations.push(`${candidateCount} candidates`);
    }
    if (annotations.length > 0) {
      lines.push(`${successMessage} ${chalk.dim(`(${annotations.join(", ")})`)}`);
    } else {
      lines.push(successMessage);
    }
    // Still show candidates even when no issues
    if (candidateCount > 0) {
      lines.push("");
      lines.push(...formatCandidates(report.candidates));
    }
    return lines.join("\n");
  }

  let summaryLine = `Found ${report.issues.length} issues (${errors} errors, ${warnings} warnings, ${info} info)`;
  if (deviationCount > 0) {
    summaryLine += chalk.dim(` [${deviationCount} deviations]`);
  }
  lines.push(chalk.bold(summaryLine));
  lines.push("");

  for (const issue of report.issues) {
    lines.push(formatIssueLine(issue));
    lines.push(...formatIssueDetail(issue));
    lines.push("");
  }

  // Add candidates section if any exist
  if (candidateCount > 0) {
    lines.push(...formatCandidates(report.candidates));
  }

  return lines.join("\n");
}
