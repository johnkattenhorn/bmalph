import type { Story, PreflightIssue, PreflightResult } from "./types.js";
import { extractSection } from "./context.js";

function hasSection(content: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => extractSection(content, p) !== "");
}

export function validatePrd(content: string | null): PreflightIssue[] {
  if (content === null) {
    return [
      {
        id: "W1",
        severity: "warning",
        message: "No PRD document found in planning artifacts",
        suggestion: "Create a PRD using the /create-prd BMAD workflow.",
      },
    ];
  }

  const issues: PreflightIssue[] = [];

  if (
    !hasSection(content, [
      /^##\s+Executive Summary/m,
      /^##\s+Vision/m,
      /^##\s+Goals/m,
      /^##\s+Project Goals/m,
    ])
  ) {
    issues.push({
      id: "W3",
      severity: "warning",
      message: "PRD missing Executive Summary or Vision section",
      suggestion: "Ralph will lack project context — PROJECT_CONTEXT.md will have empty goals.",
    });
  }

  if (!hasSection(content, [/^##\s+Functional Requirements/m])) {
    issues.push({
      id: "W4",
      severity: "warning",
      message: "PRD missing Functional Requirements section",
      suggestion: "Ralph may miss key requirements during implementation.",
    });
  }

  if (!hasSection(content, [/^##\s+Non-Functional/m, /^##\s+NFR/m, /^##\s+Quality/m])) {
    issues.push({
      id: "W5",
      severity: "warning",
      message: "PRD missing Non-Functional Requirements section",
      suggestion: "Ralph will not enforce performance, security, or quality constraints.",
    });
  }

  if (!hasSection(content, [/^##\s+Scope/m, /^##\s+In Scope/m, /^##\s+Out of Scope/m])) {
    issues.push({
      id: "W6",
      severity: "warning",
      message: "PRD missing Scope section",
      suggestion: "Ralph may implement beyond intended boundaries.",
    });
  }

  return issues;
}

export function validateArchitecture(content: string | null): PreflightIssue[] {
  if (content === null) {
    return [
      {
        id: "W2",
        severity: "warning",
        message: "No architecture document found in planning artifacts",
        suggestion: "Create an architecture doc using the /create-architecture BMAD workflow.",
      },
    ];
  }

  const issues: PreflightIssue[] = [];

  if (!hasSection(content, [/^##\s+Tech Stack/m, /^##\s+Technology Stack/m])) {
    issues.push({
      id: "W7",
      severity: "warning",
      message: "Architecture missing Tech Stack section",
      suggestion: "Ralph cannot customize @AGENT.md without knowing the tech stack.",
    });
  }

  return issues;
}

export function validateStories(stories: Story[], parseWarnings: string[]): PreflightIssue[] {
  const issues: PreflightIssue[] = [];

  for (const warning of parseWarnings) {
    if (/has no acceptance criteria/i.test(warning)) {
      issues.push({
        id: "W8",
        severity: "warning",
        message: warning,
        suggestion: "Ralph cannot verify completion without acceptance criteria.",
      });
    } else if (/has no description/i.test(warning)) {
      issues.push({
        id: "W9",
        severity: "warning",
        message: warning,
        suggestion: "Ralph will lack context for implementing this story.",
      });
    } else if (/not under an epic/i.test(warning)) {
      issues.push({
        id: "W10",
        severity: "warning",
        message: warning,
        suggestion: "Story grouping helps Ralph understand feature boundaries.",
      });
    }
  }

  if (stories.length < 3) {
    issues.push({
      id: "I2",
      severity: "info",
      message: `Only ${stories.length} ${stories.length === 1 ? "story" : "stories"} found (fewer than 3 is suspiciously small scope)`,
    });
  }

  return issues;
}

export function validateReadiness(content: string | null): PreflightIssue[] {
  if (content === null) {
    return [
      {
        id: "I1",
        severity: "info",
        message: "No readiness report found (optional artifact)",
      },
    ];
  }

  if (/NO[-\s]?GO/i.test(content)) {
    return [
      {
        id: "E1",
        severity: "error",
        message: "Readiness report indicates NO-GO status",
        suggestion: "Address issues in the readiness report, or use --force to override.",
      },
    ];
  }

  return [];
}

export function runPreflight(
  artifactContents: Map<string, string>,
  files: string[],
  stories: Story[],
  parseWarnings: string[]
): PreflightResult {
  const prdFile = files.find((f) => /prd/i.test(f));
  const prdContent = prdFile ? (artifactContents.get(prdFile) ?? null) : null;

  const archFile = files.find((f) => /architect/i.test(f));
  const archContent = archFile ? (artifactContents.get(archFile) ?? null) : null;

  const readinessFile = files.find((f) => /readiness/i.test(f));
  const readinessContent = readinessFile ? (artifactContents.get(readinessFile) ?? null) : null;

  const issues = [
    ...validatePrd(prdContent),
    ...validateArchitecture(archContent),
    ...validateStories(stories, parseWarnings),
    ...validateReadiness(readinessContent),
  ];

  return {
    issues,
    pass: !issues.some((i) => i.severity === "error"),
  };
}
