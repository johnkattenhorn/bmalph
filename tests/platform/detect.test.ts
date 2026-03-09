import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectPlatform } from "../../src/platform/detect.js";

describe("detectPlatform", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `bmalph-detect-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Windows file locking
    }
  });

  it("returns claude-code when .claude/ exists", async () => {
    await mkdir(join(testDir, ".claude"), { recursive: true });
    const result = await detectPlatform(testDir);
    expect(result.detected).toBe("claude-code");
  });

  it("treats root AGENTS.md as ambiguous between Codex and Cursor", async () => {
    await writeFile(join(testDir, "AGENTS.md"), "# Agents");
    const result = await detectPlatform(testDir);
    expect(result.detected).toBeNull();
    expect(result.candidates).toContain("codex");
    expect(result.candidates).toContain("cursor");
  });

  it("returns null when no markers found", async () => {
    const result = await detectPlatform(testDir);
    expect(result.detected).toBeNull();
    expect(result.candidates).toHaveLength(0);
  });

  it("returns null with multiple candidates when both .claude/ and AGENTS.md exist", async () => {
    await mkdir(join(testDir, ".claude"), { recursive: true });
    await writeFile(join(testDir, "AGENTS.md"), "# Agents");
    const result = await detectPlatform(testDir);
    expect(result.detected).toBeNull();
    expect(result.candidates.length).toBeGreaterThan(1);
  });

  it("candidates array contains all matched platforms", async () => {
    await mkdir(join(testDir, ".claude"), { recursive: true });
    await writeFile(join(testDir, "AGENTS.md"), "# Agents");
    const result = await detectPlatform(testDir);
    expect(result.candidates).toContain("claude-code");
    expect(result.candidates).toContain("codex");
  });

  it("returns cursor when .cursor/ exists", async () => {
    await mkdir(join(testDir, ".cursor"), { recursive: true });
    const result = await detectPlatform(testDir);
    expect(result.detected).toBe("cursor");
  });

  it("lets .cursor take precedence over root AGENTS.md and CLAUDE.md", async () => {
    await mkdir(join(testDir, ".cursor"), { recursive: true });
    await writeFile(join(testDir, "AGENTS.md"), "# Agents");
    await writeFile(join(testDir, "CLAUDE.md"), "# Claude");

    const result = await detectPlatform(testDir);

    expect(result.detected).toBe("cursor");
    expect(result.candidates).toEqual(["cursor"]);
  });

  it("treats root CLAUDE.md as ambiguous between Claude Code and Cursor", async () => {
    await writeFile(join(testDir, "CLAUDE.md"), "# Claude");

    const result = await detectPlatform(testDir);

    expect(result.detected).toBeNull();
    expect(result.candidates).toContain("claude-code");
    expect(result.candidates).toContain("cursor");
  });

  it("returns copilot when .github/copilot-instructions.md exists", async () => {
    await mkdir(join(testDir, ".github"), { recursive: true });
    await writeFile(join(testDir, ".github/copilot-instructions.md"), "# Copilot");
    const result = await detectPlatform(testDir);
    expect(result.detected).toBe("copilot");
  });

  it("returns windsurf when .windsurf/ exists", async () => {
    await mkdir(join(testDir, ".windsurf"), { recursive: true });
    const result = await detectPlatform(testDir);
    expect(result.detected).toBe("windsurf");
  });

  it("returns aider when .aider.conf.yml exists", async () => {
    await writeFile(join(testDir, ".aider.conf.yml"), "model: gpt-4");
    const result = await detectPlatform(testDir);
    expect(result.detected).toBe("aider");
  });
});
