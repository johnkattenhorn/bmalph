import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { copilotPlatform } from "../../src/platform/copilot.js";
import { cursorPlatform } from "../../src/platform/cursor.js";
import type { Platform } from "../../src/platform/types.js";

const fullTierPlatforms: Array<{ platform: Platform; expectedFile: string }> = [
  { platform: copilotPlatform, expectedFile: ".github/copilot-instructions.md" },
  { platform: cursorPlatform, expectedFile: ".cursor/rules/bmad.mdc" },
];

describe("full-tier experimental platforms", () => {
  for (const { platform, expectedFile } of fullTierPlatforms) {
    describe(platform.displayName, () => {
      it("has tier full", () => {
        expect(platform.tier).toBe("full");
      });

      it("is marked as experimental", () => {
        expect(platform.experimental).toBe(true);
      });

      it("has commandDelivery kind index", () => {
        expect(platform.commandDelivery).toEqual({ kind: "index" });
      });

      it(`instructionsFile is ${expectedFile}`, () => {
        expect(platform.instructionsFile).toBe(expectedFile);
      });

      it("generateInstructionsSnippet contains BMAD-METHOD Integration", () => {
        const snippet = platform.generateInstructionsSnippet();
        expect(snippet).toContain("BMAD-METHOD Integration");
      });

      it("generateInstructionsSnippet references Phase 4 and Ralph", () => {
        const snippet = platform.generateInstructionsSnippet();
        expect(snippet).toContain("4. Implementation");
        expect(snippet).toContain("Ralph");
      });

      it("generateInstructionsSnippet does not contain slash command syntax", () => {
        const snippet = platform.generateInstructionsSnippet();
        expect(snippet).not.toMatch(/\/bmalph\b/);
        expect(snippet).not.toMatch(/\/analyst\b/);
        expect(snippet).not.toMatch(/\/architect\b/);
        expect(snippet).not.toMatch(/\/pm\b/);
      });

      it("generateInstructionsSnippet does not say platform unsupported", () => {
        const snippet = platform.generateInstructionsSnippet();
        expect(snippet).not.toContain("not supported on this platform");
      });

      it("getDoctorChecks returns at least 1 check", () => {
        const checks = platform.getDoctorChecks();
        expect(checks.length).toBeGreaterThanOrEqual(1);
      });
    });
  }

  describe("doctor checks with filesystem", () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `bmalph-full-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      try {
        await rm(testDir, { recursive: true, force: true });
      } catch {
        // Windows file locking
      }
    });

    for (const { platform, expectedFile } of fullTierPlatforms) {
      it(`${platform.displayName} check passes when instructions file has marker`, async () => {
        const filePath = join(testDir, expectedFile);
        await mkdir(join(filePath, ".."), { recursive: true });
        await writeFile(filePath, "## BMAD-METHOD Integration\nContent here");
        const checks = platform.getDoctorChecks();
        const instrCheck = checks.find((c) => c.id === "instructions-file")!;
        const result = await instrCheck.check(testDir);
        expect(result.passed).toBe(true);
      });

      it(`${platform.displayName} check fails when instructions file missing`, async () => {
        const checks = platform.getDoctorChecks();
        const instrCheck = checks.find((c) => c.id === "instructions-file")!;
        const result = await instrCheck.check(testDir);
        expect(result.passed).toBe(false);
        expect(result.detail).toContain("not found");
      });
    }
  });

  describe("Cursor MDC rule", () => {
    it("starts with MDC frontmatter and is always applied", () => {
      const snippet = cursorPlatform.generateInstructionsSnippet();

      expect(snippet.startsWith("---\n")).toBe(true);
      expect(snippet).toContain("description:");
      expect(snippet).toContain("alwaysApply: true");
      expect(snippet).toContain("## BMAD-METHOD Integration");
    });
  });
});
