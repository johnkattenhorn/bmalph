import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { debug, info, warn } from "../utils/logger.js";
import { formatError } from "../utils/errors.js";
import { getFilesRecursive } from "../utils/file-system.js";
import {
  collectTransitionArtifacts,
  type CollectedTransitionArtifacts,
} from "./artifact-collection.js";
import { findArtifactsDir, resolvePlanningSpecsSubpath } from "./artifacts.js";
import { runPreflight, PreflightValidationError } from "./preflight.js";
import { compareStoryIds } from "./story-id.js";
import { parseStoriesWithWarnings } from "./story-parsing.js";
import type { Story, PreflightIssue, TransitionOptions } from "./types.js";

export interface LoadedTransitionInputs {
  projectDir: string;
  artifactsDir: string;
  collectedArtifacts: CollectedTransitionArtifacts;
  artifactContents: Map<string, string>;
  stories: Story[];
  parseWarnings: string[];
  preflightIssues: PreflightIssue[];
  planningSpecsSubpath: string;
}

export async function loadTransitionInputs(
  projectDir: string,
  options?: TransitionOptions
): Promise<LoadedTransitionInputs> {
  info("Locating BMAD artifacts...");
  const artifactsDir = await findArtifactsDir(projectDir);
  if (!artifactsDir) {
    throw new Error(
      "No BMAD artifacts found. Run BMAD planning phases first (at minimum: Create PRD, Create Architecture, Create Epics and Stories)."
    );
  }

  const files = await getFilesRecursive(artifactsDir);
  const collectedArtifacts = collectTransitionArtifacts(files);

  const artifactContents = new Map<string, string>();
  for (const file of collectedArtifacts.files) {
    if (!/\.(?:md|ya?ml)$/i.test(file)) {
      continue;
    }

    try {
      const content = await readFile(join(artifactsDir, file), "utf-8");
      artifactContents.set(file, content);
    } catch (err) {
      warn(`Could not read artifact ${file}: ${formatError(err)}`);
    }
  }

  if (collectedArtifacts.storyFiles.length === 0) {
    debug(`Files in artifacts dir: ${collectedArtifacts.files.join(", ")}`);
    throw new Error(
      `No epics/stories file found in ${artifactsDir}. Available files: ${collectedArtifacts.files.join(", ")}. Run 'CE' (Create Epics and Stories) first.`
    );
  }
  debug(`Using stories files: ${collectedArtifacts.storyFiles.join(", ")}`);

  info("Parsing stories...");
  const stories: Story[] = [];
  const parseWarnings: string[] = [];
  for (const storyFile of collectedArtifacts.storyFiles) {
    const storiesContent = artifactContents.get(storyFile);
    if (!storiesContent) {
      warn(`Could not read stories artifact ${storyFile}`);
      continue;
    }

    const parsedStories = parseStoriesWithWarnings(storiesContent, storyFile);
    stories.push(...parsedStories.stories);
    parseWarnings.push(...parsedStories.warnings);
  }

  ensureUniqueStoryIds(stories);
  stories.sort(
    (left, right) =>
      compareStoryIds(left.id, right.id) ||
      left.sourceFile.localeCompare(right.sourceFile) ||
      left.title.localeCompare(right.title)
  );

  if (stories.length === 0) {
    throw new Error(
      "No stories parsed from the epics files. Ensure stories follow the format: ### Story N.M: Title"
    );
  }

  info("Pre-flight validation...");
  const preflightResult = runPreflight(
    artifactContents,
    collectedArtifacts.files,
    stories,
    parseWarnings
  );
  const preflightIssues = options?.force
    ? preflightResult.issues.map((issue) =>
        issue.severity === "error" ? { ...issue, severity: "warning" as const } : issue
      )
    : preflightResult.issues;

  if (!preflightResult.pass) {
    if (options?.force) {
      warn("Pre-flight validation has errors but --force was used, continuing...");
    } else {
      throw new PreflightValidationError(preflightResult.issues);
    }
  }

  return {
    projectDir,
    artifactsDir,
    collectedArtifacts,
    artifactContents,
    stories,
    parseWarnings,
    preflightIssues,
    planningSpecsSubpath: resolvePlanningSpecsSubpath(projectDir, artifactsDir),
  };
}

function ensureUniqueStoryIds(stories: Story[]): void {
  const sourceById = new Map<string, string>();

  for (const story of stories) {
    const existingSource = sourceById.get(story.id);
    if (existingSource) {
      throw new Error(
        `Duplicate story ID "${story.id}" found in ${existingSource} and ${story.sourceFile}`
      );
    }

    sourceById.set(story.id, story.sourceFile);
  }
}
