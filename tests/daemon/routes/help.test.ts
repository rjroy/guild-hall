import { describe, test, expect } from "bun:test";
import { createOperationsRegistry } from "@/daemon/lib/operations-registry";
import { createHelpRoutes } from "@/daemon/routes/help";
import type { OperationDefinition } from "@/lib/types";

function makeOperation(
  overrides: Partial<OperationDefinition>,
): OperationDefinition {
  return {
    operationId: "test.skill",
    version: "1",
    name: "test",
    description: "Test skill",
    invocation: { method: "GET", path: "/test" },
    sideEffects: "",
    context: {},
    idempotent: true,
    hierarchy: { root: "test", feature: "skills" },
    ...overrides,
  };
}

describe("Help Routes", () => {
  test("GET /help returns top-level roots", async () => {
    const skills = [
      makeOperation({
        operationId: "commission.run",
        hierarchy: { root: "commission", feature: "run" },
      }),
      makeOperation({
        operationId: "system.health",
        hierarchy: { root: "system", feature: "health" },
      }),
    ];

    const registry = createOperationsRegistry(skills);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/help");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.operationId).toBe("");
    expect(body.version).toBe("1");
    expect(body.path).toBe("/");
    expect(body.kind).toBe("root");
    expect(body.name).toBe("Guild Hall API");
    expect(body.children).toHaveLength(2);
    expect(body.children[0].name).toBe("commission");
    expect(body.children[0].kind).toBe("root");
    expect(body.children[1].name).toBe("system");
  });

  test("GET /help includes correct child structure", async () => {
    const skills = [
      makeOperation({
        operationId: "commission.run",
        hierarchy: { root: "commission", feature: "run" },
      }),
    ];

    const registry = createOperationsRegistry(skills);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/help");
    const body = await res.json();

    const child = body.children[0];
    expect(child.name).toBe("commission");
    expect(child.kind).toBe("root");
    expect(child.path).toBe("/commission");
    expect(child.description).toBeDefined();
  });

  test("GET /:root/help returns features under a root", async () => {
    const skills = [
      makeOperation({
        operationId: "commission.run",
        hierarchy: { root: "commission", feature: "run" },
      }),
      makeOperation({
        operationId: "commission.list",
        hierarchy: { root: "commission", feature: "list" },
      }),
    ];

    const registry = createOperationsRegistry(skills);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/commission/help");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.operationId).toBe("commission");
    expect(body.path).toBe("/commission");
    expect(body.kind).toBe("root");
    expect(body.name).toBe("commission");
    expect(body.children).toHaveLength(2);
    expect(body.children[0].name).toBe("run");
    expect(body.children[0].kind).toBe("feature");
    expect(body.children[1].name).toBe("list");
  });

  test("GET /:root/help returns 404 for invalid root", async () => {
    const skills = [
      makeOperation({
        operationId: "commission.run",
        hierarchy: { root: "commission", feature: "run" },
      }),
    ];

    const registry = createOperationsRegistry(skills);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/invalid/help");
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBe("Not found");
  });

  test("GET /:root/:feature/help returns objects under a feature", async () => {
    const skills = [
      makeOperation({
        operationId: "commission.run.dispatch",
        hierarchy: { root: "commission", feature: "run", object: "dispatch" },
      }),
      makeOperation({
        operationId: "commission.run.status",
        hierarchy: { root: "commission", feature: "run", object: "status" },
      }),
    ];

    const registry = createOperationsRegistry(skills);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/commission/run/help");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.operationId).toBe("commission.run");
    expect(body.path).toBe("/commission/run");
    expect(body.kind).toBe("feature");
    expect(body.children).toHaveLength(2);
    expect(body.children[0].name).toBe("dispatch");
    expect(body.children[0].kind).toBe("object");
    expect(body.children[1].name).toBe("status");
  });

  test("GET /:root/:feature/help returns 404 for invalid feature", async () => {
    const skills = [
      makeOperation({
        operationId: "commission.run",
        hierarchy: { root: "commission", feature: "run" },
      }),
    ];

    const registry = createOperationsRegistry(skills);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/commission/invalid/help");
    expect(res.status).toBe(404);
  });

  test("GET /:root/:feature/:object/help returns operations under an object", async () => {
    const skills = [
      makeOperation({
        operationId: "commission.run.dispatch",
        name: "dispatch",
        description: "Dispatch a commission",
        hierarchy: { root: "commission", feature: "run", object: "dispatch" },
      }),
      makeOperation({
        operationId: "commission.run.abort",
        name: "abort",
        description: "Abort a commission",
        hierarchy: { root: "commission", feature: "run", object: "dispatch" },
      }),
    ];

    const registry = createOperationsRegistry(skills);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/commission/run/dispatch/help");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.operationId).toBe("commission.run.dispatch");
    expect(body.path).toBe("/commission/run/dispatch");
    expect(body.kind).toBe("object");
    expect(body.children).toHaveLength(2);
    expect(body.children[0].name).toBe("dispatch");
    expect(body.children[0].kind).toBe("operation");
    expect(body.children[1].name).toBe("abort");
  });

  test("GET /:root/:feature/:object/help returns 404 for invalid object", async () => {
    const skills = [
      makeOperation({
        operationId: "commission.run.dispatch",
        hierarchy: { root: "commission", feature: "run", object: "dispatch" },
      }),
    ];

    const registry = createOperationsRegistry(skills);
    const routes = createHelpRoutes(registry);

    const res = await routes.request(
      "/commission/run/invalid/help",
    );
    expect(res.status).toBe(404);
  });

  test("GET /:root/:feature/:object/:operation/help returns full operation metadata", async () => {
    const skill = makeOperation({
      operationId: "commission.request.commission.create",
      name: "create",
      description: "Create a commission",
      invocation: { method: "POST", path: "/commission/request/commission/create" },
      hierarchy: { root: "commission", feature: "request", object: "commission" },
    });

    const registry = createOperationsRegistry([skill]);
    const routes = createHelpRoutes(registry);

    const res = await routes.request(
      "/commission/request/commission/create/help",
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.operationId).toBe("commission.request.commission.create");
    expect(body.path).toBe("/commission/request/commission/create");
    expect(body.kind).toBe("operation");
    expect(body.name).toBe("create");
    expect(body.description).toBe("Create a commission");
    expect(body.method).toBe("POST");
    expect(body.visibility).toBe("available");
    expect(body.children).toBeUndefined();
  });

  test("GET /:root/:feature/:object/:operation/help includes HTTP method", async () => {
    const skill = makeOperation({
      operationId: "commission.run.dispatch",
      name: "dispatch",
      invocation: { method: "POST", path: "/commission/run/dispatch" },
      hierarchy: { root: "commission", feature: "run", object: "dispatch" },
    });

    const registry = createOperationsRegistry([skill]);
    const routes = createHelpRoutes(registry);

    const res = await routes.request(
      "/commission/run/dispatch/dispatch/help",
    );
    const body = await res.json();

    expect(body.method).toBe("POST");
  });

  test("GET /:root/:feature/:object/:operation/help returns 404 for invalid operation", async () => {
    const skill = makeOperation({
      operationId: "commission.run.dispatch",
      name: "dispatch",
      hierarchy: { root: "commission", feature: "run", object: "dispatch" },
    });

    const registry = createOperationsRegistry([skill]);
    const routes = createHelpRoutes(registry);

    const res = await routes.request(
      "/commission/run/dispatch/invalid/help",
    );
    expect(res.status).toBe(404);
  });

  test("handles hierarchies without objects (two-level)", async () => {
    const skill = makeOperation({
      operationId: "system.health",
      name: "health",
      description: "Get health status",
      hierarchy: { root: "system", feature: "health" },
    });

    const registry = createOperationsRegistry([skill]);
    const routes = createHelpRoutes(registry);

    // GET /:root/:feature/help - should list operations directly under feature
    const res = await routes.request("/system/health/help");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.kind).toBe("feature");
    expect(body.children).toHaveLength(1);
    expect(body.children[0].kind).toBe("operation");
    expect(body.children[0].name).toBe("health");
  });

  test("handles mixed hierarchies (some with objects, some without)", async () => {
    const skills = [
      makeOperation({
        operationId: "commission.run.dispatch",
        hierarchy: { root: "commission", feature: "run", object: "dispatch" },
      }),
      makeOperation({
        operationId: "system.health",
        hierarchy: { root: "system", feature: "health" },
      }),
    ];

    const registry = createOperationsRegistry(skills);
    const routes = createHelpRoutes(registry);

    const res1 = await routes.request("/commission/help");
    const body1 = await res1.json();
    expect(body1.children[0].kind).toBe("feature");

    const res2 = await routes.request("/system/help");
    const body2 = await res2.json();
    expect(body2.children[0].kind).toBe("feature");
  });

  test("GET /help with empty registry", async () => {
    const registry = createOperationsRegistry([]);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/help");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.kind).toBe("root");
    expect(body.children).toHaveLength(0);
  });

  test("response includes visibility field", async () => {
    const skill = makeOperation({
      operationId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });

    const registry = createOperationsRegistry([skill]);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/commission/help");
    const body = await res.json();

    expect(body.visibility).toBe("available");
  });

  test("response includes version", async () => {
    const skill = makeOperation({
      operationId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });

    const registry = createOperationsRegistry([skill]);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/commission/help");
    const body = await res.json();

    expect(body.version).toBe("1");
  });

  test("child entries include path", async () => {
    const skills = [
      makeOperation({
        operationId: "commission.run",
        hierarchy: { root: "commission", feature: "run" },
      }),
      makeOperation({
        operationId: "commission.list",
        hierarchy: { root: "commission", feature: "list" },
      }),
    ];

    const registry = createOperationsRegistry(skills);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/commission/help");
    const body = await res.json();

    expect(body.children[0].path).toBe("/commission/run");
    expect(body.children[1].path).toBe("/commission/list");
  });

  test("operation without object has operationId derived from path", async () => {
    const skill = makeOperation({
      operationId: "system.health",
      hierarchy: { root: "system", feature: "health" },
    });

    const registry = createOperationsRegistry([skill]);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/system/health/help");
    const body = await res.json();

    expect(body.operationId).toBe("system.health");
  });

  test("operation with object has full operationId in response", async () => {
    const skill = makeOperation({
      operationId: "commission.request.commission.update",
      name: "update",
      hierarchy: { root: "commission", feature: "request", object: "commission" },
    });

    const registry = createOperationsRegistry([skill]);
    const routes = createHelpRoutes(registry);

    const res = await routes.request(
      "/commission/request/commission/update/help",
    );
    const body = await res.json();

    expect(body.operationId).toBe("commission.request.commission.update");
  });

  test("multiple operations under same object", async () => {
    const skills = [
      makeOperation({
        operationId: "commission.run.dispatch",
        name: "dispatch",
        hierarchy: { root: "commission", feature: "run", object: "dispatch" },
      }),
      makeOperation({
        operationId: "commission.run.cancel",
        name: "cancel",
        hierarchy: { root: "commission", feature: "run", object: "dispatch" },
      }),
      makeOperation({
        operationId: "commission.run.status",
        name: "status",
        hierarchy: { root: "commission", feature: "run", object: "dispatch" },
      }),
    ];

    const registry = createOperationsRegistry(skills);
    const routes = createHelpRoutes(registry);

    const res = await routes.request(
      "/commission/run/dispatch/help",
    );
    const body: { children: { name: string }[] } = await res.json();

    expect(body.children).toHaveLength(3);
    expect(body.children.map((c) => c.name)).toEqual([
      "dispatch",
      "cancel",
      "status",
    ]);
  });

  test("skill metadata includes method for operation nodes", async () => {
    const skill = makeOperation({
      operationId: "commission.run.dispatch",
      name: "dispatch",
      invocation: { method: "POST", path: "/commission/run/dispatch" },
      hierarchy: { root: "commission", feature: "run" },
    });

    const registry = createOperationsRegistry([skill]);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/commission/run/dispatch/help");
    const body = await res.json();

    expect(body.method).toBe("POST");
  });

  test("operation help for package skill includes sourcePackage", async () => {
    const skill = makeOperation({
      operationId: "workspace.artifact.document.cleanup",
      name: "cleanup",
      description: "Clean up old artifacts",
      invocation: { method: "POST", path: "/workspace/artifact/document/cleanup" },
      hierarchy: { root: "workspace", feature: "artifact", object: "document" },
      sourcePackage: "guild-hall-writer",
    });

    const registry = createOperationsRegistry([skill]);
    const routes = createHelpRoutes(registry);

    const res = await routes.request(
      "/workspace/artifact/document/cleanup/help",
    );
    const body = await res.json();

    expect(body.sourcePackage).toBe("guild-hall-writer");
  });

  test("operation help for built-in skill omits sourcePackage", async () => {
    const skill = makeOperation({
      operationId: "system.health",
      name: "health",
      description: "Check health",
      hierarchy: { root: "system", feature: "health" },
      // No sourcePackage set - built-in skill
    });

    const registry = createOperationsRegistry([skill]);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/system/health/health/help");
    const body = await res.json();

    expect(body).not.toHaveProperty("sourcePackage");
  });

  test("package skill appears in correct hierarchy position", async () => {
    const builtIn = makeOperation({
      operationId: "workspace.artifact.document.list",
      name: "list",
      description: "List artifacts",
      hierarchy: { root: "workspace", feature: "artifact", object: "document" },
    });
    const packageSkill = makeOperation({
      operationId: "workspace.artifact.document.cleanup",
      name: "cleanup",
      description: "Clean up old artifacts",
      hierarchy: { root: "workspace", feature: "artifact", object: "document" },
      sourcePackage: "guild-hall-writer",
    });

    const registry = createOperationsRegistry([builtIn, packageSkill]);
    const routes = createHelpRoutes(registry);

    // Both should appear as children of the same object node
    const res = await routes.request("/workspace/artifact/document/help");
    const body = await res.json();

    expect(body.kind).toBe("object");
    expect(body.children).toHaveLength(2);
    expect((body.children as Array<{ name: string }>).map((c) => c.name)).toEqual([
      "list",
      "cleanup",
    ]);
  });

  test("non-operation nodes omit method field", async () => {
    const skill = makeOperation({
      operationId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });

    const registry = createOperationsRegistry([skill]);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/commission/help");
    const body = await res.json();

    expect(body.method).toBeUndefined();
  });
});

describe("GET /help/operations", () => {
  test("returns flat list of all operations", async () => {
    const skills = [
      makeOperation({
        operationId: "system.health",
        name: "health",
        description: "Check health",
        hierarchy: { root: "system", feature: "health" },
      }),
      makeOperation({
        operationId: "workspace.artifact.document.list",
        name: "list",
        description: "List artifacts",
        hierarchy: { root: "workspace", feature: "artifact", object: "document" },
        parameters: [{ name: "projectName", required: true, in: "query" }],
      }),
    ];

    const registry = createOperationsRegistry(skills);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/help/operations");
    expect(res.status).toBe(200);

    const body = await res.json() as { operations: Array<Record<string, unknown>> };
    expect(body.operations).toHaveLength(2);
    expect(body.operations[0].operationId).toBe("system.health");
    expect(body.operations[1].operationId).toBe("workspace.artifact.document.list");
    expect(body.operations[1].parameters).toEqual([
      { name: "projectName", required: true, in: "query" },
    ]);
  });

  test("includes invocation metadata", async () => {
    const skill = makeOperation({
      operationId: "commission.run.dispatch",
      name: "dispatch",
      invocation: { method: "POST", path: "/commission/run/dispatch" },
      hierarchy: { root: "commission", feature: "run" },
    });

    const registry = createOperationsRegistry([skill]);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/help/operations");
    const body = await res.json() as { operations: Array<Record<string, unknown>> };

    expect(body.operations[0].invocation).toEqual({
      method: "POST",
      path: "/commission/run/dispatch",
    });
  });

  test("includes streaming metadata when present", async () => {
    const skill = makeOperation({
      operationId: "meeting.session.message.send",
      name: "send",
      hierarchy: { root: "meeting", feature: "session", object: "message" },
      streaming: { eventTypes: ["meeting_message", "meeting_status"] },
    });

    const registry = createOperationsRegistry([skill]);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/help/operations");
    const body = await res.json() as { operations: Array<Record<string, unknown>> };

    expect(body.operations[0].streaming).toEqual({
      eventTypes: ["meeting_message", "meeting_status"],
    });
  });

  test("omits streaming when not present", async () => {
    const skill = makeOperation({
      operationId: "system.health",
      hierarchy: { root: "system", feature: "health" },
    });

    const registry = createOperationsRegistry([skill]);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/help/operations");
    const body = await res.json() as { operations: Array<Record<string, unknown>> };

    expect(body.operations[0].streaming).toBeUndefined();
  });

  test("returns empty list for empty registry", async () => {
    const registry = createOperationsRegistry([]);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/help/operations");
    const body = await res.json() as { operations: unknown[] };

    expect(body.operations).toHaveLength(0);
  });

  test("includes sourcePackage for package skills", async () => {
    const skills = [
      makeOperation({
        operationId: "workspace.artifact.document.cleanup",
        name: "cleanup",
        description: "Clean up old artifacts",
        hierarchy: { root: "workspace", feature: "artifact", object: "document" },
        sourcePackage: "guild-hall-writer",
      }),
      makeOperation({
        operationId: "system.health",
        name: "health",
        description: "Check health",
        hierarchy: { root: "system", feature: "health" },
      }),
    ];

    const registry = createOperationsRegistry(skills);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/help/operations");
    const body = await res.json() as { operations: Array<Record<string, unknown>> };

    const packageSkill = body.operations.find(
      (s) => s.operationId === "workspace.artifact.document.cleanup",
    );
    expect(packageSkill?.sourcePackage).toBe("guild-hall-writer");

    const builtInSkill = body.operations.find(
      (s) => s.operationId === "system.health",
    );
    expect(builtInSkill).not.toHaveProperty("sourcePackage");
  });

  test("does not expose requestSchema, responseSchema, or sideEffects", async () => {
    const skill = makeOperation({
      operationId: "test.skill",
      sideEffects: "Does something dangerous",
      hierarchy: { root: "test", feature: "skills" },
    });

    const registry = createOperationsRegistry([skill]);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/help/operations");
    const body = await res.json() as { operations: Array<Record<string, unknown>> };

    expect(body.operations[0]).not.toHaveProperty("sideEffects");
    expect(body.operations[0]).not.toHaveProperty("requestSchema");
    expect(body.operations[0]).not.toHaveProperty("responseSchema");
  });
});
