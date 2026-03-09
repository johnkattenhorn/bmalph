import { spawnSync } from "node:child_process";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { resolveBashCommand } from "../../../src/run/ralph-process.js";

export async function setupCursorDoctorEnv(projectPath: string): Promise<Record<string, string>> {
  const binDir = await setupCursorRuntime(projectPath, buildCursorDoctorStub());
  return { PATH: buildPathWithBin(binDir) };
}

export async function setupCursorRunEnv(projectPath: string): Promise<Record<string, string>> {
  const binDir = await setupCursorRuntime(projectPath, buildCursorRunStub(projectPath));
  return { PATH: buildPathWithBin(binDir) };
}

async function setupCursorRuntime(
  projectPath: string,
  cursorAgentContent: string
): Promise<string> {
  const binDir = join(projectPath, ".test-bin");
  await mkdir(binDir, { recursive: true });

  await writeExecutable(join(binDir, "jq"), buildJqShimContent(await resolveJqBinary(projectPath)));
  await writeExecutable(join(binDir, "cursor-agent"), cursorAgentContent);

  return binDir;
}

function buildPathWithBin(binDir: string): string {
  return [binDir, process.env.PATH ?? ""].filter(Boolean).join(delimiter);
}

async function resolveJqBinary(projectPath: string): Promise<string> {
  const bashCommand = await resolveBashCommand();
  const locator = spawnSync(bashCommand, ["-lc", "command -v jq"], {
    cwd: projectPath,
    encoding: "utf8",
    windowsHide: true,
  });

  if (locator.status !== 0) {
    throw new Error("jq is required for Cursor e2e tests");
  }

  const jqPath = locator.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!jqPath) {
    throw new Error("Unable to resolve jq path for Cursor e2e tests");
  }

  return jqPath;
}

function buildJqShimContent(realJqPath: string): string {
  return `#!/usr/bin/env bash
exec '${escapeForSingleQuotedBash(realJqPath)}' "$@"
`;
}

function buildCursorDoctorStub(): string {
  return `#!/usr/bin/env bash
set -euo pipefail

if [[ "\${1:-}" == "status" ]]; then
  echo "Authenticated as cursor-test@example.com"
  exit 0
fi

echo "unexpected cursor-agent invocation: $*" >&2
exit 1
`;
}

function buildCursorRunStub(projectPath: string): string {
  const callLogPath = join(projectPath, ".cursor-agent.calls.log").replaceAll("\\", "/");
  const counterPath = join(projectPath, ".cursor-agent.count").replaceAll("\\", "/");

  return `#!/usr/bin/env bash
set -euo pipefail

CALL_LOG='${escapeForSingleQuotedBash(callLogPath)}'
COUNTER_FILE='${escapeForSingleQuotedBash(counterPath)}'

if [[ "\${1:-}" == "status" ]]; then
  printf 'status|%s\\n' "$*" >> "$CALL_LOG"
  echo "Authenticated as cursor-test@example.com"
  exit 0
fi

count=0
if [[ -f "$COUNTER_FILE" ]]; then
  count=$(cat "$COUNTER_FILE")
fi
count=$((count + 1))
printf '%s' "$count" > "$COUNTER_FILE"

printf 'run|%s\\n' "$*" >> "$CALL_LOG"

if [[ "$count" -eq 1 ]]; then
  if printf '%s' "$*" | grep -q -- '--resume'; then
    echo "unexpected --resume on first Cursor call" >&2
    exit 1
  fi
  cat <<'EOF'
{"result":"Completed the initial workspace setup.\\n\\n---RALPH_STATUS---\\nSTATUS: COMPLETE\\nEXIT_SIGNAL: true\\n---END_RALPH_STATUS---","session_id":"cursor-session-123"}
EOF
  exit 0
fi

if ! printf '%s' "$*" | grep -q -- '--resume cursor-session-123'; then
  echo "expected --resume cursor-session-123 on resumed Cursor call" >&2
  exit 1
fi

cat <<'EOF'
{"result":"Completed the follow-up Cursor run.\\n\\n---RALPH_STATUS---\\nSTATUS: COMPLETE\\nEXIT_SIGNAL: true\\n---END_RALPH_STATUS---","session_id":"cursor-session-123"}
EOF
`;
}

async function writeExecutable(path: string, content: string): Promise<void> {
  await writeFile(path, content, "utf-8");
  await chmod(path, 0o755);
}

function escapeForSingleQuotedBash(value: string): string {
  return value.replaceAll("'", `'"'"'`);
}
