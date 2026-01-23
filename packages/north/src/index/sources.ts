import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { glob } from "glob";
import type { NorthPaths } from "../config/env.ts";
import type { NorthConfig } from "../config/schema.ts";
import { getIndexIgnorePatterns } from "../lint/ignores.ts";

export interface SourceFiles {
  configPath: string;
  tsxFiles: string[];
  cssFiles: string[];
  allFiles: string[];
}

export function resolveIndexPath(paths: NorthPaths, config: NorthConfig): string {
  const indexPath = config.index?.path ?? "state/index.db";
  return resolve(paths.northDir, indexPath);
}

export async function collectSourceFiles(
  projectRoot: string,
  configPath: string
): Promise<SourceFiles> {
  const ignorePatterns = getIndexIgnorePatterns();

  const [tsxFiles, cssFiles] = await Promise.all([
    glob("**/*.{tsx,jsx}", {
      cwd: projectRoot,
      absolute: true,
      nodir: true,
      ignore: ignorePatterns,
    }),
    glob("**/*.css", {
      cwd: projectRoot,
      absolute: true,
      nodir: true,
      ignore: ignorePatterns,
    }),
  ]);

  const allFiles = Array.from(new Set([configPath, ...tsxFiles, ...cssFiles])).sort();

  return {
    configPath,
    tsxFiles: [...tsxFiles].sort(),
    cssFiles: [...cssFiles].sort(),
    allFiles,
  };
}

export async function computeSourceHash(files: string[], cwd: string): Promise<string> {
  const hash = createHash("sha256");
  const sorted = [...files].sort();

  for (const file of sorted) {
    const content = await readFile(file, "utf-8");
    const relPath = relative(cwd, file).replace(/\\/g, "/");
    hash.update(relPath);
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }

  return `sha256:${hash.digest("hex")}`;
}
