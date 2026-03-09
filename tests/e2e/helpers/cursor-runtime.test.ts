import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockSpawnSync, mockResolveBashCommand } = vi.hoisted(() => ({
  mockSpawnSync: vi.fn(),
  mockResolveBashCommand: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawnSync: mockSpawnSync,
}));

vi.mock("../../../src/run/ralph-process.js", () => ({
  resolveBashCommand: mockResolveBashCommand,
}));

import { setupCursorDoctorEnv } from "./cursor-runtime.js";

describe("cursor runtime e2e helper", () => {
  let projectPath: string;

  beforeEach(async () => {
    projectPath = await mkdtemp(join(tmpdir(), "bmalph-cursor-helper-"));
    mockResolveBashCommand.mockResolvedValue("/usr/bin/bash");
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: "/usr/bin/jq\n",
      stderr: "",
    });
  });

  afterEach(async () => {
    await rm(projectPath, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("resolves jq through the bash executable Ralph uses", async () => {
    const env = await setupCursorDoctorEnv(projectPath);

    expect(mockResolveBashCommand).toHaveBeenCalledTimes(1);
    expect(mockSpawnSync).toHaveBeenCalledWith(
      "/usr/bin/bash",
      ["-lc", "command -v jq"],
      expect.objectContaining({
        encoding: "utf8",
        windowsHide: true,
      })
    );
    expect(env.PATH).toContain(join(projectPath, ".test-bin"));

    const jqShim = await readFile(join(projectPath, ".test-bin", "jq"), "utf-8");
    expect(jqShim).toContain("exec '/usr/bin/jq' \"$@\"");
  });
});
