import { runBashCommand, type BashCommandResult } from "../run/ralph-process.js";
import type { PlatformDoctorCheck } from "./types.js";

const CURSOR_STATUS_TIMEOUT_MS = 15000;

function summarizeBashOutput(
  result: BashCommandResult,
  fallback: string,
  options: { preferStdout?: boolean } = {}
): string {
  const ordered = options.preferStdout
    ? [result.stdout, result.stderr]
    : [result.stderr, result.stdout];

  for (const value of ordered) {
    const summary = value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);

    if (summary) {
      return summary;
    }
  }

  return fallback;
}

function isCursorAuthenticated(result: BashCommandResult): boolean {
  if (result.exitCode !== 0) {
    return false;
  }

  const output = `${result.stdout}\n${result.stderr}`.toLowerCase();
  return !/(not authenticated|not logged in|unauthenticated|login required)/.test(output);
}

export function getCursorDoctorChecks(): PlatformDoctorCheck[] {
  return [
    {
      id: "cursor-agent-available",
      label: "cursor-agent available in bash",
      check: async (projectDir: string) => {
        const result = await runBashCommand("command -v cursor-agent", { cwd: projectDir });
        const passed = result.exitCode === 0;

        return {
          passed,
          detail: passed
            ? summarizeBashOutput(result, "cursor-agent found", { preferStdout: true })
            : "cursor-agent not found in bash PATH",
          hint: passed
            ? undefined
            : "Install Cursor CLI so `cursor-agent` is available in the bash environment Ralph uses",
        };
      },
    },
    {
      id: "cursor-agent-auth",
      label: "cursor-agent authenticated",
      check: async (projectDir: string) => {
        const result = await runBashCommand("cursor-agent status", {
          cwd: projectDir,
          timeoutMs: CURSOR_STATUS_TIMEOUT_MS,
        });
        const passed = isCursorAuthenticated(result);

        return {
          passed,
          detail: summarizeBashOutput(
            result,
            passed ? "authenticated" : "cursor-agent status reported an authentication problem",
            { preferStdout: true }
          ),
          hint: passed
            ? undefined
            : "Run `cursor-agent status` in bash and sign in to Cursor before starting Ralph",
        };
      },
    },
  ];
}

export async function validateCursorRuntime(projectDir: string): Promise<void> {
  const jqResult = await runBashCommand("command -v jq", { cwd: projectDir });
  if (jqResult.exitCode !== 0) {
    throw new Error("jq is not available in the bash environment Ralph uses.");
  }

  const cursorAgentResult = await runBashCommand("command -v cursor-agent", { cwd: projectDir });
  if (cursorAgentResult.exitCode !== 0) {
    throw new Error("cursor-agent is not available in the bash environment Ralph uses.");
  }

  const authResult = await runBashCommand("cursor-agent status", {
    cwd: projectDir,
    timeoutMs: CURSOR_STATUS_TIMEOUT_MS,
  });
  if (!isCursorAuthenticated(authResult)) {
    throw new Error(
      summarizeBashOutput(
        authResult,
        "cursor-agent is not authenticated. Run `cursor-agent status` in bash and sign in to Cursor."
      )
    );
  }
}
