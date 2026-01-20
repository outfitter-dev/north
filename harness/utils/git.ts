import { runCommand } from "./exec.ts";

export async function cloneRepo(url: string, dest: string) {
  return await runCommand("git", ["clone", url, dest]);
}

export async function checkoutRef(cwd: string, ref: string) {
  return await runCommand("git", ["checkout", ref], { cwd });
}

export async function applyPatch(cwd: string, patchPath: string) {
  return await runCommand("git", ["apply", "--whitespace=nowarn", patchPath], { cwd });
}

export async function stageAll(cwd: string) {
  return await runCommand("git", ["add", "-A"], { cwd });
}

export async function resolveRemoteSha(url: string, ref: string) {
  const result = await runCommand("git", ["ls-remote", url, ref]);
  if (result.code !== 0) {
    throw new Error(`git ls-remote failed for ${url} (${ref})`);
  }

  const lines = result.stdout.trim().split("\n").filter(Boolean);
  if (lines.length === 0) {
    throw new Error(`No SHA resolved for ${url} (${ref})`);
  }

  const peeled = lines.find((line) => line.split(/\s+/)[1]?.endsWith("^{}"));
  const target = peeled ?? lines[0];
  const sha = target?.split(/\s+/)[0];
  if (!sha) {
    throw new Error(`No SHA resolved for ${url} (${ref})`);
  }

  return sha;
}
