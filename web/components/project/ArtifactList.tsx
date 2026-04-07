"use client";

import { useState } from "react";
import Link from "next/link";
import Panel from "@/web/components/ui/Panel";
import StatusBadge from "@/web/components/ui/StatusBadge";
import EmptyState from "@/web/components/ui/EmptyState";
import type { Artifact } from "@/lib/types";
import { statusToGem } from "@/lib/types";
import { displayTitle, buildArtifactTree } from "@/lib/artifact-grouping";
import type { TreeNode } from "@/lib/artifact-grouping";
import {
  filterSmartView,
  smartViewCounts,
  artifactTypeLabel,
  artifactDomain,
  SMART_VIEW_FILTERS,
} from "@/lib/artifact-smart-view";
import type { SmartViewFilter } from "@/lib/artifact-smart-view";
import { computeTagIndex, filterByTag } from "@/lib/artifact-tag-view";
import styles from "./ArtifactList.module.css";

const INDENT_PX_PER_DEPTH = 24;

interface ArtifactListProps {
  artifacts: Artifact[];
  projectName: string;
}

// Module-level component (not inside ArtifactTree's render body) to prevent
// React from treating it as a new component type on each render.
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
    const gemStatus = statusToGem(node.artifact.meta.status);
    const isImage = node.artifact.artifactType === "image";
    const isMockup = node.artifact.artifactType === "mockup";
    return (
      <li
        className={styles.item}
        style={{ paddingLeft: `${node.depth * INDENT_PX_PER_DEPTH}px` }}
      >
        <Link
          href={`/projects/${encodedProjectName}/artifacts/${node.artifact.relativePath}`}
          className={styles.link}
        >
          {isMockup ? (
            <span className={styles.mockupIcon} aria-hidden="true">{"\uD83D\uDDA5"}</span>
          ) : isImage ? (
            <span className={styles.imageIcon} aria-hidden="true">{"\uD83D\uDDBC"}</span>
          ) : (
            /* Static decorative icon. next/image optimization not beneficial. */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src="/images/ui/scroll-icon.webp"
              alt=""
              className={styles.scrollIcon}
              aria-hidden="true"
            />
          )}
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
          <StatusBadge gem={gemStatus} label={node.artifact.meta.status} size="sm" />
          {isMockup && (
            <button
              type="button"
              className={styles.previewAction}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const url = `/api/artifacts/mockup?project=${encodeURIComponent(encodedProjectName)}&path=${encodeURIComponent(node.artifact!.relativePath)}`;
                window.open(url, "_blank", "noopener,noreferrer");
              }}
              title="Open preview in new tab"
            >
              Preview
            </button>
          )}
        </Link>
      </li>
    );
  }

  const isExpanded = expanded.has(node.path);
  const depthStyle = node.depth === 0 ? styles.directoryRowDepth0 : styles.directoryRowDeep;
  const dirRowClass = `${styles.directoryRow} ${depthStyle}`;

  const sectionClass = node.depth === 0 ? `${styles.item} ${styles.treeSection}` : styles.item;
  return (
    <li className={sectionClass} style={{ paddingLeft: `${node.depth * INDENT_PX_PER_DEPTH}px` }}>
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

// Separated from ArtifactList so the empty-state early return does not
// violate rules-of-hooks.
function ArtifactTree({ tree, encodedProjectName }: ArtifactTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set()
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
            return (
            <TreeNodeRow
              key={node.path}
              node={node}
              expanded={expanded}
              toggleNode={toggleNode}
              encodedProjectName={encodedProjectName}
            />
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
  const [viewMode, setViewMode] = useState<"smart" | "tree" | "tags">("smart");
  const [activeFilter, setActiveFilter] = useState<SmartViewFilter>("whats-next");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

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
    <>
      <div className={styles.viewControls}>
        <div className={styles.subTabs}>
          <button
            className={`${styles.subTab} ${viewMode === "smart" ? styles.subTabActive : ""}`}
            onClick={() => setViewMode("smart")}
          >
            Smart View
          </button>
          <button
            className={`${styles.subTab} ${viewMode === "tree" ? styles.subTabActive : ""}`}
            onClick={() => setViewMode("tree")}
          >
            Tree View
          </button>
          <button
            className={`${styles.subTab} ${viewMode === "tags" ? styles.subTabActive : ""}`}
            onClick={() => setViewMode("tags")}
          >
            Tag View
          </button>
        </div>
        {viewMode === "smart" && (
          <SmartViewFilterBar
            artifacts={artifacts}
            activeFilter={activeFilter}
            setActiveFilter={setActiveFilter}
          />
        )}
      </div>
      {viewMode === "smart" ? (
        <SmartView
          artifacts={artifacts}
          activeFilter={activeFilter}
          encodedProjectName={encodedName}
        />
      ) : viewMode === "tags" ? (
        <TagViewPanel
          artifacts={artifacts}
          encodedProjectName={encodedName}
          selectedTag={selectedTag}
          setSelectedTag={setSelectedTag}
        />
      ) : (
        <ArtifactTree tree={tree} encodedProjectName={encodedName} />
      )}
    </>
  );
}

interface SmartViewFilterBarProps {
  artifacts: Artifact[];
  activeFilter: SmartViewFilter;
  setActiveFilter: (filter: SmartViewFilter) => void;
}

function SmartViewFilterBar({
  artifacts,
  activeFilter,
  setActiveFilter,
}: SmartViewFilterBarProps) {
  const counts = smartViewCounts(artifacts);
  return (
    <div className={styles.filterBar}>
      {SMART_VIEW_FILTERS.map(({ key, label }) => (
        <button
          key={key}
          className={`${styles.filterButton} ${activeFilter === key ? styles.filterButtonActive : ""}`}
          onClick={() => setActiveFilter(key)}
        >
          {label}
          <span className={styles.filterBadge}>{counts[key]}</span>
        </button>
      ))}
    </div>
  );
}

interface SmartViewProps {
  artifacts: Artifact[];
  activeFilter: SmartViewFilter;
  encodedProjectName: string;
}

function SmartView({
  artifacts,
  activeFilter,
  encodedProjectName,
}: SmartViewProps) {
  const filtered = filterSmartView(artifacts, activeFilter);

  return (
    <>
      {filtered.length === 0 ? (
        <Panel>
          <EmptyState message="No artifacts match this view." />
        </Panel>
      ) : (
        <Panel size="lg">
          <ul className={styles.smartList}>
            {filtered.map((artifact) => {
              const typeLabel = artifactTypeLabel(artifact.relativePath);
              const domain = artifactDomain(artifact.relativePath);
              return (
                <li key={artifact.relativePath} className={styles.smartItem}>
                  <Link
                    href={`/projects/${encodedProjectName}/artifacts/${artifact.relativePath}`}
                    className={styles.smartLink}
                  >
                    <div className={styles.smartItemMain}>
                      <span className={styles.smartTitle}>
                        {displayTitle(artifact)}
                      </span>
                      <StatusBadge
                        gem={statusToGem(artifact.meta.status)}
                        label={artifact.meta.status}
                        size="sm"
                      />
                    </div>
                    <div className={styles.smartItemMeta}>
                      {artifact.meta.date && (
                        <span className={styles.metaDate}>{artifact.meta.date}</span>
                      )}
                      {typeLabel && (
                        <span className={styles.metaLabel}>{typeLabel}</span>
                      )}
                      {domain && (
                        <span className={styles.metaLabel}>{domain}</span>
                      )}
                      {artifact.meta.tags.length > 0 && (
                        <>
                          {artifact.meta.tags.map((tag) => (
                            <span key={tag} className={styles.tag}>
                              {tag}
                            </span>
                          ))}
                        </>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </>
  );
}

interface TagViewPanelProps {
  artifacts: Artifact[];
  encodedProjectName: string;
  selectedTag: string | null;
  setSelectedTag: (tag: string | null) => void;
}

function TagViewPanel({
  artifacts,
  encodedProjectName,
  selectedTag,
  setSelectedTag,
}: TagViewPanelProps) {
  const tagIndex = computeTagIndex(artifacts);

  if (tagIndex.length === 0) {
    return (
      <Panel>
        <EmptyState message="No shared tags found across artifacts." />
      </Panel>
    );
  }

  const handleTagClick = (tag: string) => {
    setSelectedTag(selectedTag === tag ? null : tag);
  };

  return (
    <>
      <div className={styles.filterBar}>
        {tagIndex.map(({ tag, count }) => (
          <button
            key={tag}
            className={`${styles.filterButton} ${selectedTag === tag ? styles.filterButtonActive : ""}`}
            onClick={() => handleTagClick(tag)}
          >
            {tag}
            <span className={styles.filterBadge}>{count}</span>
          </button>
        ))}
      </div>
      {selectedTag === null ? (
        <Panel>
          <EmptyState message="Select a tag to browse matching artifacts." />
        </Panel>
      ) : (
        <TagViewItems
          artifacts={artifacts}
          tag={selectedTag}
          encodedProjectName={encodedProjectName}
        />
      )}
    </>
  );
}

interface TagViewItemsProps {
  artifacts: Artifact[];
  tag: string;
  encodedProjectName: string;
}

function TagViewItems({ artifacts, tag, encodedProjectName }: TagViewItemsProps) {
  const filtered = filterByTag(artifacts, tag);

  if (filtered.length === 0) {
    return (
      <Panel>
        <EmptyState message="No artifacts match this tag." />
      </Panel>
    );
  }

  return (
    <Panel size="lg">
      <ul className={styles.smartList}>
        {filtered.map((artifact) => {
          const typeLabel = artifactTypeLabel(artifact.relativePath);
          const domain = artifactDomain(artifact.relativePath);
          return (
            <li key={artifact.relativePath} className={styles.smartItem}>
              <Link
                href={`/projects/${encodedProjectName}/artifacts/${artifact.relativePath}`}
                className={styles.smartLink}
              >
                <div className={styles.smartItemMain}>
                  <span className={styles.smartTitle}>
                    {displayTitle(artifact)}
                  </span>
                  <StatusBadge
                    gem={statusToGem(artifact.meta.status)}
                    label={artifact.meta.status}
                    size="sm"
                  />
                </div>
                <div className={styles.smartItemMeta}>
                  {artifact.meta.date && (
                    <span className={styles.metaDate}>{artifact.meta.date}</span>
                  )}
                  {typeLabel && (
                    <span className={styles.metaLabel}>{typeLabel}</span>
                  )}
                  {domain && (
                    <span className={styles.metaLabel}>{domain}</span>
                  )}
                  {artifact.meta.tags.length > 0 && (
                    <>
                      {artifact.meta.tags.map((t) => (
                        <span key={t} className={styles.tag}>{t}</span>
                      ))}
                    </>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
