import { createRefreshCallback } from "../watch/dashboard.js";
import { createTerminalFrameWriter } from "../watch/frame-writer.js";
import { FileWatcher } from "../watch/file-watcher.js";
import type { RalphProcess } from "./types.js";

export interface RunDashboardOptions {
  projectDir: string;
  interval: number;
  ralph: RalphProcess;
}

export function renderStatusBar(ralph: RalphProcess): string {
  const pid = ralph.child.pid ?? "?";
  switch (ralph.state) {
    case "running":
      return `Ralph: running (PID ${pid}) | q: stop/detach`;
    case "stopped":
      return `Ralph: stopped (exit ${ralph.exitCode ?? "?"}) | q: quit`;
    case "detached":
      return `Ralph: detached (PID ${pid})`;
  }
}

export function renderQuitPrompt(): string {
  return "Stop (s) | Detach (d) | Cancel (c)";
}

export async function startRunDashboard(options: RunDashboardOptions): Promise<void> {
  const { projectDir, interval, ralph } = options;

  const frameWriter = createTerminalFrameWriter();
  let statusBarText = renderStatusBar(ralph);
  let showingPrompt = false;
  let stopped = false;

  const decorateFrame = (frame: string): string => {
    const bar = showingPrompt ? renderQuitPrompt() : statusBarText;
    return `${frame}\n${bar}`;
  };

  const refresh = createRefreshCallback(
    projectDir,
    (frame) => {
      if (stopped) {
        return;
      }
      frameWriter.write(frame);
    },
    { decorateFrame }
  );
  const watcher = new FileWatcher(refresh, interval);

  ralph.onExit(() => {
    if (stopped) {
      return;
    }
    statusBarText = renderStatusBar(ralph);
    void refresh();
  });

  return new Promise<void>((resolve) => {
    const onResize = (): void => {
      void refresh();
    };
    process.stdout.on("resize", onResize);

    const onSignal = (): void => {
      if (ralph.state === "running") {
        ralph.kill();
      }
      stop();
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);

    const handleKey = (data: string): void => {
      if (showingPrompt) {
        handlePromptKey(data);
        return;
      }

      if (data === "q" || data === "\x03") {
        if (ralph.state === "running") {
          showingPrompt = true;
          void refresh();
        } else {
          stop();
        }
      }
    };

    const handlePromptKey = (data: string): void => {
      showingPrompt = false;
      if (data === "s") {
        if (ralph.state === "stopped") {
          stop();
        } else {
          ralph.onExit(() => stop());
          ralph.kill();
        }
      } else if (data === "d") {
        ralph.detach();
        stop();
      } else {
        void refresh();
      }
    };

    const stop = (): void => {
      if (stopped) {
        return;
      }
      stopped = true;
      watcher.stop();
      frameWriter.cleanup();
      process.removeListener("SIGINT", onSignal);
      process.removeListener("SIGTERM", onSignal);
      process.stdout.removeListener("resize", onResize);
      if (process.stdin.isTTY) {
        process.stdin.removeListener("data", handleKey);
      }
      resolve();
    };

    if (process.stdin.isTTY && process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding("utf-8");
      process.stdin.on("data", handleKey);
    } else {
      ralph.onExit(() => stop());
      if (ralph.state === "stopped") stop();
    }

    watcher.start();
  });
}
