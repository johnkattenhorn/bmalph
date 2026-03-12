import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runTransition } from "../../src/transition/orchestration.js";

describe("orchestration contract", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `bmalph-orchestration-contract-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await mkdir(join(testDir, "bmalph"), { recursive: true });
    await mkdir(join(testDir, ".ralph/specs"), { recursive: true });
    await writeFile(
      join(testDir, "bmalph/config.json"),
      JSON.stringify({ name: "contract-project", createdAt: "2025-01-01T00:00:00.000Z" })
    );
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Windows file locking
    }
  });

  async function createTransitionArtifacts(): Promise<void> {
    await mkdir(join(testDir, "_bmad-output/planning-artifacts"), { recursive: true });
    await writeFile(
      join(testDir, "_bmad-output/planning-artifacts/stories.md"),
      `## Epic 1: Core

### Story 1.1: Feature

Do something useful.

**Acceptance Criteria:**
**Given** a valid request
**When** the feature runs
**Then** it succeeds
`
    );
    await writeFile(
      join(testDir, "_bmad-output/planning-artifacts/architecture.md"),
      `# Architecture

## Tech Stack

- Node.js
- TypeScript
- Vitest
`
    );
    await writeFile(
      join(testDir, ".ralph/@AGENT.md"),
      [
        "# Agent",
        "",
        "## Project Setup",
        "```bash",
        "echo setup",
        "```",
        "",
        "## Running Tests",
        "```bash",
        "echo test",
        "```",
        "",
        "## Build Commands",
        "```bash",
        "echo build",
        "```",
        "",
        "## Development Server",
        "```bash",
        "echo dev",
        "```",
      ].join("\n")
    );
  }

  it("keeps the TransitionResult top-level shape", async () => {
    await createTransitionArtifacts();

    const result = await runTransition(testDir);

    expect(Object.keys(result).sort()).toEqual([
      "fixPlanPreserved",
      "generatedFiles",
      "preflightIssues",
      "storiesCount",
      "warnings",
    ]);
  });

  it("keeps generated file reporting in orchestration order", async () => {
    await createTransitionArtifacts();

    const result = await runTransition(testDir);

    const orderedPaths = result.generatedFiles
      .map((file) => file.path)
      .filter((path) =>
        [
          ".ralph/@fix_plan.md",
          ".ralph/specs/",
          ".ralph/SPECS_INDEX.md",
          ".ralph/PROJECT_CONTEXT.md",
          ".ralph/PROMPT.md",
          ".ralph/@AGENT.md",
        ].includes(path)
      );

    expect(orderedPaths).toEqual([
      ".ralph/@fix_plan.md",
      ".ralph/specs/",
      ".ralph/SPECS_INDEX.md",
      ".ralph/PROJECT_CONTEXT.md",
      ".ralph/PROMPT.md",
      ".ralph/@AGENT.md",
    ]);
  });
});
