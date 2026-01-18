export type RuleSeverity = "error" | "warn" | "info" | "off";

export type LintContext = "primitive" | "composed" | "layout";

export interface LoadedRule {
  id: string;
  key: string;
  message: string;
  severity: RuleSeverity;
  note?: string;
  regex?: RegExp;
  sourcePath: string;
}

export interface LintIssue {
  ruleId: string;
  ruleKey: string;
  severity: Exclude<RuleSeverity, "off">;
  message: string;
  filePath: string;
  line: number;
  column: number;
  className?: string;
  note?: string;
  context?: LintContext;
}

export interface LintSummary {
  errors: number;
  warnings: number;
  info: number;
}

export interface LintStats {
  totalFiles: number;
  filesWithClasses: number;
  filesWithNonLiteral: number;
  extractedClassCount: number;
  classSites: number;
  coveragePercent: number;
}

export interface LintReport {
  summary: LintSummary;
  issues: LintIssue[];
  stats: LintStats;
  rules: LoadedRule[];
}

export interface ClassToken {
  value: string;
  filePath: string;
  line: number;
  column: number;
  context: LintContext;
}

export interface ClassSite {
  filePath: string;
  line: number;
  column: number;
  context: LintContext;
  classes: string[];
}

export interface NonLiteralSite {
  filePath: string;
  line: number;
  column: number;
  context: LintContext;
}

export interface ExtractionResult {
  tokens: ClassToken[];
  sites: ClassSite[];
  nonLiteralSites: NonLiteralSite[];
  classSites: number;
}
