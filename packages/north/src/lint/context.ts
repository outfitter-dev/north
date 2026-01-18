import type { LintContext } from "./types.ts";

const CONTEXT_REGEX = /@north\s+context\s*:\s*(primitive|composed|layout)/i;

export function getContext(filePath: string, source?: string): LintContext {
  if (source) {
    const match = source.match(CONTEXT_REGEX);
    if (match?.[1]) {
      const value = match[1].toLowerCase();
      if (value === "primitive" || value === "layout" || value === "composed") {
        return value;
      }
    }
  }

  const normalized = filePath.replace(/\\/g, "/");

  if (/(^|\/)(ui|primitives)\//.test(normalized)) {
    return "primitive";
  }

  if (/(^|\/)(layouts|templates)\//.test(normalized)) {
    return "layout";
  }

  return "composed";
}
