"use client";

import { useId } from "react";
import { useRouter } from "next/navigation";
import { statusToGem } from "@/lib/types";
import { layoutGraph, type DependencyGraph, type LayoutNode } from "@/lib/dependency-graph";
import { commissionHref } from "@/lib/commission-href";
import styles from "./CommissionGraph.module.css";

interface CommissionGraphProps {
  graph: DependencyGraph;
  compact?: boolean;
  /**
   * Default project name for navigation. Each node also carries its own
   * projectName from the graph data, which takes precedence when available.
   * This fallback is needed because LayoutNode inherits GraphNode.projectName.
   */
  projectName?: string;
  /** Node ID to highlight with a distinct border (used by NeighborhoodGraph). */
  focalNodeId?: string;
}

/**
 * SVG fill colors for each gem status. These approximate the gem filter
 * effects from GemIndicator but as solid fills suitable for SVG rects.
 *
 * active (green gem): completed, in_progress, dispatched
 * pending (amber gem): draft, open, pending, blocked
 * blocked (red gem): failed, cancelled, superseded
 * info (blue gem): default/unrecognized
 */
const GEM_FILL_COLORS: Record<string, string> = {
  active: "#2d8a4e",
  pending: "#b8860b",
  blocked: "#a83232",
  info: "#3a6fa0",
};

/**
 * Darker stroke colors corresponding to each gem status.
 */
const GEM_STROKE_COLORS: Record<string, string> = {
  active: "#1d6a3a",
  pending: "#8b6914",
  blocked: "#7a2020",
  info: "#2a5580",
};

const COMPACT_OPTIONS = {
  nodeWidth: 120,
  nodeHeight: 40,
  horizontalGap: 30,
  verticalGap: 50,
};

const FULL_OPTIONS = {
  nodeWidth: 160,
  nodeHeight: 60,
  horizontalGap: 40,
  verticalGap: 80,
};

/**
 * Truncates a string to fit within a given character limit,
 * appending an ellipsis if truncated.
 */
function truncateLabel(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + "\u2026";
}

/**
 * Client component that renders a dependency graph as an inline SVG.
 * Nodes are colored by commission status, edges have arrowheads,
 * and clicking a node navigates to its commission detail view.
 */
export default function CommissionGraph({
  graph,
  compact = false,
  projectName,
  focalNodeId,
}: CommissionGraphProps) {
  const instanceId = useId();
  const router = useRouter();
  const layoutOptions = compact ? COMPACT_OPTIONS : FULL_OPTIONS;
  const layout = layoutGraph(graph, layoutOptions);

  if (layout.nodes.length === 0) {
    return null;
  }

  const nodeWidth = layoutOptions.nodeWidth;
  const nodeHeight = layoutOptions.nodeHeight;
  const maxLabelChars = compact ? 14 : 20;

  // Build a position lookup for edge rendering
  const nodePositions = new Map<string, LayoutNode>();
  for (const node of layout.nodes) {
    nodePositions.set(node.id, node);
  }

  // React useId() produces unique IDs safe for SSR hydration.
  // Colons in the ID are valid in SVG but need escaping in CSS url() refs,
  // so we strip them for the marker ID.
  const markerId = `arrow${instanceId.replace(/:/g, "")}`;

  const containerClass = [styles.container, compact ? styles.compact : ""]
    .filter(Boolean)
    .join(" ");
  const graphClass = styles.graph;

  return (
    <div className={containerClass}>
      <svg
        className={graphClass}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width={layout.width}
        height={layout.height}
        role="img"
        aria-label="Commission dependency graph"
      >
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 10 7"
            refX="10"
            refY="3.5"
            markerWidth="8"
            markerHeight="6"
            orient="auto-start-reverse"
            className={styles.arrowMarker}
          >
            <polygon points="0 0, 10 3.5, 0 7" />
          </marker>
        </defs>

        {/* Edges (rendered first so nodes draw on top) */}
        {layout.edges.map((edge) => {
          const from = nodePositions.get(edge.from);
          const to = nodePositions.get(edge.to);
          if (!from || !to) return null;

          // Edge starts from the bottom center of the source node
          // and ends at the top center of the target node
          const x1 = from.x + nodeWidth / 2;
          const y1 = from.y + nodeHeight;
          const x2 = to.x + nodeWidth / 2;
          const y2 = to.y;

          return (
            <line
              key={`${edge.from}-${edge.to}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              className={styles.edge}
              markerEnd={`url(#${markerId})`}
            />
          );
        })}

        {/* Nodes */}
        {layout.nodes.map((node) => {
          const gemStatus = statusToGem(node.status);
          const fillColor = GEM_FILL_COLORS[gemStatus] ?? GEM_FILL_COLORS.info;
          const strokeColor = GEM_STROKE_COLORS[gemStatus] ?? GEM_STROKE_COLORS.info;
          const isFocal = focalNodeId === node.id;
          const isScheduled = node.type === "scheduled";
          const displayTitle = node.title || node.id;
          const label = truncateLabel(displayTitle, maxLabelChars);

          // Scheduled nodes shift the main label up to make room for the badge
          const labelY = isScheduled && !compact
            ? node.y + nodeHeight / 2 - 6
            : node.y + nodeHeight / 2;

          const nodeProject = node.projectName || projectName || "";
          const handleClick = () => {
            router.push(commissionHref(nodeProject, node.id));
          };

          return (
            <g
              key={node.id}
              className={styles.nodeGroup}
              onClick={handleClick}
              role="link"
              tabIndex={0}
              aria-label={`Commission: ${displayTitle}${isScheduled ? " (recurring)" : ""}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleClick();
                }
              }}
            >
              <title>{displayTitle}{isScheduled ? " (recurring)" : ""}</title>
              {/* Scheduled commissions get a double-border: outer rect as border effect */}
              {isScheduled && (
                <rect
                  className={styles.scheduledOuterRect}
                  x={node.x - 3}
                  y={node.y - 3}
                  width={nodeWidth + 6}
                  height={nodeHeight + 6}
                  rx={9}
                  ry={9}
                />
              )}
              <rect
                className={styles.nodeRect}
                x={node.x}
                y={node.y}
                width={nodeWidth}
                height={nodeHeight}
                rx={6}
                ry={6}
                fill={fillColor}
                stroke={isFocal ? "#ffb000" : strokeColor}
                strokeWidth={isFocal ? 3 : 1.5}
              />
              <text
                className={styles.nodeLabel}
                x={node.x + nodeWidth / 2}
                y={labelY}
              >
                {label}
              </text>
              {/* Small "Recurring" badge below the label for scheduled commissions */}
              {isScheduled && !compact && (
                <text
                  className={styles.scheduledLabel}
                  x={node.x + nodeWidth / 2}
                  y={node.y + nodeHeight / 2 + 8}
                >
                  Recurring
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
