import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function readGitignoreLines(): Promise<string[]> {
  const content = await readFile(".gitignore", "utf-8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

describe("repository .gitignore", () => {
  it("ignores generated local workspace artifacts", async () => {
    const lines = await readGitignoreLines();

    expect(lines).toContain(".cursor/");
    expect(lines).toContain(".ralph/");
    expect(lines).toContain(".ralphrc");
    expect(lines).toContain("_bmad/");
    expect(lines).toContain("bmalph/");
    expect(lines).toContain(".claude/skills/");
    expect(lines).toContain(".claude/scheduled_tasks.lock");
  });

  it("ignores temporary Cursor analysis artifacts and alternate coverage directories", async () => {
    const lines = await readGitignoreLines();

    expect(lines).toContain(".tmp-*");
    expect(lines).toContain("coverage*/");
  });
});
