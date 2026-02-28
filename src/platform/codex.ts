import type { Platform } from "./types.js";
import { buildPlatformDoctorChecks } from "./doctor-checks.js";
import { generateFullTierSnippet } from "./instructions-snippet.js";

export const codexPlatform: Platform = {
  id: "codex",
  displayName: "OpenAI Codex",
  tier: "full",
  instructionsFile: "AGENTS.md",
  commandDelivery: { kind: "inline" },
  instructionsSectionMarker: "## BMAD-METHOD Integration",
  generateInstructionsSnippet: () => generateFullTierSnippet("Run"),
  getDoctorChecks() {
    return buildPlatformDoctorChecks(this);
  },
};
