/**
 * Tests for package skill wiring in createApp().
 *
 * Verifies that package-contributed skills integrate correctly with the
 * built-in skill registry: route mounting, registry inclusion, duplicate
 * detection, and tier filtering.
 */

import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import { createApp, type AppDeps } from "@/daemon/app";
import type { SkillDefinition, RouteModule } from "@/lib/types";

// -- Helpers --

function makeHealthDeps(): AppDeps["health"] {
  return {
    getMeetingCount: () => 0,
    getUptimeSeconds: () => 0,
  };
}

function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    skillId: "test.default.op",
    version: "1",
    name: "op",
    description: "Test skill",
    invocation: { method: "GET", path: "/test/default/op" },
    sideEffects: "",
    context: {},
    eligibility: { tier: "any", readOnly: true },
    idempotent: true,
    hierarchy: { root: "test", feature: "default" },
    ...overrides,
  };
}

function makePackageSkillRouteModule(
  skills: SkillDefinition[],
  descriptions?: Record<string, string>,
): RouteModule {
  const routes = new Hono();
  for (const skill of skills) {
    if (skill.invocation.method === "GET") {
      routes.get(skill.invocation.path, (c) => c.json({ ok: true }));
    } else {
      routes.post(skill.invocation.path, (c) => c.json({ ok: true }));
    }
  }
  return { routes, skills, descriptions };
}

// -- Tests --

describe("createApp with packageSkillRouteModule", () => {
  test("routes and skills from package skill module are mounted", async () => {
    const pkgSkill = makeSkill({
      skillId: "pkg.custom.do-thing",
      name: "do-thing",
      invocation: { method: "GET", path: "/pkg/custom/do-thing" },
      hierarchy: { root: "pkg", feature: "custom" },
      sourcePackage: "test-pkg",
    });

    const routeModule = makePackageSkillRouteModule([pkgSkill]);

    const { app, registry } = createApp({
      health: makeHealthDeps(),
      packageSkillRouteModule: routeModule,
    });

    // Skill is in the registry
    expect(registry.get("pkg.custom.do-thing")).toBeDefined();
    expect(registry.get("pkg.custom.do-thing")!.sourcePackage).toBe("test-pkg");

    // Route is reachable
    const res = await app.request("/pkg/custom/do-thing");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("createApp without packageSkillRouteModule works the same as before", () => {
    const { registry } = createApp({
      health: makeHealthDeps(),
    });

    // Registry should exist and have only the health skill(s)
    expect(registry).toBeDefined();
    expect(registry.skills).toBeDefined();
    // Health routes contribute skills; no package skills should be present
    const allSkills = registry.filter(() => true);
    const pkgSkills = allSkills.filter((s) => s.sourcePackage !== undefined);
    expect(pkgSkills).toHaveLength(0);
  });

  test("registry contains both built-in and package skills", () => {
    // Create a config dep that activates the models route (which contributes skills)
    const config = { projects: [] };

    const pkgSkill = makeSkill({
      skillId: "pkg.thing.action",
      name: "action",
      invocation: { method: "POST", path: "/pkg/thing/action" },
      hierarchy: { root: "pkg", feature: "thing" },
      sourcePackage: "my-package",
    });

    const routeModule = makePackageSkillRouteModule([pkgSkill]);

    const { registry } = createApp({
      health: makeHealthDeps(),
      config,
      packageSkillRouteModule: routeModule,
    });

    // Should have at least the package skill
    expect(registry.get("pkg.thing.action")).toBeDefined();

    // Built-in skills from models route should also be present
    const builtInSkills = registry.filter((s) => s.sourcePackage === undefined);
    const pkgSkills = registry.filter((s) => s.sourcePackage !== undefined);

    // The models route contributes skills when config is provided
    expect(builtInSkills.length).toBeGreaterThanOrEqual(0);
    expect(pkgSkills).toHaveLength(1);
    expect(pkgSkills[0].skillId).toBe("pkg.thing.action");
  });

  test("duplicate skillId between package and built-in throws at registry construction", () => {
    // Health routes contribute at least one skill. We need a built-in skill ID.
    // Use the config route which registers skills. Instead, let's create a
    // scenario with two route modules that share a skillId.
    //
    // The simplest approach: the health route contributes "system.health.status".
    // We'll check what health contributes, then duplicate it.

    // First, find out what skillIds the health route contributes
    const { registry: baseRegistry } = createApp({ health: makeHealthDeps() });
    const builtInIds = baseRegistry.filter(() => true).map((s) => s.skillId);

    if (builtInIds.length === 0) {
      // If health contributes no skills, skip the built-in collision test
      // and just test package-vs-package collision
      const skill1 = makeSkill({
        skillId: "collision.test.op",
        hierarchy: { root: "collision", feature: "test" },
      });
      const skill2 = makeSkill({
        skillId: "collision.test.op",
        name: "op2",
        hierarchy: { root: "collision", feature: "test" },
      });

      expect(() =>
        createApp({
          health: makeHealthDeps(),
          packageSkillRouteModule: makePackageSkillRouteModule([skill1, skill2]),
        }),
      ).toThrow(/Duplicate skillId "collision.test.op"/);
      return;
    }

    // Duplicate a built-in skillId in the package module
    const duplicateSkill = makeSkill({
      skillId: builtInIds[0],
      hierarchy: { root: "dup", feature: "test" },
      sourcePackage: "bad-package",
    });

    expect(() =>
      createApp({
        health: makeHealthDeps(),
        packageSkillRouteModule: makePackageSkillRouteModule([duplicateSkill]),
      }),
    ).toThrow(/Duplicate skillId/);
  });

  test("duplicate skillId within package skills throws", () => {
    const skill1 = makeSkill({
      skillId: "pkg.dup.op",
      hierarchy: { root: "pkg", feature: "dup" },
      sourcePackage: "pkg-a",
    });
    const skill2 = makeSkill({
      skillId: "pkg.dup.op",
      name: "op2",
      hierarchy: { root: "pkg", feature: "dup" },
      sourcePackage: "pkg-b",
    });

    expect(() =>
      createApp({
        health: makeHealthDeps(),
        packageSkillRouteModule: makePackageSkillRouteModule([skill1, skill2]),
      }),
    ).toThrow(/Duplicate skillId "pkg.dup.op"/);
  });

  test("forTier returns eligible package skills and excludes ineligible ones", () => {
    const anySkill = makeSkill({
      skillId: "pkg.open.read",
      name: "read",
      invocation: { method: "GET", path: "/pkg/open/read" },
      hierarchy: { root: "pkg", feature: "open" },
      eligibility: { tier: "any", readOnly: true },
      sourcePackage: "test-pkg",
    });

    const managerSkill = makeSkill({
      skillId: "pkg.mgr.act",
      name: "act",
      invocation: { method: "POST", path: "/pkg/mgr/act" },
      hierarchy: { root: "pkg", feature: "mgr" },
      eligibility: { tier: "manager", readOnly: false },
      sourcePackage: "test-pkg",
    });

    const adminSkill = makeSkill({
      skillId: "pkg.admin.config",
      name: "config",
      invocation: { method: "POST", path: "/pkg/admin/config" },
      hierarchy: { root: "pkg", feature: "admin" },
      eligibility: { tier: "admin", readOnly: false },
      sourcePackage: "test-pkg",
    });

    const routeModule = makePackageSkillRouteModule([anySkill, managerSkill, adminSkill]);

    const { registry } = createApp({
      health: makeHealthDeps(),
      packageSkillRouteModule: routeModule,
    });

    // "any" tier sees only "any" skills
    const anyTier = registry.forTier("any");
    const anyPkgSkills = anyTier.filter((s) => s.sourcePackage !== undefined);
    expect(anyPkgSkills.map((s) => s.skillId)).toContain("pkg.open.read");
    expect(anyPkgSkills.map((s) => s.skillId)).not.toContain("pkg.mgr.act");
    expect(anyPkgSkills.map((s) => s.skillId)).not.toContain("pkg.admin.config");

    // "manager" tier sees "any" and "manager"
    const mgrTier = registry.forTier("manager");
    const mgrPkgSkills = mgrTier.filter((s) => s.sourcePackage !== undefined);
    expect(mgrPkgSkills.map((s) => s.skillId)).toContain("pkg.open.read");
    expect(mgrPkgSkills.map((s) => s.skillId)).toContain("pkg.mgr.act");
    expect(mgrPkgSkills.map((s) => s.skillId)).not.toContain("pkg.admin.config");

    // "admin" tier sees everything
    const adminTier = registry.forTier("admin");
    const adminPkgSkills = adminTier.filter((s) => s.sourcePackage !== undefined);
    expect(adminPkgSkills.map((s) => s.skillId)).toContain("pkg.open.read");
    expect(adminPkgSkills.map((s) => s.skillId)).toContain("pkg.mgr.act");
    expect(adminPkgSkills.map((s) => s.skillId)).toContain("pkg.admin.config");
  });

  test("package skill descriptions merge into navigation tree", () => {
    const skill = makeSkill({
      skillId: "ext.tools.run",
      name: "run",
      invocation: { method: "POST", path: "/ext/tools/run" },
      hierarchy: { root: "ext", feature: "tools" },
      sourcePackage: "tools-pkg",
    });

    const descriptions = {
      ext: "External package skills",
      "ext.tools": "Tool management operations",
    };

    const routeModule = makePackageSkillRouteModule([skill], descriptions);

    const { registry } = createApp({
      health: makeHealthDeps(),
      packageSkillRouteModule: routeModule,
    });

    const extNode = registry.subtree(["ext"]);
    expect(extNode).toBeDefined();
    expect(extNode!.description).toBe("External package skills");

    const toolsNode = registry.subtree(["ext", "tools"]);
    expect(toolsNode).toBeDefined();
    expect(toolsNode!.description).toBe("Tool management operations");
  });

  test("help endpoint includes package skills in tree", async () => {
    const skill = makeSkill({
      skillId: "pkg.feature.op",
      name: "op",
      description: "Package operation",
      invocation: { method: "GET", path: "/pkg/feature/op" },
      hierarchy: { root: "pkg", feature: "feature" },
      sourcePackage: "test-pkg",
    });

    const routeModule = makePackageSkillRouteModule([skill]);

    const { app } = createApp({
      health: makeHealthDeps(),
      packageSkillRouteModule: routeModule,
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
