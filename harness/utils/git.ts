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
