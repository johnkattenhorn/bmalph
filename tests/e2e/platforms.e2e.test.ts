import { describe, it, expect, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runInit, runUpgrade, runDoctor } from "./helpers/cli-runner.js";
import { setupCursorDoctorEnv } from "./helpers/cursor-runtime.js";
import { createTestProject, type TestProject } from "./helpers/project-scaffold.js";
import {
  expectBmalphInitializedForPlatform,
  expectDoctorCheckPassed,
  expectFileExists,
  expectFileContains,
  expectFileNotExists,
  type PlatformAssertionConfig,
} from "./helpers/assertions.js";

/**
 * Platform configs for parameterized tests.
 * Excludes claude-code (already covered by existing E2E tests).
 */
const PLATFORM_CONFIGS: PlatformAssertionConfig[] = [
  { id: "codex", instructionsFile: "AGENTS.md", commandDelivery: "skills", tier: "full" },
  {
    id: "cursor",
    instructionsFile: ".cursor/rules/bmad.mdc",
    commandDelivery: "index",
    tier: "full",
  },
  {
    id: "windsurf",
    instructionsFile: ".windsurf/rules/bmad.md",
    commandDelivery: "index",
    tier: "instructions-only",
  },
  {
    id: "copilot",
    instructionsFile: ".github/copilot-instructions.md",
    commandDelivery: "index",
    tier: "full",
  },
  {
    id: "aider",
    instructionsFile: "CONVENTIONS.md",
    commandDelivery: "index",
    tier: "instructions-only",
  },
];

/** Doctor check labels per platform (from platform definitions) */
const DOCTOR_LABELS: Record<string, string> = {
  codex: "AGENTS.md contains BMAD snippet",
  cursor: ".cursor/rules/bmad.mdc contains BMAD snippet",
  windsurf: ".windsurf/rules/bmad.md contains BMAD snippet",
  copilot: ".github/copilot-instructions.md contains BMAD snippet",
  aider: "CONVENTIONS.md contains BMAD snippet",
};

describe("multi-platform e2e", { timeout: 60000 }, () => {
  let project: TestProject | null = null;

  afterEach(async () => {
    if (project) {
      await project.cleanup();
      project = null;
    }
  });

  describe.each(PLATFORM_CONFIGS)("$id platform", (platform) => {
    it("init --platform creates correct structure", async () => {
      project = await createTestProject();

      const result = await runInit(project.path, "test-project", "E2E test", platform.id);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("bmalph initialized successfully");

      await expectBmalphInitializedForPlatform(project.path, platform);

      // Should not create CLAUDE.md for non-claude-code platforms
      if (platform.id !== "claude-code") {
        await expectFileNotExists(join(project.path, "CLAUDE.md"));
      }
    });

    it("doctor passes after init", async () => {
      project = await createTestProject();

      await runInit(project.path, "test-project", "E2E test", platform.id);
      const doctorEnv =
        platform.id === "cursor" ? await setupCursorDoctorEnv(project.path) : undefined;
      const result = await runDoctor(project.path, { env: doctorEnv });

      expect(result.exitCode).toBe(0);

      // Core checks
      expectDoctorCheckPassed(result.stdout, "bmalph/config.json exists and valid");
      expectDoctorCheckPassed(result.stdout, "_bmad/ directory present");
      expectDoctorCheckPassed(result.stdout, "ralph_loop.sh present and has content");

      // Platform-specific instruction check
      const doctorLabel = DOCTOR_LABELS[platform.id];
      if (doctorLabel) {
        expectDoctorCheckPassed(result.stdout, doctorLabel);
      }
    });

    it("upgrade preserves platform config", async () => {
      project = await createTestProject();

      await runInit(project.path, "test-project", "E2E test", platform.id);
      const result = await runUpgrade(project.path);

      expect(result.exitCode).toBe(0);

      // Config still has correct platform
      const configRaw = await readFile(join(project.path, "bmalph/config.json"), "utf-8");
      const config = JSON.parse(configRaw) as Record<string, unknown>;
      expect(config.platform).toBe(platform.id);

      // Instructions file still contains BMAD snippet
      await expectFileContains(join(project.path, platform.instructionsFile), "BMAD-METHOD");
    });

    it("init → upgrade → doctor workflow", async () => {
      project = await createTestProject();

      const initResult = await runInit(project.path, "test-project", "E2E test", platform.id);
      expect(initResult.exitCode).toBe(0);

      const upgradeResult = await runUpgrade(project.path);
      expect(upgradeResult.exitCode).toBe(0);

      const doctorEnv =
        platform.id === "cursor" ? await setupCursorDoctorEnv(project.path) : undefined;
      const doctorResult = await runDoctor(project.path, { env: doctorEnv });
      expect(doctorResult.exitCode).toBe(0);
      expect(doctorResult.stdout).toContain("all checks OK");
    });
  });

  describe("codex-specific", () => {
    it("command index generated instead of inline commands", async () => {
      project = await createTestProject();

      await runInit(project.path, "test-project", "E2E test", "codex");

      // _bmad/COMMANDS.md should exist with command index
      await expectFileExists(join(project.path, "_bmad/COMMANDS.md"));
      await expectFileContains(join(project.path, "_bmad/COMMANDS.md"), "# BMAD Commands");

      // No .claude/commands/ directory created
      await expectFileNotExists(join(project.path, ".claude/commands"));
    });

    it("generates Codex Skills in .agents/skills/", async () => {
      project = await createTestProject();

      await runInit(project.path, "test-project", "E2E test", "codex");

      // Agent skill exists with correct structure
      await expectFileExists(join(project.path, ".agents/skills/bmad-analyst/SKILL.md"));
      await expectFileContains(
        join(project.path, ".agents/skills/bmad-analyst/SKILL.md"),
        "managed-by: bmalph"
      );

      // Workflow skill exists
      await expectFileExists(join(project.path, ".agents/skills/bmad-create-prd/SKILL.md"));

      // CLI pointer commands are NOT generated as skills
      await expectFileNotExists(join(project.path, ".agents/skills/bmad-bmalph-implement"));
      await expectFileNotExists(join(project.path, ".agents/skills/bmad-bmalph-status"));
    });

    it("instructions reference $command-name syntax", async () => {
      project = await createTestProject();

      await runInit(project.path, "test-project", "E2E test", "codex");

      await expectFileContains(join(project.path, "AGENTS.md"), "$command-name");
      await expectFileContains(join(project.path, "AGENTS.md"), "Codex Skills");
    });

    it(".ralphrc has correct platform driver", async () => {
      project = await createTestProject();

      await runInit(project.path, "test-project", "E2E test", "codex");

      await expectFileExists(join(project.path, ".ralph/.ralphrc"));
      await expectFileContains(
        join(project.path, ".ralph/.ralphrc"),
        'PLATFORM_DRIVER="${PLATFORM_DRIVER:-codex}"'
      );
    });
  });

  describe("cursor-specific", () => {
    it("writes a valid MDC rule without Claude slash-command guidance", async () => {
      project = await createTestProject();

      const result = await runInit(project.path, "test-project", "E2E test", "cursor");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain("/bmalph");
      expect(result.stdout).not.toContain("/analyst");

      const content = await readFile(join(project.path, ".cursor/rules/bmad.mdc"), "utf-8");
      expect(content).toMatch(/^---\r?\n/);
      expect(content).toContain("alwaysApply: true");
      expect(content).toContain("## BMAD-METHOD Integration");
      expect(content).not.toContain("/bmalph");
      expect(content).not.toContain("/analyst");
    });
  });

  describe("instructions-only platforms", () => {
    const instructionsOnlyPlatforms = PLATFORM_CONFIGS.filter(
      (p) => p.tier === "instructions-only"
    );

    it.each(instructionsOnlyPlatforms)(
      "$id: has command index, no directory-based commands",
      async (platform) => {
        project = await createTestProject();

        await runInit(project.path, "test-project", "E2E test", platform.id);

        // No .claude/commands/ directory
        await expectFileNotExists(join(project.path, ".claude/commands"));

        // _bmad/COMMANDS.md should exist
        await expectFileExists(join(project.path, "_bmad/COMMANDS.md"));
        await expectFileContains(join(project.path, "_bmad/COMMANDS.md"), "# BMAD Commands");
      }
    );

    it.each(instructionsOnlyPlatforms)(
      "$id: instructions mention Phases 1-3 but not Phase 4",
      async (platform) => {
        project = await createTestProject();

        await runInit(project.path, "test-project", "E2E test", platform.id);

        const content = await readFile(join(project.path, platform.instructionsFile), "utf-8");

        // Should mention phases 1-3
        expect(content).toContain("Analysis");
        expect(content).toContain("Planning");
        expect(content).toContain("Solutioning");

        // Should not mention Phase 4 / Implementation phase row
        expect(content).not.toContain("4. Implementation");
        expect(content).toContain("not supported on this platform");
      }
    );
  });

  describe.each(
    PLATFORM_CONFIGS.filter(
      (p) => p.tier === "full" && (p.commandDelivery === "index" || p.commandDelivery === "skills")
    )
  )("$id-specific", (platform) => {
    it("instructions reference Phase 4 and Ralph", async () => {
      project = await createTestProject();

      await runInit(project.path, "test-project", "E2E test", platform.id);

      const content = await readFile(join(project.path, platform.instructionsFile), "utf-8");

      expect(content).toContain("4. Implementation");
      expect(content).toContain("Ralph");
      expect(content).not.toContain("not supported on this platform");
    });

    it("has command index but no directory-based commands", async () => {
      project = await createTestProject();

      await runInit(project.path, "test-project", "E2E test", platform.id);

      await expectFileNotExists(join(project.path, ".claude/commands"));
      await expectFileExists(join(project.path, "_bmad/COMMANDS.md"));
      await expectFileContains(join(project.path, "_bmad/COMMANDS.md"), "# BMAD Commands");
    });

    it(".ralphrc has correct platform driver", async () => {
      project = await createTestProject();

      await runInit(project.path, "test-project", "E2E test", platform.id);

      await expectFileExists(join(project.path, ".ralph/.ralphrc"));
      await expectFileContains(
        join(project.path, ".ralph/.ralphrc"),
        `PLATFORM_DRIVER="\${PLATFORM_DRIVER:-${platform.id}}"`
      );
    });
  });

  describe("_bmad/config.yaml platform field", () => {
    it.each(PLATFORM_CONFIGS)("$id: config.yaml has correct platform", async (platform) => {
      project = await createTestProject();

      await runInit(project.path, "test-project", "E2E test", platform.id);

      await expectFileExists(join(project.path, "_bmad/config.yaml"));
      await expectFileContains(join(project.path, "_bmad/config.yaml"), `platform: ${platform.id}`);
    });
  });
});
