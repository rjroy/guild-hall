import { describe, test, expect } from "bun:test";
import {
  groupKey,
  capitalize,
  displayTitle,
  groupArtifacts,
  buildArtifactTree,
} from "@/lib/artifact-grouping";
import type { TreeNode } from "@/lib/artifact-grouping";
import type { Artifact } from "@/lib/types";

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

  test("strips image extensions in fallback", () => {
    expect(displayTitle(makeArtifact("hero.png"))).toBe("hero");
    expect(displayTitle(makeArtifact("photo.jpg"))).toBe("photo");
    expect(displayTitle(makeArtifact("photo.jpeg"))).toBe("photo");
    expect(displayTitle(makeArtifact("cover.webp"))).toBe("cover");
    expect(displayTitle(makeArtifact("anim.gif"))).toBe("anim");
    expect(displayTitle(makeArtifact("diagram.svg"))).toBe("diagram");
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

describe("buildArtifactTree", () => {
  test("empty input returns empty array", () => {
    expect(buildArtifactTree([])).toEqual([]);
  });

  test("single root-level file: produces root node with one leaf child", () => {
    const artifact = makeArtifact("readme.md", "Read Me");
    const tree = buildArtifactTree([artifact]);

    expect(tree).toHaveLength(1);
    const rootNode = tree[0];
    expect(rootNode.name).toBe("root");
    expect(rootNode.label).toBe("Root");
    expect(rootNode.path).toBe("root");
    expect(rootNode.depth).toBe(0);
    expect(rootNode.artifact).toBeUndefined();
    expect(rootNode.children).toHaveLength(1);

    const leaf = rootNode.children[0];
    expect(leaf.name).toBe("readme.md");
    expect(leaf.label).toBe("Read Me");
    expect(leaf.path).toBe("readme.md");
    expect(leaf.depth).toBe(1);
    expect(leaf.artifact).toBe(artifact);
    expect(leaf.children).toHaveLength(0);
  });

  test("single-level paths produce a directory node with leaf children", () => {
    const a = makeArtifact("specs/a.md", "Spec A");
    const b = makeArtifact("specs/b.md", "Spec B");
    const tree = buildArtifactTree([a, b]);

    expect(tree).toHaveLength(1);
    const specsNode = tree[0];
    expect(specsNode.name).toBe("specs");
    expect(specsNode.label).toBe("Specs");
    expect(specsNode.depth).toBe(0);
    expect(specsNode.artifact).toBeUndefined();
    expect(specsNode.children).toHaveLength(2);

    const names = specsNode.children.map((c) => c.name);
    expect(names).toContain("a.md");
    expect(names).toContain("b.md");

    for (const child of specsNode.children) {
      expect(child.artifact).toBeDefined();
      expect(child.children).toHaveLength(0);
      expect(child.depth).toBe(1);
    }
  });

  test("multi-level paths build a nested directory structure", () => {
    const artifact = makeArtifact("tasks/phase-1/a.md", "Task A");
    const tree = buildArtifactTree([artifact]);

    expect(tree).toHaveLength(1);
    const tasksNode = tree[0];
    expect(tasksNode.name).toBe("tasks");
    expect(tasksNode.depth).toBe(0);
    expect(tasksNode.artifact).toBeUndefined();
    expect(tasksNode.children).toHaveLength(1);

    const phase1Node = tasksNode.children[0];
    expect(phase1Node.name).toBe("phase-1");
    expect(phase1Node.depth).toBe(1);
    expect(phase1Node.artifact).toBeUndefined();
    expect(phase1Node.children).toHaveLength(1);

    const leaf = phase1Node.children[0];
    expect(leaf.name).toBe("a.md");
    expect(leaf.depth).toBe(2);
    expect(leaf.artifact).toBe(artifact);
    expect(leaf.children).toHaveLength(0);
  });

  test("mixed depths: shallow dirs, deep dirs, and root files", () => {
    const rootFile = makeArtifact("readme.md");
    const shallowArtifact = makeArtifact("specs/a.md");
    const deepArtifact = makeArtifact("plans/phase-1/b.md");
    const tree = buildArtifactTree([rootFile, shallowArtifact, deepArtifact]);

    // Top-level: specs, plans, root (alphabetical, root last)
    expect(tree).toHaveLength(3);
    const names = tree.map((n) => n.name);
    expect(names).toEqual(["plans", "specs", "root"]);

    // plans -> phase-1 -> b.md
    const plansNode = tree[0];
    expect(plansNode.children).toHaveLength(1);
    expect(plansNode.children[0].name).toBe("phase-1");
    expect(plansNode.children[0].children).toHaveLength(1);
    expect(plansNode.children[0].children[0].artifact).toBe(deepArtifact);

    // specs -> a.md
    const specsNode = tree[1];
    expect(specsNode.children).toHaveLength(1);
    expect(specsNode.children[0].artifact).toBe(shallowArtifact);

    // root -> readme.md
    const rootNode = tree[2];
    expect(rootNode.children).toHaveLength(1);
    expect(rootNode.children[0].artifact).toBe(rootFile);
  });

  test("directory sort order: alphabetical at each level, root last at top level", () => {
    const artifacts = [
      makeArtifact("zebra/a.md"),
      makeArtifact("alpha/b.md"),
      makeArtifact("middle/c.md"),
      makeArtifact("readme.md"),
    ];
    const tree = buildArtifactTree(artifacts);

    // Top-level names should be alphabetical with root last
    expect(tree.map((n) => n.name)).toEqual(["alpha", "middle", "zebra", "root"]);
  });

  test("leaves within a directory sort by status group then title", () => {
    const artifacts = [
      makeArtifact("specs/z-last.md", "Z Last", "implemented"),
      makeArtifact("specs/a-first.md", "A First", "draft"),
      makeArtifact("specs/m-middle.md", "M Middle", "active"),
    ];
    const tree = buildArtifactTree(artifacts);
    const specsNode = tree[0];

    // draft (group 0) -> active (group 1) -> implemented (group 2)
    expect(specsNode.children.map((c) => c.name)).toEqual([
      "a-first.md",  // draft = group 0
      "m-middle.md", // active = group 1
      "z-last.md",   // implemented = group 2
    ]);
  });

  test("within same status group, leaves sort by title alphabetically", () => {
    const artifacts = [
      makeArtifact("specs/z.md", "Zulu", "draft"),
      makeArtifact("specs/a.md", "Alpha", "draft"),
      makeArtifact("specs/m.md", "Mike", "draft"),
    ];
    const tree = buildArtifactTree(artifacts);
    const specsNode = tree[0];

    expect(specsNode.children.map((c) => c.label)).toEqual([
      "Alpha",
      "Mike",
      "Zulu",
    ]);
  });

  test("directories sort before leaves within a level", () => {
    // Create a mix of subdirectories and leaf files at the same level
    const artifacts = [
      makeArtifact("specs/overview.md", "Overview", "draft"),
      makeArtifact("specs/sub/detail.md", "Detail", "draft"),
    ];
    const tree = buildArtifactTree(artifacts);
    const specsNode = tree[0];

    // "sub" (directory) should come before "overview.md" (leaf)
    expect(specsNode.children[0].name).toBe("sub");
    expect(specsNode.children[0].artifact).toBeUndefined();
    expect(specsNode.children[1].name).toBe("overview.md");
    expect(specsNode.children[1].artifact).toBeDefined();
  });

  test("mixed statuses within one directory sort correctly", () => {
    const artifacts = [
      makeArtifact("specs/cancelled-spec.md", "Cancelled Spec", "cancelled"),
      makeArtifact("specs/draft-spec.md", "Draft Spec", "draft"),
      makeArtifact("specs/active-spec.md", "Active Spec", "active"),
      makeArtifact("specs/complete-spec.md", "Complete Spec", "complete"),
      makeArtifact("specs/blocked-spec.md", "Blocked Spec", "blocked"),
    ];
    const tree = buildArtifactTree(artifacts);
    const specsNode = tree[0];

    expect(specsNode.children.map((c) => c.label)).toEqual([
      "Draft Spec",      // group 0 (pending)
      "Active Spec",     // group 1
      "Blocked Spec",    // group 2 (pending)
      "Cancelled Spec",  // group 2 (hard failure)
      "Complete Spec",   // group 3 (terminal)
    ]);
  });

  test("defaultExpanded: true for depth-0 directory nodes, false for deeper nodes", () => {
    const artifacts = [
      makeArtifact("specs/a.md"),
      makeArtifact("plans/phase-1/b.md"),
    ];
    const tree = buildArtifactTree(artifacts);

    // depth-0 dirs are expanded by default
    for (const node of tree) {
      if (!node.artifact) {
        expect(node.defaultExpanded).toBe(true);
      }
    }

    // depth-1 dir (phase-1) should not be expanded
    const plansNode = tree.find((n) => n.name === "plans")!;
    const phase1Node = plansNode.children[0];
    expect(phase1Node.defaultExpanded).toBe(false);
  });

  test("leaf nodes carry the artifact reference; directory nodes do not", () => {
    const artifacts = [
      makeArtifact("specs/a.md", "A"),
      makeArtifact("plans/phase-1/b.md", "B"),
      makeArtifact("readme.md", "Readme"),
    ];
    const tree = buildArtifactTree(artifacts);

    function assertNodeInvariants(node: TreeNode): void {
      if (node.artifact !== undefined) {
        // Leaf: must have no children
        expect(node.children).toHaveLength(0);
      } else {
        // Directory: must have children, no artifact
        expect(node.children.length).toBeGreaterThan(0);
        expect(node.artifact).toBeUndefined();
      }
      for (const child of node.children) {
        assertNodeInvariants(child);
      }
    }

    for (const node of tree) {
      assertNodeInvariants(node);
    }
  });

  test("label uses capitalize() for directories and displayTitle() for leaf nodes", () => {
    const artifactWithTitle = makeArtifact("specs/my-doc.md", "My Document Title");
    const artifactWithoutTitle = makeArtifact("plans/impl.md");
    const tree = buildArtifactTree([artifactWithTitle, artifactWithoutTitle]);

    const specsNode = tree.find((n) => n.name === "specs")!;
    expect(specsNode.label).toBe("Specs"); // capitalize("specs")

    const plansNode = tree.find((n) => n.name === "plans")!;
    expect(plansNode.label).toBe("Plans"); // capitalize("plans")

    const docLeaf = specsNode.children[0];
    expect(docLeaf.label).toBe("My Document Title"); // frontmatter title

    const implLeaf = plansNode.children[0];
    expect(implLeaf.label).toBe("impl"); // filename without extension
  });

  test("root node leaf nodes have defaultExpanded: false", () => {
    const artifacts = [makeArtifact("readme.md"), makeArtifact("changelog.md")];
    const tree = buildArtifactTree(artifacts);

    const rootNode = tree[0];
    expect(rootNode.name).toBe("root");
    expect(rootNode.defaultExpanded).toBe(false);

    for (const leaf of rootNode.children) {
      expect(leaf.defaultExpanded).toBe(false);
    }
  });

  test("multiple artifacts share directory nodes (no duplicate dir nodes)", () => {
    const artifacts = [
      makeArtifact("specs/a.md"),
      makeArtifact("specs/b.md"),
      makeArtifact("specs/c.md"),
    ];
    const tree = buildArtifactTree(artifacts);

    // Only one "specs" node at the top level
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("specs");
    expect(tree[0].children).toHaveLength(3);
  });
});
