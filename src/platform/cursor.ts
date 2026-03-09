import type { Platform } from "./types.js";
import { buildPlatformDoctorChecks } from "./doctor-checks.js";
import { generateCursorRulesSnippet } from "./instructions-snippet.js";
import { getCursorDoctorChecks } from "./cursor-runtime-checks.js";

export const cursorPlatform: Platform = {
  id: "cursor",
  displayName: "Cursor",
  tier: "full",
  experimental: true,
  instructionsFile: ".cursor/rules/bmad.mdc",
  commandDelivery: { kind: "index" },
  instructionsSectionMarker: "## BMAD-METHOD Integration",
  generateInstructionsSnippet: () => generateCursorRulesSnippet(),
  getDoctorChecks() {
    return [...buildPlatformDoctorChecks(this), ...getCursorDoctorChecks()];
  },
};
