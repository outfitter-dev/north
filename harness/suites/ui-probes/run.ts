import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { runCommand } from "../../utils/exec.ts";
import { emptyDir, ensureDir, readJson, writeJson, writeText } from "../../utils/fs.ts";
import { checkoutRef, cloneRepo } from "../../utils/git.ts";
import { harnessPath } from "../../utils/paths.ts";

interface UiProbeRoute {
  name: string;
  path: string;
}

interface UiProbeRepo {
  name: string;
  url: string;
  sha: string;
  appDir: string;
  install?: string;
  devCommand: string;
  port: number;
  routes: UiProbeRoute[];
}

interface UiProbeConfig {
  repo: UiProbeRepo;
}

interface UiProbeRunOptions {
  route?: string;
}

interface UiProbeResult {
  name: string;
  ok: boolean;
  errors: string[];
}

const VIEWPORTS = [
  { width: 375, height: 812, name: "mobile" },
  { width: 768, height: 900, name: "tablet" },
  { width: 1280, height: 900, name: "desktop" },
];

export async function runUiProbes(options: UiProbeRunOptions = {}) {
  const config = await readJson<UiProbeConfig>(harnessPath("suites", "ui-probes", "config.json"));
  const repo = config.repo;
  const workDir = harnessPath(".cache", "ui-probes", repo.name);
  const artifactRoot = harnessPath("artifacts", "ui-probes", repo.name, repo.sha);

  await emptyDir(workDir);

  const cloneResult = await cloneRepo(repo.url, workDir);
  if (cloneResult.code !== 0) {
    throw new Error("git clone failed");
  }

  const checkoutResult = await checkoutRef(workDir, repo.sha);
  if (checkoutResult.code !== 0) {
    throw new Error("git checkout failed");
  }

  if (repo.install) {
    const installCmd = parseCommand(repo.install);
    await runCommand(installCmd.cmd, installCmd.args, { cwd: workDir, timeoutMs: 300_000 });
  }

  const appDir = resolve(workDir, repo.appDir);
  const server = startServer(repo.devCommand, appDir, repo.port, artifactRoot);
  try {
    const baseUrl = `http://localhost:${repo.port}`;
    await waitForServer(baseUrl, 60_000);

    const routes = options.route
      ? repo.routes.filter((route) => route.name === options.route)
      : repo.routes;

    if (routes.length === 0) {
      throw new Error(options.route ? `Route '${options.route}' not found.` : "No routes defined.");
    }

    const results: UiProbeResult[] = [];
    const browser = await chromium.launch();
    try {
      for (const route of routes) {
        const scenarioDir = resolve(artifactRoot, route.name);
        await ensureDir(scenarioDir);

        const evidence: {
          repo: string;
          sha: string;
          route: string;
          url: string;
          viewports: Array<Record<string, unknown>>;
        } = {
          repo: repo.name,
          sha: repo.sha,
          route: route.name,
          url: `${baseUrl}${route.path}`,
          viewports: [],
        };

        const scenarioErrors: string[] = [];

        for (const viewport of VIEWPORTS) {
          const page = await browser.newPage({
            viewport: { width: viewport.width, height: viewport.height },
          });
          await page.goto(`${baseUrl}${route.path}`, { waitUntil: "networkidle" });

          const metrics = await page.evaluate(() => {
          const overflow =
            Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) >
            window.innerWidth + 1;

          const interactive = Array.from(
            document.querySelectorAll("a, button, [role='button'], input, select, textarea")
          ).filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          });

          const smallTargets = interactive
            .map((element) => {
              const rect = element.getBoundingClientRect();
              return {
                width: rect.width,
                height: rect.height,
                text: element.textContent?.trim().slice(0, 48) ?? "",
                tag: element.tagName.toLowerCase(),
              };
            })
            .filter((item) => item.width < 44 || item.height < 44);

          function parseRgb(value: string) {
            const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
            if (!match) return null;
            return {
              r: Number(match[1]),
              g: Number(match[2]),
              b: Number(match[3]),
              a: match[4] ? Number(match[4]) : 1,
            };
          }

          function luminance(color: { r: number; g: number; b: number }) {
            const toLinear = (channel: number) => {
              const c = channel / 255;
              return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            };
            return (
              0.2126 * toLinear(color.r) + 0.7152 * toLinear(color.g) + 0.0722 * toLinear(color.b)
            );
          }

          function contrastRatio(
            fg: { r: number; g: number; b: number },
            bg: { r: number; g: number; b: number }
          ) {
            const l1 = luminance(fg) + 0.05;
            const l2 = luminance(bg) + 0.05;
            return l1 > l2 ? l1 / l2 : l2 / l1;
          }

          const background = parseRgb(getComputedStyle(document.body).backgroundColor) ?? {
            r: 255,
            g: 255,
            b: 255,
            a: 1,
          };

          const textNodes = Array.from(
            document.querySelectorAll("p, span, a, button, h1, h2, h3, h4, h5, h6")
          )
            .filter((element) => element.textContent && element.textContent.trim().length > 0)
            .slice(0, 120);

          const lowContrast = textNodes
            .map((element) => {
              const style = getComputedStyle(element);
              const fg = parseRgb(style.color);
              const bg = parseRgb(style.backgroundColor);
              if (!fg) return null;
              const bgColor = bg && bg.a !== 0 ? bg : background;
              const ratio = contrastRatio(
                { r: fg.r, g: fg.g, b: fg.b },
                { r: bgColor.r, g: bgColor.g, b: bgColor.b }
              );
              return {
                ratio,
                text: element.textContent?.trim().slice(0, 48) ?? "",
                tag: element.tagName.toLowerCase(),
              };
            })
            .filter(
              (entry): entry is { ratio: number; text: string; tag: string } => entry !== null
            )
            .filter((entry) => entry.ratio < 3);

          return {
            overflow,
            touchTargets: {
              total: interactive.length,
              tooSmall: smallTargets.length,
              samples: smallTargets.slice(0, 5),
            },
            contrast: {
              total: textNodes.length,
              low: lowContrast.length,
              samples: lowContrast.slice(0, 5),
            },
          };
        });

          const screenshotPath = resolve(
            scenarioDir,
            `viewport-${viewport.width}x${viewport.height}.png`
          );
          await page.screenshot({ path: screenshotPath, fullPage: true });
          await page.close();

          evidence.viewports.push({
            viewport: viewport,
            metrics,
            screenshot: screenshotPath,
          });

          if (metrics.overflow) {
            scenarioErrors.push(`${viewport.name}: overflow detected`);
          }
          if (metrics.touchTargets.tooSmall > 0) {
            scenarioErrors.push(`${viewport.name}: ${metrics.touchTargets.tooSmall} small targets`);
          }
          if (metrics.contrast.low > 0) {
            scenarioErrors.push(`${viewport.name}: ${metrics.contrast.low} low-contrast samples`);
          }
        }

        await writeJson(resolve(scenarioDir, "evidence.json"), evidence);
        results.push({ name: route.name, ok: scenarioErrors.length === 0, errors: scenarioErrors });
      }

      return results;
    } finally {
      await browser.close();
    }
  } finally {
    stopServer(server);
  }
}

function parseCommand(command: string) {
  const parts = command.split(" ").filter(Boolean);
  return { cmd: parts[0] ?? command, args: parts.slice(1) };
}

function startServer(command: string, cwd: string, port: number, artifactRoot: string) {
  const { cmd, args } = parseCommand(command);
  const logPath = resolve(artifactRoot, "server.log");
  const out = [] as string[];
  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (chunk) => out.push(chunk.toString()));
  child.stderr?.on("data", (chunk) => out.push(chunk.toString()));

  child.on("close", () => {
    void writeText(logPath, out.join("")).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Failed to write server log: ${message}`);
    });
  });

  return child;
}

function stopServer(child: ReturnType<typeof spawn>) {
  if (!child.killed) {
    child.kill("SIGTERM");
  }
}

async function waitForServer(url: string, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok) {
        return;
      }
    } catch {
      // ignore
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Server not ready after ${timeoutMs}ms`);
}
