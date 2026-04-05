import { describe, expect, test } from "bun:test";
import { computeTagIndex, filterByTag } from "@/lib/artifact-tag-view";
import type { Artifact } from "@/lib/types";

function makeArtifact(
  relativePath: string,
  status: string,
  tags: string[] = [],
): Artifact {
  return {
    meta: {
      title: relativePath.split("/").pop()?.replace(".md", "") ?? "",
      date: "2026-01-01",
      status,
      tags,
      extras: {},
    },
    filePath: `/test/.lore/${relativePath}`,
    relativePath,
    content: "",
    lastModified: new Date("2026-01-01"),
  };
}

describe("computeTagIndex", () => {
  test("counts tags and excludes those with count <= 1", () => {
    const artifacts = [
      makeArtifact("specs/a.md", "draft", ["ui"]),
      makeArtifact("specs/b.md", "draft", ["ui"]),
      makeArtifact("specs/c.md", "draft", ["api"]),
    ];
    const result = computeTagIndex(artifacts);
    expect(result).toEqual([{ tag: "ui", count: 2 }]);
  });

  test("returns empty when all tags are unique", () => {
    const artifacts = [
      makeArtifact("specs/a.md", "draft", ["alpha"]),
      makeArtifact("specs/b.md", "draft", ["beta"]),
      makeArtifact("specs/c.md", "draft", ["gamma"]),
      makeArtifact("specs/d.md", "draft", ["delta"]),
      makeArtifact("specs/e.md", "draft", ["epsilon"]),
    ];
    expect(computeTagIndex(artifacts)).toEqual([]);
  });

  test("sorts by count descending", () => {
    const artifacts = [
      makeArtifact("a.md", "draft", ["mid"]),
      makeArtifact("b.md", "draft", ["mid"]),
      makeArtifact("c.md", "draft", ["mid"]),
      makeArtifact("d.md", "draft", ["low"]),
      makeArtifact("e.md", "draft", ["low"]),
      makeArtifact("f.md", "draft", ["high"]),
      makeArtifact("g.md", "draft", ["high"]),
      makeArtifact("h.md", "draft", ["high"]),
      makeArtifact("i.md", "draft", ["high"]),
      makeArtifact("j.md", "draft", ["high"]),
      makeArtifact("k.md", "draft", ["high"]),
      makeArtifact("l.md", "draft", ["high"]),
    ];
    const result = computeTagIndex(artifacts);
    expect(result.map((e) => e.tag)).toEqual(["high", "mid", "low"]);
    expect(result.map((e) => e.count)).toEqual([7, 3, 2]);
  });

  test("alphabetical tiebreak for equal counts", () => {
    const artifacts = [
      makeArtifact("a.md", "draft", ["beta"]),
      makeArtifact("b.md", "draft", ["beta"]),
      makeArtifact("c.md", "draft", ["alpha"]),
      makeArtifact("d.md", "draft", ["alpha"]),
    ];
    const result = computeTagIndex(artifacts);
    expect(result).toEqual([
      { tag: "alpha", count: 2 },
      { tag: "beta", count: 2 },
    ]);
  });

  test("artifacts with empty tags contribute nothing", () => {
    const artifacts = [
      makeArtifact("a.md", "draft", []),
      makeArtifact("b.md", "draft", ["ui"]),
      makeArtifact("c.md", "draft", []),
      makeArtifact("d.md", "draft", ["ui"]),
    ];
    const result = computeTagIndex(artifacts);
    expect(result).toEqual([{ tag: "ui", count: 2 }]);
  });

  test("artifact with multiple tags counts each tag separately", () => {
    const artifacts = [
      makeArtifact("a.md", "draft", ["ui", "api"]),
      makeArtifact("b.md", "draft", ["ui", "testing"]),
    ];
    const result = computeTagIndex(artifacts);
    expect(result).toEqual([{ tag: "ui", count: 2 }]);
  });
});

describe("filterByTag", () => {
  test("returns only artifacts containing the tag", () => {
    const artifacts = [
      makeArtifact("specs/a.md", "draft", ["ui"]),
      makeArtifact("specs/b.md", "draft", ["api"]),
      makeArtifact("specs/c.md", "draft", ["ui"]),
      makeArtifact("specs/d.md", "draft", ["ui", "api"]),
      makeArtifact("specs/e.md", "draft", ["testing"]),
    ];
    const result = filterByTag(artifacts, "ui");
    expect(result).toHaveLength(3);
    expect(result.every((a) => a.meta.tags.includes("ui"))).toBe(true);
  });

  test("results are sorted by status and title", () => {
    const artifacts = [
      makeArtifact("specs/z-item.md", "draft", ["ui"]),
      makeArtifact("specs/a-item.md", "complete", ["ui"]),
      makeArtifact("specs/m-item.md", "draft", ["ui"]),
    ];
    const result = filterByTag(artifacts, "ui");
    // compareArtifactsByStatusAndTitle: group 0 (draft) before group 3 (complete),
    // then alphabetical by status string within group, then by title
    const titles = result.map((a) => a.meta.title);
    expect(titles).toEqual(["m-item", "z-item", "a-item"]);
  });

  test("returns empty for nonexistent tag", () => {
    const artifacts = [
      makeArtifact("specs/a.md", "draft", ["ui"]),
      makeArtifact("specs/b.md", "draft", ["api"]),
    ];
    expect(filterByTag(artifacts, "nonexistent")).toEqual([]);
  });

  test("tag comparison is case-sensitive", () => {
    const artifacts = [
      makeArtifact("specs/a.md", "draft", ["ui"]),
      makeArtifact("specs/b.md", "draft", ["ui"]),
    ];
    expect(filterByTag(artifacts, "UI")).toEqual([]);
  });
});
