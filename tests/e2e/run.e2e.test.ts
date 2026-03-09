import { describe, it, expect, afterEach } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runCli, runInit, runImplement, runRun } from "./helpers/cli-runner.js";
import { setupCursorRunEnv } from "./helpers/cursor-runtime.js";
import { createTestProject, type TestProject } from "./helpers/project-scaffold.js";

describe("bmalph run e2e", { timeout: 60000 }, () => {
  let project: TestProject | null = null;

  afterEach(async () => {
    if (project) {
      await project.cleanup();
      project = null;
    }
  });

  it("exits with error when project is not initialized", async () => {
    project = await createTestProject();

    const result = await runRun(project.path);

    expect(result.stderr).toContain("not initialized");
    expect(result.exitCode).toBe(1);
  });

  it("exits with error for instructions-only platform", async () => {
    project = await createTestProject();
    await runInit(project.path, "test-project", "test", "windsurf");

    const result = await runRun(project.path);

    expect(result.stderr).toContain("full-tier");
    expect(result.exitCode).toBe(1);
  });

  it("exits with error for unknown --driver value", async () => {
    project = await createTestProject();
    await runInit(project.path);

    const result = await runRun(project.path, { driver: "nonexistent" });

    expect(result.stderr).toContain("Unknown platform");
    expect(result.exitCode).toBe(1);
  });

  it("exits with error for invalid interval", async () => {
    project = await createTestProject();
    await runInit(project.path);

    const result = await runRun(project.path, { interval: 100 });

    expect(result.stderr).toContain("500");
    expect(result.exitCode).toBe(1);
  });

  it(
    "runs Cursor with JSON mode and resumes the saved session on the next loop",
    { timeout: 240000 },
    async () => {
      project = await createTestProject();
      await runInit(project.path, "cursor-project", "Cursor run smoke test", "cursor");
      await setupBmadArtifacts(project.path);

      const implementResult = await runImplement(project.path);
      expect(implementResult.exitCode).toBe(0);

      const cursorEnv = await setupCursorRunEnv(project.path);

      const result = await runCli(["run", "--driver", "cursor", "--no-dashboard"], {
        cwd: project.path,
        env: cursorEnv,
        timeout: 180000,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain("Ralph has completed the project");

      const cursorLog = await readFile(join(project.path, ".cursor-agent.calls.log"), "utf-8");

      const runInvocations = cursorLog
        .split(/\r?\n/)
        .filter((line) => line.startsWith("run|") && line.length > 0);
      expect(runInvocations).toHaveLength(2);
      expect(runInvocations[0]).toContain("-p --force --output-format json");
      expect(runInvocations[0]).not.toContain("--resume");
      expect(runInvocations[1]).toContain("-p --force --output-format json");
      expect(runInvocations[1]).toContain("--resume cursor-session-123");

      const status = JSON.parse(
        await readFile(join(project.path, ".ralph/status.json"), "utf-8")
      ) as { status: string; exit_reason: string };
      expect(status.status).toBe("completed");
      expect(status.exit_reason).toBe("completion_signals");
    }
  );
});

const SAMPLE_EPICS_STORIES = `# Epics and Stories

## Epic 1: Workspace Access

The workspace access flow lets users enter the product safely.

### Story 1.1: Sign in to a workspace

As a member, I want to sign in to my workspace, So that I can continue my work.

**Acceptance Criteria:**

- **Given** the workspace exists
- **When** I submit valid credentials
- **Then** I should reach the dashboard
`;

const SAMPLE_ARCHITECTURE = `# Architecture Document

## Tech Stack

- Node.js 20
- TypeScript
- Vitest
`;

const SAMPLE_PRD = `# Product Requirements Document

## Executive Summary

Test project for Cursor run smoke coverage.

## Functional Requirements

- Support workspace sign-in

## Non-Functional Requirements

- Keep the flow deterministic for automated testing

## Scope

- In scope: workspace sign-in
`;

async function setupBmadArtifacts(projectPath: string): Promise<void> {
  const artifactsDir = join(projectPath, "_bmad-output/planning-artifacts");
  await mkdir(artifactsDir, { recursive: true });
  await writeFile(join(artifactsDir, "epics-and-stories.md"), SAMPLE_EPICS_STORIES, "utf-8");
  await writeFile(join(artifactsDir, "architecture.md"), SAMPLE_ARCHITECTURE, "utf-8");
  await writeFile(join(artifactsDir, "prd.md"), SAMPLE_PRD, "utf-8");
}
