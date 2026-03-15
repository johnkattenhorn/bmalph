import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createTerminalFrameWriter,
  getDashboardTerminalSupport,
} from "../../src/watch/frame-writer.js";

interface MockOutput {
  columns: number;
  isTTY: boolean;
  write: ReturnType<typeof vi.fn>;
}

interface MockInput {
  isTTY: boolean;
  pause: ReturnType<typeof vi.fn>;
  setRawMode: ReturnType<typeof vi.fn>;
}

function createMockTerminal(): { input: MockInput; output: MockOutput } {
  return {
    output: {
      columns: 80,
      isTTY: true,
      write: vi.fn(),
    },
    input: {
      isTTY: true,
      pause: vi.fn(),
      setRawMode: vi.fn(),
    },
  };
}

describe("createTerminalFrameWriter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes the initial frame once", () => {
    const { input, output } = createMockTerminal();
    const writer = createTerminalFrameWriter({ input, output });

    writer.write("alpha\nbeta");

    expect(output.write).toHaveBeenNthCalledWith(1, "\u001B[?25l");
    expect(output.write).toHaveBeenNthCalledWith(2, "alpha\nbeta\n");
  });

  it("skips writes when the frame is unchanged", () => {
    const { input, output } = createMockTerminal();
    const writer = createTerminalFrameWriter({ input, output });

    writer.write("alpha\nbeta");
    output.write.mockClear();

    const changed = writer.write("alpha\nbeta");

    expect(changed).toBe(false);
    expect(output.write).not.toHaveBeenCalled();
  });

  it("rewrites only the changed rows", () => {
    const { input, output } = createMockTerminal();
    const writer = createTerminalFrameWriter({ input, output });

    writer.write("alpha\nbeta");
    output.write.mockClear();

    writer.write("alpha\nBETA");

    const chunks = output.write.mock.calls.map((call) => call[0]);
    expect(chunks).toContain("\u001B[2F");
    expect(chunks.join("")).toContain("\u001B[2KBETA");
    expect(chunks.join("")).not.toContain("\u001B[2Kalpha");
  });

  it("clears stale rows when the next frame is shorter", () => {
    const { input, output } = createMockTerminal();
    const writer = createTerminalFrameWriter({ input, output });

    writer.write("alpha\nbeta\ngamma");
    output.write.mockClear();

    writer.write("alpha");

    const clearCount =
      output.write.mock.calls
        .map((call) => call[0])
        .join("")
        .split("\u001B[2K").length - 1;

    expect(clearCount).toBe(2);
  });

  it("re-anchors the cursor after shrinking before the next update", () => {
    const { input, output } = createMockTerminal();
    const writer = createTerminalFrameWriter({ input, output });

    writer.write("alpha\nbeta\ngamma");
    output.write.mockClear();

    writer.write("alpha");

    const shrinkChunks = output.write.mock.calls.map((call) => call[0]);
    expect(shrinkChunks[shrinkChunks.length - 1]).toBe("\u001B[2F");

    output.write.mockClear();
    writer.write("ALPHA");

    expect(output.write).toHaveBeenNthCalledWith(1, "\u001B[1F");
    expect(output.write.mock.calls.map((call) => call[0]).join("")).toContain("\u001B[2KALPHA");
  });

  it("restores cursor visibility and terminal state during cleanup", () => {
    const { input, output } = createMockTerminal();
    const writer = createTerminalFrameWriter({ input, output });

    writer.cleanup();

    expect(output.write).toHaveBeenLastCalledWith("\u001B[?25h");
    expect(input.setRawMode).toHaveBeenCalledWith(false);
    expect(input.pause).toHaveBeenCalledOnce();
  });
});

describe("getDashboardTerminalSupport", () => {
  it("rejects non-interactive terminals", () => {
    const support = getDashboardTerminalSupport(
      {
        columns: 80,
        isTTY: false,
        write: vi.fn(),
      },
      {
        isTTY: false,
        pause: vi.fn(),
        setRawMode: vi.fn(),
      },
      { TERM: "xterm-256color" }
    );

    expect(support.supported).toBe(false);
    expect(support.reason).toContain("interactive");
  });
});
