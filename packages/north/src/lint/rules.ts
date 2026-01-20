import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { glob } from "glob";
import { parse as parseYAML } from "yaml";
import type { NorthConfig } from "../config/schema.ts";
import type { LoadedRule, RuleSeverity } from "./types.ts";

// ============================================================================
// Rule Loading
// ============================================================================

export class RuleLoadError extends Error {
  constructor(
    message: string,
    public readonly filePath?: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "RuleLoadError";
  }
}

const VALID_SEVERITIES: RuleSeverity[] = ["error", "warn", "info", "off"];

function normalizeRuleKey(ruleId: string): string {
  const parts = ruleId.split("/");
  return parts[parts.length - 1] ?? ruleId;
}

interface RuleConfigResolution {
  level: RuleSeverity | null;
  ignore: string[] | null;
}

function resolveRuleConfig(config: NorthConfig, ruleKey: string): RuleConfigResolution {
  const rulesConfig = config.rules;
  if (!rulesConfig) {
    return { level: null, ignore: null };
  }

  const value = rulesConfig[ruleKey as keyof typeof rulesConfig];

  if (!value) {
    return { level: null, ignore: null };
  }

  if (typeof value === "string") {
    return { level: value as RuleSeverity, ignore: null };
  }

  if (typeof value === "object") {
    const level = "level" in value ? (value.level as RuleSeverity) : null;
    const ignore = "ignore" in value && Array.isArray(value.ignore) ? value.ignore : null;
    return { level, ignore };
  }

  return { level: null, ignore: null };
}

function toSeverity(value: unknown, fallback: RuleSeverity): RuleSeverity {
  if (typeof value === "string" && VALID_SEVERITIES.includes(value as RuleSeverity)) {
    return value as RuleSeverity;
  }

  return fallback;
}

export async function loadRules(rulesDir: string, config: NorthConfig): Promise<LoadedRule[]> {
  const pattern = "**/*.yaml";
  const files = await glob(pattern, {
    cwd: rulesDir,
    absolute: true,
    nodir: true,
  });

  if (files.length === 0) {
    throw new RuleLoadError("No rule files found", rulesDir);
  }

  const rules: LoadedRule[] = [];

  for (const filePath of files) {
    try {
      const content = await readFile(filePath, "utf-8");
      const data = parseYAML(content) as Record<string, unknown> | null;

      if (!data || typeof data !== "object") {
        throw new RuleLoadError("Invalid rule file format", filePath);
      }

      const id = typeof data.id === "string" ? data.id : null;
      const message = typeof data.message === "string" ? data.message : null;

      if (!id || !message) {
        throw new RuleLoadError("Rule file missing required fields (id, message)", filePath);
      }

      const ruleKey = normalizeRuleKey(id);
      const ruleConfigResolution = resolveRuleConfig(config, ruleKey);
      const baseSeverity = toSeverity(data.severity, "warn");
      const severity = ruleConfigResolution.level ?? baseSeverity;

      if (severity === "off") {
        continue;
      }

      const ruleConfig = data.rule as { regex?: unknown } | undefined;
      const rawRegex = typeof ruleConfig?.regex === "string" ? ruleConfig.regex : undefined;
      const regex = rawRegex ? new RegExp(rawRegex) : undefined;

      rules.push({
        id,
        key: ruleKey,
        message,
        severity,
        note: typeof data.note === "string" ? data.note : undefined,
        regex,
        sourcePath: resolve(filePath),
        ignore: ruleConfigResolution.ignore ?? undefined,
      });
    } catch (error) {
      if (error instanceof RuleLoadError) {
        throw error;
      }

      throw new RuleLoadError(
        `Failed to load rule file: ${error instanceof Error ? error.message : String(error)}`,
        filePath,
        error
      );
    }
  }

  return rules;
}

export function getRuleKey(ruleId: string): string {
  return normalizeRuleKey(ruleId);
}
