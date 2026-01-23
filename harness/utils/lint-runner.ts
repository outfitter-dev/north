import { runLint } from "../../packages/north/src/lint/engine.ts";

interface ParsedArgs {
  configPath?: string;
  cwd?: string;
  files: string[];
}

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = { files: [] };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--config" || arg === "-c") {
      const value = args[i + 1];
      if (value !== undefined) {
        parsed.configPath = value;
        i += 1;
      }
    } else if (arg === "--cwd") {
      const value = args[i + 1];
      if (value !== undefined) {
        parsed.cwd = value;
        i += 1;
      }
    } else if (arg === "--files" || arg === "-f") {
      const value = args[i + 1];
      if (value !== undefined) {
        parsed.files.push(value);
        i += 1;
      }
    }
  }

  return parsed;
}

async function run() {
  const { configPath, cwd, files } = parseArgs(process.argv.slice(2));

  if (!configPath) {
    console.error("Missing --config <path> argument.");
    process.exit(1);
  }

  const { report } = await runLint({
    cwd: cwd ?? process.cwd(),
    configPath,
    files: files.length > 0 ? files : undefined,
  });

  const serializableReport = {
    summary: report.summary,
    violations: report.issues,
    stats: report.stats,
    rules: report.rules.map((rule) => ({
      ...rule,
      regex: rule.regex ? rule.regex.source : undefined,
    })),
  };

  console.log(JSON.stringify(serializableReport, null, 2));
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
