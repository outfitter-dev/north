import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function readPackageVersion(): string {
  const packagePath = resolve(dirname(fileURLToPath(import.meta.url)), "../package.json");

  try {
    const content = readFileSync(packagePath, "utf-8");
    const data = JSON.parse(content) as { version?: string };
    return typeof data.version === "string" ? data.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const version = readPackageVersion();
