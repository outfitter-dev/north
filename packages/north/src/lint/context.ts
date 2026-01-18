import type { LintContext } from "./types.ts";

export function getContext(filePath: string): LintContext {
  const normalized = filePath.replace(/\\/g, "/");

  if (/(^|\/)(ui|primitives)\//.test(normalized)) {
    return "primitive";
  }

  if (/(^|\/)(layouts|templates)\//.test(normalized)) {
    return "layout";
  }

  return "composed";
}
