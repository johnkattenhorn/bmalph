import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRunBashCommand } = vi.hoisted(() => ({
  mockRunBashCommand: vi.fn(),
}));

vi.mock("../../src/run/ralph-process.js", () => ({
  runBashCommand: mockRunBashCommand,
}));

import { runBashCommand } from "../../src/run/ralph-process.js";
import {
  getCursorDoctorChecks,
  validateCursorRuntime,
} from "../../src/platform/cursor-runtime-checks.js";

const mockedRunBashCommand = vi.mocked(runBashCommand);

describe("cursor runtime checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("doctor check fails when cursor-agent is missing from bash", async () => {
    mockedRunBashCommand.mockResolvedValueOnce({
      exitCode: 1,
      stdout: "",
      stderr: "",
    });

    const checks = getCursorDoctorChecks();
    const result = await checks[0]!.check("/projects/cursor-app");

    expect(result.passed).toBe(false);
    expect(result.detail).toBe("cursor-agent not found in bash PATH");
  });

  it("doctor check fails when cursor-agent status reports unauthenticated", async () => {
    mockedRunBashCommand.mockResolvedValueOnce({
      exitCode: 1,
      stdout: "",
      stderr: "Not authenticated",
    });

    const checks = getCursorDoctorChecks();
    const result = await checks[1]!.check("/projects/cursor-app");

    expect(result.passed).toBe(false);
    expect(result.detail).toContain("Not authenticated");
    expect(result.hint).toContain("cursor-agent status");
  });

  it("doctor check uses an extended timeout for cursor-agent status", async () => {
    mockedRunBashCommand.mockResolvedValueOnce({
      exitCode: 0,
      stdout: "Authenticated as cursor-test@example.com",
      stderr: "",
    });

    const checks = getCursorDoctorChecks();
    await checks[1]!.check("/projects/cursor-app");

    expect(mockedRunBashCommand).toHaveBeenCalledWith("cursor-agent status", {
      cwd: "/projects/cursor-app",
      timeoutMs: 15000,
    });
  });

  it("validateCursorRuntime fails when bash cannot resolve jq", async () => {
    mockedRunBashCommand.mockResolvedValueOnce({
      exitCode: 1,
      stdout: "",
      stderr: "",
    });

    await expect(validateCursorRuntime("/projects/cursor-app")).rejects.toThrow(
      "jq is not available in the bash environment Ralph uses."
    );
  });

  it("validateCursorRuntime fails when cursor-agent is missing", async () => {
    mockedRunBashCommand
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "/usr/bin/jq\n",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 1,
        stdout: "",
        stderr: "",
      });

    await expect(validateCursorRuntime("/projects/cursor-app")).rejects.toThrow(
      "cursor-agent is not available in the bash environment Ralph uses."
    );
  });

  it("validateCursorRuntime fails when cursor-agent status is unauthenticated", async () => {
    mockedRunBashCommand
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "/usr/bin/jq\n",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "/usr/bin/cursor-agent\n",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 1,
        stdout: "",
        stderr: "Not authenticated",
      });

    await expect(validateCursorRuntime("/projects/cursor-app")).rejects.toThrow(
      "Not authenticated"
    );
  });

  it("validateCursorRuntime uses an extended timeout for cursor-agent status", async () => {
    mockedRunBashCommand
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "/usr/bin/jq\n",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "/usr/bin/cursor-agent\n",
        stderr: "",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "Authenticated as cursor-test@example.com",
        stderr: "",
      });

    await expect(validateCursorRuntime("/projects/cursor-app")).resolves.toBeUndefined();

    expect(mockedRunBashCommand).toHaveBeenLastCalledWith("cursor-agent status", {
      cwd: "/projects/cursor-app",
      timeoutMs: 15000,
    });
  });
});
