"use client";

import { getNeighborhood, type DependencyGraph } from "@/lib/dependency-graph";
import CommissionGraph from "@/web/components/dashboard/CommissionGraph";
import styles from "./NeighborhoodGraph.module.css";

interface NeighborhoodGraphProps {
  graph: DependencyGraph;
  commissionId: string;
  projectName: string;
}

/**
 * Mini dependency graph showing a commission and its immediate neighbors
 * (direct dependencies and direct dependents). The focal commission is
 * highlighted with a distinct border via the focalNodeId prop.
 *
 * Only renders if the neighborhood contains more than one node (the
 * commission itself has at least one dependency or dependent).
 */
export default function NeighborhoodGraph({
  graph,
  commissionId,
  projectName,
}: NeighborhoodGraphProps) {
  const neighborhood = getNeighborhood(graph, commissionId);

  // Don't render if the commission is isolated (no deps or dependents)
  if (neighborhood.nodes.length <= 1) {
    return null;
  }

  return (
    <div className={styles.wrapper}>
      <p className={styles.heading}>Dependencies</p>
      <CommissionGraph
        graph={neighborhood}
        compact
        projectName={projectName}
        focalNodeId={commissionId}
      />
    </div>
  );
}
