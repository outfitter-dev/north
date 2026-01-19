import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function ensureDir(path: string) {
  await mkdir(path, { recursive: true });
}

export async function emptyDir(path: string) {
  await rm(path, { recursive: true, force: true });
  await mkdir(path, { recursive: true });
}

export async function readJson<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw) as T;
}

export async function writeJson(path: string, value: unknown) {
  await ensureDir(dirname(path));
  await writeFile(path, JSON.stringify(value, null, 2));
}

export async function readText(path: string) {
  return await readFile(path, "utf-8");
}

export async function writeText(path: string, value: string) {
  await ensureDir(dirname(path));
  await writeFile(path, value);
}

export async function copyFileSafe(from: string, to: string) {
  await ensureDir(dirname(to));
  await copyFile(from, to);
}
