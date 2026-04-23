import { describe, test, expect } from "bun:test";
import { createOperationsRegistry } from "@/apps/daemon/lib/operations-registry";
import type { OperationDefinition } from "@/lib/types";

function makeOperation(
  overrides: Partial<OperationDefinition>,
): OperationDefinition {
  return {
    operationId: "test.operation",
    version: "1",
    name: "test",
    description: "Test operation",
    invocation: { method: "GET", path: "/test" },
    sideEffects: "",
    context: {},
    idempotent: true,
    hierarchy: { root: "test", feature: "operations" },
    ...overrides,
  };
}

describe("createOperationsRegistry", () => {
  test("builds registry from empty operation list", () => {
    const registry = createOperationsRegistry([]);

    expect(registry.operations.size).toBe(0);
    expect(registry.tree).toEqual([]);
  });

  test("registers a single operation with two-level hierarchy", () => {
    const op = makeOperation({
      operationId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });

    const registry = createOperationsRegistry([op]);

    expect(registry.operations.size).toBe(1);
    expect(registry.get("commission.run")).toEqual(op);
    expect(registry.tree).toHaveLength(1);
    expect(registry.tree[0].name).toBe("commission");
    expect(registry.tree[0].kind).toBe("root");
  });

  test("registers an operation with three-level hierarchy (object)", () => {
    const op = makeOperation({
      operationId: "commission.run.dispatch",
      name: "create",
      hierarchy: { root: "commission", feature: "run", object: "dispatch" },
    });

    const registry = createOperationsRegistry([op]);

    expect(registry.get("commission.run.dispatch")).toEqual(op);

    const root = registry.tree[0];
    expect(root.name).toBe("commission");
    const feature = root.children[0];
    expect(feature.name).toBe("run");
    const object = feature.children[0];
    expect(object.name).toBe("dispatch");
    expect(object.kind).toBe("object");
    const operation = object.children[0];
    expect(operation.name).toBe("create");
    expect(operation.kind).toBe("operation");
    expect(operation.operation).toEqual(op);
  });

  test("registers multiple operations under same root", () => {
    const op1 = makeOperation({
      operationId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });
    const op2 = makeOperation({
      operationId: "commission.list",
      hierarchy: { root: "commission", feature: "list" },
    });

    const registry = createOperationsRegistry([op1, op2]);

    expect(registry.operations.size).toBe(2);
    const root = registry.tree[0];
    expect(root.children).toHaveLength(2);
    expect(root.children.map((c) => c.name)).toEqual(["run", "list"]);
  });

  test("registers operations under multiple roots", () => {
    const op1 = makeOperation({
      operationId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });
    const op2 = makeOperation({
      operationId: "system.health",
      hierarchy: { root: "system", feature: "health" },
    });

    const registry = createOperationsRegistry([op1, op2]);

    expect(registry.tree).toHaveLength(2);
    expect(registry.tree.map((r) => r.name)).toEqual(["commission", "system"]);
  });

  test("registers operations with nested objects", () => {
    const op1 = makeOperation({
      operationId: "commission.run.dispatch",
      hierarchy: { root: "commission", feature: "run", object: "dispatch" },
    });
    const op2 = makeOperation({
      operationId: "commission.run.status",
      hierarchy: { root: "commission", feature: "run", object: "status" },
    });

    const registry = createOperationsRegistry([op1, op2]);

    const root = registry.tree[0];
    const feature = root.children[0];
    expect(feature.children).toHaveLength(2);
    expect(feature.children.map((o) => o.name)).toEqual(["dispatch", "status"]);
  });

  test("rejects duplicate operationIds", () => {
    const op1 = makeOperation({
      operationId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });
    const op2 = makeOperation({
      operationId: "commission.run",
      hierarchy: { root: "commission", feature: "list" },
    });

    expect(() => createOperationsRegistry([op1, op2])).toThrow(
      /Duplicate operationId "commission.run"/,
    );
  });

  test("uses provided descriptions for non-leaf nodes", () => {
    const op = makeOperation({
      operationId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });

    const descriptions = {
      commission: "Commission management operations",
      "commission.run": "Run a commission",
    };

    const registry = createOperationsRegistry([op], descriptions);

    expect(registry.tree[0].description).toBe(
      "Commission management operations",
    );
    expect(registry.tree[0].children[0].description).toBe("Run a commission");
  });

  test("uses fallback descriptions when not provided", () => {
    const op = makeOperation({
      operationId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });

    const registry = createOperationsRegistry([op]);

    expect(registry.tree[0].description).toBe("Operations for commission");
    expect(registry.tree[0].children[0].description).toBe(
      "Operations for run",
    );
  });

  test("uses partial descriptions (some provided, some fallback)", () => {
    const op = makeOperation({
      operationId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });

    const descriptions = {
      commission: "Commission management",
    };

    const registry = createOperationsRegistry([op], descriptions);

    expect(registry.tree[0].description).toBe("Commission management");
    expect(registry.tree[0].children[0].description).toBe(
      "Operations for run",
    );
  });

  test("get() returns undefined for missing operationId", () => {
    const op = makeOperation({
      operationId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });

    const registry = createOperationsRegistry([op]);

    expect(registry.get("commission.missing")).toBeUndefined();
  });

  test("filter() returns matching operations", () => {
    const op1 = makeOperation({
      operationId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });
    const op2 = makeOperation({
      operationId: "commission.list",
      sideEffects: "does stuff",
      hierarchy: { root: "commission", feature: "list" },
    });

    const registry = createOperationsRegistry([op1, op2]);

    const withSideEffects = registry.filter(
      (s) => s.sideEffects !== "",
    );
    expect(withSideEffects).toHaveLength(1);
    expect(withSideEffects[0].operationId).toBe("commission.list");
  });

  test("subtree() returns undefined for empty segments", () => {
    const op = makeOperation({
      operationId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });

    const registry = createOperationsRegistry([op]);

    expect(registry.subtree([])).toBeUndefined();
  });

  test("subtree() returns root node by name", () => {
    const op = makeOperation({
      operationId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });

    const registry = createOperationsRegistry([op]);

    const root = registry.subtree(["commission"]);
    expect(root).toBeDefined();
    expect(root?.name).toBe("commission");
    expect(root?.kind).toBe("root");
  });

  test("subtree() returns feature node", () => {
    const op = makeOperation({
      operationId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });

    const registry = createOperationsRegistry([op]);

    const feature = registry.subtree(["commission", "run"]);
    expect(feature).toBeDefined();
    expect(feature?.name).toBe("run");
    expect(feature?.kind).toBe("feature");
  });

  test("subtree() returns object node", () => {
    const op = makeOperation({
      operationId: "commission.run.dispatch",
      hierarchy: { root: "commission", feature: "run", object: "dispatch" },
    });

    const registry = createOperationsRegistry([op]);

    const object = registry.subtree(["commission", "run", "dispatch"]);
    expect(object).toBeDefined();
    expect(object?.name).toBe("dispatch");
    expect(object?.kind).toBe("object");
  });

  test("subtree() returns operation node", () => {
    const op = makeOperation({
      operationId: "commission.run.dispatch",
      name: "dispatch",
      hierarchy: { root: "commission", feature: "run", object: "dispatch" },
    });

    const registry = createOperationsRegistry([op]);

    const operation = registry.subtree([
      "commission",
      "run",
      "dispatch",
      "dispatch",
    ]);
    expect(operation).toBeDefined();
    expect(operation?.kind).toBe("operation");
    expect(operation?.operation).toEqual(op);
  });

  test("subtree() returns undefined for invalid path", () => {
    const op = makeOperation({
      operationId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });

    const registry = createOperationsRegistry([op]);

    expect(registry.subtree(["invalid"])).toBeUndefined();
    expect(registry.subtree(["commission", "invalid"])).toBeUndefined();
  });

  test("subtree() returns children list for non-operation nodes", () => {
    const op1 = makeOperation({
      operationId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });
    const op2 = makeOperation({
      operationId: "commission.list",
      hierarchy: { root: "commission", feature: "list" },
    });

    const registry = createOperationsRegistry([op1, op2]);

    const root = registry.subtree(["commission"]);
    expect(root?.children).toHaveLength(2);
    expect(root?.children.map((c) => c.name).sort()).toEqual(["list", "run"]);
  });

  test("operation node contains operation reference", () => {
    const op = makeOperation({
      operationId: "commission.run",
      name: "run",
      description: "Run a commission",
      invocation: { method: "POST", path: "/commission/run" },
      hierarchy: { root: "commission", feature: "run" },
    });

    const registry = createOperationsRegistry([op]);

    const feature = registry.subtree(["commission", "run"]);
    const operation = feature?.children[0];
    expect(operation?.operation).toEqual(op);
    expect(operation?.operation?.invocation.method).toBe("POST");
  });

  test("complex multi-level hierarchy", () => {
    const operations = [
      makeOperation({
        operationId: "commission.run.dispatch",
        hierarchy: { root: "commission", feature: "run", object: "dispatch" },
      }),
      makeOperation({
        operationId: "commission.run.status",
        hierarchy: { root: "commission", feature: "run", object: "status" },
      }),
      makeOperation({
        operationId: "commission.list",
        hierarchy: { root: "commission", feature: "list" },
      }),
      makeOperation({
        operationId: "meeting.create",
        hierarchy: { root: "meeting", feature: "create" },
      }),
    ];

    const registry = createOperationsRegistry(operations);

    expect(registry.tree).toHaveLength(2);

    const commissionRoot = registry.tree[0];
    expect(commissionRoot.name).toBe("commission");
    expect(commissionRoot.children).toHaveLength(2);

    const runFeature = commissionRoot.children[0];
    expect(runFeature.name).toBe("run");
    expect(runFeature.children).toHaveLength(2);

    const dispatchObject = runFeature.children[0];
    expect(dispatchObject.name).toBe("dispatch");
    expect(dispatchObject.children).toHaveLength(1);
  });
});
