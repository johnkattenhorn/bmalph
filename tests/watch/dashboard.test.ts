import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("chalk");

vi.mock("../../src/watch/state-reader.js", () => ({
  readDashboardState: vi.fn(),
}));

vi.mock("../../src/watch/renderer.js", () => ({
  renderDashboard: vi.fn(),
}));

import type { DashboardState } from "../../src/watch/types.js";
import { readDashboardState } from "../../src/watch/state-reader.js";
import { renderDashboard } from "../../src/watch/renderer.js";
import { createRefreshCallback, startDashboard } from "../../src/watch/dashboard.js";

const mockReadState = vi.mocked(readDashboardState);
const mockRenderDashboard = vi.mocked(renderDashboard);

function renderVisibleBody(state: DashboardState): string {
  const sections = [
    state.loop
      ? `loop:${state.loop.loopCount}:${state.loop.status}:${state.loop.lastAction}`
      : "loop:none",
    state.session ? `session:${state.session.createdAt}` : "session:none",
    state.execution
      ? `execution:${state.execution.status}:${state.execution.lastOutput}`
      : "execution:none",
    state.circuitBreaker?.reason ? `reason:${state.circuitBreaker.reason}` : "reason:none",
    state.stories?.nextStory ? `next:${state.stories.nextStory}` : "next:none",
    state.recentLogs.map((entry) => `${entry.level}:${entry.message}`).join("|"),
    `updated:${state.lastUpdated.toISOString()}`,
  ];
  return sections.join(" | ");
}

function makeEmptyState(): DashboardState {
  return {
    loop: null,
    circuitBreaker: null,
    stories: null,
    analysis: null,
    execution: null,
    session: null,
    recentLogs: [],
    liveLog: [],
    ralphCompleted: false,
    lastUpdated: new Date("2026-02-25T14:25:15Z"),
  };
}

describe("createRefreshCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads state and renders dashboard", async () => {
    const state = makeEmptyState();
    mockReadState.mockResolvedValue(state);
    mockRenderDashboard.mockImplementation(renderVisibleBody);
    const now = new Date("2026-02-25T15:00:00Z");

    const writeSpy = vi.fn();
    const refresh = createRefreshCallback("/test/project", writeSpy, {
      now: () => now,
    });
    await refresh();

    expect(mockReadState).toHaveBeenCalledWith("/test/project");
    expect(mockRenderDashboard).toHaveBeenLastCalledWith({
      ...state,
      lastUpdated: now,
    });
    expect(writeSpy).toHaveBeenCalledOnce();
    expect(writeSpy.mock.calls[0]![0]).toContain(`updated:${now.toISOString()}`);
  });

  it("reuses the last meaningful update when state is unchanged", async () => {
    mockReadState.mockResolvedValue(makeEmptyState());
    mockRenderDashboard.mockImplementation(renderVisibleBody);
    const timestamps = [new Date("2026-02-25T15:00:00Z"), new Date("2026-02-25T15:01:00Z")];

    const writeSpy = vi.fn();
    const refresh = createRefreshCallback("/test/project", writeSpy, {
      now: () => timestamps.shift() ?? new Date("2026-02-25T15:02:00Z"),
    });
    await refresh();
    await refresh();

    expect(mockRenderDashboard.mock.calls[0]![0]!.lastUpdated).toEqual(
      new Date("2026-02-25T15:00:00Z")
    );
    expect(mockRenderDashboard.mock.calls[1]![0]!.lastUpdated).toEqual(
      new Date("2026-02-25T15:00:00Z")
    );
    expect(writeSpy.mock.calls[0]![0]).toBe(writeSpy.mock.calls[1]![0]);
  });

  it("updates the meaningful timestamp when Ralph state changes", async () => {
    const firstState = makeEmptyState();
    const secondState = makeEmptyState();
    secondState.loop = {
      loopCount: 2,
      status: "running",
      lastAction: "testing",
      callsMadeThisHour: 1,
      maxCallsPerHour: 100,
    };

    mockReadState.mockResolvedValueOnce(firstState).mockResolvedValueOnce(secondState);
    mockRenderDashboard.mockImplementation(renderVisibleBody);
    const timestamps = [new Date("2026-02-25T15:00:00Z"), new Date("2026-02-25T15:01:00Z")];

    const writeSpy = vi.fn();
    const refresh = createRefreshCallback("/test/project", writeSpy, {
      now: () => timestamps.shift() ?? new Date("2026-02-25T15:02:00Z"),
    });
    await refresh();
    await refresh();

    expect(mockRenderDashboard.mock.calls.at(-1)?.[0]?.lastUpdated).toEqual(
      new Date("2026-02-25T15:01:00Z")
    );
    expect(writeSpy.mock.calls[0]![0]).not.toBe(writeSpy.mock.calls[1]![0]);
  });

  it("does not advance the timestamp when only session lastUsed changes", async () => {
    const firstState = makeEmptyState();
    firstState.loop = {
      loopCount: 2,
      status: "running",
      lastAction: "testing",
      callsMadeThisHour: 1,
      maxCallsPerHour: 100,
    };
    firstState.session = {
      createdAt: "2026-02-25T14:00:00Z",
      lastUsed: "2026-02-25T14:05:00Z",
    };

    const secondState = {
      ...firstState,
      session: {
        createdAt: "2026-02-25T14:00:00Z",
        lastUsed: "2026-02-25T14:15:00Z",
      },
    };

    mockReadState.mockResolvedValueOnce(firstState).mockResolvedValueOnce(secondState);
    mockRenderDashboard.mockImplementation(renderVisibleBody);
    const timestamps = [new Date("2026-02-25T15:00:00Z"), new Date("2026-02-25T15:01:00Z")];

    const writeSpy = vi.fn();
    const refresh = createRefreshCallback("/test/project", writeSpy, {
      now: () => timestamps.shift() ?? new Date("2026-02-25T15:02:00Z"),
    });
    await refresh();
    const firstTimestamp = mockRenderDashboard.mock.calls.at(-1)?.[0]?.lastUpdated;
    await refresh();
    const secondTimestamp = mockRenderDashboard.mock.calls.at(-1)?.[0]?.lastUpdated;

    expect(secondTimestamp).toEqual(firstTimestamp);
    expect(writeSpy.mock.calls[0]![0]).toBe(writeSpy.mock.calls[1]![0]);
  });

  it("does not advance the timestamp when only ralphCompleted changes", async () => {
    const firstState = makeEmptyState();
    firstState.loop = {
      loopCount: 2,
      status: "running",
      lastAction: "testing",
      callsMadeThisHour: 1,
      maxCallsPerHour: 100,
    };
    const secondState = {
      ...firstState,
      ralphCompleted: true,
    };

    mockReadState.mockResolvedValueOnce(firstState).mockResolvedValueOnce(secondState);
    mockRenderDashboard.mockImplementation(renderVisibleBody);
    const timestamps = [new Date("2026-02-25T15:00:00Z"), new Date("2026-02-25T15:01:00Z")];

    const refresh = createRefreshCallback("/test/project", vi.fn(), {
      now: () => timestamps.shift() ?? new Date("2026-02-25T15:02:00Z"),
    });
    await refresh();
    const firstTimestamp = mockRenderDashboard.mock.calls.at(-1)?.[0]?.lastUpdated;
    await refresh();
    const secondTimestamp = mockRenderDashboard.mock.calls.at(-1)?.[0]?.lastUpdated;

    expect(secondTimestamp).toEqual(firstTimestamp);
  });

  it("does not advance the timestamp when hidden live output changes", async () => {
    const firstState = makeEmptyState();
    firstState.loop = {
      loopCount: 2,
      status: "running",
      lastAction: "testing",
      callsMadeThisHour: 1,
      maxCallsPerHour: 100,
    };
    const secondState = {
      ...firstState,
      liveLog: ["new hidden line"],
    };

    mockReadState.mockResolvedValueOnce(firstState).mockResolvedValueOnce(secondState);
    mockRenderDashboard.mockImplementation(renderVisibleBody);
    const timestamps = [new Date("2026-02-25T15:00:00Z"), new Date("2026-02-25T15:01:00Z")];

    const refresh = createRefreshCallback("/test/project", vi.fn(), {
      now: () => timestamps.shift() ?? new Date("2026-02-25T15:02:00Z"),
    });
    await refresh();
    const firstTimestamp = mockRenderDashboard.mock.calls.at(-1)?.[0]?.lastUpdated;
    await refresh();
    const secondTimestamp = mockRenderDashboard.mock.calls.at(-1)?.[0]?.lastUpdated;

    expect(secondTimestamp).toEqual(firstTimestamp);
  });

  it("does not advance the timestamp when only the decorated frame changes", async () => {
    mockReadState.mockResolvedValue(makeEmptyState());
    mockRenderDashboard.mockImplementation(renderVisibleBody);
    const timestamps = [new Date("2026-02-25T15:00:00Z"), new Date("2026-02-25T15:01:00Z")];

    let bar = "status:running";
    const writeSpy = vi.fn();
    const refresh = createRefreshCallback("/test/project", writeSpy, {
      decorateFrame: (frame) => `${frame}\n${bar}`,
      now: () => timestamps.shift() ?? new Date("2026-02-25T15:02:00Z"),
    });
    await refresh();
    const firstTimestamp = mockRenderDashboard.mock.calls.at(-1)?.[0]?.lastUpdated;

    bar = "prompt:stop";
    await refresh();
    const secondTimestamp = mockRenderDashboard.mock.calls.at(-1)?.[0]?.lastUpdated;

    expect(secondTimestamp).toEqual(firstTimestamp);
    expect(writeSpy.mock.calls[0]![0]).not.toBe(writeSpy.mock.calls[1]![0]);
  });
});

describe("startDashboard", () => {
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalIsTTY = process.stdin.isTTY;
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, writable: true });
    vi.restoreAllMocks();
  });

  it("can be stopped via signal in non-TTY environment", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, writable: true });
    mockReadState.mockResolvedValue(makeEmptyState());
    mockRenderDashboard.mockReturnValue("output");

    const promise = startDashboard({ projectDir: "/test/project", interval: 2000 });
    process.emit("SIGTERM");
    await promise;
  });
});
