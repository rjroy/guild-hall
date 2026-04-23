/**
 * Helpers over the CLI surface tree defined in `./surface.ts`.
 *
 * Consumed by help rendering, the resolver, and structural tests. Keeps the
 * surface itself a pure data tree.
 */

import {
  AGGREGATE_SENTINEL,
  CLI_SURFACE,
  LOCAL_COMMAND_SENTINEL,
  PACKAGE_OP_SENTINEL,
  PHASE_LABELS,
  type CliGroupNode,
  type CliLeafNode,
  type CliNode,
} from "./surface";

/**
 * Find a node by walking segments from the root. An empty segments array
 * returns the root. Returns undefined if any segment does not match.
 */
export function findNodeByPath(
  segments: string[],
  root: CliGroupNode = CLI_SURFACE,
): CliNode | undefined {
  let node: CliNode = root;
  for (const segment of segments) {
    if (node.kind !== "group") return undefined;
    const next: CliNode | undefined = node.children.find((child) => child.name === segment);
    if (!next) return undefined;
    node = next;
  }
  return node;
}

/** All leaves in depth-first order. */
export function leafNodes(root: CliGroupNode = CLI_SURFACE): CliLeafNode[] {
  const out: CliLeafNode[] = [];
  const visit = (node: CliNode): void => {
    if (node.kind === "leaf") {
      out.push(node);
      return;
    }
    for (const child of node.children) visit(child);
  };
  for (const child of root.children) visit(child);
  return out;
}

/**
 * Path from root to `target`, exclusive of the root's own name.
 * Returns undefined if `target` is not reachable from `root`.
 */
export function pathForNode(
  target: CliNode,
  root: CliGroupNode = CLI_SURFACE,
): string[] | undefined {
  if (target === root) return [];
  const walk = (node: CliNode, trail: string[]): string[] | undefined => {
    if (node === target) return trail;
    if (node.kind !== "group") return undefined;
    for (const child of node.children) {
      const found = walk(child, [...trail, child.name]);
      if (found) return found;
    }
    return undefined;
  };
  for (const child of root.children) {
    const found = walk(child, [child.name]);
    if (found) return found;
  }
  return undefined;
}

export interface PathRuleViolation {
  path: string[];
  rule: string;
  detail: string;
}

/**
 * Groups where `list` may exist without a peer `read` leaf because the
 * underlying daemon does not yet expose a read op. REQ-CLI-AGENT-21 calls for
 * `read` wherever a noun has identifiers; these are documented gaps. The
 * plan notes future expansion: "verb sets grow cleanly as new enumerations
 * arrive (`model read`, `worker read`, etc.)."
 */
const LIST_WITHOUT_READ_EXEMPT_GROUPS = new Set<string>(["worker", "model"]);

/**
 * Enforce structural invariants on the surface tree. Returns a list of
 * violations; empty list means the tree satisfies all rules.
 *
 * Rules:
 * 1. No segment equals its parent segment (REQ-CLI-AGENT-8).
 * 2. No intermediate segment is a phase label (REQ-CLI-AGENT-9).
 * 3. If a group has a `list` leaf, it also has a `read` leaf — except for
 *    groups in `LIST_WITHOUT_READ_EXEMPT_GROUPS` (REQ-CLI-AGENT-21).
 * 4. Sub-grouping: every child-group has at least one leaf descendant
 *    (REQ-CLI-AGENT-11, 12).
 */
export function assertPathRules(root: CliGroupNode = CLI_SURFACE): PathRuleViolation[] {
  const violations: PathRuleViolation[] = [];
  const phaseLabels = new Set<string>(PHASE_LABELS);

  const walk = (node: CliNode, trail: string[], parentName: string | null): void => {
    if (parentName !== null && node.name === parentName) {
      violations.push({
        path: trail,
        rule: "no-parent-segment-repeat",
        detail: `Segment '${node.name}' repeats parent '${parentName}'.`,
      });
    }

    if (node.kind === "group") {
      // Phase labels may not appear as an intermediate (non-leaf, non-root)
      // segment. Since the root has no parent in `trail`, `trail.length === 0`
      // means root.
      if (trail.length > 0 && phaseLabels.has(node.name)) {
        violations.push({
          path: trail,
          rule: "no-phase-label-intermediate",
          detail: `Intermediate segment '${node.name}' is a phase label.`,
        });
      }

      const leafChildren = node.children.filter(
        (c): c is CliLeafNode => c.kind === "leaf",
      );
      const groupChildren = node.children.filter(
        (c): c is CliGroupNode => c.kind === "group",
      );
      const childNames = new Set(leafChildren.map((c) => c.name));

      if (
        childNames.has("list") &&
        !childNames.has("read") &&
        !LIST_WITHOUT_READ_EXEMPT_GROUPS.has(node.name)
      ) {
        violations.push({
          path: trail,
          rule: "list-requires-read",
          detail: `Group '${node.name}' has a 'list' leaf but no 'read' leaf.`,
        });
      }

      for (const sub of groupChildren) {
        const subLeafCount = countLeafDescendants(sub);
        if (subLeafCount < 1) {
          violations.push({
            path: [...trail, sub.name],
            rule: "subgroup-non-empty",
            detail: `Sub-group '${sub.name}' has no leaf descendants.`,
          });
        }
      }

      for (const child of node.children) {
        walk(child, [...trail, child.name], node.name);
      }
    }
  };

  for (const child of root.children) {
    walk(child, [child.name], null);
  }

  return violations;
}

function countLeafDescendants(node: CliNode): number {
  if (node.kind === "leaf") return 1;
  return node.children.reduce((sum, c) => sum + countLeafDescendants(c), 0);
}

/**
 * Return the operationIds that a leaf resolves to:
 * - Regular leaf: single-element array with `operationId`.
 * - Aggregate leaf: the `aggregate.operationIds` list.
 * - Package-op leaf: empty array (target is resolved at invocation time).
 */
export function operationIdsFor(leaf: CliLeafNode): string[] {
  if (leaf.operationId === AGGREGATE_SENTINEL) {
    return leaf.aggregate?.operationIds ?? [];
  }
  if (
    leaf.operationId === PACKAGE_OP_SENTINEL ||
    leaf.operationId === LOCAL_COMMAND_SENTINEL
  ) {
    return [];
  }
  return [leaf.operationId];
}

/**
 * Verbs that map to idempotent GET operations. Anything else is POST.
 * Keeping this table in one place lets surface.ts stay data-only while the
 * CLI derives invocation info from each leaf's operationId.
 */
const GET_VERBS = new Set([
  "list",
  "read",
  "status",
  "meta",
  "health",
  "check",
  "graph",
  "validate",
]);

/**
 * Operations that return SSE streams. Keyed by operationId.
 * Mirrors the `streaming` fields on daemon OperationDefinition entries — kept
 * here so the CLI can dispatch streaming calls without a runtime catalog
 * fetch (REQ-CLI-AGENT-26).
 */
const STREAMING_OPERATIONS: Record<string, { eventTypes: string[] }> = {
  "meeting.request.meeting.create": { eventTypes: ["meeting_message", "meeting_status"] },
  "meeting.request.meeting.accept": { eventTypes: ["meeting_message", "meeting_status"] },
  "meeting.session.message.send": { eventTypes: ["meeting_message", "meeting_status"] },
  "system.events.stream.subscribe": {
    eventTypes: ["commission_status", "meeting_status", "meeting_message"],
  },
};

/**
 * Method overrides for operations where the verb heuristic is wrong.
 * Most operations follow the convention (list/read → GET, create/dispatch → POST);
 * this table is the documented exception set.
 */
const METHOD_OVERRIDES: Record<string, "GET" | "POST"> = {
  // SSE stream endpoints are conventionally GET; `subscribe` is not in GET_VERBS
  // because it's not a generic read verb, only meaningful for streams.
  "system.events.stream.subscribe": "GET",
};

export interface OperationInvocation {
  method: "GET" | "POST";
  path: string;
  streaming?: { eventTypes: string[] };
}

/**
 * Resolve `{ method, path, streaming? }` for a concrete daemon operationId.
 * Path is derived by dot→slash substitution; method defaults to GET for
 * read-shaped verbs and POST otherwise; streaming is looked up in the table.
 *
 * Throws if called with an aggregate or package-op sentinel — those leaves
 * must be unwrapped to a concrete operationId first.
 */
export function invocationForOperation(operationId: string): OperationInvocation {
  if (
    operationId === AGGREGATE_SENTINEL ||
    operationId === PACKAGE_OP_SENTINEL ||
    operationId === LOCAL_COMMAND_SENTINEL
  ) {
    throw new Error(
      `invocationForOperation called with sentinel '${operationId}'. Resolve the target operationId first.`,
    );
  }
  const verb = operationId.split(".").pop() ?? "";
  const method = METHOD_OVERRIDES[operationId] ?? (GET_VERBS.has(verb) ? "GET" : "POST");
  const path = "/" + operationId.split(".").join("/");
  const streaming = STREAMING_OPERATIONS[operationId];
  return streaming ? { method, path, streaming } : { method, path };
}
