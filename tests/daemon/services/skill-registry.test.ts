import { describe, test, expect } from "bun:test";
import {
  createSkillRegistry,
  type SkillTreeNode,
} from "@/daemon/lib/skill-registry";
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

describe("createSkillRegistry", () => {
  test("builds registry from empty skill list", () => {
    const registry = createSkillRegistry([]);

    expect(registry.skills.size).toBe(0);
    expect(registry.tree).toEqual([]);
  });

  test("registers a single skill with two-level hierarchy", () => {
    const skill = makeSkill({
      skillId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });

    const registry = createSkillRegistry([skill]);

    expect(registry.skills.size).toBe(1);
    expect(registry.get("commission.run")).toEqual(skill);
    expect(registry.tree).toHaveLength(1);
    expect(registry.tree[0].name).toBe("commission");
    expect(registry.tree[0].kind).toBe("root");
  });

  test("registers a skill with three-level hierarchy (object)", () => {
    const skill = makeSkill({
      skillId: "commission.run.dispatch",
      name: "create",
      hierarchy: { root: "commission", feature: "run", object: "dispatch" },
    });

    const registry = createSkillRegistry([skill]);

    expect(registry.get("commission.run.dispatch")).toEqual(skill);

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
    expect(operation.skill).toEqual(skill);
  });

  test("registers multiple skills under same root", () => {
    const skill1 = makeSkill({
      skillId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });
    const skill2 = makeSkill({
      skillId: "commission.list",
      hierarchy: { root: "commission", feature: "list" },
    });

    const registry = createSkillRegistry([skill1, skill2]);

    expect(registry.skills.size).toBe(2);
    const root = registry.tree[0];
    expect(root.children).toHaveLength(2);
    expect(root.children.map((c) => c.name)).toEqual(["run", "list"]);
  });

  test("registers skills under multiple roots", () => {
    const skill1 = makeSkill({
      skillId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });
    const skill2 = makeSkill({
      skillId: "system.health",
      hierarchy: { root: "system", feature: "health" },
    });

    const registry = createSkillRegistry([skill1, skill2]);

    expect(registry.tree).toHaveLength(2);
    expect(registry.tree.map((r) => r.name)).toEqual(["commission", "system"]);
  });

  test("registers skills with nested objects", () => {
    const skill1 = makeSkill({
      skillId: "commission.run.dispatch",
      hierarchy: { root: "commission", feature: "run", object: "dispatch" },
    });
    const skill2 = makeSkill({
      skillId: "commission.run.status",
      hierarchy: { root: "commission", feature: "run", object: "status" },
    });

    const registry = createSkillRegistry([skill1, skill2]);

    const root = registry.tree[0];
    const feature = root.children[0];
    expect(feature.children).toHaveLength(2);
    expect(feature.children.map((o) => o.name)).toEqual(["dispatch", "status"]);
  });

  test("rejects duplicate skillIds", () => {
    const skill1 = makeSkill({
      skillId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });
    const skill2 = makeSkill({
      skillId: "commission.run",
      hierarchy: { root: "commission", feature: "list" },
    });

    expect(() => createSkillRegistry([skill1, skill2])).toThrow(
      /Duplicate skillId "commission.run"/,
    );
  });

  test("uses provided descriptions for non-leaf nodes", () => {
    const skill = makeSkill({
      skillId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });

    const descriptions = {
      commission: "Commission management operations",
      "commission.run": "Run a commission",
    };

    const registry = createSkillRegistry([skill], descriptions);

    expect(registry.tree[0].description).toBe(
      "Commission management operations",
    );
    expect(registry.tree[0].children[0].description).toBe("Run a commission");
  });

  test("uses fallback descriptions when not provided", () => {
    const skill = makeSkill({
      skillId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });

    const registry = createSkillRegistry([skill]);

    expect(registry.tree[0].description).toBe("Operations for commission");
    expect(registry.tree[0].children[0].description).toBe(
      "Operations for run",
    );
  });

  test("uses partial descriptions (some provided, some fallback)", () => {
    const skill = makeSkill({
      skillId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });

    const descriptions = {
      commission: "Commission management",
    };

    const registry = createSkillRegistry([skill], descriptions);

    expect(registry.tree[0].description).toBe("Commission management");
    expect(registry.tree[0].children[0].description).toBe(
      "Operations for run",
    );
  });

  test("get() returns undefined for missing skillId", () => {
    const skill = makeSkill({
      skillId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });

    const registry = createSkillRegistry([skill]);

    expect(registry.get("commission.missing")).toBeUndefined();
  });

  test("filter() returns matching skills", () => {
    const skill1 = makeSkill({
      skillId: "commission.run",
      eligibility: { tier: "any", readOnly: true },
      hierarchy: { root: "commission", feature: "run" },
    });
    const skill2 = makeSkill({
      skillId: "commission.list",
      eligibility: { tier: "manager", readOnly: true },
      hierarchy: { root: "commission", feature: "list" },
    });

    const registry = createSkillRegistry([skill1, skill2]);

    const managerSkills = registry.filter(
      (s) => s.eligibility.tier === "manager",
    );
    expect(managerSkills).toHaveLength(1);
    expect(managerSkills[0].skillId).toBe("commission.list");
  });

  test("forTier('any') returns only 'any' tier skills", () => {
    const skill1 = makeSkill({
      skillId: "commission.run",
      eligibility: { tier: "any", readOnly: true },
      hierarchy: { root: "commission", feature: "run" },
    });
    const skill2 = makeSkill({
      skillId: "commission.dispatch",
      eligibility: { tier: "manager", readOnly: false },
      hierarchy: { root: "commission", feature: "dispatch" },
    });
    const skill3 = makeSkill({
      skillId: "system.reload",
      eligibility: { tier: "admin", readOnly: false },
      hierarchy: { root: "system", feature: "reload" },
    });

    const registry = createSkillRegistry([skill1, skill2, skill3]);

    const anyTier = registry.forTier("any");
    expect(anyTier).toHaveLength(1);
    expect(anyTier[0].skillId).toBe("commission.run");
  });

  test("forTier('manager') returns 'any' and 'manager' tier skills", () => {
    const skill1 = makeSkill({
      skillId: "commission.run",
      eligibility: { tier: "any", readOnly: true },
      hierarchy: { root: "commission", feature: "run" },
    });
    const skill2 = makeSkill({
      skillId: "commission.dispatch",
      eligibility: { tier: "manager", readOnly: false },
      hierarchy: { root: "commission", feature: "dispatch" },
    });
    const skill3 = makeSkill({
      skillId: "system.reload",
      eligibility: { tier: "admin", readOnly: false },
      hierarchy: { root: "system", feature: "reload" },
    });

    const registry = createSkillRegistry([skill1, skill2, skill3]);

    const managerTier = registry.forTier("manager");
    expect(managerTier).toHaveLength(2);
    expect(managerTier.map((s) => s.skillId).sort()).toEqual([
      "commission.dispatch",
      "commission.run",
    ]);
  });

  test("forTier('admin') returns all skills", () => {
    const skill1 = makeSkill({
      skillId: "commission.run",
      eligibility: { tier: "any", readOnly: true },
      hierarchy: { root: "commission", feature: "run" },
    });
    const skill2 = makeSkill({
      skillId: "commission.dispatch",
      eligibility: { tier: "manager", readOnly: false },
      hierarchy: { root: "commission", feature: "dispatch" },
    });
    const skill3 = makeSkill({
      skillId: "system.reload",
      eligibility: { tier: "admin", readOnly: false },
      hierarchy: { root: "system", feature: "reload" },
    });

    const registry = createSkillRegistry([skill1, skill2, skill3]);

    const adminTier = registry.forTier("admin");
    expect(adminTier).toHaveLength(3);
  });

  test("subtree() returns undefined for empty segments", () => {
    const skill = makeSkill({
      skillId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });

    const registry = createSkillRegistry([skill]);

    expect(registry.subtree([])).toBeUndefined();
  });

  test("subtree() returns root node by name", () => {
    const skill = makeSkill({
      skillId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });

    const registry = createSkillRegistry([skill]);

    const root = registry.subtree(["commission"]);
    expect(root).toBeDefined();
    expect(root?.name).toBe("commission");
    expect(root?.kind).toBe("root");
  });

  test("subtree() returns feature node", () => {
    const skill = makeSkill({
      skillId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });

    const registry = createSkillRegistry([skill]);

    const feature = registry.subtree(["commission", "run"]);
    expect(feature).toBeDefined();
    expect(feature?.name).toBe("run");
    expect(feature?.kind).toBe("feature");
  });

  test("subtree() returns object node", () => {
    const skill = makeSkill({
      skillId: "commission.run.dispatch",
      hierarchy: { root: "commission", feature: "run", object: "dispatch" },
    });

    const registry = createSkillRegistry([skill]);

    const object = registry.subtree(["commission", "run", "dispatch"]);
    expect(object).toBeDefined();
    expect(object?.name).toBe("dispatch");
    expect(object?.kind).toBe("object");
  });

  test("subtree() returns operation node", () => {
    const skill = makeSkill({
      skillId: "commission.run.dispatch",
      name: "dispatch",
      hierarchy: { root: "commission", feature: "run", object: "dispatch" },
    });

    const registry = createSkillRegistry([skill]);

    const operation = registry.subtree([
      "commission",
      "run",
      "dispatch",
      "dispatch",
    ]);
    expect(operation).toBeDefined();
    expect(operation?.kind).toBe("operation");
    expect(operation?.skill).toEqual(skill);
  });

  test("subtree() returns undefined for invalid path", () => {
    const skill = makeSkill({
      skillId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });

    const registry = createSkillRegistry([skill]);

    expect(registry.subtree(["invalid"])).toBeUndefined();
    expect(registry.subtree(["commission", "invalid"])).toBeUndefined();
  });

  test("subtree() returns children list for non-operation nodes", () => {
    const skill1 = makeSkill({
      skillId: "commission.run",
      hierarchy: { root: "commission", feature: "run" },
    });
    const skill2 = makeSkill({
      skillId: "commission.list",
      hierarchy: { root: "commission", feature: "list" },
    });

    const registry = createSkillRegistry([skill1, skill2]);

    const root = registry.subtree(["commission"]);
    expect(root?.children).toHaveLength(2);
    expect(root?.children.map((c) => c.name).sort()).toEqual(["list", "run"]);
  });

  test("operation node contains skill reference", () => {
    const skill = makeSkill({
      skillId: "commission.run",
      name: "run",
      description: "Run a commission",
      invocation: { method: "POST", path: "/commission/run" },
      hierarchy: { root: "commission", feature: "run" },
    });

    const registry = createSkillRegistry([skill]);

    const feature = registry.subtree(["commission", "run"]);
    const operation = feature?.children[0];
    expect(operation?.skill).toEqual(skill);
    expect(operation?.skill?.invocation.method).toBe("POST");
  });

  test("complex multi-level hierarchy", () => {
    const skills = [
      makeSkill({
        skillId: "commission.run.dispatch",
        hierarchy: { root: "commission", feature: "run", object: "dispatch" },
      }),
      makeSkill({
        skillId: "commission.run.status",
        hierarchy: { root: "commission", feature: "run", object: "status" },
      }),
      makeSkill({
        skillId: "commission.list",
        hierarchy: { root: "commission", feature: "list" },
      }),
      makeSkill({
        skillId: "meeting.create",
        hierarchy: { root: "meeting", feature: "create" },
      }),
    ];

    const registry = createSkillRegistry(skills);

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
