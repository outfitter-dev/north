import chalk from "chalk";
import type { LintIssue, LintReport } from "./types.ts";

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

export function formatLintReport(report: LintReport): string {
  const lines: string[] = [];
  const { errors, warnings, info } = report.summary;
  const deviationCount = report.deviations.length;

  if (report.issues.length === 0) {
    const successMessage = chalk.bold.green("✓ No lint issues found");
    if (deviationCount > 0) {
      lines.push(`${successMessage} ${chalk.dim(`(${deviationCount} deviations acknowledged)`)}`);
    } else {
      lines.push(successMessage);
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

  return lines.join("\n");
}
