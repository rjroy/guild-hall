import Link from "next/link";
import { getNeighborhood, type DependencyGraph } from "@/lib/dependency-graph";
import { statusToGem } from "@/lib/types";
import StatusBadge from "@/web/components/ui/StatusBadge";
import { commissionHref } from "@/lib/commission-href";
import styles from "./NeighborhoodGraph.module.css";

interface NeighborhoodGraphProps {
  graph: DependencyGraph;
  commissionId: string;
  projectName: string;
}

/**
 * Server component showing a commission's upstream dependencies ("Depends on")
 * and downstream dependents ("Blocks") as linked text lists.
 *
 * Only renders if the commission has at least one dependency or dependent.
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

  // Build node lookup for titles and status
  const nodeMap = new Map(neighborhood.nodes.map((n) => [n.id, n]));

  // Upstream: edges where edge.to === commissionId (these commissions are depended upon)
  const upstream = neighborhood.edges
    .filter((e) => e.to === commissionId)
    .map((e) => nodeMap.get(e.from))
    .filter((n) => n != null);

  // Downstream: edges where edge.from === commissionId (these commissions depend on us)
  const downstream = neighborhood.edges
    .filter((e) => e.from === commissionId)
    .map((e) => nodeMap.get(e.to))
    .filter((n) => n != null);

  return (
    <div className={styles.wrapper}>
      <p className={styles.heading}>Dependencies</p>
      {upstream.length > 0 && (
        <div className={styles.section}>
          <p className={styles.sectionHeading}>Depends on</p>
          <ul className={styles.neighborList}>
            {upstream.map((node) => (
              <li key={node.id} className={styles.neighborItem}>
                <StatusBadge gem={statusToGem(node.status)} label={node.status} size="sm" />
                <Link
                  href={commissionHref(node.projectName || projectName, node.id)}
                  className={styles.neighborLink}
                >
                  {node.title || node.id}
                </Link>
                <span className={styles.neighborStatus}>({node.status})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {downstream.length > 0 && (
        <div className={styles.section}>
          <p className={styles.sectionHeading}>Blocks</p>
          <ul className={styles.neighborList}>
            {downstream.map((node) => (
              <li key={node.id} className={styles.neighborItem}>
                <StatusBadge gem={statusToGem(node.status)} label={node.status} size="sm" />
                <Link
                  href={commissionHref(node.projectName || projectName, node.id)}
                  className={styles.neighborLink}
                >
                  {node.title || node.id}
                </Link>
                <span className={styles.neighborStatus}>({node.status})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
