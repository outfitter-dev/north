/**
 * Git Utilities - Shared git operations
 *
 * This module extracts common git operations used across MCP tools and CLI commands.
 * Centralizes git interactions to ensure consistent error handling and behavior.
 *
 * @see PR #106 for context on DRY cleanup
 */

import { resolve } from "node:path";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for getStagedFiles.
 */
export interface GetStagedFilesOptions {
  /**
   * Filter to only include files matching these extensions.
   * If not provided, all staged files are returned.
   *
   * @example [".tsx", ".jsx"]
   */
  extensions?: string[];

  /**
   * Whether to return absolute paths.
   * Default: true
   */
  absolute?: boolean;
}

/**
 * Error thrown when git operations fail.
 */
export class GitError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "GitError";
  }
}

// ============================================================================
// Staged Files
// ============================================================================

/**
 * Get list of staged files from git.
 *
 * Uses `git diff --cached` to find files that are staged for commit.
 * Only includes files that are Added, Copied, Modified, or Renamed (ACMR).
 *
 * @example Basic usage
 * ```ts
 * const files = getStagedFiles("/path/to/repo");
 * // ["/path/to/repo/src/file1.ts", "/path/to/repo/src/file2.ts"]
 * ```
 *
 * @example Filter by extension
 * ```ts
 * const tsxFiles = getStagedFiles("/path/to/repo", { extensions: [".tsx", ".jsx"] });
 * // Only returns .tsx and .jsx files
 * ```
 *
 * @param cwd - Working directory (must be inside a git repository)
 * @param options - Configuration options
 * @returns Array of file paths (absolute by default)
 * @throws GitError if git command fails
 */
export function getStagedFiles(cwd: string, options: GetStagedFilesOptions = {}): string[] {
  const { extensions, absolute = true } = options;

  const result = Bun.spawnSync(["git", "diff", "--name-only", "--cached", "--diff-filter=ACMR"], {
    cwd,
  });

  if (!result.success) {
    throw new GitError(`Git diff failed: ${result.stderr.toString()}`);
  }

  let files = result.stdout
    .toString()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  // Apply extension filter if provided
  if (extensions && extensions.length > 0) {
    const extSet = new Set(extensions.map((ext) => (ext.startsWith(".") ? ext : `.${ext}`)));
    files = files.filter((file) => {
      const ext = file.slice(file.lastIndexOf("."));
      return extSet.has(ext);
    });
  }

  // Convert to absolute paths if requested
  if (absolute) {
    files = files.map((file) => resolve(cwd, file));
  }

  return files;
}

// ============================================================================
// Repository Detection
// ============================================================================

/**
 * Check if a directory is inside a git repository.
 *
 * @param cwd - Directory to check
 * @returns True if inside a git repository
 */
export function isGitRepository(cwd: string): boolean {
  const result = Bun.spawnSync(["git", "rev-parse", "--is-inside-work-tree"], {
    cwd,
  });

  return result.success && result.stdout.toString().trim() === "true";
}

/**
 * Get the root directory of the git repository.
 *
 * @param cwd - Directory inside the repository
 * @returns Absolute path to repository root
 * @throws GitError if not inside a git repository
 */
export function getRepositoryRoot(cwd: string): string {
  const result = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], {
    cwd,
  });

  if (!result.success) {
    throw new GitError(`Not inside a git repository: ${result.stderr.toString()}`);
  }

  return result.stdout.toString().trim();
}

// ============================================================================
// Branch Information
// ============================================================================

/**
 * Get the current branch name.
 *
 * @param cwd - Repository directory
 * @returns Current branch name
 * @throws GitError if not on a branch or git command fails
 */
export function getCurrentBranch(cwd: string): string {
  const result = Bun.spawnSync(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
    cwd,
  });

  if (!result.success) {
    throw new GitError(`Failed to get current branch: ${result.stderr.toString()}`);
  }

  return result.stdout.toString().trim();
}
