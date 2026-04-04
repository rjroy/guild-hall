/**
 * Dependency graph data structures for commission dependency visualization.
 * Pure computation, no React or SVG.
 *
 * Consumed by UI components (DependencyMap tree list, NeighborhoodGraph)
 * to render commission dependency relationships.
 */

// Minimal subset of CommissionMeta needed for graph building.
// Defined locally to avoid importing from commissions.ts, which pulls in
// node:fs/promises and breaks client-side bundling via Turbopack.
interface CommissionGraphInput {
  commissionId: string;
  title: string;
  status: string;
  worker: string;
  dependencies: string[];
  projectName: string;
}

// -- Types --

export interface GraphNode {
  id: string;
  title: string;
  status: string;
  worker?: string;
  projectName: string;
}

export interface GraphEdge {
  /** The dependency commission ID (upstream). */
  from: string;
  /** The dependent commission ID (downstream). */
  to: string;
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// -- Graph construction --

/**
 * Extracts a commission ID from a dependency path.
 *
 * Dependencies are artifact paths like "commissions/commission-researcher-20260221-143000.md".
 * This function checks whether a dependency path points to a commission artifact
 * and, if so, extracts the commission ID (filename without extension).
 *
 * Non-commission paths (e.g., "specs/foo.md", "designs/bar.md") return null.
 */
function extractCommissionId(dependencyPath: string): string | null {
  // Commission dependencies live in the commissions/ directory
  if (!dependencyPath.startsWith("commissions/")) return null;

  // Extract the filename and strip .md extension
  const filename = dependencyPath.slice("commissions/".length);
  if (!filename.endsWith(".md")) return null;

  return filename.replace(/\.md$/, "");
}

/**
 * Builds a dependency graph from an array of commission metadata.
 *
 * Each commission becomes a node. Edges are created only for commission-to-commission
 * dependencies (paths starting with "commissions/"). Non-commission dependencies
 * (specs, designs, etc.) are ignored since they aren't commissions in the graph.
 *
 * Edge direction: from the dependency (upstream) to the dependent (downstream).
 * If commission B depends on commission A, the edge goes from A to B.
 */
export function buildDependencyGraph(commissions: CommissionGraphInput[]): DependencyGraph {
  const nodeMap = new Map<string, GraphNode>();

  // Build nodes from all commissions
  for (const commission of commissions) {
    nodeMap.set(commission.commissionId, {
      id: commission.commissionId,
      title: commission.title,
      status: commission.status,
      worker: commission.worker || undefined,
      projectName: commission.projectName,
    });
  }

  // Build edges from commission-to-commission dependencies
  const edges: GraphEdge[] = [];
  for (const commission of commissions) {
    for (const dep of commission.dependencies) {
      const depId = extractCommissionId(dep);
      if (depId !== null && nodeMap.has(depId)) {
        edges.push({ from: depId, to: commission.commissionId });
      }
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
  };
}

// -- Neighborhood extraction --

/**
 * Returns the subgraph containing a commission and its immediate neighbors:
 * direct dependencies (one hop back) and direct dependents (one hop forward).
 *
 * If the commission is not in the graph, returns an empty graph.
 */
export function getNeighborhood(
  graph: DependencyGraph,
  commissionId: string,
): DependencyGraph {
  const nodeSet = new Set<string>();
  const selfExists = graph.nodes.some((n) => n.id === commissionId);
  if (!selfExists) {
    return { nodes: [], edges: [] };
  }

  nodeSet.add(commissionId);

  // Direct dependencies: edges where this commission is the target
  for (const edge of graph.edges) {
    if (edge.to === commissionId) {
      nodeSet.add(edge.from);
    }
  }

  // Direct dependents: edges where this commission is the source
  for (const edge of graph.edges) {
    if (edge.from === commissionId) {
      nodeSet.add(edge.to);
    }
  }

  const nodes = graph.nodes.filter((n) => nodeSet.has(n.id));
  const edges = graph.edges.filter(
    (e) => nodeSet.has(e.from) && nodeSet.has(e.to),
  );

  return { nodes, edges };
}

// -- Adjacency list --

/**
 * Builds a parent-to-children adjacency list from the graph's edge list.
 * Each key is a parent commission ID (edge.from, upstream), and each value
 * is an array of its direct child commission IDs (edge.to, downstream).
 *
 * Used by the dashboard tree list to determine indentation structure.
 */
export function buildAdjacencyList(graph: DependencyGraph): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const children = adjacency.get(edge.from);
    if (children) {
      children.push(edge.to);
    } else {
      adjacency.set(edge.from, [edge.to]);
    }
  }
  return adjacency;
}
