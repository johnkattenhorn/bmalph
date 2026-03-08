import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile, access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const { mockRename } = vi.hoisted(() => ({
  mockRename: vi.fn(),
}));

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return { ...actual, rename: mockRename };
});

import { runTransition } from "../../src/transition/orchestration.js";

function toPosixPath(path: string): string {
  return path.replace(/\\/g, "/");
}

async function installRenameMock(
  shouldFail?: (src: string, dest: string) => boolean
): Promise<void> {
  const { rename: realRename } =
    await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  mockRename.mockImplementation(async (src: string, dest: string) => {
    if (shouldFail?.(src, dest)) {
      throw new Error("Simulated specs rename failure");
    }

    return (realRename as typeof import("fs/promises").rename)(src, dest);
  });
}

function isFinalSpecsSwap(src: string, dest: string): boolean {
  const normalizedSrc = toPosixPath(String(src));
  const normalizedDest = toPosixPath(String(dest));
  return normalizedSrc.endsWith("/.ralph/specs.new") && normalizedDest.endsWith("/.ralph/specs");
}

describe("orchestration atomic specs swap", { timeout: 30000 }, () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `bmalph-orchestration-atomic-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await mkdir(join(testDir, "bmalph"), { recursive: true });
    await mkdir(join(testDir, ".ralph/specs"), { recursive: true });
    await writeFile(
      join(testDir, "bmalph/config.json"),
      JSON.stringify({ name: "test-project", createdAt: "2025-01-01T00:00:00.000Z" })
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Windows file locking
    }
  });

  it("restores existing specs when the final rename fails for _bmad-output", async () => {
    await writeFile(join(testDir, ".ralph/specs/original.txt"), "original specs");
    await mkdir(join(testDir, "_bmad-output/planning-artifacts"), { recursive: true });
    await writeFile(
      join(testDir, "_bmad-output/planning-artifacts/stories.md"),
      `## Epic 1: Core\n\n### Story 1.1: Feature\n\nDo something.\n`
    );

    await installRenameMock(isFinalSpecsSwap);

    await expect(runTransition(testDir)).rejects.toThrow("Simulated specs rename failure");

    await expect(access(join(testDir, ".ralph/specs/original.txt"))).resolves.toBeUndefined();
    const content = await readFile(join(testDir, ".ralph/specs/original.txt"), "utf-8");
    expect(content).toBe("original specs");
  });

  it("restores existing specs when the final rename fails for docs/planning fallback", async () => {
    await writeFile(join(testDir, ".ralph/specs/original.txt"), "original specs");
    await mkdir(join(testDir, "docs/planning"), { recursive: true });
    await writeFile(
      join(testDir, "docs/planning/stories.md"),
      `## Epic 1: Core\n\n### Story 1.1: Feature\n\nDo something.\n`
    );

    await installRenameMock(isFinalSpecsSwap);

    await expect(runTransition(testDir)).rejects.toThrow("Simulated specs rename failure");

    await expect(access(join(testDir, ".ralph/specs/original.txt"))).resolves.toBeUndefined();
    const content = await readFile(join(testDir, ".ralph/specs/original.txt"), "utf-8");
    expect(content).toBe("original specs");
  });

  it("reuses specs.old as backup when retrying after an incomplete failed swap", async () => {
    await rm(join(testDir, ".ralph/specs"), { recursive: true, force: true });
    await mkdir(join(testDir, ".ralph/specs.old"), { recursive: true });
    await writeFile(join(testDir, ".ralph/specs.old/original.txt"), "original specs");
    await mkdir(join(testDir, "_bmad-output/planning-artifacts"), { recursive: true });
    await writeFile(
      join(testDir, "_bmad-output/planning-artifacts/stories.md"),
      `## Epic 1: Core\n\n### Story 1.1: Feature\n\nDo something.\n`
    );

    await installRenameMock(isFinalSpecsSwap);

    await expect(runTransition(testDir)).rejects.toThrow("Simulated specs rename failure");

    await expect(access(join(testDir, ".ralph/specs/original.txt"))).resolves.toBeUndefined();
    await expect(access(join(testDir, ".ralph/specs.old"))).rejects.toThrow();
    const content = await readFile(join(testDir, ".ralph/specs/original.txt"), "utf-8");
    expect(content).toBe("original specs");
  });

  it("cleans up specs swap temp directories after a successful transition", async () => {
    await mkdir(join(testDir, "_bmad-output/planning-artifacts"), { recursive: true });
    await writeFile(
      join(testDir, "_bmad-output/planning-artifacts/stories.md"),
      `## Epic 1: Core\n\n### Story 1.1: Feature\n\nDo something.\n`
    );
    await mkdir(join(testDir, ".ralph/specs.old/stale"), { recursive: true });
    await writeFile(join(testDir, ".ralph/specs.old/stale/data.txt"), "stale data");

    await installRenameMock();

    await runTransition(testDir);

    await expect(access(join(testDir, ".ralph/specs.new"))).rejects.toThrow();
    await expect(access(join(testDir, ".ralph/specs.old"))).rejects.toThrow();
    await expect(
      access(join(testDir, ".ralph/specs/planning-artifacts/stories.md"))
    ).resolves.toBeUndefined();
  });

  it("creates specs on first install without leaving swap directories behind", async () => {
    await rm(join(testDir, ".ralph/specs"), { recursive: true, force: true });
    await mkdir(join(testDir, "_bmad-output/planning-artifacts"), { recursive: true });
    await writeFile(
      join(testDir, "_bmad-output/planning-artifacts/stories.md"),
      `## Epic 1: Core\n\n### Story 1.1: Feature\n\nDo something.\n`
    );

    await installRenameMock();

    await runTransition(testDir);

    await expect(
      access(join(testDir, ".ralph/specs/planning-artifacts/stories.md"))
    ).resolves.toBeUndefined();
    await expect(access(join(testDir, ".ralph/specs.new"))).rejects.toThrow();
    await expect(access(join(testDir, ".ralph/specs.old"))).rejects.toThrow();
  });
});
