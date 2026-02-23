import { describe, test, expect, spyOn } from "bun:test";
import type { CommissionMeta } from "@/lib/commissions";
import {
  buildDependencyGraph,
  getNeighborhood,
  layoutGraph,
  type DependencyGraph,
} from "@/lib/dependency-graph";

// -- Test data helpers --

/**
 * Creates a minimal CommissionMeta with sensible defaults.
 * Only the fields relevant to graph construction need overriding.
 */
function makeCommission(overrides: Partial<CommissionMeta> & { commissionId: string }): CommissionMeta {
  return {
    title: overrides.title ?? `Commission: ${overrides.commissionId}`,
    status: overrides.status ?? "pending",
    worker: overrides.worker ?? "researcher",
    workerDisplayTitle: overrides.workerDisplayTitle ?? "Researcher",
    prompt: overrides.prompt ?? "",
    dependencies: overrides.dependencies ?? [],
    linked_artifacts: overrides.linked_artifacts ?? [],
    resource_overrides: overrides.resource_overrides ?? {},
    current_progress: overrides.current_progress ?? "",
    result_summary: overrides.result_summary ?? "",
    projectName: overrides.projectName ?? "test-project",
    date: overrides.date ?? "2026-02-21",
    ...overrides,
  };
}

// -- buildDependencyGraph --

describe("buildDependencyGraph", () => {
  test("creates correct nodes and edges from commissions with dependencies", () => {
    const commissions = [
      makeCommission({
        commissionId: "commission-a",
        title: "Commission A",
        status: "completed",
        worker: "researcher",
        projectName: "my-project",
      }),
      makeCommission({
        commissionId: "commission-b",
        title: "Commission B",
        status: "pending",
        worker: "writer",
        projectName: "my-project",
        dependencies: ["commissions/commission-a.md"],
      }),
      makeCommission({
        commissionId: "commission-c",
        title: "Commission C",
        status: "pending",
        projectName: "my-project",
        dependencies: [
          "commissions/commission-a.md",
          "commissions/commission-b.md",
        ],
      }),
    ];

    const graph = buildDependencyGraph(commissions);

    expect(graph.nodes).toHaveLength(3);
    expect(graph.nodes.map((n) => n.id).sort()).toEqual([
      "commission-a",
      "commission-b",
      "commission-c",
    ]);

    // B depends on A: edge from A to B
    // C depends on A and B: edges from A to C, B to C
    expect(graph.edges).toHaveLength(3);
    expect(graph.edges).toContainEqual({ from: "commission-a", to: "commission-b" });
    expect(graph.edges).toContainEqual({ from: "commission-a", to: "commission-c" });
    expect(graph.edges).toContainEqual({ from: "commission-b", to: "commission-c" });

    // Verify node properties are preserved
    const nodeA = graph.nodes.find((n) => n.id === "commission-a")!;
    expect(nodeA.title).toBe("Commission A");
    expect(nodeA.status).toBe("completed");
    expect(nodeA.worker).toBe("researcher");
    expect(nodeA.projectName).toBe("my-project");
  });

  test("non-commission dependencies do not produce edges", () => {
    const commissions = [
      makeCommission({
        commissionId: "commission-a",
        dependencies: [
          "specs/auth-requirements.md",
          "designs/ui-mockup.md",
          "notes/research-findings.md",
        ],
      }),
      makeCommission({
        commissionId: "commission-b",
        dependencies: ["specs/system-spec.md"],
      }),
    ];

    const graph = buildDependencyGraph(commissions);

    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(0);
  });

  test("commissions with no dependencies produce nodes with no edges", () => {
    const commissions = [
      makeCommission({ commissionId: "commission-x" }),
      makeCommission({ commissionId: "commission-y" }),
      makeCommission({ commissionId: "commission-z" }),
    ];

    const graph = buildDependencyGraph(commissions);

    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(0);
  });

  test("handles missing/invalid dependency references gracefully", () => {
    const commissions = [
      makeCommission({
        commissionId: "commission-a",
        dependencies: [
          // References a commission that doesn't exist in the array
          "commissions/commission-nonexistent.md",
          // Malformed path (no .md)
          "commissions/commission-broken",
          // Empty string
          "",
        ],
      }),
      makeCommission({ commissionId: "commission-b" }),
    ];

    const graph = buildDependencyGraph(commissions);

    expect(graph.nodes).toHaveLength(2);
    // None of these invalid refs should produce edges
    expect(graph.edges).toHaveLength(0);
  });

  test("sets worker to undefined when commission has empty worker string", () => {
    const commissions = [
      makeCommission({
        commissionId: "commission-a",
        worker: "",
      }),
    ];

    const graph = buildDependencyGraph(commissions);

    expect(graph.nodes[0].worker).toBeUndefined();
  });
});

// -- getNeighborhood --

describe("getNeighborhood", () => {
  test("returns correct subgraph (direct deps + direct dependents + self)", () => {
    // Graph: A -> B -> C -> D
    //        A -> C
    const graph: DependencyGraph = {
      nodes: [
        { id: "a", title: "A", status: "completed", projectName: "p" },
        { id: "b", title: "B", status: "completed", projectName: "p" },
        { id: "c", title: "C", status: "pending", projectName: "p" },
        { id: "d", title: "D", status: "pending", projectName: "p" },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "a", to: "c" },
        { from: "c", to: "d" },
      ],
    };

    const neighborhood = getNeighborhood(graph, "c");

    // C's direct deps: B, A (both point to C)
    // C's direct dependents: D (C points to D)
    expect(neighborhood.nodes.map((n) => n.id).sort()).toEqual(["a", "b", "c", "d"]);

    // Edges within the neighborhood: a->c, b->c, c->d
    // Note: a->b is NOT included because neither a nor b is the focal node,
    // but both a and b are in the neighborhood so the edge between them IS
    // included since both endpoints are in the subgraph.
    expect(neighborhood.edges).toContainEqual({ from: "b", to: "c" });
    expect(neighborhood.edges).toContainEqual({ from: "a", to: "c" });
    expect(neighborhood.edges).toContainEqual({ from: "c", to: "d" });
    // a->b: both nodes are in the set, so this edge is included
    expect(neighborhood.edges).toContainEqual({ from: "a", to: "b" });
  });

  test("isolated commission returns single-node graph", () => {
    const graph: DependencyGraph = {
      nodes: [
        { id: "lone", title: "Lone Wolf", status: "pending", projectName: "p" },
        { id: "other", title: "Other", status: "pending", projectName: "p" },
      ],
      edges: [],
    };

    const neighborhood = getNeighborhood(graph, "lone");

    expect(neighborhood.nodes).toHaveLength(1);
    expect(neighborhood.nodes[0].id).toBe("lone");
    expect(neighborhood.edges).toHaveLength(0);
  });

  test("commission not in graph returns empty graph", () => {
    const graph: DependencyGraph = {
      nodes: [
        { id: "a", title: "A", status: "pending", projectName: "p" },
      ],
      edges: [],
    };

    const neighborhood = getNeighborhood(graph, "nonexistent");

    expect(neighborhood.nodes).toHaveLength(0);
    expect(neighborhood.edges).toHaveLength(0);
  });
});

// -- layoutGraph --

describe("layoutGraph", () => {
  test("produces valid coordinates (no overlapping nodes within same layer)", () => {
    // Three nodes in the same layer (no edges)
    const graph: DependencyGraph = {
      nodes: [
        { id: "a", title: "A", status: "pending", projectName: "p" },
        { id: "b", title: "B", status: "pending", projectName: "p" },
        { id: "c", title: "C", status: "pending", projectName: "p" },
      ],
      edges: [],
    };

    const result = layoutGraph(graph, { nodeWidth: 100, horizontalGap: 20 });

    // All nodes should be in layer 0
    for (const node of result.nodes) {
      expect(node.layer).toBe(0);
    }

    // No two nodes should have the same x coordinate
    const xCoords = result.nodes.map((n) => n.x);
    const uniqueXCoords = new Set(xCoords);
    expect(uniqueXCoords.size).toBe(3);

    // Check no overlapping: each pair of nodes has at least nodeWidth gap
    const sortedX = [...xCoords].sort((a, b) => a - b);
    for (let i = 1; i < sortedX.length; i++) {
      expect(sortedX[i] - sortedX[i - 1]).toBeGreaterThanOrEqual(100 + 20);
    }
  });

  test("correct layer assignment (roots at layer 0, dependencies above dependents)", () => {
    // A -> B -> C
    const graph: DependencyGraph = {
      nodes: [
        { id: "a", title: "A", status: "completed", projectName: "p" },
        { id: "b", title: "B", status: "in_progress", projectName: "p" },
        { id: "c", title: "C", status: "pending", projectName: "p" },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    };

    const result = layoutGraph(graph);

    const nodeA = result.nodes.find((n) => n.id === "a")!;
    const nodeB = result.nodes.find((n) => n.id === "b")!;
    const nodeC = result.nodes.find((n) => n.id === "c")!;

    expect(nodeA.layer).toBe(0);
    expect(nodeB.layer).toBe(1);
    expect(nodeC.layer).toBe(2);

    // Y coordinate should increase with layer
    expect(nodeA.y).toBeLessThan(nodeB.y);
    expect(nodeB.y).toBeLessThan(nodeC.y);
  });

  test("returns dimensions large enough to contain all nodes", () => {
    const nodeWidth = 160;
    const nodeHeight = 60;
    const hGap = 40;
    const vGap = 80;

    // A -> B, A -> C (two nodes in layer 1, one in layer 0)
    const graph: DependencyGraph = {
      nodes: [
        { id: "a", title: "A", status: "pending", projectName: "p" },
        { id: "b", title: "B", status: "pending", projectName: "p" },
        { id: "c", title: "C", status: "pending", projectName: "p" },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "a", to: "c" },
      ],
    };

    const result = layoutGraph(graph, { nodeWidth, nodeHeight, horizontalGap: hGap, verticalGap: vGap });

    // Every node's position + size should fit within dimensions
    for (const node of result.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.x + nodeWidth).toBeLessThanOrEqual(result.width);
      expect(node.y + nodeHeight).toBeLessThanOrEqual(result.height);
    }
  });

  test("handles single-node graph", () => {
    const graph: DependencyGraph = {
      nodes: [
        { id: "solo", title: "Solo", status: "pending", projectName: "p" },
      ],
      edges: [],
    };

    const result = layoutGraph(graph);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe("solo");
    expect(result.nodes[0].layer).toBe(0);
    expect(result.edges).toHaveLength(0);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  test("handles disconnected graph (multiple components)", () => {
    // Component 1: A -> B
    // Component 2: C -> D
    // No edges between components
    const graph: DependencyGraph = {
      nodes: [
        { id: "a", title: "A", status: "pending", projectName: "p" },
        { id: "b", title: "B", status: "pending", projectName: "p" },
        { id: "c", title: "C", status: "pending", projectName: "p" },
        { id: "d", title: "D", status: "pending", projectName: "p" },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "c", to: "d" },
      ],
    };

    const result = layoutGraph(graph);

    expect(result.nodes).toHaveLength(4);

    // Roots (A, C) should be at layer 0
    const nodeA = result.nodes.find((n) => n.id === "a")!;
    const nodeC = result.nodes.find((n) => n.id === "c")!;
    expect(nodeA.layer).toBe(0);
    expect(nodeC.layer).toBe(0);

    // Dependents (B, D) should be at layer 1
    const nodeB = result.nodes.find((n) => n.id === "b")!;
    const nodeD = result.nodes.find((n) => n.id === "d")!;
    expect(nodeB.layer).toBe(1);
    expect(nodeD.layer).toBe(1);

    // All edges should be present
    expect(result.edges).toHaveLength(2);
  });

  test("handles graph with cycles (breaks cycle, logs warning)", () => {
    // A -> B -> C -> A (cycle)
    const graph: DependencyGraph = {
      nodes: [
        { id: "a", title: "A", status: "pending", projectName: "p" },
        { id: "b", title: "B", status: "pending", projectName: "p" },
        { id: "c", title: "C", status: "pending", projectName: "p" },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "c", to: "a" },
      ],
    };

    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

    const result = layoutGraph(graph);

    // Should produce a valid layout despite the cycle
    expect(result.nodes).toHaveLength(3);

    // At least one edge should be removed to break the cycle
    expect(result.edges.length).toBeLessThan(3);

    // Should have warned about the cycle
    expect(warnSpy).toHaveBeenCalled();
    const warnMsg = warnSpy.mock.calls[0][0] as string;
    expect(warnMsg).toContain("cycles");

    // All nodes should have valid coordinates
    for (const node of result.nodes) {
      expect(typeof node.x).toBe("number");
      expect(typeof node.y).toBe("number");
      expect(typeof node.layer).toBe("number");
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
    }

    warnSpy.mockRestore();
  });

  test("empty graph returns zero dimensions", () => {
    const graph: DependencyGraph = {
      nodes: [],
      edges: [],
    };

    const result = layoutGraph(graph);

    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });

  test("respects custom layout options", () => {
    const graph: DependencyGraph = {
      nodes: [
        { id: "a", title: "A", status: "pending", projectName: "p" },
        { id: "b", title: "B", status: "pending", projectName: "p" },
      ],
      edges: [{ from: "a", to: "b" }],
    };

    const opts = { nodeWidth: 200, nodeHeight: 80, horizontalGap: 50, verticalGap: 100 };
    const result = layoutGraph(graph, opts);

    const nodeA = result.nodes.find((n) => n.id === "a")!;
    const nodeB = result.nodes.find((n) => n.id === "b")!;

    // B should be one verticalGap + nodeHeight below A
    expect(nodeB.y - nodeA.y).toBe(80 + 100);
  });

  test("diamond dependency produces correct layers", () => {
    //   A
    //  / \
    // B   C
    //  \ /
    //   D
    const graph: DependencyGraph = {
      nodes: [
        { id: "a", title: "A", status: "completed", projectName: "p" },
        { id: "b", title: "B", status: "completed", projectName: "p" },
        { id: "c", title: "C", status: "completed", projectName: "p" },
        { id: "d", title: "D", status: "pending", projectName: "p" },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "a", to: "c" },
        { from: "b", to: "d" },
        { from: "c", to: "d" },
      ],
    };

    const result = layoutGraph(graph);

    const nodeA = result.nodes.find((n) => n.id === "a")!;
    const nodeB = result.nodes.find((n) => n.id === "b")!;
    const nodeC = result.nodes.find((n) => n.id === "c")!;
    const nodeD = result.nodes.find((n) => n.id === "d")!;

    expect(nodeA.layer).toBe(0);
    expect(nodeB.layer).toBe(1);
    expect(nodeC.layer).toBe(1);
    // D depends on both B and C (layer 1), so D is at layer 2
    expect(nodeD.layer).toBe(2);
  });
});
