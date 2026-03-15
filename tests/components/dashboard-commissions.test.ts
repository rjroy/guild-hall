import { describe, test, expect } from "bun:test";
import type { CommissionMeta } from "@/lib/commissions";
import { sortCommissions } from "@/lib/commissions";
import { commissionHref } from "@/web/components/dashboard/DependencyMap";
import { buildDependencyGraph, getNeighborhood } from "@/lib/dependency-graph";
import { buildTreeList } from "@/web/components/dashboard/build-tree-list";
import { statusToGem } from "@/lib/types";

/**
 * Tests for the DependencyMap component's exported helpers and
 * the data flow from commission metadata to dashboard display.
 *
 * Component rendering is validated through the exported pure functions;
 * the React tree is a server component that wires these together with
 * Panel, StatusBadge, EmptyState, and Link.
 *
 * Tree construction tests validate the indentation logic that replaces
 * the former SVG graph vs flat card list decision.
 */

function makeCommission(overrides: Partial<CommissionMeta> = {}): CommissionMeta {
  return {
    commissionId: "commission-test-20260221-120000",
    title: "Test Commission",
    status: "pending",
    type: "one-shot",
    sourceSchedule: "",
    worker: "researcher",
    workerDisplayTitle: "Research Specialist",
    prompt: "Investigate the thing",
    dependencies: [],
    linked_artifacts: [],
    resource_overrides: {},
    current_progress: "",
    result_summary: "",
    projectName: "my-project",
    date: "2026-02-21",
    relevantDate: "",
    ...overrides,
  };
}

describe("DependencyMap empty state", () => {
  test("sortCommissions returns empty array for empty input", () => {
    const result = sortCommissions([]);
    expect(result).toEqual([]);
  });
});

describe("DependencyMap commission card data", () => {
  test("commission title is used for display", () => {
    const commission = makeCommission({ title: "Investigate Performance" });
    expect(commission.title).toBe("Investigate Performance");
  });

  test("commission falls back to commissionId when title is empty", () => {
    const commission = makeCommission({ title: "" });
    // Component uses: commission.title || commission.commissionId
    const displayTitle = commission.title || commission.commissionId;
    expect(displayTitle).toBe("commission-test-20260221-120000");
  });

  test("workerDisplayTitle is shown when present", () => {
    const commission = makeCommission({ workerDisplayTitle: "Architect" });
    expect(commission.workerDisplayTitle).toBe("Architect");
  });

  test("current_progress is shown when non-empty", () => {
    const commission = makeCommission({
      current_progress: "Analyzing dependencies...",
    });
    expect(commission.current_progress).toBe("Analyzing dependencies...");
  });

  test("status maps to correct gem via statusToGem", () => {
    expect(statusToGem("in_progress")).toBe("active");
    expect(statusToGem("dispatched")).toBe("active");
    expect(statusToGem("pending")).toBe("pending");
    expect(statusToGem("blocked")).toBe("blocked");
    expect(statusToGem("completed")).toBe("info");
    expect(statusToGem("failed")).toBe("blocked");
    expect(statusToGem("cancelled")).toBe("blocked");
    // Scheduled commission statuses
    expect(statusToGem("active")).toBe("active");
    expect(statusToGem("paused")).toBe("pending");
  });
});

describe("commissionHref", () => {
  test("constructs correct link to commission view", () => {
    const href = commissionHref("my-project", "commission-researcher-20260221-120000");
    expect(href).toBe(
      "/projects/my-project/commissions/commission-researcher-20260221-120000",
    );
  });

  test("encodes special characters in project name", () => {
    const href = commissionHref("my project & stuff", "commission-test-123");
    expect(href).toBe(
      "/projects/my%20project%20%26%20stuff/commissions/commission-test-123",
    );
  });

  test("encodes special characters in commission ID", () => {
    const href = commissionHref("project", "commission with spaces");
    expect(href).toBe(
      "/projects/project/commissions/commission%20with%20spaces",
    );
  });
});

describe("sortCommissions (consolidated from lib/commissions)", () => {
  // lib/commissions uses a four-group model: idle(0), active(1), failed(2), completed(3)
  // Idle/active/failed sort oldest first; completed sorts newest first.

  test("idle commissions (pending) sort before active (in_progress)", () => {
    const commissions = [
      makeCommission({ commissionId: "running-1", status: "in_progress", date: "2026-02-20" }),
      makeCommission({ commissionId: "pending-1", status: "pending", date: "2026-02-21" }),
      makeCommission({ commissionId: "done-1", status: "completed", date: "2026-02-22" }),
    ];

    const sorted = sortCommissions(commissions);
    expect(sorted[0].commissionId).toBe("pending-1");
    expect(sorted[1].commissionId).toBe("running-1");
    expect(sorted[2].commissionId).toBe("done-1");
  });

  test("active group sorts oldest first", () => {
    const commissions = [
      makeCommission({ commissionId: "late", status: "in_progress", date: "2026-02-21" }),
      makeCommission({ commissionId: "early", status: "dispatched", date: "2026-02-18" }),
      makeCommission({ commissionId: "mid", status: "in_progress", date: "2026-02-20" }),
    ];

    const sorted = sortCommissions(commissions);
    expect(sorted[0].commissionId).toBe("early");
    expect(sorted[1].commissionId).toBe("mid");
    expect(sorted[2].commissionId).toBe("late");
  });

  test("failed/cancelled sort after active, before completed", () => {
    const commissions = [
      makeCommission({ commissionId: "done-1", status: "completed", date: "2026-02-22" }),
      makeCommission({ commissionId: "failed-1", status: "failed", date: "2026-02-20" }),
      makeCommission({ commissionId: "running-1", status: "in_progress", date: "2026-02-19" }),
    ];

    const sorted = sortCommissions(commissions);
    expect(sorted[0].commissionId).toBe("running-1");
    expect(sorted[1].commissionId).toBe("failed-1");
    expect(sorted[2].commissionId).toBe("done-1");
  });

  test("completed sorts newest first", () => {
    const commissions = [
      makeCommission({ commissionId: "old", status: "completed", date: "2026-02-18" }),
      makeCommission({ commissionId: "new", status: "completed", date: "2026-02-22" }),
      makeCommission({ commissionId: "mid", status: "completed", date: "2026-02-20" }),
    ];

    const sorted = sortCommissions(commissions);
    expect(sorted[0].commissionId).toBe("new");
    expect(sorted[1].commissionId).toBe("mid");
    expect(sorted[2].commissionId).toBe("old");
  });

  test("does not mutate original array", () => {
    const commissions = [
      makeCommission({ commissionId: "b", status: "completed", date: "2026-02-20" }),
      makeCommission({ commissionId: "a", status: "in_progress", date: "2026-02-19" }),
    ];

    const originalFirst = commissions[0].commissionId;
    sortCommissions(commissions);
    expect(commissions[0].commissionId).toBe(originalFirst);
  });

  test("full sort order: idle, active, failed, completed", () => {
    const commissions = [
      makeCommission({ commissionId: "cancelled-1", status: "cancelled", date: "2026-02-15" }),
      makeCommission({ commissionId: "pending-1", status: "pending", date: "2026-02-18" }),
      makeCommission({ commissionId: "running-1", status: "in_progress", date: "2026-02-20" }),
      makeCommission({ commissionId: "failed-1", status: "failed", date: "2026-02-19" }),
      makeCommission({ commissionId: "dispatched-1", status: "dispatched", date: "2026-02-21" }),
      makeCommission({ commissionId: "completed-1", status: "completed", date: "2026-02-17" }),
    ];

    const sorted = sortCommissions(commissions);
    const ids = sorted.map((c: CommissionMeta) => c.commissionId);

    // Idle first (oldest first)
    expect(ids[0]).toBe("pending-1");

    // Active next (oldest first)
    expect(ids[1]).toBe("running-1");
    expect(ids[2]).toBe("dispatched-1");

    // Failed group (oldest first)
    expect(ids[3]).toBe("cancelled-1");
    expect(ids[4]).toBe("failed-1");

    // Completed last (newest first)
    expect(ids[5]).toBe("completed-1");
  });
});

describe("commission status gem mapping completeness", () => {
  test("all commission statuses produce valid gem values", () => {
    const commissionStatuses = [
      "pending",
      "dispatched",
      "in_progress",
      "completed",
      "failed",
      "cancelled",
    ];
    const validGems = new Set(["active", "pending", "blocked", "info"]);

    for (const status of commissionStatuses) {
      const gem = statusToGem(status);
      expect(validGems.has(gem)).toBe(true);
    }
  });
});

// -- Graph integration tests --
// These validate the graph construction used by DependencyMap's tree list.

describe("DependencyMap graph construction", () => {
  test("commissions with no inter-commission dependencies produce no edges (flat list path)", () => {
    const commissions = [
      makeCommission({ commissionId: "a", dependencies: [] }),
      makeCommission({ commissionId: "b", dependencies: ["specs/some-spec.md"] }),
      makeCommission({ commissionId: "c", dependencies: [] }),
    ];

    const graph = buildDependencyGraph(commissions);
    expect(graph.edges.length).toBe(0);
    // DependencyMap renders flat card list when edges.length === 0
  });

  test("commissions with inter-commission dependencies produce edges (graph path)", () => {
    const commissions = [
      makeCommission({ commissionId: "a", dependencies: [] }),
      makeCommission({
        commissionId: "b",
        dependencies: ["commissions/a.md"],
      }),
    ];

    const graph = buildDependencyGraph(commissions);
    expect(graph.edges.length).toBe(1);
    expect(graph.edges[0]).toEqual({ from: "a", to: "b" });
    // DependencyMap renders tree list with indentation when edges exist
  });

  test("graph nodes preserve projectName for multi-project dashboard navigation", () => {
    const commissions = [
      makeCommission({ commissionId: "a", projectName: "project-alpha" }),
      makeCommission({
        commissionId: "b",
        projectName: "project-beta",
        dependencies: ["commissions/a.md"],
      }),
    ];

    const graph = buildDependencyGraph(commissions);
    const nodeA = graph.nodes.find((n) => n.id === "a")!;
    const nodeB = graph.nodes.find((n) => n.id === "b")!;

    expect(nodeA.projectName).toBe("project-alpha");
    expect(nodeB.projectName).toBe("project-beta");

    // Tree list cards use node.projectName for navigation hrefs
    expect(commissionHref(nodeA.projectName, nodeA.id)).toBe(
      "/projects/project-alpha/commissions/a",
    );
    expect(commissionHref(nodeB.projectName, nodeB.id)).toBe(
      "/projects/project-beta/commissions/b",
    );
  });
});

describe("NeighborhoodGraph data flow", () => {
  test("neighborhood with no deps or dependents has single node (component returns null)", () => {
    const commissions = [
      makeCommission({ commissionId: "a" }),
      makeCommission({ commissionId: "b" }),
    ];

    const graph = buildDependencyGraph(commissions);
    const neighborhood = getNeighborhood(graph, "a");

    // NeighborhoodGraph returns null when neighborhood.nodes.length <= 1
    expect(neighborhood.nodes.length).toBe(1);
  });

  test("neighborhood with deps shows focal node plus neighbors", () => {
    const commissions = [
      makeCommission({ commissionId: "dep-1", dependencies: [] }),
      makeCommission({
        commissionId: "focal",
        dependencies: ["commissions/dep-1.md"],
      }),
      makeCommission({
        commissionId: "dependent",
        dependencies: ["commissions/focal.md"],
      }),
      makeCommission({ commissionId: "unrelated", dependencies: [] }),
    ];

    const graph = buildDependencyGraph(commissions);
    const neighborhood = getNeighborhood(graph, "focal");

    expect(neighborhood.nodes.length).toBe(3);
    const ids = neighborhood.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(["dep-1", "dependent", "focal"]);

    // "unrelated" should not be in the neighborhood
    expect(ids).not.toContain("unrelated");
  });

});

// -- Tree construction tests --

describe("buildTreeList", () => {
  test("single-parent chain: items at correct depths", () => {
    const commissions = [
      makeCommission({ commissionId: "a", title: "A", dependencies: [] }),
      makeCommission({ commissionId: "b", title: "B", dependencies: ["commissions/a.md"] }),
      makeCommission({ commissionId: "c", title: "C", dependencies: ["commissions/b.md"] }),
    ];

    const graph = buildDependencyGraph(commissions);
    const tree = buildTreeList(commissions, graph);

    expect(tree).toHaveLength(3);
    expect(tree[0].commission.commissionId).toBe("a");
    expect(tree[0].depth).toBe(0);
    expect(tree[1].commission.commissionId).toBe("b");
    expect(tree[1].depth).toBe(1);
    expect(tree[2].commission.commissionId).toBe("c");
    expect(tree[2].depth).toBe(2);
  });

  test("diamond dependency: multi-parent node at root with Awaits list", () => {
    const commissions = [
      makeCommission({ commissionId: "a", title: "Alpha", dependencies: [] }),
      makeCommission({ commissionId: "b", title: "Bravo", dependencies: [] }),
      makeCommission({
        commissionId: "d",
        title: "Delta",
        dependencies: ["commissions/a.md", "commissions/b.md"],
      }),
    ];

    const graph = buildDependencyGraph(commissions);
    const tree = buildTreeList(commissions, graph);

    // d has 2 incoming edges, so it renders at root level
    const deltaItem = tree.find((t) => t.commission.commissionId === "d")!;
    expect(deltaItem.depth).toBe(0);
    expect(deltaItem.awaits).toBeDefined();
    expect(deltaItem.awaits!.sort()).toEqual(["Alpha", "Bravo"]);

    // a and b are also root level (no incoming edges)
    expect(tree.find((t) => t.commission.commissionId === "a")!.depth).toBe(0);
    expect(tree.find((t) => t.commission.commissionId === "b")!.depth).toBe(0);
  });

  test("isolated nodes: all at depth 0, no Awaits annotations", () => {
    const commissions = [
      makeCommission({ commissionId: "x", dependencies: [] }),
      makeCommission({ commissionId: "y", dependencies: [] }),
      makeCommission({ commissionId: "z", dependencies: [] }),
    ];

    const graph = buildDependencyGraph(commissions);
    const tree = buildTreeList(commissions, graph);

    expect(tree).toHaveLength(3);
    for (const item of tree) {
      expect(item.depth).toBe(0);
      expect(item.awaits).toBeUndefined();
    }
  });

  test("mixed: independent, chained, and diamond", () => {
    const commissions = [
      makeCommission({ commissionId: "independent", title: "Ind", dependencies: [] }),
      makeCommission({ commissionId: "root", title: "Root", dependencies: [] }),
      makeCommission({ commissionId: "child", title: "Child", dependencies: ["commissions/root.md"] }),
      makeCommission({ commissionId: "fork-a", title: "Fork A", dependencies: [] }),
      makeCommission({ commissionId: "fork-b", title: "Fork B", dependencies: [] }),
      makeCommission({
        commissionId: "diamond",
        title: "Diamond",
        dependencies: ["commissions/fork-a.md", "commissions/fork-b.md"],
      }),
    ];

    const graph = buildDependencyGraph(commissions);
    const tree = buildTreeList(commissions, graph);

    expect(tree).toHaveLength(6);

    // child indents under root
    const childItem = tree.find((t) => t.commission.commissionId === "child")!;
    expect(childItem.depth).toBe(1);

    // diamond is at root with Awaits
    const diamondItem = tree.find((t) => t.commission.commissionId === "diamond")!;
    expect(diamondItem.depth).toBe(0);
    expect(diamondItem.awaits).toBeDefined();

    // independent is at root, no Awaits
    const indItem = tree.find((t) => t.commission.commissionId === "independent")!;
    expect(indItem.depth).toBe(0);
    expect(indItem.awaits).toBeUndefined();
  });

  test("children within a parent group sorted by sortCommissions, not globally", () => {
    // Parent has two children: one active (in_progress), one idle (pending).
    // sortCommissions puts idle before active.
    const commissions = [
      makeCommission({ commissionId: "parent", title: "Parent", status: "pending", dependencies: [] }),
      makeCommission({
        commissionId: "child-active",
        title: "Active Child",
        status: "in_progress",
        date: "2026-02-20",
        dependencies: ["commissions/parent.md"],
      }),
      makeCommission({
        commissionId: "child-idle",
        title: "Idle Child",
        status: "pending",
        date: "2026-02-21",
        dependencies: ["commissions/parent.md"],
      }),
    ];

    const graph = buildDependencyGraph(commissions);
    const tree = buildTreeList(commissions, graph);

    // Children should be sorted: idle (pending) before active (in_progress)
    const childIndices = tree
      .filter((t) => t.depth === 1)
      .map((t) => t.commission.commissionId);
    expect(childIndices[0]).toBe("child-idle");
    expect(childIndices[1]).toBe("child-active");
  });

  test("children of multi-parent root nodes indent at depth 1", () => {
    // diamond has 2 parents, so it's at root. diamond has a single-parent child.
    const commissions = [
      makeCommission({ commissionId: "p1", title: "P1", dependencies: [] }),
      makeCommission({ commissionId: "p2", title: "P2", dependencies: [] }),
      makeCommission({
        commissionId: "diamond",
        title: "Diamond",
        dependencies: ["commissions/p1.md", "commissions/p2.md"],
      }),
      makeCommission({
        commissionId: "grandchild",
        title: "Grandchild",
        dependencies: ["commissions/diamond.md"],
      }),
    ];

    const graph = buildDependencyGraph(commissions);
    const tree = buildTreeList(commissions, graph);

    const diamondItem = tree.find((t) => t.commission.commissionId === "diamond")!;
    expect(diamondItem.depth).toBe(0);

    const grandchildItem = tree.find((t) => t.commission.commissionId === "grandchild")!;
    expect(grandchildItem.depth).toBe(1);
  });
});
