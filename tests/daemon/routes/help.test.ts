import { describe, test, expect } from "bun:test";
import { createSkillRegistry } from "@/daemon/lib/skill-registry";
import { createHelpRoutes } from "@/daemon/routes/help";
import type { SkillDefinition } from "@/lib/types";

function makeSkill(
  overrides: Partial<SkillDefinition>,
): SkillDefinition {
  return {
    skillId: "test.skill",
    version: "1",
    name: "test",
    description: "Test skill",
    invocation: { method: "GET", path: "/test" },
    sideEffects: "",
    context: {},
    eligibility: { tier: "any", readOnly: true },
    idempotent: true,
    hierarchy: { root: "test", feature: "skills" },
    ...overrides,
  };
}

describe("Help Routes", () => {
  test("GET /help returns top-level roots", async () => {
    const skills = [
      makeSkill({
        skillId: "commission.run",
        hierarchy: { root: "commission", feature: "run" },
      }),
      makeSkill({
        skillId: "system.health",
        hierarchy: { root: "system", feature: "health" },
      }),
    ];

    const registry = createSkillRegistry(skills);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/help");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.skillId).toBe("");
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
      makeSkill({
        skillId: "commission.run",
        hierarchy: { root: "commission", feature: "run" },
      }),
    ];

    const registry = createSkillRegistry(skills);
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
      makeSkill({
        skillId: "commission.run",
        hierarchy: { root: "commission", feature: "run" },
      }),
      makeSkill({
        skillId: "commission.list",
        hierarchy: { root: "commission", feature: "list" },
      }),
    ];

    const registry = createSkillRegistry(skills);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/commission/help");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.skillId).toBe("commission");
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
      makeSkill({
        skillId: "commission.run",
        hierarchy: { root: "commission", feature: "run" },
      }),
    ];

    const registry = createSkillRegistry(skills);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/invalid/help");
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBe("Not found");
  });

  test("GET /:root/:feature/help returns objects under a feature", async () => {
    const skills = [
      makeSkill({
        skillId: "commission.run.dispatch",
        hierarchy: { root: "commission", feature: "run", object: "dispatch" },
      }),
      makeSkill({
        skillId: "commission.run.status",
        hierarchy: { root: "commission", feature: "run", object: "status" },
      }),
    ];

    const registry = createSkillRegistry(skills);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/commission/run/help");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.skillId).toBe("commission.run");
    expect(body.path).toBe("/commission/run");
    expect(body.kind).toBe("feature");
    expect(body.children).toHaveLength(2);
    expect(body.children[0].name).toBe("dispatch");
    expect(body.children[0].kind).toBe("object");
    expect(body.children[1].name).toBe("status");
  });

  test("GET /:root/:feature/help returns 404 for invalid feature", async () => {
    const skills = [
      makeSkill({
        skillId: "commission.run",
        hierarchy: { root: "commission", feature: "run" },
      }),
    ];

    const registry = createSkillRegistry(skills);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/commission/invalid/help");
    expect(res.status).toBe(404);
  });

  test("GET /:root/:feature/:object/help returns operations under an object", async () => {
    const skills = [
      makeSkill({
        skillId: "commission.run.dispatch",
        name: "dispatch",
        description: "Dispatch a commission",
        hierarchy: { root: "commission", feature: "run", object: "dispatch" },
      }),
      makeSkill({
        skillId: "commission.run.abort",
        name: "abort",
        description: "Abort a commission",
        hierarchy: { root: "commission", feature: "run", object: "dispatch" },
      }),
    ];

    const registry = createSkillRegistry(skills);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/commission/run/dispatch/help");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.skillId).toBe("commission.run.dispatch");
    expect(body.path).toBe("/commission/run/dispatch");
    expect(body.kind).toBe("object");
    expect(body.children).toHaveLength(2);
    expect(body.children[0].name).toBe("dispatch");
    expect(body.children[0].kind).toBe("operation");
    expect(body.children[1].name).toBe("abort");
  });

  test("GET /:root/:feature/:object/help returns 404 for invalid object", async () => {
    const skills = [
      makeSkill({
        skillId: "commission.run.dispatch",
        hierarchy: { root: "commission", feature: "run", object: "dispatch" },
      }),
    ];

    const registry = createSkillRegistry(skills);
    const routes = createHelpRoutes(registry);

    const res = await routes.request(
      "/commission/run/invalid/help",
    );
    expect(res.status).toBe(404);
  });

  test("GET /:root/:feature/:object/:operation/help returns full operation metadata", async () => {
    const skill = makeSkill({
      skillId: "commission.request.commission.create",
      name: "create",
      description: "Create a commission",
      invocation: { method: "POST", path: "/commission/request/commission/create" },
      hierarchy: { root: "commission", feature: "request", object: "commission" },
    });

    const registry = createSkillRegistry([skill]);
    const routes = createHelpRoutes(registry);

    const res = await routes.request(
      "/commission/request/commission/create/help",
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.skillId).toBe("commission.request.commission.create");
    expect(body.path).toBe("/commission/request/commission/create");
    expect(body.kind).toBe("operation");
    expect(body.name).toBe("create");
    expect(body.description).toBe("Create a commission");
    expect(body.method).toBe("POST");
    expect(body.visibility).toBe("available");
    expect(body.children).toBeUndefined();
  });

  test("GET /:root/:feature/:object/:operation/help includes HTTP method", async () => {
    const skill = makeSkill({
      skillId: "commission.run.dispatch",
      name: "dispatch",
      invocation: { method: "POST", path: "/commission/run/dispatch" },
      hierarchy: { root: "commission", feature: "run", object: "dispatch" },
    });

    const registry = createSkillRegistry([skill]);
    const routes = createHelpRoutes(registry);

    const res = await routes.request(
      "/commission/run/dispatch/dispatch/help",
    );
    const body = await res.json();

    expect(body.method).toBe("POST");
  });

  test("GET /:root/:feature/:object/:operation/help returns 404 for invalid operation", async () => {
    const skill = makeSkill({
      skillId: "commission.run.dispatch",
      name: "dispatch",
      hierarchy: { root: "commission", feature: "run", object: "dispatch" },
    });

    const registry = createSkillRegistry([skill]);
    const routes = createHelpRoutes(registry);

    const res = await routes.request(
      "/commission/run/dispatch/invalid/help",
    );
    expect(res.status).toBe(404);
  });

  test("handles hierarchies without objects (two-level)", async () => {
    const skill = makeSkill({
      skillId: "system.health",
      name: "health",
      description: "Get health status",
      hierarchy: { root: "system", feature: "health" },
    });

    const registry = createSkillRegistry([skill]);
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
      makeSkill({
        skillId: "commission.run.dispatch",
        hierarchy: { root: "commission", feature: "run", object: "dispatch" },
      }),
      makeSkill({
        skillId: "system.health",
        hierarchy: { root: "system", feature: "health" },
      }),
    ];

    const registry = createSkillRegistry(skills);
    const routes = createHelpRoutes(registry);

    const res1 = await routes.request("/commission/help");
    const body1 = await res1.json();
    expect(body1.children[0].kind).toBe("feature");

    const res2 = await routes.request("/system/help");
    const body2 = await res2.json();
    expect(body2.children[0].kind).toBe("feature");
  });

  test("GET /help with empty registry", async () => {
    const registry = createSkillRegistry([]);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/help");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.kind).toBe("root");
    expect(body.children).toHaveLength(0);
  });

  test("response includes visibility field", async () => {
    const skill = makeSkill({
      skillId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });

    const registry = createSkillRegistry([skill]);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/commission/help");
    const body = await res.json();

    expect(body.visibility).toBe("available");
  });

  test("response includes version", async () => {
    const skill = makeSkill({
      skillId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });

    const registry = createSkillRegistry([skill]);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/commission/help");
    const body = await res.json();

    expect(body.version).toBe("1");
  });

  test("child entries include path", async () => {
    const skills = [
      makeSkill({
        skillId: "commission.run",
        hierarchy: { root: "commission", feature: "run" },
      }),
      makeSkill({
        skillId: "commission.list",
        hierarchy: { root: "commission", feature: "list" },
      }),
    ];

    const registry = createSkillRegistry(skills);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/commission/help");
    const body = await res.json();

    expect(body.children[0].path).toBe("/commission/run");
    expect(body.children[1].path).toBe("/commission/list");
  });

  test("operation without object has skillId derived from path", async () => {
    const skill = makeSkill({
      skillId: "system.health",
      hierarchy: { root: "system", feature: "health" },
    });

    const registry = createSkillRegistry([skill]);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/system/health/help");
    const body = await res.json();

    expect(body.skillId).toBe("system.health");
  });

  test("operation with object has full skillId in response", async () => {
    const skill = makeSkill({
      skillId: "commission.request.commission.update",
      name: "update",
      hierarchy: { root: "commission", feature: "request", object: "commission" },
    });

    const registry = createSkillRegistry([skill]);
    const routes = createHelpRoutes(registry);

    const res = await routes.request(
      "/commission/request/commission/update/help",
    );
    const body = await res.json();

    expect(body.skillId).toBe("commission.request.commission.update");
  });

  test("multiple operations under same object", async () => {
    const skills = [
      makeSkill({
        skillId: "commission.run.dispatch",
        name: "dispatch",
        hierarchy: { root: "commission", feature: "run", object: "dispatch" },
      }),
      makeSkill({
        skillId: "commission.run.cancel",
        name: "cancel",
        hierarchy: { root: "commission", feature: "run", object: "dispatch" },
      }),
      makeSkill({
        skillId: "commission.run.status",
        name: "status",
        hierarchy: { root: "commission", feature: "run", object: "dispatch" },
      }),
    ];

    const registry = createSkillRegistry(skills);
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
    const skill = makeSkill({
      skillId: "commission.run.dispatch",
      name: "dispatch",
      invocation: { method: "POST", path: "/commission/run/dispatch" },
      hierarchy: { root: "commission", feature: "run" },
    });

    const registry = createSkillRegistry([skill]);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/commission/run/dispatch/help");
    const body = await res.json();

    expect(body.method).toBe("POST");
  });

  test("non-operation nodes omit method field", async () => {
    const skill = makeSkill({
      skillId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });

    const registry = createSkillRegistry([skill]);
    const routes = createHelpRoutes(registry);

    const res = await routes.request("/commission/help");
    const body = await res.json();

    expect(body.method).toBeUndefined();
  });
});
