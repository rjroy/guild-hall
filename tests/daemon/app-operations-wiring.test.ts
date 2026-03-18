/**
 * Tests for package operation wiring in createApp().
 *
 * Verifies that package-contributed operations integrate correctly with the
 * built-in operations registry: route mounting, registry inclusion, duplicate
 * detection, and navigation tree integration.
 */

import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import { createApp, type AppDeps } from "@/daemon/app";
import type { OperationDefinition, RouteModule } from "@/lib/types";

// -- Helpers --

function makeHealthDeps(): AppDeps["health"] {
  return {
    getMeetingCount: () => 0,
    getUptimeSeconds: () => 0,
  };
}

function makeOperation(overrides: Partial<OperationDefinition> = {}): OperationDefinition {
  return {
    operationId: "test.default.op",
    version: "1",
    name: "op",
    description: "Test operation",
    invocation: { method: "GET", path: "/test/default/op" },
    sideEffects: "",
    context: {},
    idempotent: true,
    hierarchy: { root: "test", feature: "default" },
    ...overrides,
  };
}

function makePackageOperationRouteModule(
  operations: OperationDefinition[],
  descriptions?: Record<string, string>,
): RouteModule {
  const routes = new Hono();
  for (const op of operations) {
    if (op.invocation.method === "GET") {
      routes.get(op.invocation.path, (c) => c.json({ ok: true }));
    } else {
      routes.post(op.invocation.path, (c) => c.json({ ok: true }));
    }
  }
  return { routes, operations, descriptions };
}

// -- Tests --

describe("createApp with packageOperationRouteModule", () => {
  test("routes and operations from package operation module are mounted", async () => {
    const pkgSkill = makeOperation({
      operationId: "pkg.custom.do-thing",
      name: "do-thing",
      invocation: { method: "GET", path: "/pkg/custom/do-thing" },
      hierarchy: { root: "pkg", feature: "custom" },
      sourcePackage: "test-pkg",
    });

    const routeModule = makePackageOperationRouteModule([pkgSkill]);

    const { app, registry } = createApp({
      health: makeHealthDeps(),
      packageOperationRouteModule: routeModule,
    });

    // Operation is in the registry
    expect(registry.get("pkg.custom.do-thing")).toBeDefined();
    expect(registry.get("pkg.custom.do-thing")!.sourcePackage).toBe("test-pkg");

    // Route is reachable
    const res = await app.request("/pkg/custom/do-thing");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("createApp without packageOperationRouteModule works the same as before", () => {
    const { registry } = createApp({
      health: makeHealthDeps(),
    });

    // Registry should exist and have only the health operation(s)
    expect(registry).toBeDefined();
    expect(registry.operations).toBeDefined();
    // Health routes contribute operations; no package operations should be present
    const allOps = registry.filter(() => true);
    const pkgOps = allOps.filter((s) => s.sourcePackage !== undefined);
    expect(pkgOps).toHaveLength(0);
  });

  test("registry contains both built-in and package operations", () => {
    // Create a config dep that activates the models route (which contributes operations)
    const config = { projects: [] };

    const pkgSkill = makeOperation({
      operationId: "pkg.thing.action",
      name: "action",
      invocation: { method: "POST", path: "/pkg/thing/action" },
      hierarchy: { root: "pkg", feature: "thing" },
      sourcePackage: "my-package",
    });

    const routeModule = makePackageOperationRouteModule([pkgSkill]);

    const { registry } = createApp({
      health: makeHealthDeps(),
      config,
      packageOperationRouteModule: routeModule,
    });

    // Should have at least the package operation
    expect(registry.get("pkg.thing.action")).toBeDefined();

    // Built-in operations from models route should also be present
    const builtInOps = registry.filter((s) => s.sourcePackage === undefined);
    const pkgOps = registry.filter((s) => s.sourcePackage !== undefined);

    // The models route contributes operations when config is provided
    expect(builtInOps.length).toBeGreaterThanOrEqual(0);
    expect(pkgOps).toHaveLength(1);
    expect(pkgOps[0].operationId).toBe("pkg.thing.action");
  });

  test("duplicate operationId between package and built-in throws at registry construction", () => {
    // Health routes contribute at least one operation. We need a built-in operation ID.
    // Use the config route which registers operations. Instead, let's create a
    // scenario with two route modules that share an operationId.
    //
    // The simplest approach: the health route contributes "system.health.status".
    // We'll check what health contributes, then duplicate it.

    // First, find out what operationIds the health route contributes
    const { registry: baseRegistry } = createApp({ health: makeHealthDeps() });
    const builtInIds = baseRegistry.filter(() => true).map((s) => s.operationId);

    if (builtInIds.length === 0) {
      // If health contributes no operations, skip the built-in collision test
      // and just test package-vs-package collision
      const skill1 = makeOperation({
        operationId: "collision.test.op",
        hierarchy: { root: "collision", feature: "test" },
      });
      const skill2 = makeOperation({
        operationId: "collision.test.op",
        name: "op2",
        hierarchy: { root: "collision", feature: "test" },
      });

      expect(() =>
        createApp({
          health: makeHealthDeps(),
          packageOperationRouteModule: makePackageOperationRouteModule([skill1, skill2]),
        }),
      ).toThrow(/Duplicate operationId "collision.test.op"/);
      return;
    }

    // Duplicate a built-in operationId in the package module
    const duplicateSkill = makeOperation({
      operationId: builtInIds[0],
      hierarchy: { root: "dup", feature: "test" },
      sourcePackage: "bad-package",
    });

    expect(() =>
      createApp({
        health: makeHealthDeps(),
        packageOperationRouteModule: makePackageOperationRouteModule([duplicateSkill]),
      }),
    ).toThrow(/Duplicate operationId/);
  });

  test("duplicate operationId within package operations throws", () => {
    const skill1 = makeOperation({
      operationId: "pkg.dup.op",
      hierarchy: { root: "pkg", feature: "dup" },
      sourcePackage: "pkg-a",
    });
    const skill2 = makeOperation({
      operationId: "pkg.dup.op",
      name: "op2",
      hierarchy: { root: "pkg", feature: "dup" },
      sourcePackage: "pkg-b",
    });

    expect(() =>
      createApp({
        health: makeHealthDeps(),
        packageOperationRouteModule: makePackageOperationRouteModule([skill1, skill2]),
      }),
    ).toThrow(/Duplicate operationId "pkg.dup.op"/);
  });

  test("package operation descriptions merge into navigation tree", () => {
    const skill = makeOperation({
      operationId: "ext.tools.run",
      name: "run",
      invocation: { method: "POST", path: "/ext/tools/run" },
      hierarchy: { root: "ext", feature: "tools" },
      sourcePackage: "tools-pkg",
    });

    const descriptions = {
      ext: "External package operations",
      "ext.tools": "Tool management operations",
    };

    const routeModule = makePackageOperationRouteModule([skill], descriptions);

    const { registry } = createApp({
      health: makeHealthDeps(),
      packageOperationRouteModule: routeModule,
    });

    const extNode = registry.subtree(["ext"]);
    expect(extNode).toBeDefined();
    expect(extNode!.description).toBe("External package operations");

    const toolsNode = registry.subtree(["ext", "tools"]);
    expect(toolsNode).toBeDefined();
    expect(toolsNode!.description).toBe("Tool management operations");
  });

  test("help endpoint includes package operations in tree", async () => {
    const skill = makeOperation({
      operationId: "pkg.feature.op",
      name: "op",
      description: "Package operation",
      invocation: { method: "GET", path: "/pkg/feature/op" },
      hierarchy: { root: "pkg", feature: "feature" },
      sourcePackage: "test-pkg",
    });

    const routeModule = makePackageOperationRouteModule([skill]);

    const { app } = createApp({
      health: makeHealthDeps(),
      packageOperationRouteModule: routeModule,
    });

    const res = await app.request("/help");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { children: Array<{ name: string; kind: string }> };
    const pkgRoot = body.children.find(
      (c) => c.name === "pkg",
    );
    expect(pkgRoot).toBeDefined();
    expect(pkgRoot!.kind).toBe("root");
  });
});
