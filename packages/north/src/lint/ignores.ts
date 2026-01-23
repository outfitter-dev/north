import type { NorthConfig } from "../config/schema.ts";

// ============================================================================
// Shared Ignore Patterns
// ============================================================================

/**
 * Default file patterns to ignore during linting.
 * Indexing uses these defaults only (no lint.ignore additions).
 */
export const DEFAULT_IGNORES = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.next/**",
  "**/.north/state/**",
  "**/.north/reports/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.turbo/**",
];

/**
 * Get ignore patterns by merging defaults with config-defined patterns.
 * Config patterns are additive - they extend the defaults, not replace them.
 */
export function getIgnorePatterns(config: NorthConfig): string[] {
  return [...DEFAULT_IGNORES, ...(config.lint?.ignore ?? [])];
}

/**
 * Ignore patterns for index source collection.
 * Indexing intentionally ignores lint-specific patterns so .north sources are included.
 */
export function getIndexIgnorePatterns(): string[] {
  return [...DEFAULT_IGNORES];
}
