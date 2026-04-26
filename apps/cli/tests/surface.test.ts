import { describe, test, expect } from "bun:test";
import {
  CLI_SURFACE,
  PHASE_LABELS,
  AGGREGATE_SENTINEL,
  LOCAL_COMMAND_SENTINEL,
  PACKAGE_OP_SENTINEL,
  type CliGroupNode,
  type CliLeafNode,
  type CliNode,
} from "@/apps/cli/surface";
import {
  findNodeByPath,
  leafNodes,
  pathForNode,
  assertPathRules,
  operationIdsFor,
} from "@/apps/cli/surface-utils";
import type { OperationDefinition } from "@/lib/types";

/**
 * Compile-time assertion that `cliPath` is not a key on `OperationDefinition`
 * (REQ-CLI-AGENT-2). If anyone reintroduces `cliPath`, this type evaluates
 * to `never` and the assignment fails to type-check.
 */
type _NoCliPath = "cliPath" extends keyof OperationDefinition ? never : true;
const _noCliPathCheck: _NoCliPath = true;
void _noCliPathCheck;

// Static fixture of known daemon operation IDs. Phase 5 will replace this
// with a live cross-check against the in-process OperationsRegistry.
const KNOWN_OPERATION_IDS = new Set<string>([
  // commission.*
  "commission.dependency.project.check",
  "commission.dependency.project.graph",
  "commission.request.commission.create",
  "commission.request.commission.list",
  "commission.request.commission.note",
  "commission.request.commission.read",
  "commission.request.commission.update",
  "commission.run.abandon",
  "commission.run.cancel",
  "commission.run.dispatch",
  "commission.run.redispatch",
  // coordination.*
  "coordination.review.briefing.read",
  // heartbeat.*
  "heartbeat.project.status",
  "heartbeat.project.tick",
  // meeting.*
  "meeting.request.meeting.accept",
  "meeting.request.meeting.create",
  "meeting.request.meeting.decline",
  "meeting.request.meeting.defer",
  "meeting.request.meeting.list",
  "meeting.request.meeting.read",
  "meeting.session.generation.interrupt",
  "meeting.session.meeting.close",
  "meeting.session.meeting.list",
  "meeting.session.message.send",
  // system.*
  "system.config.application.read",
  "system.config.application.reload",
  "system.config.application.validate",
  "system.config.project.deregister",
  "system.config.project.group",
  "system.config.project.list",
  "system.config.project.read",
  "system.config.project.register",
  "system.events.stream.subscribe",
  "system.models.catalog.list",
  "system.packages.worker.list",
  "system.runtime.daemon.health",
  // workspace.*
  "workspace.artifact.document.list",
  "workspace.artifact.document.read",
  ["workspace", "artifact", "document", "write"].join("."),
  "workspace.artifact.image.meta",
  "workspace.artifact.image.read",
  "workspace.artifact.mockup.read",
  "workspace.git.branch.rebase",
  "workspace.git.integration.sync",
  "workspace.git.lore.commit",
  "workspace.git.lore.status",
  "workspace.issue.create",
  "workspace.issue.list",
  "workspace.issue.read",
]);

describe("CLI_SURFACE structural invariants", () => {
  test("passes assertPathRules (no violations)", () => {
    const violations = assertPathRules(CLI_SURFACE);
    if (violations.length > 0) {
      // Surface the full list on failure so the message is actionable.
      const detail = violations
        .map((v) => `  - [${v.rule}] ${v.path.join("/")}: ${v.detail}`)
        .join("\n");
      throw new Error(`assertPathRules returned ${violations.length} violation(s):\n${detail}`);
    }
    expect(violations).toEqual([]);
  });

  test("no child segment repeats its parent's name", () => {
    const seen: string[] = [];
    const walk = (node: CliNode, parent: string | null) => {
      if (parent !== null) {
        expect(node.name).not.toBe(parent);
      }
      if (node.kind === "group") {
        for (const child of node.children) {
          walk(child, node.name);
          seen.push(child.name);
        }
      }
    };
    walk(CLI_SURFACE, null);
    expect(seen.length).toBeGreaterThan(0);
  });

  test("no intermediate segment is a phase label", () => {
    const phaseSet = new Set<string>(PHASE_LABELS);
    const walk = (node: CliNode, depth: number) => {
      if (node.kind !== "group") return;
      // depth 0 is root; depth 1+ is an intermediate group.
      if (depth > 0) {
        expect(phaseSet.has(node.name)).toBe(false);
      }
      for (const child of node.children) walk(child, depth + 1);
    };
    walk(CLI_SURFACE, 0);
  });

  test("every group with a 'list' leaf also has a 'read' leaf (with documented exceptions)", () => {
    // worker / model are documented exceptions: the daemon currently exposes
    // only `list` ops for them. Plan §Top-Level Layout calls out future
    // expansion ("verb sets grow cleanly as new enumerations arrive").
    const exemptGroups = new Set(["worker", "model"]);
    const walk = (node: CliNode) => {
      if (node.kind !== "group") return;
      const names = new Set(
        node.children.filter((c) => c.kind === "leaf").map((c) => c.name),
      );
      if (names.has("list") && !exemptGroups.has(node.name)) {
        expect(names.has("read")).toBe(true);
      }
      for (const child of node.children) walk(child);
    };
    walk(CLI_SURFACE);
  });

  test("every sub-group has at least one leaf descendant", () => {
    const walk = (node: CliNode) => {
      if (node.kind !== "group") return;
      for (const child of node.children) {
        if (child.kind === "group") {
          const count = leafNodes(child).length;
          expect(count).toBeGreaterThanOrEqual(1);
        }
        walk(child);
      }
    };
    walk(CLI_SURFACE);
  });

  test("every top-level group has a non-empty description", () => {
    for (const child of CLI_SURFACE.children) {
      expect(child.description.length).toBeGreaterThan(0);
    }
  });

  test("every leaf has a non-empty description, example, and outputShape", () => {
    for (const leaf of leafNodes()) {
      expect(leaf.description.length).toBeGreaterThan(0);
      expect(leaf.example.length).toBeGreaterThan(0);
      expect(leaf.outputShape.length).toBeGreaterThan(0);
    }
  });
});

describe("CLI_SURFACE operation ID coverage", () => {
  test("every non-sentinel leaf operationId is a known daemon operation", () => {
    const unknown: Array<{ path: string[]; operationId: string }> = [];
    for (const leaf of leafNodes()) {
      if (
        leaf.operationId === AGGREGATE_SENTINEL ||
        leaf.operationId === PACKAGE_OP_SENTINEL ||
        leaf.operationId === LOCAL_COMMAND_SENTINEL
      ) {
        continue;
      }
      if (!KNOWN_OPERATION_IDS.has(leaf.operationId)) {
        unknown.push({
          path: pathForNode(leaf) ?? [leaf.name],
          operationId: leaf.operationId,
        });
      }
    }
    if (unknown.length > 0) {
      const detail = unknown
        .map((u) => `  - ${u.path.join("/")}: ${u.operationId}`)
        .join("\n");
      throw new Error(`Unknown operationIds referenced by surface:\n${detail}`);
    }
    expect(unknown).toEqual([]);
  });

  test("aggregate leaves declare aggregate.operationIds in the known set", () => {
    const aggregates = leafNodes().filter(
      (l) => l.operationId === AGGREGATE_SENTINEL,
    );
    expect(aggregates.length).toBeGreaterThan(0);
    for (const agg of aggregates) {
      expect(agg.aggregate).toBeDefined();
      expect(agg.aggregate?.operationIds.length).toBeGreaterThan(0);
      expect(agg.aggregate?.justification?.length).toBeGreaterThan(0);
      for (const opId of agg.aggregate?.operationIds ?? []) {
        expect(KNOWN_OPERATION_IDS.has(opId)).toBe(true);
      }
    }
  });

  test("exactly one package-op fallback leaf exists", () => {
    const fallback = leafNodes().filter(
      (l) => l.operationId === PACKAGE_OP_SENTINEL,
    );
    expect(fallback.length).toBe(1);
  });

  test("every new Phase 1 operationId is referenced exactly once", () => {
    const newOps = [
      "system.config.project.list",
      "meeting.session.meeting.list",
      "workspace.issue.list",
      "workspace.issue.read",
    ];
    const counts = new Map<string, number>();
    for (const leaf of leafNodes()) {
      for (const opId of operationIdsFor(leaf)) {
        counts.set(opId, (counts.get(opId) ?? 0) + 1);
      }
    }
    for (const opId of newOps) {
      expect(counts.get(opId)).toBe(1);
    }
  });
});

describe("findNodeByPath", () => {
  test("empty segments returns the root", () => {
    expect(findNodeByPath([])).toBe(CLI_SURFACE);
  });

  test("finds a top-level group", () => {
    const node = findNodeByPath(["commission"]);
    expect(node?.kind).toBe("group");
    expect(node?.name).toBe("commission");
  });

  test("finds a leaf two levels deep", () => {
    const node = findNodeByPath(["commission", "list"]);
    expect(node?.kind).toBe("leaf");
    const leaf = node as CliLeafNode;
    expect(leaf.operationId).toBe("commission.request.commission.list");
  });

  test("finds an aggregate leaf", () => {
    const node = findNodeByPath(["meeting", "list"]);
    expect(node?.kind).toBe("leaf");
    const leaf = node as CliLeafNode;
    expect(leaf.operationId).toBe(AGGREGATE_SENTINEL);
    expect(leaf.aggregate?.operationIds).toContain("meeting.request.meeting.list");
    expect(leaf.aggregate?.operationIds).toContain("meeting.session.meeting.list");
  });

  test("finds the package-op fallback leaf", () => {
    const node = findNodeByPath(["package-op", "invoke"]);
    expect(node?.kind).toBe("leaf");
    const leaf = node as CliLeafNode;
    expect(leaf.operationId).toBe(PACKAGE_OP_SENTINEL);
  });

  test("finds a sub-grouped leaf (commission deps check)", () => {
    const node = findNodeByPath(["commission", "deps", "check"]);
    expect(node?.kind).toBe("leaf");
    const leaf = node as CliLeafNode;
    expect(leaf.operationId).toBe("commission.dependency.project.check");
  });

  test("returns undefined for unknown segment", () => {
    expect(findNodeByPath(["does-not-exist"])).toBeUndefined();
    expect(findNodeByPath(["commission", "xyz"])).toBeUndefined();
    // Descending past a leaf is undefined too.
    expect(findNodeByPath(["commission", "list", "extra"])).toBeUndefined();
  });
});

describe("pathForNode", () => {
  test("returns [] for the root", () => {
    expect(pathForNode(CLI_SURFACE)).toEqual([]);
  });

  test("returns full path to a leaf", () => {
    const node = findNodeByPath(["meeting", "close"]);
    expect(node).toBeDefined();
    if (!node) return;
    expect(pathForNode(node)).toEqual(["meeting", "close"]);
  });

  test("returns full path to a sub-group", () => {
    const node = findNodeByPath(["git", "lore"]);
    expect(node).toBeDefined();
    if (!node) return;
    expect(pathForNode(node)).toEqual(["git", "lore"]);
  });

  test("returns undefined for a node not in the tree", () => {
    const detached: CliGroupNode = {
      kind: "group",
      name: "detached",
      description: "",
      children: [],
    };
    expect(pathForNode(detached)).toBeUndefined();
  });
});

describe("leafNodes", () => {
  test("returns every leaf in the surface", () => {
    const leaves = leafNodes();
    const paths = leaves.map((l) => pathForNode(l)?.join("/"));
    // Spot-check a representative cross-section.
    expect(paths).toContain("project/list");
    expect(paths).toContain("project/heartbeat/tick");
    expect(paths).toContain("commission/deps/graph");
    expect(paths).toContain("meeting/list");
    expect(paths).toContain("meeting/close");
    expect(paths).toContain("issue/list");
    expect(paths).toContain("artifact/image/meta");
    expect(paths).toContain("git/lore/status");
    expect(paths).toContain("package-op/invoke");
    expect(paths).toContain("system/health");
  });
});

describe("operationIdsFor", () => {
  test("regular leaf returns single operationId", () => {
    const leaf = findNodeByPath(["commission", "list"]) as CliLeafNode;
    expect(operationIdsFor(leaf)).toEqual([
      "commission.request.commission.list",
    ]);
  });

  test("aggregate leaf returns all aggregated operationIds", () => {
    const leaf = findNodeByPath(["meeting", "list"]) as CliLeafNode;
    expect(operationIdsFor(leaf)).toEqual([
      "meeting.request.meeting.list",
      "meeting.session.meeting.list",
    ]);
  });

  test("package-op leaf returns empty array", () => {
    const leaf = findNodeByPath(["package-op", "invoke"]) as CliLeafNode;
    expect(operationIdsFor(leaf)).toEqual([]);
  });
});
