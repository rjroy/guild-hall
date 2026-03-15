import type { CommissionMeta } from "@/lib/commissions";
import { sortCommissions } from "@/lib/commissions";
import {
  buildAdjacencyList,
  type DependencyGraph,
} from "@/lib/dependency-graph";

export interface TreeItem {
  commission: CommissionMeta;
  depth: number;
  /** Titles of upstream dependencies, present only for multi-parent (diamond) nodes. */
  awaits?: string[];
}

/**
 * Builds a flat render list with depth metadata from commissions and their
 * dependency graph. The list is ordered for tree rendering:
 *
 * - Root-level items: commissions with zero incoming edges, plus commissions
 *   with 2+ incoming edges (diamond case, rendered flat with "Awaits:" annotation).
 * - Single-parent items: indented under their parent at the appropriate depth.
 * - Sort order within each parent group uses sortCommissions() (status group, then date).
 */
export function buildTreeList(commissions: CommissionMeta[], graph: DependencyGraph): TreeItem[] {
  const adjacency = buildAdjacencyList(graph);

  // Count incoming edges per node
  const incomingCount = new Map<string, number>();
  for (const edge of graph.edges) {
    incomingCount.set(edge.to, (incomingCount.get(edge.to) ?? 0) + 1);
  }

  // Build a node lookup for graph nodes (to get titles for "Awaits:" annotation)
  const graphNodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  // Build a commission lookup
  const commissionMap = new Map(commissions.map((c) => [c.commissionId, c]));

  // Identify root nodes: zero incoming edges OR 2+ incoming edges (diamond)
  const rootIds = new Set<string>();
  const diamondIds = new Set<string>();
  for (const c of commissions) {
    const inc = incomingCount.get(c.commissionId) ?? 0;
    if (inc === 0 || inc >= 2) {
      rootIds.add(c.commissionId);
      if (inc >= 2) {
        diamondIds.add(c.commissionId);
      }
    }
  }

  // Build "Awaits:" data for diamond nodes
  const awaitsMap = new Map<string, string[]>();
  for (const id of diamondIds) {
    const upstreamTitles: string[] = [];
    for (const edge of graph.edges) {
      if (edge.to === id) {
        const node = graphNodeMap.get(edge.from);
        upstreamTitles.push(node ? (node.title || node.id) : edge.from);
      }
    }
    awaitsMap.set(id, upstreamTitles);
  }

  const result: TreeItem[] = [];
  const visited = new Set<string>();

  function addSubtree(parentId: string, depth: number) {
    if (visited.has(parentId)) return;
    visited.add(parentId);

    const commission = commissionMap.get(parentId);
    if (!commission) return;

    const item: TreeItem = { commission, depth };
    if (diamondIds.has(parentId)) {
      item.awaits = awaitsMap.get(parentId);
    }
    result.push(item);

    // Add single-parent children, sorted
    const childIds = adjacency.get(parentId) ?? [];
    const singleParentChildren = childIds
      .filter((cid) => (incomingCount.get(cid) ?? 0) === 1 && !visited.has(cid))
      .map((cid) => commissionMap.get(cid))
      .filter((c): c is CommissionMeta => c != null);

    const sortedChildren = sortCommissions(singleParentChildren);
    for (const child of sortedChildren) {
      addSubtree(child.commissionId, depth + 1);
    }
  }

  // Sort root nodes using sortCommissions
  const rootCommissions = commissions.filter((c) => rootIds.has(c.commissionId));
  const sortedRoots = sortCommissions(rootCommissions);

  for (const root of sortedRoots) {
    addSubtree(root.commissionId, 0);
  }

  // Any commissions not yet visited (shouldn't happen normally, but defensive)
  for (const c of commissions) {
    if (!visited.has(c.commissionId)) {
      result.push({ commission: c, depth: 0 });
      visited.add(c.commissionId);
    }
  }

  return result;
}
