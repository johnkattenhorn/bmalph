import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { copilotPlatform } from "../../src/platform/copilot.js";

describe("copilotPlatform", () => {
  it("has correct id, displayName, and tier", () => {
    expect(copilotPlatform.id).toBe("copilot");
    expect(copilotPlatform.displayName).toBe("GitHub Copilot CLI");
    expect(copilotPlatform.tier).toBe("full");
  });

  it("is marked as experimental", () => {
    expect(copilotPlatform.experimental).toBe(true);
  });

  it("instructionsFile is .github/copilot-instructions.md", () => {
    expect(copilotPlatform.instructionsFile).toBe(".github/copilot-instructions.md");
  });

  it("commandDelivery is none", () => {
    expect(copilotPlatform.commandDelivery).toEqual({ kind: "none" });
  });

  it("generateInstructionsSnippet contains BMAD-METHOD Integration", () => {
    const snippet = copilotPlatform.generateInstructionsSnippet();
    expect(snippet).toContain("BMAD-METHOD Integration");
  });

  it("generateInstructionsSnippet references Phase 4 and Ralph", () => {
    const snippet = copilotPlatform.generateInstructionsSnippet();
    expect(snippet).toContain("4. Implementation");
    expect(snippet).toContain("Ralph");
  });

  it("generateInstructionsSnippet does not contain slash command syntax", () => {
    const snippet = copilotPlatform.generateInstructionsSnippet();
    expect(snippet).not.toMatch(/\/bmalph\b/);
    expect(snippet).not.toMatch(/\/analyst\b/);
    expect(snippet).not.toMatch(/\/architect\b/);
    expect(snippet).not.toMatch(/\/pm\b/);
  });

  it("generateInstructionsSnippet does not say platform unsupported", () => {
    const snippet = copilotPlatform.generateInstructionsSnippet();
    expect(snippet).not.toContain("not supported on this platform");
  });

  it("getDoctorChecks returns at least 1 check", () => {
    const checks = copilotPlatform.getDoctorChecks();
    expect(checks.length).toBeGreaterThanOrEqual(1);
  });

  describe("doctor checks", () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = join(
        tmpdir(),
        `bmalph-copilot-${Date.now()}-${Math.random().toString(36).slice(2)}`
      );
      await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      try {
        await rm(testDir, { recursive: true, force: true });
      } catch {
        // Windows file locking
      }
    });

    it("instructions-file check passes when file has marker", async () => {
      const filePath = join(testDir, ".github/copilot-instructions.md");
      await mkdir(join(testDir, ".github"), { recursive: true });
      await writeFile(filePath, "## BMAD-METHOD Integration\nContent here");
      const checks = copilotPlatform.getDoctorChecks();
      const instrCheck = checks.find((c) => c.id === "instructions-file")!;
      const result = await instrCheck.check(testDir);
      expect(result.passed).toBe(true);
    });

    it("instructions-file check fails when file missing", async () => {
      const checks = copilotPlatform.getDoctorChecks();
      const instrCheck = checks.find((c) => c.id === "instructions-file")!;
      const result = await instrCheck.check(testDir);
      expect(result.passed).toBe(false);
      expect(result.detail).toContain("not found");
    });
  });
});
