#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";

const logRoot = process.env.NORTHX_LOG_DIR || "__LOG_ROOT__";
const cliPath = "__CLI_PATH__";

async function loadRepoMeta() {
  try {
    const raw = await readFile(path.join(logRoot, "repo.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function ensureLogRoot() {
  await mkdir(logRoot, { recursive: true });
  const sessionMetaPath = path.join(logRoot, "session.json");
  try {
    await access(sessionMetaPath);
  } catch {
    const repoMeta = await loadRepoMeta();
    await writeFile(
      sessionMetaPath,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          repo: repoMeta,
          cwd: process.cwd(),
        },
        null,
        2
      )
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("northx: pass north CLI args (ex: ./northx check --json)");
    process.exit(1);
  }

  await ensureLogRoot();
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const stdoutPath = path.join(logRoot, `run-${runId}.stdout.txt`);
  const stderrPath = path.join(logRoot, `run-${runId}.stderr.txt`);
  const logPath = path.join(logRoot, "session.jsonl");

  const startedAt = Date.now();
  const child = spawn("bun", [cliPath, ...args], {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: ["inherit", "pipe", "pipe"],
  });

  const stdoutStream = createWriteStream(stdoutPath);
  const stderrStream = createWriteStream(stderrPath);

  child.stdout.on("data", (chunk) => {
    stdoutStream.write(chunk);
    process.stdout.write(chunk);
  });

  child.stderr.on("data", (chunk) => {
    stderrStream.write(chunk);
    process.stderr.write(chunk);
  });

  child.on("close", async (code, signal) => {
    stdoutStream.end();
    stderrStream.end();

    const record = {
      timestamp: new Date().toISOString(),
      command: args,
      cwd: process.cwd(),
      exitCode: code,
      signal,
      durationMs: Date.now() - startedAt,
      stdout: stdoutPath,
      stderr: stderrPath,
    };

    await appendFile(logPath, `${JSON.stringify(record)}\n`);
    process.exit(code ?? 1);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
