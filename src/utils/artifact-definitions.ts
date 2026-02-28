/**
 * Shared artifact definitions for BMAD planning phases.
 *
 * Used by both artifact-scan.ts (for file classification) and
 * status.ts (for checklist rendering). Each definition includes
 * a regex pattern for matching filenames against artifact types.
 */

export interface ArtifactDefinition {
  pattern: RegExp;
  phase: number;
  name: string;
  required: boolean;
}

export const ARTIFACT_DEFINITIONS: ArtifactDefinition[] = [
  { pattern: /brief/i, phase: 1, name: "Product Brief", required: false },
  { pattern: /market/i, phase: 1, name: "Market Research", required: false },
  { pattern: /domain/i, phase: 1, name: "Domain Research", required: false },
  { pattern: /tech.*research/i, phase: 1, name: "Technical Research", required: false },
  { pattern: /prd/i, phase: 2, name: "PRD", required: true },
  { pattern: /ux/i, phase: 2, name: "UX Design", required: false },
  { pattern: /architect/i, phase: 3, name: "Architecture", required: true },
  { pattern: /epic|stor/i, phase: 3, name: "Epics & Stories", required: true },
  { pattern: /readiness/i, phase: 3, name: "Readiness Report", required: true },
];
