import { hasFlag, readFlag, readFlags } from "./utils/args.ts";
import { resolveRemoteSha } from "./utils/git.ts";
import { filterReposByTags, readRepoRegistry, writeRepoRegistry } from "./utils/repos.ts";

function printHelp() {
  console.log(`Harness Repo Registry

Usage:
  bun run harness:repos list [--tag tag]
  bun run harness:repos add --name name --url url [--sha sha] [--ref ref] [--type type] [--tag tag]

Options:
  --name <name>  Repo key used by harness configs.
  --url <url>    Git URL to clone.
  --sha <sha>    Explicit SHA (optional).
  --ref <ref>    Git ref to resolve (default: HEAD).
  --type <type>  Optional repo type metadata.
  --tag <tag>    Optional tag (repeatable).
`);
}

async function listRepos(args: string[]) {
  const registry = await readRepoRegistry();
  const tags = readFlags(args, "--tag");
  const repos = tags.length > 0 ? filterReposByTags(registry, tags) : registry.repos;

  for (const repo of repos) {
    const tagText = repo.tags && repo.tags.length > 0 ? ` [${repo.tags.join(", ")}]` : "";
    console.log(`${repo.name} ${repo.sha}${tagText}`);
  }
}

async function addRepo(args: string[]) {
  const name = readFlag(args, "--name");
  const url = readFlag(args, "--url");
  const sha = readFlag(args, "--sha");
  const ref = readFlag(args, "--ref") ?? "HEAD";
  const type = readFlag(args, "--type");
  const tags = readFlags(args, "--tag");

  if (!name || !url) {
    throw new Error("--name and --url are required.");
  }

  if (sha && readFlag(args, "--ref")) {
    throw new Error("--sha cannot be combined with --ref.");
  }

  const registry = await readRepoRegistry();
  if (registry.repos.some((repo) => repo.name === name)) {
    throw new Error(`Repo '${name}' already exists.`);
  }

  const resolvedSha = sha ?? (await resolveRemoteSha(url, ref));
  registry.repos.push({
    name,
    url,
    sha: resolvedSha,
    type,
    tags: tags.length > 0 ? tags : undefined,
  });

  await writeRepoRegistry(registry);
  console.log(`Added ${name} (${resolvedSha}).`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || hasFlag(args, "--help") || hasFlag(args, "-h")) {
    printHelp();
    return;
  }

  if (command === "list") {
    await listRepos(args.slice(1));
    return;
  }

  if (command === "add") {
    await addRepo(args.slice(1));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
