import { describe, test, expect } from "bun:test";
import {
  groupKey,
  capitalize,
  displayTitle,
  groupArtifacts,
} from "@/lib/artifact-grouping";
import type { Artifact } from "@/lib/types";

/**
 * Helper: creates a minimal Artifact for testing.
 * Only populates the fields that the grouping functions inspect.
 */
function makeArtifact(
  relativePath: string,
  title: string = "",
  status: string = "draft",
  date: string = "",
  tags: string[] = []
): Artifact {
  return {
    meta: { title, date, status, tags },
    filePath: `/fake/lore/${relativePath}`,
    relativePath,
    content: "",
    lastModified: new Date(),
  };
}

describe("groupKey", () => {
  test("extracts first directory from nested path", () => {
    expect(groupKey("specs/system.md")).toBe("specs");
  });

  test("extracts first directory from deeply nested path", () => {
    expect(groupKey("plans/deep/nested.md")).toBe("plans");
  });

  test("returns 'root' for file without directory", () => {
    expect(groupKey("readme.md")).toBe("root");
  });

  test("handles empty string", () => {
    expect(groupKey("")).toBe("root");
  });
});

describe("capitalize", () => {
  test("capitalizes first letter", () => {
    expect(capitalize("specs")).toBe("Specs");
  });

  test("preserves already capitalized", () => {
    expect(capitalize("Plans")).toBe("Plans");
  });

  test("handles single character", () => {
    expect(capitalize("a")).toBe("A");
  });

  test("handles empty string", () => {
    expect(capitalize("")).toBe("");
  });

  test("handles root label", () => {
    expect(capitalize("root")).toBe("Root");
  });
});

describe("displayTitle", () => {
  test("returns frontmatter title when available", () => {
    const artifact = makeArtifact("specs/system.md", "System Specification");
    expect(displayTitle(artifact)).toBe("System Specification");
  });

  test("falls back to filename without extension", () => {
    const artifact = makeArtifact("specs/system-spec.md");
    expect(displayTitle(artifact)).toBe("system-spec");
  });

  test("handles deeply nested paths", () => {
    const artifact = makeArtifact("plans/phase-1/deep/impl-notes.md");
    expect(displayTitle(artifact)).toBe("impl-notes");
  });

  test("handles root-level files", () => {
    const artifact = makeArtifact("readme.md");
    expect(displayTitle(artifact)).toBe("readme");
  });

  test("prefers non-empty title over filename", () => {
    const artifact = makeArtifact("x.md", "Real Title");
    expect(displayTitle(artifact)).toBe("Real Title");
  });

  test("treats empty string title as missing", () => {
    const artifact = makeArtifact("specs/my-doc.md", "");
    expect(displayTitle(artifact)).toBe("my-doc");
  });
});

describe("groupArtifacts", () => {
  test("groups by top-level directory", () => {
    const artifacts = [
      makeArtifact("specs/a.md", "Spec A"),
      makeArtifact("specs/b.md", "Spec B"),
      makeArtifact("plans/c.md", "Plan C"),
    ];

    const groups = groupArtifacts(artifacts);
    expect(groups).toHaveLength(2);
    expect(groups[0].group).toBe("plans");
    expect(groups[0].items).toHaveLength(1);
    expect(groups[1].group).toBe("specs");
    expect(groups[1].items).toHaveLength(2);
  });

  test("sorts groups alphabetically with root last", () => {
    const artifacts = [
      makeArtifact("readme.md", "README"),
      makeArtifact("specs/system.md", "System"),
      makeArtifact("brainstorms/idea.md", "Idea"),
    ];

    const groups = groupArtifacts(artifacts);
    expect(groups.map((g) => g.group)).toEqual([
      "brainstorms",
      "specs",
      "root",
    ]);
  });

  test("returns empty array for no artifacts", () => {
    expect(groupArtifacts([])).toEqual([]);
  });

  test("handles all root-level files", () => {
    const artifacts = [
      makeArtifact("a.md", "A"),
      makeArtifact("b.md", "B"),
    ];

    const groups = groupArtifacts(artifacts);
    expect(groups).toHaveLength(1);
    expect(groups[0].group).toBe("root");
    expect(groups[0].items).toHaveLength(2);
  });

  test("preserves artifact order within groups", () => {
    const artifacts = [
      makeArtifact("specs/z-last.md", "Z"),
      makeArtifact("specs/a-first.md", "A"),
    ];

    const groups = groupArtifacts(artifacts);
    expect(groups[0].items[0].meta.title).toBe("Z");
    expect(groups[0].items[1].meta.title).toBe("A");
  });

  test("handles single artifact", () => {
    const artifacts = [makeArtifact("notes/one.md", "One")];
    const groups = groupArtifacts(artifacts);
    expect(groups).toHaveLength(1);
    expect(groups[0].group).toBe("notes");
    expect(groups[0].items).toHaveLength(1);
  });

  test("handles many different directories", () => {
    const artifacts = [
      makeArtifact("specs/a.md"),
      makeArtifact("plans/b.md"),
      makeArtifact("retros/c.md"),
      makeArtifact("brainstorms/d.md"),
      makeArtifact("research/e.md"),
      makeArtifact("design/f.md"),
      makeArtifact("notes/g.md"),
    ];

    const groups = groupArtifacts(artifacts);
    expect(groups).toHaveLength(7);
    // Alphabetical: brainstorms, design, notes, plans, research, retros, specs
    expect(groups.map((g) => g.group)).toEqual([
      "brainstorms",
      "design",
      "notes",
      "plans",
      "research",
      "retros",
      "specs",
    ]);
  });
});
