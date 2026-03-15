import { describe, test, expect } from "bun:test";
import type { ArtifactWithProject } from "@/lib/types";

/**
 * Tests for the page-level artifact merge logic used by the dashboard
 * in all-projects mode. The merge sorts artifacts from multiple projects
 * by lastModified descending and takes the top 10.
 *
 * This tests the pure merge logic extracted from page.tsx's server-side
 * data preparation.
 */

/** Merge artifacts from multiple projects, sorted by lastModified desc, top N. */
function mergeArtifacts(
  perProject: ArtifactWithProject[][],
  limit: number,
): ArtifactWithProject[] {
  return perProject
    .flat()
    .sort(
      (a, b) =>
        new Date(b.lastModified).getTime() -
        new Date(a.lastModified).getTime(),
    )
    .slice(0, limit);
}

function makeArtifact(
  projectName: string,
  relativePath: string,
  lastModified: string,
): ArtifactWithProject {
  return {
    projectName,
    relativePath,
    filePath: `/fake/${projectName}/.lore/${relativePath}`,
    content: "",
    lastModified: new Date(lastModified),
    meta: {
      title: relativePath.replace(/\.md$/, ""),
      date: lastModified.split("T")[0],
      status: "draft",
      tags: [],
    },
  };
}

describe("all-projects artifact merge", () => {
  test("merges and sorts by lastModified descending", () => {
    const projectA = [
      makeArtifact("alpha", "specs/a.md", "2026-03-10T10:00:00Z"),
      makeArtifact("alpha", "specs/b.md", "2026-03-12T10:00:00Z"),
    ];
    const projectB = [
      makeArtifact("beta", "plans/x.md", "2026-03-11T10:00:00Z"),
      makeArtifact("beta", "plans/y.md", "2026-03-13T10:00:00Z"),
    ];

    const merged = mergeArtifacts([projectA, projectB], 10);

    expect(merged.map((a) => a.relativePath)).toEqual([
      "plans/y.md",
      "specs/b.md",
      "plans/x.md",
      "specs/a.md",
    ]);
  });

  test("limits to top 10", () => {
    const artifacts: ArtifactWithProject[][] = [];
    // 3 projects, 5 artifacts each = 15 total
    for (let p = 0; p < 3; p++) {
      const batch: ArtifactWithProject[] = [];
      for (let i = 0; i < 5; i++) {
        const day = String(p * 5 + i + 1).padStart(2, "0");
        batch.push(
          makeArtifact(`project-${p}`, `doc-${i}.md`, `2026-03-${day}T10:00:00Z`),
        );
      }
      artifacts.push(batch);
    }

    const merged = mergeArtifacts(artifacts, 10);
    expect(merged).toHaveLength(10);

    // Should be the 10 most recent (days 15 down to 6)
    for (let i = 0; i < merged.length - 1; i++) {
      expect(
        new Date(merged[i].lastModified).getTime(),
      ).toBeGreaterThanOrEqual(
        new Date(merged[i + 1].lastModified).getTime(),
      );
    }
  });

  test("preserves projectName on each artifact", () => {
    const projectA = [makeArtifact("alpha", "a.md", "2026-03-10T10:00:00Z")];
    const projectB = [makeArtifact("beta", "b.md", "2026-03-11T10:00:00Z")];

    const merged = mergeArtifacts([projectA, projectB], 10);

    expect(merged[0].projectName).toBe("beta");
    expect(merged[1].projectName).toBe("alpha");
  });

  test("handles empty project arrays", () => {
    const merged = mergeArtifacts([[], []], 10);
    expect(merged).toHaveLength(0);
  });

  test("handles single project", () => {
    const projectA = [
      makeArtifact("solo", "a.md", "2026-03-10T10:00:00Z"),
      makeArtifact("solo", "b.md", "2026-03-11T10:00:00Z"),
    ];

    const merged = mergeArtifacts([projectA], 10);
    expect(merged).toHaveLength(2);
    expect(merged[0].relativePath).toBe("b.md");
  });
});
