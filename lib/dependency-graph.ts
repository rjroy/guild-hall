/**
 * Dependency graph data structures and layout algorithm for commission
 * dependency visualization. Pure computation, no React or SVG.
 *
 * Consumed by UI components (DependencyMap, commission detail views)
 * to render interactive dependency graphs.
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

export interface LayoutNode extends GraphNode {
  x: number;
  y: number;
  layer: number;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

export interface LayoutOptions {
  nodeWidth?: number;
  nodeHeight?: number;
  horizontalGap?: number;
  verticalGap?: number;
}

// -- Constants --

const DEFAULT_NODE_WIDTH = 160;
const DEFAULT_NODE_HEIGHT = 60;
const DEFAULT_HORIZONTAL_GAP = 40;
const DEFAULT_VERTICAL_GAP = 80;

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

// -- Layout algorithm --

/**
 * Assigns layers via topological sort. Roots (no incoming edges) get layer 0.
 * Each node's layer = max(layers of its dependencies) + 1.
 *
 * Cycles are detected and broken: back edges are removed from the layout edges
 * and a console.warn is emitted.
 */
function assignLayers(
  nodes: GraphNode[],
  edges: GraphEdge[],
): { layers: Map<string, number>; layoutEdges: GraphEdge[] } {
  const layers = new Map<string, number>();
  const layoutEdges = [...edges];

  // Build adjacency structures
  const incomingEdges = new Map<string, Set<string>>();
  const outgoingEdges = new Map<string, Set<string>>();

  for (const node of nodes) {
    incomingEdges.set(node.id, new Set());
    outgoingEdges.set(node.id, new Set());
  }

  for (const edge of layoutEdges) {
    incomingEdges.get(edge.to)?.add(edge.from);
    outgoingEdges.get(edge.from)?.add(edge.to);
  }

  // Kahn's algorithm for topological sort with layer assignment
  const inDegree = new Map<string, number>();
  for (const node of nodes) {
    inDegree.set(node.id, incomingEdges.get(node.id)?.size ?? 0);
  }

  // Start with roots (in-degree 0)
  let currentLevel: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      currentLevel.push(id);
      layers.set(id, 0);
    }
  }

  const visited = new Set<string>();
  let layer = 0;

  while (currentLevel.length > 0) {
    const nextLevel: string[] = [];

    for (const id of currentLevel) {
      visited.add(id);
      const outgoing = outgoingEdges.get(id);
      if (!outgoing) continue;

      for (const neighbor of outgoing) {
        const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          nextLevel.push(neighbor);
          layers.set(neighbor, layer + 1);
        }
      }
    }

    layer++;
    currentLevel = nextLevel;
  }

  // Handle cycles: any unvisited nodes have cycles
  const unvisited = nodes.filter((n) => !visited.has(n.id));
  if (unvisited.length > 0) {
    console.warn(
      `Dependency graph contains cycles involving: ${unvisited.map((n) => n.id).join(", ")}. Breaking cycles for layout.`,
    );

    // Remove back edges that create cycles and assign remaining nodes
    // to layers based on their dependencies that are already assigned
    const backEdgeIndices: number[] = [];
    for (let i = layoutEdges.length - 1; i >= 0; i--) {
      const edge = layoutEdges[i];
      const fromVisited = visited.has(edge.from);
      const toVisited = visited.has(edge.to);
      // An edge between two unvisited nodes is part of a cycle.
      // Pick one to break: remove edges where the target is also unvisited
      // and the source is unvisited (back edges within the cycle).
      if (!fromVisited && !toVisited) {
        backEdgeIndices.push(i);
      }
    }

    // Remove at least one back edge per unvisited node to break cycles
    // Strategy: for each unvisited node, remove one incoming edge from
    // another unvisited node
    const removedEdges = new Set<number>();
    const unvisitedSet = new Set(unvisited.map((n) => n.id));

    for (const node of unvisited) {
      if (visited.has(node.id)) continue;

      // Find an incoming edge from another unvisited node and remove it
      for (let i = layoutEdges.length - 1; i >= 0; i--) {
        if (removedEdges.has(i)) continue;
        const edge = layoutEdges[i];
        if (edge.to === node.id && unvisitedSet.has(edge.from)) {
          removedEdges.add(i);
          break;
        }
      }
    }

    // Remove the back edges (iterate in reverse to preserve indices)
    const sortedRemovedIndices = Array.from(removedEdges).sort((a, b) => b - a);
    for (const idx of sortedRemovedIndices) {
      layoutEdges.splice(idx, 1);
    }

    // Re-run layer assignment with the broken edges using a simpler DFS approach
    // for the remaining unvisited nodes
    const rerunIncoming = new Map<string, Set<string>>();
    for (const node of nodes) {
      rerunIncoming.set(node.id, new Set());
    }
    for (const edge of layoutEdges) {
      rerunIncoming.get(edge.to)?.add(edge.from);
    }

    // Assign layers to unvisited nodes
    const assignLayer = (nodeId: string, visiting: Set<string>): number => {
      if (layers.has(nodeId)) return layers.get(nodeId)!;
      if (visiting.has(nodeId)) {
        // Still in a cycle after breaking edges, assign layer 0
        layers.set(nodeId, 0);
        return 0;
      }

      visiting.add(nodeId);
      const deps = rerunIncoming.get(nodeId) ?? new Set();
      let maxDepLayer = -1;
      for (const depId of deps) {
        maxDepLayer = Math.max(maxDepLayer, assignLayer(depId, visiting));
      }
      const assignedLayer = maxDepLayer + 1;
      layers.set(nodeId, assignedLayer);
      visiting.delete(nodeId);
      return assignedLayer;
    };

    for (const node of unvisited) {
      if (!layers.has(node.id)) {
        assignLayer(node.id, new Set());
      }
    }
  }

  return { layers, layoutEdges };
}

/**
 * Orders nodes within each layer using a greedy barycentric heuristic
 * to minimize edge crossings.
 *
 * For each node, computes the average position of connected nodes in the
 * adjacent layer, then sorts by that average.
 */
function orderNodesInLayers(
  layerAssignments: Map<string, number>,
  edges: GraphEdge[],
): Map<number, string[]> {
  // Group nodes by layer
  const layerGroups = new Map<number, string[]>();
  for (const [id, layer] of layerAssignments) {
    const group = layerGroups.get(layer) ?? [];
    group.push(id);
    layerGroups.set(layer, group);
  }

  if (layerGroups.size === 0) return layerGroups;

  // Build position maps for barycentric ordering
  // Process layers top-to-bottom, using the previous layer's positions
  const maxLayer = Math.max(...layerGroups.keys());
  const nodePositions = new Map<string, number>();

  // Initialize layer 0 positions (arbitrary initial order)
  const layer0 = layerGroups.get(0) ?? [];
  layer0.forEach((id, idx) => nodePositions.set(id, idx));

  // Build adjacency for quick lookup: for each node, which nodes in the
  // previous layer connect to it?
  const incomingByNode = new Map<string, string[]>();
  for (const edge of edges) {
    const existing = incomingByNode.get(edge.to) ?? [];
    existing.push(edge.from);
    incomingByNode.set(edge.to, existing);
  }

  // Process each layer after 0
  for (let layer = 1; layer <= maxLayer; layer++) {
    const nodesInLayer = layerGroups.get(layer);
    if (!nodesInLayer) continue;

    // Compute barycenter for each node based on connected nodes in previous layers
    const barycenters = new Map<string, number>();
    for (const nodeId of nodesInLayer) {
      const incoming = incomingByNode.get(nodeId) ?? [];
      const connectedPositions = incoming
        .filter((id) => nodePositions.has(id))
        .map((id) => nodePositions.get(id)!);

      if (connectedPositions.length > 0) {
        const sum = connectedPositions.reduce((a, b) => a + b, 0);
        barycenters.set(nodeId, sum / connectedPositions.length);
      } else {
        // No connections to previous layers, keep original relative order
        barycenters.set(nodeId, nodesInLayer.indexOf(nodeId));
      }
    }

    // Sort by barycenter
    nodesInLayer.sort((a, b) => (barycenters.get(a) ?? 0) - (barycenters.get(b) ?? 0));

    // Update positions for this layer
    nodesInLayer.forEach((id, idx) => nodePositions.set(id, idx));
    layerGroups.set(layer, nodesInLayer);
  }

  return layerGroups;
}

/**
 * Computes a layered layout for the dependency graph using a simplified
 * Sugiyama-style algorithm. No external dependencies (no D3, no dagre).
 *
 * Steps:
 * 1. Layer assignment via topological sort (roots at layer 0)
 * 2. Node ordering via greedy barycentric heuristic
 * 3. Coordinate assignment (x by position in layer, y by layer)
 *
 * Handles cycles by detecting back edges, breaking them, and logging a warning.
 * Handles disconnected graphs (multiple components).
 * Handles empty graphs (returns zero dimensions).
 */
export function layoutGraph(
  graph: DependencyGraph,
  options?: LayoutOptions,
): LayoutResult {
  if (graph.nodes.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  const nodeWidth = options?.nodeWidth ?? DEFAULT_NODE_WIDTH;
  const nodeHeight = options?.nodeHeight ?? DEFAULT_NODE_HEIGHT;
  const hGap = options?.horizontalGap ?? DEFAULT_HORIZONTAL_GAP;
  const vGap = options?.verticalGap ?? DEFAULT_VERTICAL_GAP;

  // Step 1: Layer assignment
  const { layers, layoutEdges } = assignLayers(graph.nodes, graph.edges);

  // Step 2: Order nodes within layers
  const orderedLayers = orderNodesInLayers(layers, layoutEdges);

  // Find the widest layer for centering
  let maxNodesInLayer = 0;
  for (const nodesInLayer of orderedLayers.values()) {
    maxNodesInLayer = Math.max(maxNodesInLayer, nodesInLayer.length);
  }

  const maxLayerWidth = maxNodesInLayer * nodeWidth + (maxNodesInLayer - 1) * hGap;

  // Step 3: Coordinate assignment
  const nodeMap = new Map<string, GraphNode>();
  for (const node of graph.nodes) {
    nodeMap.set(node.id, node);
  }

  const layoutNodes: LayoutNode[] = [];

  for (const [layer, nodesInLayer] of orderedLayers) {
    const layerWidth = nodesInLayer.length * nodeWidth + (nodesInLayer.length - 1) * hGap;
    const layerOffset = (maxLayerWidth - layerWidth) / 2;

    for (let i = 0; i < nodesInLayer.length; i++) {
      const nodeId = nodesInLayer[i];
      const node = nodeMap.get(nodeId);
      if (!node) continue;

      layoutNodes.push({
        ...node,
        x: layerOffset + i * (nodeWidth + hGap),
        y: layer * (nodeHeight + vGap),
        layer,
      });
    }
  }

  // Compute overall dimensions with padding
  const padding = nodeWidth / 4;
  const width = maxLayerWidth + padding * 2;
  const maxLayer = orderedLayers.size > 0 ? Math.max(...orderedLayers.keys()) : 0;
  const height = (maxLayer + 1) * nodeHeight + maxLayer * vGap + padding * 2;

  // Shift all nodes by padding
  for (const node of layoutNodes) {
    node.x += padding;
    node.y += padding;
  }

  return {
    nodes: layoutNodes,
    edges: layoutEdges,
    width,
    height,
  };
}
