import { hasFlag, readFlag, readFlags } from "./utils/args.ts";
import { resolveRemoteSha } from "./utils/git.ts";
import { filterReposByTags, readRepoRegistry, writeRepoRegistry } from "./utils/repos.ts";

function printHelp() {
  console.log(`Harness SHA Bumper

Usage:
  bun run harness:bump-sha [--repo name] [--tag tag] [--ref ref] [--sha sha] [--all]

Options:
  --repo <name>   Target a specific repo (repeatable).
  --tag <tag>     Target repos by tag (repeatable).
  --ref <ref>     Git ref to resolve (default: HEAD).
  --sha <sha>     Explicit SHA to set (requires --repo).
  --all           Target all repos.
  --dry-run       Print changes without writing.
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (hasFlag(args, "--help") || hasFlag(args, "-h")) {
    printHelp();
    return;
  }

  const repoNames = readFlags(args, "--repo");
  const tags = readFlags(args, "--tag");
  const explicitSha = readFlag(args, "--sha");
  const ref = readFlag(args, "--ref") ?? "HEAD";
  const dryRun = hasFlag(args, "--dry-run");
  const useAll = hasFlag(args, "--all") || (repoNames.length === 0 && tags.length === 0);

  if (hasFlag(args, "--all") && (repoNames.length > 0 || tags.length > 0)) {
    throw new Error("--all cannot be combined with --repo or --tag.");
  }

  if (explicitSha && readFlag(args, "--ref")) {
    throw new Error("--sha cannot be combined with --ref.");
  }

  if (explicitSha && repoNames.length === 0) {
    throw new Error("--sha requires at least one --repo.");
  }

  const registry = await readRepoRegistry();
  let targets = registry.repos;

  if (!useAll) {
    if (repoNames.length > 0) {
      const missing = repoNames.filter(
        (name) => !registry.repos.some((repo) => repo.name === name)
      );
      if (missing.length > 0) {
        throw new Error(`Unknown repos: ${missing.join(", ")}`);
      }
      targets = targets.filter((repo) => repoNames.includes(repo.name));
    }
    if (tags.length > 0) {
      targets = filterReposByTags({ repos: targets }, tags);
    }
  }

  if (targets.length === 0) {
    throw new Error("No repos matched the provided filters.");
  }

  const updates: Array<{ name: string; from: string; to: string }> = [];

  for (const repo of registry.repos) {
    const target = targets.find((entry) => entry.name === repo.name);
    if (!target) {
      continue;
    }

    const nextSha = explicitSha ?? (await resolveRemoteSha(repo.url, ref));
    if (nextSha !== repo.sha) {
      updates.push({ name: repo.name, from: repo.sha, to: nextSha });
      repo.sha = nextSha;
    } else {
      updates.push({ name: repo.name, from: repo.sha, to: repo.sha });
    }
  }

  for (const update of updates) {
    console.log(`${update.name}: ${update.from} -> ${update.to}`);
  }

  if (dryRun) {
    console.log("Dry run: no changes written.");
    return;
  }

  await writeRepoRegistry(registry);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
