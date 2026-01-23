import type { Candidate, Deviation, DeviationGroup } from "./types.ts";

// ============================================================================
// Deviation Tracking and Aggregation
// ============================================================================

/**
 * Result of deviation aggregation analysis.
 */
export interface DeviationAnalysis {
  groups: DeviationGroup[];
  suggestedCandidates: Candidate[];
}

/** Threshold for suggesting promotion to @north-candidate */
export const DEFAULT_PROMOTION_THRESHOLD = 3;

/**
 * Aggregate deviations by rule and reason to identify repeated patterns.
 * If the same rule+reason combination appears 3+ times, suggest promoting
 * to a @north-candidate pattern.
 */
export function aggregateDeviations(
  deviations: Deviation[],
  promotionThreshold: number = DEFAULT_PROMOTION_THRESHOLD
): DeviationAnalysis {
  // Group deviations by rule+reason
  const groupMap = new Map<string, DeviationGroup>();

  for (const deviation of deviations) {
    const key = `${deviation.rule}::${deviation.reason}`;
    const existing = groupMap.get(key);

    if (existing) {
      existing.count += deviation.count;
      existing.locations.push({
        filePath: deviation.filePath,
        line: deviation.line,
      });
    } else {
      groupMap.set(key, {
        rule: deviation.rule,
        reason: deviation.reason,
        count: deviation.count,
        locations: [{ filePath: deviation.filePath, line: deviation.line }],
      });
    }
  }

  const groups = Array.from(groupMap.values()).sort((a, b) => b.count - a.count);

  // Suggest candidates for groups that meet the threshold
  const suggestedCandidates: Candidate[] = groups
    .filter((group) => group.count >= promotionThreshold)
    .map((group) => ({
      pattern: `${group.rule}-deviation`,
      occurrences: group.count,
      suggestion: `Consider extracting "${group.reason}" pattern to a reusable utility or updating the rule`,
      filePath: group.locations[0]?.filePath ?? "",
      line: group.locations[0]?.line ?? 0,
    }));

  return {
    groups,
    suggestedCandidates,
  };
}

/**
 * Format deviation groups as a histogram for display.
 */
export function formatDeviationHistogram(groups: DeviationGroup[]): string[] {
  if (groups.length === 0) {
    return [];
  }

  const lines: string[] = [];
  const maxCount = Math.max(...groups.map((g) => g.count));
  const barWidth = 20;

  for (const group of groups) {
    const barLength = Math.ceil((group.count / maxCount) * barWidth);
    const bar = "#".repeat(barLength).padEnd(barWidth);
    lines.push(`  ${group.count.toString().padStart(3)} ${bar} ${group.rule}`);
    lines.push(`      ${group.reason}`);
  }

  return lines;
}
