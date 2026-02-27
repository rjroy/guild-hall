"use client";

import { useState } from "react";
import Link from "next/link";
import Panel from "@/components/ui/Panel";
import GemIndicator from "@/components/ui/GemIndicator";
import EmptyState from "@/components/ui/EmptyState";
import type { Artifact } from "@/lib/types";
import { statusToGem } from "@/lib/types";
import { displayTitle, buildArtifactTree } from "@/lib/artifact-grouping";
import type { TreeNode } from "@/lib/artifact-grouping";
import styles from "./ArtifactList.module.css";

interface ArtifactListProps {
  artifacts: Artifact[];
  projectName: string;
}

/**
 * Collects all node paths where defaultExpanded is true.
 * Used to pre-populate expanded state on first render.
 */
function collectDefaultExpanded(nodes: TreeNode[]): Set<string> {
  const expanded = new Set<string>();
  function walk(node: TreeNode): void {
    if (node.defaultExpanded) {
      expanded.add(node.path);
    }
    for (const child of node.children) {
      walk(child);
    }
  }
  for (const node of nodes) {
    walk(node);
  }
  return expanded;
}

// Fix 1: TreeNodeRow is a standalone module-level component with explicit props.
// Previously defined inside ArtifactTree's function body, which caused remounts
// on every expand/collapse because React treats inner function components as new
// types on each render.
interface TreeNodeRowProps {
  node: TreeNode;
  expanded: Set<string>;
  toggleNode: (path: string) => void;
  encodedProjectName: string;
}

function TreeNodeRow({
  node,
  expanded,
  toggleNode,
  encodedProjectName,
}: TreeNodeRowProps) {
  if (node.artifact) {
    // Leaf node: render the artifact link.
    // Fix 3: use depth * 24 so leaves indent consistently under their parent
    // directory. The previous (depth - 1) * 24 made depth-2 leaves align with
    // depth-1 directories, producing a flat appearance at deeper levels.
    const gemStatus = statusToGem(node.artifact.meta.status);
    return (
      <li
        className={styles.item}
        style={{ paddingLeft: `${node.depth * 24}px` }}
      >
        <Link
          href={`/projects/${encodedProjectName}/artifacts/${node.artifact.relativePath}`}
          className={styles.link}
        >
          {/* Static decorative icon. next/image optimization not beneficial. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/ui/scroll-icon.webp"
            alt=""
            className={styles.scrollIcon}
            aria-hidden="true"
          />
          <div className={styles.info}>
            <span className={styles.title}>{displayTitle(node.artifact)}</span>
            <div className={styles.meta}>
              {node.artifact.meta.date && (
                <span className={styles.date}>{node.artifact.meta.date}</span>
              )}
              {node.artifact.meta.tags.length > 0 && (
                <div className={styles.tags}>
                  {node.artifact.meta.tags.map((tag) => (
                    <span key={tag} className={styles.tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <GemIndicator status={gemStatus} size="sm" />
        </Link>
      </li>
    );
  }

  // Directory node
  const isExpanded = expanded.has(node.path);
  const isDepth0 = node.depth === 0;
  const dirRowClass = `${styles.directoryRow} ${isDepth0 ? styles.directoryRowDepth0 : styles.directoryRowDeep}`;

  return (
    <li className={styles.item} style={{ paddingLeft: `${node.depth * 24}px` }}>
      <button
        type="button"
        className={dirRowClass}
        onClick={() => toggleNode(node.path)}
        aria-expanded={isExpanded}
      >
        <span
          className={`${styles.chevron} ${isExpanded ? styles.chevronExpanded : ""}`}
          aria-hidden="true"
        >
          {"\u25B6"}
        </span>
        {node.label}
      </button>
      {isExpanded && node.children.length > 0 && (
        <ul className={styles.children}>
          {node.children.map((child) => (
            <TreeNodeRow
              key={child.path}
              node={child}
              expanded={expanded}
              toggleNode={toggleNode}
              encodedProjectName={encodedProjectName}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

interface ArtifactTreeProps {
  tree: TreeNode[];
  encodedProjectName: string;
}

/**
 * Inner client component that owns expand/collapse state.
 * Separated from ArtifactList so the empty-state early return above
 * does not violate the rules-of-hooks (hooks must not be called conditionally).
 */
function ArtifactTree({ tree, encodedProjectName }: ArtifactTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => collectDefaultExpanded(tree)
  );

  function toggleNode(path: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  return (
    <Panel size="lg">
      <ul className={styles.list}>
        {tree.map((node) => {
          if (node.name === "root") {
            // Root group: render children directly, no collapsible wrapper
            return node.children.map((child) => (
              <TreeNodeRow
                key={child.path}
                node={child}
                expanded={expanded}
                toggleNode={toggleNode}
                encodedProjectName={encodedProjectName}
              />
            ));
          }
          // Fix 2: was <div className={styles.treeSection}> wrapping a nested
          // <ul>, making div a direct child of ul (invalid HTML). Now each
          // top-level node renders as an <li> directly inside the outer <ul>.
          return (
            <li key={node.path} className={styles.treeSection}>
              <TreeNodeRow
                node={node}
                expanded={expanded}
                toggleNode={toggleNode}
                encodedProjectName={encodedProjectName}
              />
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

export default function ArtifactList({
  artifacts,
  projectName,
}: ArtifactListProps) {
  if (artifacts.length === 0) {
    return (
      <Panel>
        <EmptyState message="No artifacts found in this project." />
      </Panel>
    );
  }

  const tree = buildArtifactTree(artifacts);
  const encodedName = encodeURIComponent(projectName);

  return (
    <ArtifactTree
      tree={tree}
      encodedProjectName={encodedName}
    />
  );
}
