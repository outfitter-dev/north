import { readJson, writeJson } from "./fs.ts";
import { harnessPath } from "./paths.ts";

export interface HarnessRepo {
  name: string;
  url: string;
  sha: string;
  type?: string;
  tags?: string[];
}

export interface HarnessRepoRegistry {
  repos: HarnessRepo[];
}

export type HarnessRepoRef = string | { name: string; url?: string; sha?: string };

export async function readRepoRegistry(): Promise<HarnessRepoRegistry> {
  return await readJson<HarnessRepoRegistry>(harnessPath("repos.json"));
}

export async function writeRepoRegistry(registry: HarnessRepoRegistry) {
  await writeJson(harnessPath("repos.json"), registry);
}

export function findRepo(registry: HarnessRepoRegistry, name: string) {
  return registry.repos.find((repo) => repo.name === name);
}

export function resolveRepo(registry: HarnessRepoRegistry, ref: HarnessRepoRef): HarnessRepo {
  const name = typeof ref === "string" ? ref : ref.name;

  // Detect org/repo format for ad-hoc GitHub repos
  if (name.includes("/")) {
    const [org, repoName] = name.split("/", 2);
    if (org && repoName) {
      return {
        name: repoName,
        url: `https://github.com/${org}/${repoName}.git`,
        sha: "", // Will be resolved to HEAD in explore.ts
      };
    }
  }

  const repo = findRepo(registry, name);
  if (!repo) {
    throw new Error(`Repo '${name}' not found in harness/repos.json.`);
  }

  if (typeof ref === "string") {
    return repo;
  }

  return {
    ...repo,
    url: ref.url ?? repo.url,
    sha: ref.sha ?? repo.sha,
  };
}

export function filterReposByTags(registry: HarnessRepoRegistry, tags: string[]) {
  if (tags.length === 0) {
    return registry.repos;
  }
  return registry.repos.filter((repo) => {
    const repoTags = repo.tags ?? [];
    return tags.some((tag) => repoTags.includes(tag));
  });
}
