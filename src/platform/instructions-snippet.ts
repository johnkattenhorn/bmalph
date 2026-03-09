const FULL_TIER_PHASES = `### Phases

| Phase | Focus | Key Agents |
|-------|-------|-----------|
| 1. Analysis | Understand the problem | Analyst agent |
| 2. Planning | Define the solution | Product Manager agent |
| 3. Solutioning | Design the architecture | Architect agent |
| 4. Implementation | Build it | Developer agent, then Ralph autonomous loop |

### Workflow

1. Work through Phases 1-3 using BMAD agents and workflows
2. For PRD creation, use \`_bmad/lite/create-prd.md\` for single-turn generation
3. Use the bmalph-implement transition to prepare Ralph format, then start Ralph`;

const COMMAND_REFERENCE = `### Command Reference

When the user asks for a BMAD command, look it up in \`_bmad/COMMANDS.md\` and follow the invocation instructions.`;

/**
 * Shared instructions snippet for non-directory full-tier platforms.
 * @param verb - Opening verb for the first line ("Run" or "Ask").
 */
export function generateFullTierSnippet(verb: string): string {
  return `
## BMAD-METHOD Integration

${verb} the BMAD master agent to navigate phases. Read \`_bmad/COMMANDS.md\` for all available agents, workflows, and commands.

${FULL_TIER_PHASES}

${COMMAND_REFERENCE}
`;
}

/**
 * Cursor uses MDC rules, so the snippet must include valid frontmatter.
 */
export function generateCursorRulesSnippet(): string {
  return `---
description: BMAD-METHOD integration for this repository
alwaysApply: true
---

## BMAD-METHOD Integration

Ask Cursor to run the BMAD master agent to navigate phases. Read \`_bmad/COMMANDS.md\` for all available agents, workflows, and command instructions.

${FULL_TIER_PHASES}

${COMMAND_REFERENCE}
`;
}

/**
 * Instructions snippet for skills-based platforms.
 * Commands are available as native skills with \`$command-name\` invocation.
 */
export function generateSkillsTierSnippet(): string {
  return `
## BMAD-METHOD Integration

BMAD commands are available as Codex Skills. Use \`$command-name\` to invoke them
(e.g., \`$create-prd\`, \`$analyst\`). See \`_bmad/COMMANDS.md\` for a full reference.

${FULL_TIER_PHASES}
`;
}

/**
 * Shared instructions snippet for instructions-only platforms.
 * Used by: windsurf, aider.
 */
export function generateInstructionsOnlySnippet(): string {
  return `
## BMAD-METHOD Integration

Ask the BMAD master agent to navigate phases. Read \`_bmad/COMMANDS.md\` for all available agents, workflows, and commands.

### Phases

| Phase | Focus | Key Agents |
|-------|-------|-----------|
| 1. Analysis | Understand the problem | Analyst agent |
| 2. Planning | Define the solution | Product Manager agent |
| 3. Solutioning | Design the architecture | Architect agent |

### Workflow

Work through Phases 1-3 using BMAD agents and workflows interactively. For PRD creation, use \`_bmad/lite/create-prd.md\` for single-turn generation.

> **Note:** Ralph (Phase 4 — autonomous implementation) is not supported on this platform.

${COMMAND_REFERENCE}
`;
}
