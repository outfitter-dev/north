import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { parse as parseYAML } from "yaml";
import { applyDefaults } from "./defaults.ts";
import { findConfigFile } from "./env.ts";
import { type NorthConfig, type RegistryConfig, validateConfig } from "./schema.ts";

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

type ConfigSource =
  | { type: "file"; id: string; path: string }
  | { type: "url"; id: string; url: string };

const DEFAULT_PRESET_FILES = ["north.config.yaml", "north.config.yml", "north.config.json"];

function isUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function isWindowsAbsolutePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value);
}

function isFileReference(value: string): boolean {
  return value.startsWith(".") || value.startsWith("/") || isWindowsAbsolutePath(value);
}

function looksLikeConfigFile(value: string): boolean {
  return /\.(ya?ml|json)$/i.test(value);
}

function normalizeExtends(extendsValue: NorthConfig["extends"]): string[] {
  if (!extendsValue) return [];
  return Array.isArray(extendsValue) ? extendsValue : [extendsValue];
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function parsePackageReference(value: string): { packageName: string; subpath?: string } {
  if (value.startsWith("@")) {
    const parts = value.split("/");
    const packageName = parts.slice(0, 2).join("/");
    const subpath = parts.slice(2).join("/");
    return { packageName, subpath: subpath || undefined };
  }

  const [packageName = value, ...rest] = value.split("/");
  const subpath = rest.join("/");
  return { packageName, subpath: subpath || undefined };
}

async function resolvePackageConfigPath(
  value: string,
  baseDir: string
): Promise<{ success: true; path: string } | { success: false; error: Error }> {
  const { packageName, subpath } = parsePackageReference(value);
  const requireFromBase = createRequire(resolve(baseDir, "package.json"));

  let packageJsonPath: string;
  try {
    packageJsonPath = requireFromBase.resolve(`${packageName}/package.json`);
  } catch (error) {
    return {
      success: false,
      error: new Error(
        `Unable to resolve npm package "${packageName}" from ${baseDir}: ${
          error instanceof Error ? error.message : String(error)
        }`
      ),
    };
  }

  const packageRoot = dirname(packageJsonPath);

  if (subpath) {
    const resolved = resolve(packageRoot, subpath);
    if (await fileExists(resolved)) {
      return { success: true, path: resolved };
    }
    return {
      success: false,
      error: new Error(`Preset path not found: ${resolved}`),
    };
  }

  let packageJson: { north?: unknown } | null = null;
  try {
    const content = await readFile(packageJsonPath, "utf-8");
    packageJson = JSON.parse(content) as { north?: unknown };
  } catch (error) {
    return {
      success: false,
      error: new Error(
        `Failed to read ${packageName} package.json: ${
          error instanceof Error ? error.message : String(error)
        }`
      ),
    };
  }

  const northField = packageJson?.north;
  const candidatePaths: string[] = [];
  if (typeof northField === "string") {
    candidatePaths.push(northField);
  } else if (northField && typeof northField === "object") {
    const configPath = (northField as { config?: unknown; preset?: unknown; path?: unknown })
      .config;
    const presetPath = (northField as { config?: unknown; preset?: unknown; path?: unknown })
      .preset;
    const genericPath = (northField as { config?: unknown; preset?: unknown; path?: unknown }).path;
    if (typeof configPath === "string") candidatePaths.push(configPath);
    if (typeof presetPath === "string") candidatePaths.push(presetPath);
    if (typeof genericPath === "string") candidatePaths.push(genericPath);
  }

  const resolvedCandidates = (
    candidatePaths.length > 0 ? candidatePaths : DEFAULT_PRESET_FILES
  ).map((candidate) => resolve(packageRoot, candidate));

  for (const candidate of resolvedCandidates) {
    if (await fileExists(candidate)) {
      return { success: true, path: candidate };
    }
  }

  return {
    success: false,
    error: new Error(
      `No north config found in "${packageName}". Looked for ${resolvedCandidates
        .map((candidate) => `"${candidate}"`)
        .join(", ")}`
    ),
  };
}

function resolveRegistryUrl(value: string, registry?: RegistryConfig): string | null {
  if (!registry?.url) return null;
  const name =
    registry.namespace && !value.startsWith(registry.namespace)
      ? `${registry.namespace}/${value}`
      : value;

  if (registry.url.includes("{name}")) {
    return registry.url.replace("{name}", name);
  }

  const trimmed = registry.url.endsWith("/") ? registry.url.slice(0, -1) : registry.url;
  return `${trimmed}/${name}.json`;
}

async function resolveExtendsSource(
  extendsPath: string,
  configPath: string,
  registry?: RegistryConfig
): Promise<{ success: true; source: ConfigSource } | { success: false; error: Error }> {
  if (isUrl(extendsPath)) {
    return {
      success: true,
      source: {
        type: "url",
        id: extendsPath,
        url: extendsPath,
      },
    };
  }

  if (isFileReference(extendsPath)) {
    if (isUrl(configPath)) {
      const url = new URL(extendsPath, configPath).toString();
      return {
        success: true,
        source: { type: "url", id: url, url },
      };
    }

    const baseDir = dirname(configPath);
    const resolved = resolve(baseDir, extendsPath);
    return {
      success: true,
      source: { type: "file", id: resolved, path: resolved },
    };
  }

  const baseDir = isUrl(configPath) ? process.cwd() : dirname(configPath);

  if (!isUrl(configPath) && looksLikeConfigFile(extendsPath)) {
    const resolved = resolve(baseDir, extendsPath);
    if (await fileExists(resolved)) {
      return {
        success: true,
        source: { type: "file", id: resolved, path: resolved },
      };
    }
  }

  const packageResult = await resolvePackageConfigPath(extendsPath, baseDir);
  if (packageResult.success) {
    return {
      success: true,
      source: { type: "file", id: packageResult.path, path: packageResult.path },
    };
  }

  const registryUrl = resolveRegistryUrl(extendsPath, registry);
  if (registryUrl) {
    return {
      success: true,
      source: { type: "url", id: registryUrl, url: registryUrl },
    };
  }

  return {
    success: false,
    error: new Error(
      `Unable to resolve extends "${extendsPath}" as file path, npm package, or registry URL. ${packageResult.error.message}`
    ),
  };
}

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

async function readConfigUrl(
  url: string
): Promise<{ success: true; data: unknown } | { success: false; error: ConfigLoadError }> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return {
        success: false,
        error: new ConfigLoadError(
          `Failed to fetch config: ${response.status} ${response.statusText}`,
          url
        ),
      };
    }
    const content = await response.text();
    const data = parseYAML(content);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: new ConfigLoadError(
        `Failed to fetch config: ${error instanceof Error ? error.message : String(error)}`,
        url,
        error
      ),
    };
  }
}

async function readConfigSource(
  source: ConfigSource
): Promise<{ success: true; data: unknown } | { success: false; error: ConfigLoadError }> {
  if (source.type === "url") {
    return readConfigUrl(source.url);
  }

  return readConfigFile(source.path);
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

  try {
    const extendsEntries = normalizeExtends(config.extends);

    // No extends, return as-is
    if (extendsEntries.length === 0) {
      return { success: true, config };
    }

    let mergedParent: Partial<NorthConfig> | null = null;

    for (const extendsPath of extendsEntries) {
      const resolvedSource = await resolveExtendsSource(extendsPath, configPath, config.registry);
      if (!resolvedSource.success) {
        return {
          success: false,
          error: new ConfigExtendsError(
            resolvedSource.error.message,
            configPath,
            extendsPath,
            resolvedSource.error
          ),
        };
      }

      const parentResult = await readConfigSource(resolvedSource.source);
      if (!parentResult.success) {
        return {
          success: false,
          error: new ConfigExtendsError(
            `Failed to load extended config: ${parentResult.error.message}`,
            configPath,
            extendsPath,
            parentResult.error
          ),
        };
      }

      const parentValidation = validateConfig(parentResult.data);
      if (!parentValidation.success) {
        return {
          success: false,
          error: new ConfigExtendsError(
            `Extended config is invalid: ${parentValidation.error.message}`,
            configPath,
            extendsPath,
            parentValidation.error
          ),
        };
      }

      const resolvedParentResult = await resolveExtends(
        parentValidation.data,
        resolvedSource.source.id,
        visitedPaths
      );

      if (!resolvedParentResult.success) {
        return resolvedParentResult;
      }

      mergedParent = mergeConfigs(mergedParent ?? {}, resolvedParentResult.config);
    }

    const merged = mergeConfigs(mergedParent ?? {}, config);
    return { success: true, config: merged };
  } finally {
    visitedPaths.delete(configPath);
  }
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

    // Compatibility: child overrides
    compatibility: child.compatibility ?? parent.compatibility,

    // Lint: child overrides
    lint: child.lint ?? parent.lint,

    // Index: child overrides
    index: {
      ...(parent.index ?? {}),
      ...(child.index ?? {}),
    },
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
export { findConfigFile };
