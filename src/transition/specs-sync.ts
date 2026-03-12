import { access, cp, mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { debug, info, warn } from "../utils/logger.js";
import { atomicWriteFile, exists } from "../utils/file-system.js";
import { formatError, isEnoent } from "../utils/errors.js";
import { resolvePlanningSpecsSubpath } from "./artifacts.js";
import { generateSpecsChangelog, formatChangelog } from "./specs-changelog.js";
import { generateSpecsIndex, formatSpecsIndexMd } from "./specs-index.js";
import type { GeneratedFile } from "./types.js";

export async function prepareSpecsDirectory(
  projectDir: string,
  artifactsDir: string,
  artifactFiles: readonly string[],
  specsTmpDir: string
): Promise<void> {
  const bmadOutputDir = join(projectDir, "_bmad-output");
  const bmadOutputExists = await exists(bmadOutputDir);
  const planningSpecsSubpath = resolvePlanningSpecsSubpath(projectDir, artifactsDir);

  await rm(specsTmpDir, { recursive: true, force: true });
  await mkdir(specsTmpDir, { recursive: true });

  if (bmadOutputExists) {
    await cp(bmadOutputDir, specsTmpDir, { recursive: true, dereference: false });
  }

  for (const file of artifactFiles) {
    const destinationPath = join(specsTmpDir, planningSpecsSubpath, file);
    await mkdir(dirname(destinationPath), { recursive: true });
    await cp(join(artifactsDir, file), destinationPath, {
      dereference: false,
    });
  }

  await access(specsTmpDir);
}

export async function syncPreparedSpecsDirectory(
  projectDir: string,
  specsDir: string,
  specsTmpDir: string
): Promise<GeneratedFile[]> {
  const generatedFiles: GeneratedFile[] = [];

  try {
    const changes = await generateSpecsChangelog(specsDir, specsTmpDir);
    if (changes.length > 0) {
      const changelog = formatChangelog(changes, new Date().toISOString());
      await atomicWriteFile(join(projectDir, ".ralph/SPECS_CHANGELOG.md"), changelog);
      generatedFiles.push({ path: ".ralph/SPECS_CHANGELOG.md", action: "updated" });
      debug(`Generated SPECS_CHANGELOG.md with ${changes.length} changes`);
    }
  } catch (err) {
    warn(`Could not generate SPECS_CHANGELOG.md: ${formatError(err)}`);
  }

  info("Copying specs to .ralph/specs/...");
  await swapSpecsDirectory(specsDir, specsTmpDir);
  generatedFiles.push({ path: ".ralph/specs/", action: "updated" });

  info("Generating SPECS_INDEX.md...");
  const specsIndexPath = join(projectDir, ".ralph/SPECS_INDEX.md");
  const specsIndexExisted = await exists(specsIndexPath);
  try {
    const specsIndex = await generateSpecsIndex(specsDir);
    if (specsIndex.totalFiles > 0) {
      await atomicWriteFile(specsIndexPath, formatSpecsIndexMd(specsIndex));
      generatedFiles.push({
        path: ".ralph/SPECS_INDEX.md",
        action: specsIndexExisted ? "updated" : "created",
      });
      debug(`Generated SPECS_INDEX.md with ${specsIndex.totalFiles} files`);
    }
  } catch (err) {
    warn(`Could not generate SPECS_INDEX.md: ${formatError(err)}`);
  }

  return generatedFiles;
}

export async function swapSpecsDirectory(specsDir: string, specsTmpDir: string): Promise<void> {
  const specsOldDir = `${specsDir}.old`;
  let hasBackup = false;

  if (await exists(specsDir)) {
    await rm(specsOldDir, { recursive: true, force: true });
    await rename(specsDir, specsOldDir);
    hasBackup = true;
  } else if (await exists(specsOldDir)) {
    hasBackup = true;
    debug("Found existing .ralph/specs.old from previous failed transition, preserving backup");
  } else {
    debug("No existing .ralph/specs to preserve (first transition)");
  }

  try {
    await rename(specsTmpDir, specsDir);
  } catch (err) {
    if (hasBackup) {
      debug(`Specs swap failed, restoring original: ${formatError(err)}`);
      try {
        await rename(specsOldDir, specsDir);
      } catch (restoreErr) {
        if (!isEnoent(restoreErr)) {
          debug(`Could not restore .ralph/specs.old: ${formatError(restoreErr)}`);
        }
      }
    }

    throw err;
  }

  if (hasBackup) {
    await rm(specsOldDir, { recursive: true, force: true });
  }
}
