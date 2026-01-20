/**
 * Schema version guards for the north index database.
 *
 * The index database schema evolves over time. This module provides utilities
 * to check schema versions and gracefully handle older indexes that may not
 * have all tables/features available.
 *
 * @see schema.ts for current schema version and table definitions
 */

import type { IndexDatabase } from "./db.ts";
import { SCHEMA_VERSION } from "./schema.ts";

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a schema version check.
 */
export interface SchemaCheck {
  /** Whether the schema version meets requirements */
  valid: boolean;
  /** The version found in the database (0 if no version found) */
  currentVersion: number;
  /** The minimum required version */
  requiredVersion: number;
  /** Human-readable message if invalid */
  message?: string;
}

/**
 * Error thrown when schema version requirements are not met.
 */
export class SchemaVersionError extends Error {
  readonly check: SchemaCheck;

  constructor(message: string, check: SchemaCheck) {
    super(message);
    this.name = "SchemaVersionError";
    this.check = check;
  }
}

// ============================================================================
// Feature Version Map
// ============================================================================

/**
 * Maps features to the minimum schema version that supports them.
 *
 * Use this to check if a feature is available before querying related tables.
 *
 * @example
 * ```ts
 * if (featureAvailable(schemaVersion, "tokenThemes")) {
 *   // Safe to query token_themes table
 * }
 * ```
 */
export const FEATURE_VERSIONS = {
  /** Core tokens table (v1+) */
  tokens: 1,
  /** Usages table (v1+) */
  usages: 1,
  /** Patterns table (v1+) */
  patterns: 1,
  /** Token graph relationships (v1+) */
  tokenGraph: 1,
  /** Theme variants (light/dark) for tokens (v2+) */
  tokenThemes: 2,
  /** Component composition graph (v2+) */
  componentGraph: 2,
} as const;

export type FeatureName = keyof typeof FEATURE_VERSIONS;

// ============================================================================
// Version Checking Functions
// ============================================================================

/**
 * Check if the database schema version meets requirements.
 *
 * @param db - The index database to check
 * @param minVersion - Minimum required version (defaults to current SCHEMA_VERSION)
 * @returns SchemaCheck result with validity and version information
 *
 * @example
 * ```ts
 * const check = checkSchemaVersion(db);
 * if (!check.valid) {
 *   console.error(check.message);
 *   return;
 * }
 * ```
 */
export function checkSchemaVersion(db: IndexDatabase, minVersion = SCHEMA_VERSION): SchemaCheck {
  try {
    const row = db
      .prepare<[], { value: string }>("SELECT value FROM meta WHERE key = 'schema_version'")
      .get();

    const currentVersion = row ? Number.parseInt(row.value, 10) : 0;

    if (Number.isNaN(currentVersion)) {
      return {
        valid: false,
        currentVersion: 0,
        requiredVersion: minVersion,
        message: `Index has invalid schema version. Run 'north index' to rebuild.`,
      };
    }

    if (currentVersion < minVersion) {
      return {
        valid: false,
        currentVersion,
        requiredVersion: minVersion,
        message: `Index schema v${currentVersion} is outdated. Required: v${minVersion}. Run 'north index' to rebuild.`,
      };
    }

    return {
      valid: true,
      currentVersion,
      requiredVersion: minVersion,
    };
  } catch {
    // Table doesn't exist or other error - treat as v0
    return {
      valid: false,
      currentVersion: 0,
      requiredVersion: minVersion,
      message: `Index has no schema version (likely v0). Run 'north index' to rebuild.`,
    };
  }
}

/**
 * Require the database schema version to meet requirements, throwing if not.
 *
 * @param db - The index database to check
 * @param minVersion - Minimum required version (defaults to current SCHEMA_VERSION)
 * @throws SchemaVersionError if version requirements are not met
 *
 * @example
 * ```ts
 * try {
 *   requireSchemaVersion(db);
 *   // Safe to proceed with queries
 * } catch (error) {
 *   if (error instanceof SchemaVersionError) {
 *     console.error(error.check.message);
 *   }
 * }
 * ```
 */
export function requireSchemaVersion(db: IndexDatabase, minVersion = SCHEMA_VERSION): void {
  const check = checkSchemaVersion(db, minVersion);
  if (!check.valid) {
    throw new SchemaVersionError(check.message ?? "Schema version requirement not met", check);
  }
}

/**
 * Check if a specific feature is available in the given schema version.
 *
 * @param schemaVersion - The current schema version
 * @param feature - The feature to check
 * @returns true if the feature is available
 *
 * @example
 * ```ts
 * const check = checkSchemaVersion(db);
 * if (featureAvailable(check.currentVersion, "tokenThemes")) {
 *   const themes = db.prepare("SELECT * FROM token_themes...").all();
 * }
 * ```
 */
export function featureAvailable(schemaVersion: number, feature: FeatureName): boolean {
  return schemaVersion >= FEATURE_VERSIONS[feature];
}

/**
 * Get the minimum schema version from the database without requiring a specific version.
 *
 * Useful for informational purposes or when you want to check version
 * before deciding how to proceed.
 *
 * @param db - The index database
 * @returns The schema version, or 0 if not found/invalid
 */
export function getSchemaVersion(db: IndexDatabase): number {
  try {
    const row = db
      .prepare<[], { value: string }>("SELECT value FROM meta WHERE key = 'schema_version'")
      .get();

    if (!row) return 0;

    const version = Number.parseInt(row.value, 10);
    return Number.isNaN(version) ? 0 : version;
  } catch {
    return 0;
  }
}
