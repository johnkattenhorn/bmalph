import type { Platform } from "./types.js";
import { buildPlatformDoctorChecks } from "./doctor-checks.js";
import { generateFullTierSnippet } from "./instructions-snippet.js";

export const copilotPlatform: Platform = {
  id: "copilot",
  displayName: "GitHub Copilot CLI",
  tier: "full",
  experimental: true,
  instructionsFile: ".github/copilot-instructions.md",
  commandDelivery: { kind: "none" },
  instructionsSectionMarker: "## BMAD-METHOD Integration",
  generateInstructionsSnippet: () => generateFullTierSnippet("Ask"),
  getDoctorChecks() {
    return buildPlatformDoctorChecks(this);
  },
};
