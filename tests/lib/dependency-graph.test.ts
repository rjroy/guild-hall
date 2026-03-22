import { describe, test, expect } from "bun:test";
import type { CommissionMeta } from "@/lib/commissions";
import {
  buildDependencyGraph,
  getNeighborhood,
  buildAdjacencyList,
  type DependencyGraph,
} from "@/lib/dependency-graph";

// -- Test data helpers --

/**
 * Creates a minimal GraphNode with sensible defaults.
 * Keeps test node construction concise after adding type/sourceSchedule fields.
 */
function makeNode(overrides: Partial<import("@/lib/dependency-graph").GraphNode> & { id: string }): import("@/lib/dependency-graph").GraphNode {
  return {
    title: overrides.title ?? overrides.id.toUpperCase(),
    status: overrides.status ?? "pending",
    type: overrides.type ?? "one-shot",
    sourceSchedule: overrides.sourceSchedule ?? "",
    projectName: overrides.projectName ?? "p",
    ...overrides,
  };
}

/**
 * Creates a minimal CommissionMeta with sensible defaults.
 * Only the fields relevant to graph construction need overriding.
 */
function makeCommission(overrides: Partial<CommissionMeta> & { commissionId: string }): CommissionMeta {
  return {
    title: overrides.title ?? `Commission: ${overrides.commissionId}`,
    status: overrides.status ?? "pending",
    type: overrides.type ?? "one-shot",
    sourceSchedule: overrides.sourceSchedule ?? "",
    sourceTrigger: overrides.sourceTrigger ?? "",
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
    relevantDate: overrides.relevantDate ?? "",
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

  test("preserves type and sourceSchedule fields on graph nodes", () => {
    const commissions = [
      makeCommission({
        commissionId: "schedule-daily",
        type: "scheduled",
        sourceSchedule: "",
      }),
      makeCommission({
        commissionId: "commission-spawned",
        type: "one-shot",
        sourceSchedule: "schedule-daily",
      }),
    ];

    const graph = buildDependencyGraph(commissions);

    const scheduleNode = graph.nodes.find((n) => n.id === "schedule-daily")!;
    expect(scheduleNode.type).toBe("scheduled");
    expect(scheduleNode.sourceSchedule).toBe("");

    const spawnedNode = graph.nodes.find((n) => n.id === "commission-spawned")!;
    expect(spawnedNode.type).toBe("one-shot");
    expect(spawnedNode.sourceSchedule).toBe("schedule-daily");
  });

  test("creates edge from parent schedule to spawned commission via sourceSchedule", () => {
    const commissions = [
      makeCommission({
        commissionId: "schedule-daily",
        type: "scheduled",
      }),
      makeCommission({
        commissionId: "commission-spawned-1",
        sourceSchedule: "schedule-daily",
      }),
      makeCommission({
        commissionId: "commission-spawned-2",
        sourceSchedule: "schedule-daily",
      }),
    ];

    const graph = buildDependencyGraph(commissions);

    expect(graph.edges).toContainEqual({
      from: "schedule-daily",
      to: "commission-spawned-1",
    });
    expect(graph.edges).toContainEqual({
      from: "schedule-daily",
      to: "commission-spawned-2",
    });
  });

  test("does not duplicate edges when sourceSchedule matches an existing dependency edge", () => {
    const commissions = [
      makeCommission({
        commissionId: "schedule-daily",
        type: "scheduled",
      }),
      makeCommission({
        commissionId: "commission-spawned",
        sourceSchedule: "schedule-daily",
        // Also has an explicit dependency on the same commission
        dependencies: ["commissions/schedule-daily.md"],
      }),
    ];

    const graph = buildDependencyGraph(commissions);

    // Should have exactly one edge, not two
    const matchingEdges = graph.edges.filter(
      (e) => e.from === "schedule-daily" && e.to === "commission-spawned",
    );
    expect(matchingEdges).toHaveLength(1);
  });

  test("ignores sourceSchedule when parent is not in the graph", () => {
    const commissions = [
      makeCommission({
        commissionId: "commission-orphan",
        sourceSchedule: "schedule-nonexistent",
      }),
    ];

    const graph = buildDependencyGraph(commissions);

    expect(graph.nodes).toHaveLength(1);
    expect(graph.edges).toHaveLength(0);
  });
});

// -- getNeighborhood --

describe("getNeighborhood", () => {
  test("returns correct subgraph (direct deps + direct dependents + self)", () => {
    // Graph: A -> B -> C -> D
    //        A -> C
    const graph: DependencyGraph = {
      nodes: [
        makeNode({ id: "a", title: "A", status: "completed" }),
        makeNode({ id: "b", title: "B", status: "completed" }),
        makeNode({ id: "c", title: "C", status: "pending" }),
        makeNode({ id: "d", title: "D", status: "pending" }),
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
        makeNode({ id: "lone", title: "Lone Wolf" }),
        makeNode({ id: "other", title: "Other" }),
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
        makeNode({ id: "a", title: "A" }),
      ],
      edges: [],
    };

    const neighborhood = getNeighborhood(graph, "nonexistent");

    expect(neighborhood.nodes).toHaveLength(0);
    expect(neighborhood.edges).toHaveLength(0);
  });
});

// -- buildAdjacencyList --

describe("buildAdjacencyList", () => {
  test("single-parent chain: A→B→C", () => {
    const graph: DependencyGraph = {
      nodes: [
        makeNode({ id: "a" }),
        makeNode({ id: "b" }),
        makeNode({ id: "c" }),
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    };

    const adj = buildAdjacencyList(graph);
    expect(adj.get("a")).toEqual(["b"]);
    expect(adj.get("b")).toEqual(["c"]);
    expect(adj.has("c")).toBe(false);
  });

  test("diamond: A→B, A→C, B→D, C→D", () => {
    const graph: DependencyGraph = {
      nodes: [
        makeNode({ id: "a" }),
        makeNode({ id: "b" }),
        makeNode({ id: "c" }),
        makeNode({ id: "d" }),
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "a", to: "c" },
        { from: "b", to: "d" },
        { from: "c", to: "d" },
      ],
    };

    const adj = buildAdjacencyList(graph);
    expect(adj.get("a")!.sort()).toEqual(["b", "c"]);
    expect(adj.get("b")).toEqual(["d"]);
    expect(adj.get("c")).toEqual(["d"]);
    expect(adj.has("d")).toBe(false);
  });

  test("isolated nodes: no edges, returns empty map", () => {
    const graph: DependencyGraph = {
      nodes: [
        makeNode({ id: "x" }),
        makeNode({ id: "y" }),
      ],
      edges: [],
    };

    const adj = buildAdjacencyList(graph);
    expect(adj.size).toBe(0);
  });

  test("schedule→spawned edges appear in the adjacency list", () => {
    const commissions = [
      makeCommission({
        commissionId: "schedule-daily",
        type: "scheduled",
      }),
      makeCommission({
        commissionId: "spawned-1",
        sourceSchedule: "schedule-daily",
      }),
      makeCommission({
        commissionId: "spawned-2",
        sourceSchedule: "schedule-daily",
      }),
    ];

    const graph = buildDependencyGraph(commissions);
    const adj = buildAdjacencyList(graph);
    expect(adj.get("schedule-daily")!.sort()).toEqual(["spawned-1", "spawned-2"]);
  });
});

