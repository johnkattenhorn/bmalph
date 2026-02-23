import chalk from "chalk";
import { runTransition } from "../transition/orchestration.js";
import { withErrorHandling } from "../utils/errors.js";
import { resolveProjectPlatform } from "../platform/resolve.js";
import type { PreflightIssue } from "../transition/types.js";

interface ImplementOptions {
  force?: boolean;
  projectDir: string;
}

export async function implementCommand(options: ImplementOptions): Promise<void> {
  await withErrorHandling(() => runImplement(options));
}

async function runImplement(options: ImplementOptions): Promise<void> {
  const { projectDir, force } = options;

  const platform = await resolveProjectPlatform(projectDir);

  const result = await runTransition(projectDir, { force });

  // Print preflight issues with severity icons
  if (result.preflightIssues && result.preflightIssues.length > 0) {
    console.log(chalk.bold("\nPre-flight checks\n"));
    for (const issue of result.preflightIssues) {
      console.log(`  ${severityIcon(issue)} ${issue.message}`);
      if (issue.suggestion) {
        console.log(chalk.dim(`     ${issue.suggestion}`));
      }
    }
    console.log("");
  }

  // Print warnings
  if (result.warnings.length > 0) {
    for (const warning of result.warnings) {
      console.log(chalk.yellow(`  ! ${warning}`));
    }
    console.log("");
  }

  // Summary
  const preserved = result.fixPlanPreserved ? chalk.dim(" (progress preserved)") : "";
  console.log(chalk.green(`Transition complete: ${result.storiesCount} stories`) + preserved);

  if (result.warnings.length > 0) {
    console.log(chalk.yellow(`  ${result.warnings.length} warning(s)`));
  }

  // Driver instructions
  console.log("");
  if (platform.tier === "full") {
    console.log(`Start the Ralph loop:\n`);
    console.log(`    bash .ralph/drivers/${platform.id}.sh`);
  } else {
    console.log(
      `Ralph requires a full-tier platform (claude-code or codex). ` +
        `Current platform: ${platform.displayName}`
    );
  }
}

function severityIcon(issue: PreflightIssue): string {
  switch (issue.severity) {
    case "error":
      return chalk.red("\u2717");
    case "warning":
      return chalk.yellow("!");
    case "info":
      return chalk.dim("i");
  }
}
