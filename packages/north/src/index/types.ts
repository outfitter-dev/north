import type { LintContext } from "../lint/types.ts";

export interface IndexStats {
  fileCount: number;
  cssFileCount: number;
  tokenCount: number;
  usageCount: number;
  patternCount: number;
  tokenGraphCount: number;
  classSiteCount: number;
}

export interface IndexBuildResult {
  indexPath: string;
  sourceHash: string;
  stats: IndexStats;
}

export interface IndexStatus {
  indexPath: string;
  exists: boolean;
  meta: Record<string, string>;
  counts: {
    tokens: number;
    usages: number;
    patterns: number;
    tokenGraph: number;
  };
}

export interface IndexFreshness {
  fresh: boolean;
  expected?: string;
  actual?: string;
}

export interface TokenRecord {
  name: string;
  value: string;
  file: string;
  line: number;
  layer?: number | null;
  computedValue?: string | null;
  references: string[];
}

export interface UsageRecord {
  file: string;
  line: number;
  column: number;
  className: string;
  resolvedToken?: string | null;
  context: LintContext;
  component?: string | null;
}
