import { runMutationSuite } from "./suites/mutations/run.ts";

function parseFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "mutations") {
    const suite = parseFlag(args, "--suite");
    const results = await runMutationSuite({ suite });

    const failures = results.filter((result) => !result.ok);
    for (const result of results) {
      const status = result.ok ? "ok" : "fail";
      console.log(`${status} ${result.name}`);
      if (!result.ok) {
        for (const error of result.errors) {
          console.log(`  - ${error}`);
        }
      }
    }

    if (failures.length > 0) {
      process.exitCode = 1;
    }
    return;
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exitCode = 1;
}

function printHelp() {
  console.log("Stress Harness\n\nUsage:\n  bun run harness mutations [--suite name]\n");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
