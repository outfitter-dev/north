/**
 * SafeMode - Single abstraction for "safe by default, require explicit apply"
 *
 * This module provides a unified way to handle the dryRun/apply flag pattern
 * across MCP tools and CLI commands.
 *
 * ## Design Principle
 *
 * Changes only happen when `apply === true`. This is the single source of truth.
 *
 * - **MCP tools**: Only expose `apply` parameter. Never expose `dryRun`.
 * - **CLI commands**: Accept both for backwards compatibility, but derive behavior from `apply`.
 *
 * ## Problem Solved
 *
 * Previous implementation had `dryRun: false, apply: false` causing real changes,
 * which contradicted user expectations. This abstraction fixes PR #113 feedback.
 *
 * @see PR #113 for context on the dryRun/apply confusion
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Input options that can be provided by callers.
 */
export interface SafeModeOptions {
  /**
   * Explicitly set to true to apply changes.
   * Default: false (preview only)
   *
   * This is the primary flag that controls whether mutations happen.
   */
  apply?: boolean;

  /**
   * Preview changes without applying them.
   *
   * @deprecated Use `apply` instead. Only supported in CLI for backwards compatibility.
   * In MCP tools, this flag is ignored.
   */
  dryRun?: boolean;
}

/**
 * Resolved safe mode state after processing options.
 */
export interface ResolvedSafeMode {
  /**
   * Whether changes should actually be applied.
   *
   * Only true when `apply === true` was explicitly passed.
   */
  shouldApply: boolean;

  /**
   * Display label for user output.
   *
   * - "preview": No changes will be made
   * - "apply": Changes will be made
   */
  modeLabel: "preview" | "apply";
}

/**
 * Context in which safe mode is being resolved.
 */
export type SafeModeContext = "cli" | "mcp";

// ============================================================================
// Resolution Logic
// ============================================================================

/**
 * Resolve safe mode from input options.
 *
 * ## Semantics
 *
 * - `apply: true` -> `shouldApply: true` (changes happen)
 * - `apply: false` or `undefined` -> `shouldApply: false` (preview only)
 *
 * ## Context Differences
 *
 * - **MCP**: Only `apply` flag matters. `dryRun` is ignored.
 *   This ensures MCP tools have predictable behavior.
 *
 * - **CLI**: Supports legacy `dryRun` flag for backwards compatibility.
 *   `apply` takes precedence if specified. If only `dryRun` is specified,
 *   `shouldApply = !dryRun`.
 *
 * @example MCP usage
 * ```ts
 * // In MCP tool handler
 * const { shouldApply, modeLabel } = resolveSafeMode({ apply: input.apply }, "mcp");
 *
 * if (!shouldApply) {
 *   return { preview: true, changes: computeChanges() };
 * }
 *
 * // Actually apply changes
 * applyChanges();
 * ```
 *
 * @example CLI usage
 * ```ts
 * // In CLI command
 * const { shouldApply, modeLabel } = resolveSafeMode(
 *   { apply: options.apply, dryRun: options.dryRun },
 *   "cli"
 * );
 *
 * console.log(`Running in ${modeLabel} mode`);
 * ```
 *
 * @param options - Input options containing apply/dryRun flags
 * @param context - Whether this is CLI or MCP context (default: "mcp")
 * @returns Resolved safe mode state
 */
export function resolveSafeMode(
  options: SafeModeOptions,
  context: SafeModeContext = "mcp"
): ResolvedSafeMode {
  // MCP: Only apply flag matters, must be explicitly true
  if (context === "mcp") {
    const shouldApply = options.apply === true;
    return {
      shouldApply,
      modeLabel: shouldApply ? "apply" : "preview",
    };
  }

  // CLI: Support legacy dryRun flag for backwards compatibility
  // apply wins if specified, otherwise derive from dryRun
  let shouldApply: boolean;

  if (options.apply !== undefined) {
    // apply flag takes precedence
    shouldApply = options.apply;
  } else if (options.dryRun !== undefined) {
    // Derive from dryRun for backwards compatibility
    shouldApply = !options.dryRun;
  } else {
    // Safe default: preview only
    shouldApply = false;
  }

  return {
    shouldApply,
    modeLabel: shouldApply ? "apply" : "preview",
  };
}

// ============================================================================
// Helper Utilities
// ============================================================================

/**
 * Create a SafeModeOptions object for MCP tools.
 *
 * This helper ensures MCP tools only use the `apply` flag.
 *
 * @param apply - Whether to apply changes
 * @returns SafeModeOptions with only apply set
 */
export function mcpSafeMode(apply: boolean | undefined): SafeModeOptions {
  return { apply: apply === true };
}

/**
 * Assert that we're in apply mode, throwing if not.
 *
 * Useful as a guard at the start of mutation functions.
 *
 * @param mode - Resolved safe mode
 * @param operation - Description of the operation for error message
 * @throws Error if not in apply mode
 */
export function assertApplyMode(mode: ResolvedSafeMode, operation: string): void {
  if (!mode.shouldApply) {
    throw new Error(`Cannot ${operation}: not in apply mode. Set apply=true to proceed.`);
  }
}
