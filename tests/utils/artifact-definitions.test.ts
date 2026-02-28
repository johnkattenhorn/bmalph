import { describe, it, expect } from "vitest";
import { ARTIFACT_DEFINITIONS } from "../../src/utils/artifact-definitions.js";

describe("ARTIFACT_DEFINITIONS", () => {
  it("contains 9 artifact definitions", () => {
    expect(ARTIFACT_DEFINITIONS).toHaveLength(9);
  });

  it("includes phase 1 artifacts", () => {
    const phase1 = ARTIFACT_DEFINITIONS.filter((d) => d.phase === 1);
    expect(phase1).toHaveLength(4);
    expect(phase1.map((d) => d.name)).toEqual([
      "Product Brief",
      "Market Research",
      "Domain Research",
      "Technical Research",
    ]);
  });

  it("includes phase 2 artifacts", () => {
    const phase2 = ARTIFACT_DEFINITIONS.filter((d) => d.phase === 2);
    expect(phase2).toHaveLength(2);
    expect(phase2.map((d) => d.name)).toEqual(["PRD", "UX Design"]);
  });

  it("includes phase 3 artifacts", () => {
    const phase3 = ARTIFACT_DEFINITIONS.filter((d) => d.phase === 3);
    expect(phase3).toHaveLength(3);
    expect(phase3.map((d) => d.name)).toEqual([
      "Architecture",
      "Epics & Stories",
      "Readiness Report",
    ]);
  });

  it("marks PRD as required", () => {
    const prd = ARTIFACT_DEFINITIONS.find((d) => d.name === "PRD");
    expect(prd?.required).toBe(true);
  });

  it("marks phase 3 artifacts as required", () => {
    const phase3 = ARTIFACT_DEFINITIONS.filter((d) => d.phase === 3);
    for (const def of phase3) {
      expect(def.required).toBe(true);
    }
  });

  it("marks phase 1 artifacts as not required", () => {
    const phase1 = ARTIFACT_DEFINITIONS.filter((d) => d.phase === 1);
    for (const def of phase1) {
      expect(def.required).toBe(false);
    }
  });

  it("includes regex pattern for each definition", () => {
    for (const def of ARTIFACT_DEFINITIONS) {
      expect(def.pattern).toBeInstanceOf(RegExp);
    }
  });

  it("has patterns that match expected filenames", () => {
    const expectations: [string, string][] = [
      ["product-brief.md", "Product Brief"],
      ["market-research.md", "Market Research"],
      ["domain-research.md", "Domain Research"],
      ["tech-research.md", "Technical Research"],
      ["prd.md", "PRD"],
      ["ux-design.md", "UX Design"],
      ["architecture.md", "Architecture"],
      ["epics-and-stories.md", "Epics & Stories"],
      ["readiness-report.md", "Readiness Report"],
    ];
    for (const [filename, expectedName] of expectations) {
      const match = ARTIFACT_DEFINITIONS.find((d) => d.pattern.test(filename));
      expect(match?.name).toBe(expectedName);
    }
  });
});
