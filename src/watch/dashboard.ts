import { readDashboardState } from "./state-reader.js";
import { renderDashboard } from "./renderer.js";
import type { FooterRenderer } from "./renderer.js";
import { createTerminalFrameWriter } from "./frame-writer.js";
import { FileWatcher } from "./file-watcher.js";
import type { WatchOptions } from "./types.js";

export interface RefreshCallbackOptions {
  footerRenderer?: FooterRenderer;
  now?: () => Date;
}

export function createRefreshCallback(
  projectDir: string,
  write: (frame: string) => void,
  options: RefreshCallbackOptions = {}
): () => Promise<void> {
  const now = options.now ?? (() => new Date());
  let lastMeaningfulUpdate: Date | undefined;
  let lastRenderedBody: string | undefined;
  const renderOptions = options.footerRenderer
    ? { footerRenderer: options.footerRenderer }
    : undefined;

  return async (): Promise<void> => {
    const state = await readDashboardState(projectDir);
    if (lastMeaningfulUpdate === undefined) {
      lastMeaningfulUpdate = now();
    }

    let frame = renderDashboard(
      {
        ...state,
        lastUpdated: lastMeaningfulUpdate,
      },
      undefined,
      renderOptions
    );
    let body = stripFooterLine(frame);

    if (lastRenderedBody !== undefined && body !== lastRenderedBody) {
      lastMeaningfulUpdate = now();
      frame = renderDashboard(
        {
          ...state,
          lastUpdated: lastMeaningfulUpdate,
        },
        undefined,
        renderOptions
      );
      body = stripFooterLine(frame);
    }

    lastRenderedBody = body;
    write(frame);
  };
}

function stripFooterLine(frame: string): string {
  const footerIndex = frame.lastIndexOf("\n");
  if (footerIndex === -1) {
    return frame;
  }

  return frame.slice(0, footerIndex);
}

export async function startDashboard(options: WatchOptions): Promise<void> {
  const { projectDir, interval } = options;

  const frameWriter = createTerminalFrameWriter();
  const refresh = createRefreshCallback(projectDir, (frame) => {
    frameWriter.write(frame);
  });
  const watcher = new FileWatcher(refresh, interval);

  return new Promise<void>((resolve) => {
    const handleKey = (data: string): void => {
      if (data === "q" || data === "\x03") {
        stop();
      }
    };

    const onResize = (): void => {
      void refresh();
    };

    const onSignal = (): void => {
      stop();
    };

    let stopped = false;
    const stop = (): void => {
      if (stopped) return;
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
    }

    process.stdout.on("resize", onResize);
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);

    watcher.start();
  });
}
