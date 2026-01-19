import { createHash } from "node:crypto";

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalize(entry));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const next: Record<string, unknown> = {};
    for (const key of keys) {
      next[key] = normalize(record[key]);
    }
    return next;
  }

  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function hashJson(value: unknown): string {
  const payload = stableStringify(value);
  return createHash("sha256").update(payload).digest("hex");
}
