import { join } from "node:path";
import { info } from "../utils/logger.js";
import { readState, writeState, type BmalphState } from "../utils/state.js";
import { loadTransitionInputs } from "./artifact-loading.js";
import { generateContextOutputs } from "./context-output.js";
import { syncFixPlan } from "./fix-plan-sync.js";
import { prepareSpecsDirectory, syncPreparedSpecsDirectory } from "./specs-sync.js";
import type { GeneratedFile, TransitionOptions, TransitionResult } from "./types.js";

export async function runTransition(
  projectDir: string,
  options?: TransitionOptions
): Promise<TransitionResult> {
  const inputs = await loadTransitionInputs(projectDir, options);
  const generatedFiles: GeneratedFile[] = [];

  const fixPlanSync = await syncFixPlan(projectDir, inputs);
  generatedFiles.push(fixPlanSync.generatedFile);

  const specsDir = join(projectDir, ".ralph/specs");
  const specsTmpDir = join(projectDir, ".ralph/specs.new");
  info("Preparing specs tree...");
  await prepareSpecsDirectory(
    projectDir,
    inputs.artifactsDir,
    inputs.collectedArtifacts.files,
    specsTmpDir
  );
  generatedFiles.push(...(await syncPreparedSpecsDirectory(projectDir, specsDir, specsTmpDir)));

  const contextOutput = await generateContextOutputs(projectDir, inputs);
  generatedFiles.push(...contextOutput.generatedFiles);

  const preflightWarnings = inputs.preflightIssues
    .filter((issue) => issue.severity === "warning")
    .map((issue) => issue.message);

  const nonPreflightParseWarnings = inputs.parseWarnings.filter(
    (warning) =>
      !/malformed story id/i.test(warning) &&
      !/has no acceptance criteria/i.test(warning) &&
      !/has no description/i.test(warning) &&
      !/not under an epic/i.test(warning)
  );

  const warnings = [
    ...preflightWarnings,
    ...nonPreflightParseWarnings,
    ...fixPlanSync.warnings,
    ...contextOutput.warnings,
  ];

  const now = new Date().toISOString();
  const currentState = await readState(projectDir);
  const newState: BmalphState = {
    currentPhase: 4,
    status: "implementing",
    startedAt: currentState?.startedAt ?? now,
    lastUpdated: now,
  };
  await writeState(projectDir, newState);
  info("Transition complete: phase 4 (implementing)");

  return {
    storiesCount: inputs.stories.length,
    warnings,
    fixPlanPreserved: fixPlanSync.fixPlanPreserved,
    preflightIssues: inputs.preflightIssues,
    generatedFiles,
  };
}
