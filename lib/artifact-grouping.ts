import type { Artifact } from "@/lib/types";
import { compareArtifactsByStatusAndTitle } from "@/lib/types";

/**
 * Extracts the first directory segment from a relative path.
 * "specs/foo.md" -> "specs", "notes.md" -> "root"
 */
export function groupKey(relativePath: string): string {
  const slashIndex = relativePath.indexOf("/");
  if (slashIndex === -1) return "root";
  return relativePath.slice(0, slashIndex);
}

/**
 * Capitalizes the first letter of a string.
 */
export function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Returns a display title for an artifact.
 * Uses frontmatter title if available, otherwise derives from filename.
 */
export function displayTitle(artifact: Artifact): string {
  if (artifact.meta.title) {
    return artifact.meta.title;
  }
  const segments = artifact.relativePath.split("/");
  const filename = segments[segments.length - 1];
  return filename.replace(/\.(md|png|jpe?g|webp|gif|svg)$/i, "");
}

export interface ArtifactGroup {
  group: string;
  items: Artifact[];
}

/**
 * Groups artifacts by their top-level directory within .lore/.
 * Returns groups sorted alphabetically by directory name, with "root"
 * (ungrouped files) at the end.
 */
export function groupArtifacts(artifacts: Artifact[]): ArtifactGroup[] {
  const groups = new Map<string, Artifact[]>();

  for (const artifact of artifacts) {
    const key = groupKey(artifact.relativePath);
    const existing = groups.get(key);
    if (existing) {
      existing.push(artifact);
    } else {
      groups.set(key, [artifact]);
    }
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => {
      // "root" sorts last
      if (a === "root") return 1;
      if (b === "root") return -1;
      return a.localeCompare(b);
    })
    .map(([group, items]) => ({ group, items }));
}

export interface TreeNode {
  name: string; // directory segment or filename
  label: string; // capitalize(name) for dirs, displayTitle() for leaves
  path: string; // full relative path from .lore/ root
  depth: number; // 0 = top-level, 1 = second level, etc.
  children: TreeNode[]; // subdirectories and artifacts (empty for leaves)
  artifact?: Artifact; // present only on leaf nodes
  defaultExpanded: boolean; // true for depth-0 directory nodes only
}
// Invariant: a node is a leaf when artifact is defined AND children is empty.
// A node is a directory when artifact is undefined AND children is non-empty.
// No node should have both artifact and children populated.

function insertArtifact(
  nodeMap: Map<string, TreeNode>,
  parentArray: TreeNode[],
  segments: string[],
  depth: number,
  parentPath: string,
  artifact: Artifact
): void {
  const segment = segments[0];
  const currentPath = parentPath ? `${parentPath}/${segment}` : segment;

  if (segments.length === 1) {
    const leaf: TreeNode = {
      name: segment,
      label: displayTitle(artifact),
      path: artifact.relativePath,
      depth,
      children: [],
      artifact,
      defaultExpanded: false,
    };
    nodeMap.set(segment, leaf);
    parentArray.push(leaf);
    return;
  }

  let dirNode = nodeMap.get(segment);
  if (!dirNode) {
    dirNode = {
      name: segment,
      label: capitalize(segment),
      path: currentPath,
      depth,
      children: [],
      defaultExpanded: depth === 0,
    };
    nodeMap.set(segment, dirNode);
    parentArray.push(dirNode);
  }

  const childMap = new Map<string, TreeNode>();
  for (const child of dirNode.children) {
    if (!child.artifact) {
      childMap.set(child.name, child);
    }
  }

  insertArtifact(
    childMap,
    dirNode.children,
    segments.slice(1),
    depth + 1,
    currentPath,
    artifact
  );
}

/**
 * Sorts nodes in-place. Directories sort before leaves.
 * Directories: alphabetical by name, with "root" always last.
 * Leaves: status group (REQ-SORT-4) then title alphabetical (REQ-SORT-6).
 * Recurses into children.
 */
function sortTreeLevel(nodes: TreeNode[]): void {
  const dirs = nodes.filter((n) => !n.artifact);
  const leaves = nodes.filter((n) => !!n.artifact);

  dirs.sort((a, b) => {
    if (a.name === "root") return 1;
    if (b.name === "root") return -1;
    return a.name.localeCompare(b.name);
  });

  leaves.sort((a, b) => {
    // Leaf invariant: artifact is always defined
    return compareArtifactsByStatusAndTitle(a.artifact!, b.artifact!);
  });

  // Rebuild the array: directories first, then leaves
  nodes.length = 0;
  nodes.push(...dirs, ...leaves);

  for (const node of nodes) {
    if (node.children.length > 0) {
      sortTreeLevel(node.children);
    }
  }
}

/**
 * Builds a tree of TreeNodes from a flat list of artifacts.
 * Directory nodes group artifacts by path segments; leaves hold artifact refs.
 * Root-level files (no directory) are placed under a synthetic "root" node
 * that is always rendered without a collapsible wrapper.
 * Depth-0 directory nodes have defaultExpanded: true; deeper nodes do not.
 */
export function buildArtifactTree(artifacts: Artifact[]): TreeNode[] {
  const topLevelMap = new Map<string, TreeNode>();
  const topLevelArray: TreeNode[] = [];

  for (const artifact of artifacts) {
    const segments = artifact.relativePath.split("/");

    if (segments.length === 1) {
      let rootNode = topLevelMap.get("root");
      if (!rootNode) {
        rootNode = {
          name: "root",
          label: "Root",
          path: "root",
          depth: 0,
          children: [],
          defaultExpanded: false,
        };
        topLevelMap.set("root", rootNode);
        topLevelArray.push(rootNode);
      }

      const rootChildMap = new Map<string, TreeNode>();
      for (const child of rootNode.children) {
        rootChildMap.set(child.name, child);
      }

      insertArtifact(rootChildMap, rootNode.children, segments, 1, "", artifact);
    } else {
      insertArtifact(topLevelMap, topLevelArray, segments, 0, "", artifact);
    }
  }

  sortTreeLevel(topLevelArray);
  return topLevelArray;
}
