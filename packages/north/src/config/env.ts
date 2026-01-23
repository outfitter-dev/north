import { access } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";

export const DEFAULT_NORTH_DIR = ".north";
export const LEGACY_NORTH_DIR = "north";

export const DEFAULT_CONFIG_FILE = "config.yaml";
export const LEGACY_CONFIG_FILE = "north.config.yaml";

export const DEFAULT_STATE_DIR = "state";
export const DEFAULT_TOKENS_DIR = "tokens";
export const DEFAULT_RULES_DIR = "rules";
export const DEFAULT_PRESETS_DIR = "presets";
export const DEFAULT_REPORTS_DIR = "reports";

export const DEFAULT_CONFIG_PATHS = [
  `${DEFAULT_NORTH_DIR}/${DEFAULT_CONFIG_FILE}`,
  `${LEGACY_NORTH_DIR}/${LEGACY_CONFIG_FILE}`,
];

export const CONFIG_ENV_VAR = "NORTH_CONFIG";

export interface NorthPaths {
  cwd: string;
  configPath: string;
  configDir: string;
  projectRoot: string;
  northDir: string;
  stateDir: string;
  tokensDir: string;
  rulesDir: string;
  presetsDir: string;
  reportsDir: string;
  generatedTokensPath: string;
  baseTokensPath: string;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function isNorthDir(dirPath: string): boolean {
  const base = basename(dirPath);
  return base === DEFAULT_NORTH_DIR || base === LEGACY_NORTH_DIR;
}

export function resolveNorthPaths(configPath: string, cwd: string = process.cwd()): NorthPaths {
  const configDir = dirname(configPath);
  const projectRoot = isNorthDir(configDir) ? dirname(configDir) : configDir;
  const northDir = isNorthDir(configDir) ? configDir : resolve(configDir, DEFAULT_NORTH_DIR);
  const stateDir = resolve(northDir, DEFAULT_STATE_DIR);
  const tokensDir = resolve(northDir, DEFAULT_TOKENS_DIR);
  const rulesDir = resolve(northDir, DEFAULT_RULES_DIR);
  const presetsDir = resolve(northDir, DEFAULT_PRESETS_DIR);
  const reportsDir = resolve(northDir, DEFAULT_REPORTS_DIR);

  return {
    cwd,
    configPath,
    configDir,
    projectRoot,
    northDir,
    stateDir,
    tokensDir,
    rulesDir,
    presetsDir,
    reportsDir,
    generatedTokensPath: resolve(tokensDir, "generated.css"),
    baseTokensPath: resolve(tokensDir, "base.css"),
  };
}

export async function findConfigFile(
  startDir: string,
  configFileName: string = DEFAULT_CONFIG_FILE
): Promise<string | null> {
  let currentDir = resolve(startDir);
  const root = resolve("/");

  const candidates =
    configFileName === DEFAULT_CONFIG_FILE
      ? DEFAULT_CONFIG_PATHS
      : [`${DEFAULT_NORTH_DIR}/${configFileName}`, `${LEGACY_NORTH_DIR}/${configFileName}`];

  while (currentDir !== root) {
    for (const candidate of candidates) {
      const configPath = resolve(currentDir, candidate);
      if (await fileExists(configPath)) {
        return configPath;
      }
    }
    currentDir = dirname(currentDir);
  }

  return null;
}

export async function resolveConfigPath(cwd: string, override?: string): Promise<string | null> {
  if (override) {
    return isAbsolute(override) ? override : resolve(cwd, override);
  }

  const envOverride = process.env[CONFIG_ENV_VAR];
  if (envOverride) {
    return isAbsolute(envOverride) ? envOverride : resolve(cwd, envOverride);
  }

  return await findConfigFile(cwd);
}
