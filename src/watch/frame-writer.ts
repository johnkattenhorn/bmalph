const HIDE_CURSOR = "\x1B[?25l";
const SHOW_CURSOR = "\x1B[?25h";
const CLEAR_LINE = "\x1B[2K";
const NEXT_LINE = "\x1B[E";

export interface DashboardOutput {
  columns?: number;
  isTTY?: boolean;
  write(chunk: string): unknown;
}

export interface DashboardInput {
  isTTY?: boolean;
  pause(): void;
  setRawMode?(enabled: boolean): void;
}

export interface DashboardTerminalSupport {
  reason?: string;
  supported: boolean;
}

export interface FrameWriter {
  cleanup(): void;
  write(frame: string): boolean;
}

interface FrameWriterOptions {
  input?: DashboardInput;
  output?: DashboardOutput;
}

export function getDashboardTerminalSupport(
  output: DashboardOutput = process.stdout,
  input: DashboardInput = process.stdin,
  env: NodeJS.ProcessEnv = process.env
): DashboardTerminalSupport {
  if (!output.isTTY || !input.isTTY) {
    return {
      supported: false,
      reason: "Dashboard requires an interactive terminal with cursor support.",
    };
  }

  if (typeof output.columns !== "number" || output.columns < 20) {
    return {
      supported: false,
      reason: "Dashboard requires a terminal with a usable width.",
    };
  }

  if ((env.TERM ?? "").toLowerCase() === "dumb") {
    return {
      supported: false,
      reason: "Dashboard is not supported when TERM=dumb.",
    };
  }

  return { supported: true };
}

export function createTerminalFrameWriter(options: FrameWriterOptions = {}): FrameWriter {
  const output = options.output ?? process.stdout;
  const input = options.input ?? process.stdin;

  let previousLines: string[] = [];

  if (output.isTTY) {
    output.write(HIDE_CURSOR);
  }

  return {
    cleanup(): void {
      if (output.isTTY) {
        output.write(SHOW_CURSOR);
      }
      if (input.isTTY && input.setRawMode) {
        input.setRawMode(false);
      }
      input.pause();
    },

    write(frame: string): boolean {
      const nextLines = frame.split("\n");
      if (sameLines(previousLines, nextLines)) {
        return false;
      }

      if (previousLines.length === 0) {
        output.write(`${frame}\n`);
        previousLines = nextLines;
        return true;
      }

      output.write(`\x1B[${String(previousLines.length)}F`);

      const totalLines = Math.max(previousLines.length, nextLines.length);
      for (let index = 0; index < totalLines; index += 1) {
        const nextLine = nextLines[index] ?? "";
        const previousLine = previousLines[index] ?? "";

        if (nextLine !== previousLine) {
          output.write(`${CLEAR_LINE}${nextLine}`);
        }

        output.write(NEXT_LINE);
      }

      const shrinkBy = previousLines.length - nextLines.length;
      if (shrinkBy > 0) {
        output.write(`\x1B[${String(shrinkBy)}F`);
      }

      previousLines = nextLines;
      return true;
    },
  };
}

function sameLines(previousLines: string[], nextLines: string[]): boolean {
  if (previousLines.length !== nextLines.length) {
    return false;
  }

  for (let index = 0; index < previousLines.length; index += 1) {
    if (previousLines[index] !== nextLines[index]) {
      return false;
    }
  }

  return true;
}
