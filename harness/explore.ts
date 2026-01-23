import { spawn } from "node:child_process";
import { chmod, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { hasFlag, readFlag } from "./utils/args.ts";
import { runCommand } from "./utils/exec.ts";
import { copyDir, ensureDir, pathExists, readJson, readText, writeJson } from "./utils/fs.ts";
import { checkoutRef, cloneRepo, resolveRemoteSha } from "./utils/git.ts";
import { repoPath } from "./utils/paths.ts";
import { readRepoRegistry, resolveRepo } from "./utils/repos.ts";

interface ExploreOptions {
  repo: string;
  ref?: string;
  sha?: string;
  fresh?: boolean;
  mode: "prepare" | "shell" | "run";
  session?: string;
  command?: string[];
}

function printHelp() {
  console.log(`Harness Explore

Usage:
  bun run harness:explore --repo <name> [--ref <ref> | --sha <sha>] [--fresh] [--mode <prepare|shell|run>] [--session <name>] [-- <north args>]

Examples:
  bun run harness:explore --repo shadcn-ui --mode shell
  bun run harness:explore --repo shadcn-ui -- check --json
  bun run harness:explore --repo shadcn-ui --ref main -- check --json
  bun run harness:explore --repo vercel/next.js --mode shell

Options:
  --repo <name>   Repo name from harness/repos.json, or org/repo for GitHub
  --ref <ref>     Git ref to resolve (default: pinned SHA or HEAD)
  --sha <sha>     Explicit SHA override
  --fresh         Re-clone the repo workspace
  --mode <mode>   prepare (default), shell, or run
  --session <id>  Group multiple repos in the same session
`);
}

function parseArgs(raw: string[]): ExploreOptions {
  const delimiterIndex = raw.indexOf("--");
  const args = delimiterIndex === -1 ? raw : raw.slice(0, delimiterIndex);
  const command = delimiterIndex === -1 ? undefined : raw.slice(delimiterIndex + 1);

  if (hasFlag(args, "--help") || hasFlag(args, "-h")) {
    printHelp();
    process.exit(0);
  }

  const repo = readFlag(args, "--repo");
  if (!repo) {
    throw new Error("--repo is required.");
  }

  const ref = readFlag(args, "--ref");
  const sha = readFlag(args, "--sha");
  const modeFlag = readFlag(args, "--mode");
  const session = readFlag(args, "--session");
  const shellFlag = hasFlag(args, "--shell");

  if (ref && sha) {
    throw new Error("--ref cannot be combined with --sha.");
  }

  if (shellFlag && modeFlag && modeFlag !== "shell") {
    throw new Error("--shell cannot be combined with --mode unless --mode shell.");
  }

  const mode = (() => {
    if (shellFlag) {
      return "shell" as const;
    }
    if (modeFlag) {
      if (modeFlag === "prepare" || modeFlag === "shell" || modeFlag === "run") {
        return modeFlag;
      }
      throw new Error(`Unknown mode '${modeFlag}'. Use prepare, shell, or run.`);
    }
    if (command && command.length > 0) {
      return "run" as const;
    }
    return "prepare" as const;
  })();

  if (mode === "run" && (!command || command.length === 0)) {
    throw new Error("--mode run requires a command after '--'.");
  }

  return {
    repo,
    ref: ref ?? undefined,
    sha: sha ?? undefined,
    fresh: hasFlag(args, "--fresh"),
    mode,
    session: session ?? undefined,
    command: command && command.length > 0 ? command : undefined,
  };
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function renderNorthxScript(options: { logRoot: string; cliPath: string }) {
  const templatePath = repoPath("harness", "templates", "northx.js");
  const template = await readText(templatePath);
  return template
    .replace('"__LOG_ROOT__"', JSON.stringify(options.logRoot))
    .replace('"__CLI_PATH__"', JSON.stringify(options.cliPath));
}

async function ensureNorthConfig(workDir: string) {
  const configPath = resolve(workDir, ".north", "config.yaml");
  if (await pathExists(configPath)) {
    return;
  }

  const fixtureDir = repoPath("harness", "fixtures", "north", ".north");
  await copyDir(fixtureDir, resolve(workDir, ".north"));
}

interface SessionIndexEntry {
  name: string;
  sha: string;
  updatedAt: string;
}

interface SessionIndex {
  id: string;
  createdAt: string;
  repos: SessionIndexEntry[];
}

async function updateSessionIndex(
  sessionRoot: string,
  sessionId: string,
  repoName: string,
  sha: string
) {
  const indexPath = resolve(sessionRoot, "index.json");
  const now = new Date().toISOString();
  let index: SessionIndex;

  if (await pathExists(indexPath)) {
    index = (await readJson(indexPath)) as SessionIndex;
  } else {
    index = { id: sessionId, createdAt: now, repos: [] };
  }

  const existing = index.repos.find((entry) => entry.name === repoName);
  if (existing) {
    existing.sha = sha;
    existing.updatedAt = now;
  } else {
    index.repos.push({ name: repoName, sha, updatedAt: now });
  }

  await writeJson(indexPath, index);
}

async function setupRepo(options: ExploreOptions, sessionId: string) {
  const registry = await readRepoRegistry();
  const repo = resolveRepo(registry, options.repo);

  const workRoot = repoPath(".harness", "workspaces");
  const workDir = resolve(workRoot, repo.name);
  const sessionRoot = repoPath(".harness", "sessions", sessionId);
  const logRoot = resolve(sessionRoot, repo.name);

  await ensureDir(workRoot);
  await ensureDir(sessionRoot);
  await ensureDir(logRoot);

  const pinnedSha = options.sha
    ? options.sha
    : options.ref
      ? await resolveRemoteSha(repo.url, options.ref)
      : repo.sha || (await resolveRemoteSha(repo.url, "HEAD"));

  if (options.fresh || !(await pathExists(workDir))) {
    await rm(workDir, { recursive: true, force: true });
    const cloneResult = await cloneRepo(repo.url, workDir);
    if (cloneResult.code !== 0) {
      throw new Error("git clone failed");
    }
  } else {
    await runCommand("git", ["fetch", "--all", "--tags"], { cwd: workDir });
  }

  const checkoutResult = await checkoutRef(workDir, pinnedSha);
  if (checkoutResult.code !== 0) {
    throw new Error("git checkout failed");
  }

  await ensureNorthConfig(workDir);
  await updateSessionIndex(sessionRoot, sessionId, repo.name, pinnedSha);

  await writeJson(resolve(logRoot, "repo.json"), {
    name: repo.name,
    url: repo.url,
    sha: pinnedSha,
    ref: options.ref ?? null,
    updatedAt: new Date().toISOString(),
  });

  const northxPath = resolve(workDir, "northx");
  const northCli = repoPath("packages", "north", "src", "cli", "index.ts");
  await writeFile(northxPath, await renderNorthxScript({ logRoot, cliPath: northCli }));
  await chmod(northxPath, 0o755);

  return { workDir, logRoot, repoName: repo.name, sha: pinnedSha, sessionId };
}

async function runShell(workDir: string, logDir: string) {
  const shell = process.env.SHELL ?? "zsh";
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(shell, {
      cwd: workDir,
      stdio: "inherit",
      env: { ...process.env, NORTHX_LOG_DIR: logDir },
    });
    child.on("exit", () => resolvePromise());
    child.on("error", reject);
  });
}

async function runCommandOnce(workDir: string, logDir: string, args: string[]) {
  const exitCode = await new Promise<number | null>((resolvePromise, reject) => {
    const child = spawn(resolve(workDir, "northx"), args, {
      cwd: workDir,
      stdio: "inherit",
      env: { ...process.env, NORTHX_LOG_DIR: logDir },
    });
    child.on("exit", (code) => resolvePromise(code));
    child.on("error", reject);
  });
  if (exitCode !== 0) {
    process.exitCode = exitCode ?? 1;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sessionId = options.session ?? timestamp();
  const { workDir, logRoot, repoName, sha } = await setupRepo(options, sessionId);

  console.log(`Repo ready: ${workDir}`);
  console.log(`Session: ${sessionId}`);
  console.log(`Logs: ${logRoot}`);
  console.log("Run: ./northx <command> [args]");

  if (options.mode === "run" && options.command && options.command.length > 0) {
    await runCommandOnce(workDir, logRoot, options.command);
    return;
  }

  if (options.mode === "shell") {
    await runShell(workDir, logRoot);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
