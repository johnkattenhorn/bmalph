import chalk from "chalk";
import { readConfig } from "../utils/config.js";
import { withErrorHandling } from "../utils/errors.js";
import { isPlatformId, getPlatform, getFullTierPlatformNames } from "../platform/registry.js";
import { validateCursorRuntime } from "../platform/cursor-runtime-checks.js";
import { validateBashAvailable, validateRalphLoop, spawnRalphLoop } from "../run/ralph-process.js";
import { startRunDashboard } from "../run/run-dashboard.js";
import { parseInterval } from "../utils/validate.js";
import { getDashboardTerminalSupport } from "../watch/frame-writer.js";
import type { Platform, PlatformId } from "../platform/types.js";

interface RunCommandOptions {
  projectDir: string;
  driver?: string;
  interval?: string;
  dashboard: boolean;
}

export async function runCommand(options: RunCommandOptions): Promise<void> {
  await withErrorHandling(() => executeRun(options));
}

async function executeRun(options: RunCommandOptions): Promise<void> {
  const { projectDir, dashboard } = options;

  const config = await readConfig(projectDir);
  if (!config) {
    throw new Error("Project not initialized. Run: bmalph init");
  }

  const platform = resolvePlatform(options.driver, config.platform);
  if (platform.tier !== "full") {
    throw new Error(
      `Ralph requires a full-tier platform (${getFullTierPlatformNames()}). ` +
        `Current: ${platform.displayName}`
    );
  }

  if (platform.experimental) {
    console.log(chalk.yellow(`Warning: ${platform.displayName} support is experimental`));
  }

  const interval = parseInterval(options.interval);
  let useDashboard = dashboard;
  if (useDashboard) {
    const terminalSupport = getDashboardTerminalSupport();
    if (!terminalSupport.supported) {
      console.log(chalk.yellow(`Warning: dashboard disabled. ${terminalSupport.reason}`));
      useDashboard = false;
    }
  }

  await Promise.all([validateBashAvailable(), validateRalphLoop(projectDir)]);
  if (platform.id === "cursor") {
    await validateCursorRuntime(projectDir);
  }

  const ralph = spawnRalphLoop(projectDir, platform.id, {
    inheritStdio: !useDashboard,
  });

  if (useDashboard) {
    await startRunDashboard({ projectDir, interval, ralph });
    if (ralph.state === "stopped") {
      applyRalphExitCode(ralph.exitCode);
    }
  } else {
    const exitCode = await new Promise<number | null>((resolve) => {
      ralph.onExit((code) => resolve(code));
    });
    applyRalphExitCode(exitCode);
  }
}

function applyRalphExitCode(code: number | null): void {
  if (typeof code === "number" && code !== 0) {
    process.exitCode = code;
  }
}

function resolvePlatform(
  driverOverride: string | undefined,
  configPlatform?: PlatformId
): Platform {
  const id = driverOverride ?? configPlatform ?? "claude-code";
  if (!isPlatformId(id)) {
    throw new Error(`Unknown platform: ${id}`);
  }
  return getPlatform(id);
}
