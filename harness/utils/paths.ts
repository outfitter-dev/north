import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const HARNESS_ROOT = resolve(here, "..");
export const REPO_ROOT = resolve(HARNESS_ROOT, "..");

export function repoPath(...segments: string[]) {
  return resolve(REPO_ROOT, ...segments);
}

export function harnessPath(...segments: string[]) {
  return resolve(HARNESS_ROOT, ...segments);
}
