import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parse as parseYAML } from "yaml";
import { applyDefaults } from "./defaults.ts";
import { type NorthConfig, validateConfig } from "./schema.ts";

// ============================================================================
// Error Types
// ============================================================================

export class ConfigLoadError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "ConfigLoadError";
  }
}

export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly issues: Array<{ path: string; message: string }>
  ) {
    super(message);
    this.name = "ConfigValidationError";
  }
}

export class ConfigExtendsError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly extendsPath: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "ConfigExtendsError";
  }
}

// ============================================================================
// Config Loader Result Types
// ============================================================================

export type LoadConfigResult =
  | { success: true; config: NorthConfig; filePath: string }
  | { success: false; error: ConfigLoadError | ConfigValidationError };

// ============================================================================
// Core Loader Functions
// ============================================================================

/**
 * Load and parse YAML config file
 */
async function readConfigFile(
  filePath: string
): Promise<{ success: true; data: unknown } | { success: false; error: ConfigLoadError }> {
  try {
    const content = await readFile(filePath, "utf-8");
    const data = parseYAML(content);
    return { success: true, data };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return {
        success: false,
        error: new ConfigLoadError(`Config file not found: ${filePath}`, filePath, error),
      };
    }

    return {
      success: false,
      error: new ConfigLoadError(
        `Failed to read or parse config file: ${error instanceof Error ? error.message : String(error)}`,
        filePath,
        error
      ),
    };
  }
}

/**
 * Recursively resolve extends chain
 */
async function resolveExtends(
  config: Partial<NorthConfig>,
  configPath: string,
  visitedPaths: Set<string> = new Set()
): Promise<{ success: true; config: Partial<NorthConfig> } | { success: false; error: Error }> {
  // Check for circular extends
  if (visitedPaths.has(configPath)) {
    return {
      success: false,
      error: new ConfigExtendsError(
        `Circular extends detected: ${configPath}`,
        configPath,
        configPath
      ),
    };
  }

  visitedPaths.add(configPath);

  // No extends, return as-is
  if (!config.extends) {
    return { success: true, config };
  }

  // v0.1: Only support local file paths (not npm packages or remote URLs)
  const extendsPath = config.extends;
  if (
    extendsPath.startsWith("@") ||
    extendsPath.startsWith("http://") ||
    extendsPath.startsWith("https://")
  ) {
    return {
      success: false,
      error: new ConfigExtendsError(
        `Remote extends not supported in v0.1. Use local file paths only. Got: ${extendsPath}`,
        configPath,
        extendsPath
      ),
    };
  }

  // Resolve relative path from current config directory
  const baseDir = dirname(configPath);
  const parentPath = resolve(baseDir, extendsPath);

  // Load parent config
  const parentResult = await readConfigFile(parentPath);
  if (!parentResult.success) {
    return {
      success: false,
      error: new ConfigExtendsError(
        `Failed to load extended config: ${parentResult.error.message}`,
        configPath,
        parentPath,
        parentResult.error
      ),
    };
  }

  // Validate parent config structure (loose validation, doesn't need to be complete)
  const parentValidation = validateConfig(parentResult.data);
  if (!parentValidation.success) {
    return {
      success: false,
      error: new ConfigExtendsError(
        `Extended config is invalid: ${parentValidation.error.message}`,
        configPath,
        parentPath,
        parentValidation.error
      ),
    };
  }

  // Recursively resolve parent's extends
  const resolvedParentResult = await resolveExtends(
    parentValidation.data,
    parentPath,
    visitedPaths
  );

  if (!resolvedParentResult.success) {
    return resolvedParentResult;
  }

  // Merge: child overrides parent
  const merged = mergeConfigs(resolvedParentResult.config, config);

  return { success: true, config: merged };
}

/**
 * Deep merge two configs (child overrides parent)
 */
function mergeConfigs(
  parent: Partial<NorthConfig>,
  child: Partial<NorthConfig>
): Partial<NorthConfig> {
  return {
    // extends is not inherited
    extends: child.extends ?? null,

    // Merge dials
    dials: {
      ...parent.dials,
      ...child.dials,
    },

    // Merge typography
    typography: {
      scale: child.typography?.scale ?? parent.typography?.scale,
      measure: {
        min: child.typography?.measure?.min ?? parent.typography?.measure?.min,
        max: child.typography?.measure?.max ?? parent.typography?.measure?.max,
      },
    },

    // Merge policy
    policy: {
      ...parent.policy,
      ...child.policy,
    },

    // Colors: child completely overrides parent (not deep merged)
    colors: child.colors ?? parent.colors,

    // Rules: merge individual rules
    rules: child.rules
      ? {
          ...parent.rules,
          ...child.rules,
        }
      : parent.rules,

    // Third-party: merge arrays only when either side defines it
    "third-party":
      parent["third-party"] || child["third-party"]
        ? {
            allowed: [
              ...(parent["third-party"]?.allowed ?? []),
              ...(child["third-party"]?.allowed ?? []),
            ],
            prohibited: [
              ...(parent["third-party"]?.prohibited ?? []),
              ...(child["third-party"]?.prohibited ?? []),
            ],
          }
        : undefined,

    // Registry: child overrides
    registry: child.registry ?? parent.registry,
  };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Load config from file with validation and extends resolution
 */
export async function loadConfig(filePath: string): Promise<LoadConfigResult> {
  // 1. Read and parse file
  const readResult = await readConfigFile(filePath);
  if (!readResult.success) {
    return { success: false, error: readResult.error };
  }

  // 2. Validate structure
  const validationResult = validateConfig(readResult.data);
  if (!validationResult.success) {
    return {
      success: false,
      error: new ConfigValidationError(
        validationResult.error.message,
        filePath,
        validationResult.error.issues
      ),
    };
  }

  // 3. Resolve extends chain
  const extendsResult = await resolveExtends(validationResult.data, filePath);
  if (!extendsResult.success) {
    const error = extendsResult.error;
    if (error instanceof ConfigLoadError) {
      return {
        success: false,
        error,
      };
    }
    if (error instanceof ConfigValidationError) {
      return {
        success: false,
        error,
      };
    }
    return {
      success: false,
      error: new ConfigLoadError(error.message, filePath, error),
    };
  }

  // 4. Apply defaults to any missing values
  const finalConfig = applyDefaults(extendsResult.config);

  return {
    success: true,
    config: finalConfig,
    filePath,
  };
}

/**
 * Find config file in current or parent directories
 */
export async function findConfigFile(
  startDir: string,
  configFileName = "north.config.yaml"
): Promise<string | null> {
  let currentDir = resolve(startDir);
  const root = resolve("/");

  while (currentDir !== root) {
    const configPath = resolve(currentDir, "north", configFileName);
    try {
      await readFile(configPath, "utf-8");
      return configPath;
    } catch {
      // Not found, try parent
      currentDir = dirname(currentDir);
    }
  }

  return null;
}
