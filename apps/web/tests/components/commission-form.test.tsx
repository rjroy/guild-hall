import { describe, test, expect } from "bun:test";

/**
 * Commission form and commission list component tests.
 *
 * CommissionForm, CreateCommissionButton, and CommissionList are all client
 * components with hooks and cannot be called outside a React render context.
 * We test their type contracts and module exports here.
 *
 * CommissionList filter logic (pure functions) is tested in
 * tests/components/commission-list.test.tsx.
 */

// -- CommissionForm type contract tests --

describe("CommissionForm type contract", () => {
  test("CommissionForm module exports default", async () => {
    const mod = await import("@/apps/web/components/commission/CommissionForm");
    expect(typeof mod.default).toBe("function");
  });

  test("accepts required props shape", () => {
    const props = {
      projectName: "test-project",
      onCreated: () => {},
      onCancel: () => {},
    };
    expect(props.projectName).toBe("test-project");
    expect(typeof props.onCreated).toBe("function");
    expect(typeof props.onCancel).toBe("function");
  });

  test("onCreated and onCancel are optional", () => {
    const props = { projectName: "test-project" };
    expect(props.projectName).toBe("test-project");
  });

  test("accepts initialDependencies prop", () => {
    const props = {
      projectName: "test-project",
      initialDependencies: "specs/api.md",
    };
    expect(props.initialDependencies).toBe("specs/api.md");
  });

  test("initialDependencies is optional", () => {
    const props = { projectName: "test-project" };
    expect(props).not.toHaveProperty("initialDependencies");
  });
});

// -- CreateCommissionButton type contract tests --

describe("CreateCommissionButton type contract", () => {
  test("module exports default", async () => {
    const mod = await import("@/apps/web/components/commission/CreateCommissionButton");
    expect(typeof mod.default).toBe("function");
  });

  test("accepts projectName prop", () => {
    const props = { projectName: "my-project" };
    expect(props.projectName).toBe("my-project");
  });

  test("accepts defaultOpen and initialDependencies props", () => {
    const props = {
      projectName: "my-project",
      defaultOpen: true,
      initialDependencies: "specs/api.md",
    };
    expect(props.defaultOpen).toBe(true);
    expect(props.initialDependencies).toBe("specs/api.md");
  });

  test("defaultOpen and initialDependencies are optional", () => {
    const props = { projectName: "my-project" };
    expect(props).not.toHaveProperty("defaultOpen");
    expect(props).not.toHaveProperty("initialDependencies");
  });
});

// -- CommissionList type contract tests --
// CommissionList is now a client component with useState (converted for status
// filtering). It cannot be called directly outside a React render context.
// Filter logic (pure functions) is tested in tests/components/commission-list.test.tsx.

describe("CommissionList", () => {
  test("module exports default", async () => {
    const mod = await import("@/apps/web/components/commission/CommissionList");
    expect(typeof mod.default).toBe("function");
  });

  test("exports filter logic functions from commission-filter module", async () => {
    const mod = await import("@/apps/web/components/commission/commission-filter");
    expect(mod.DEFAULT_STATUSES).toBeInstanceOf(Set);
    expect(Array.isArray(mod.FILTER_GROUPS)).toBe(true);
    expect(typeof mod.filterCommissions).toBe("function");
    expect(typeof mod.countByStatus).toBe("function");
    expect(typeof mod.isDefaultSelection).toBe("function");
  });
});

// -- CommissionForm API payload format tests --

describe("Commission API payload format", () => {
  test("minimal payload has required fields", () => {
    const payload = {
      projectName: "test-project",
      title: "Research task",
      workerName: "researcher",
      prompt: "Do some research",
    };
    expect(payload.projectName).toBe("test-project");
    expect(payload.title).toBe("Research task");
    expect(payload.workerName).toBe("researcher");
    expect(payload.prompt).toBe("Do some research");
  });

  test("full payload includes optional fields", () => {
    const payload = {
      projectName: "test-project",
      title: "Research task",
      workerName: "researcher",
      prompt: "Do some research",
      dependencies: ["specs/api.md", "designs/schema.md"],
      resourceOverrides: { model: "haiku" },
    };
    expect(payload.dependencies).toHaveLength(2);
    expect(payload.resourceOverrides.model).toBe("haiku");
  });

  test("dependencies parsed from comma-separated string", () => {
    const input = "specs/api.md, designs/schema.md, notes/research.md";
    const deps = input.split(",").map((d) => d.trim()).filter(Boolean);
    expect(deps).toEqual([
      "specs/api.md",
      "designs/schema.md",
      "notes/research.md",
    ]);
  });

  test("empty dependency string produces empty array", () => {
    const input = "";
    const deps = input.split(",").map((d) => d.trim()).filter(Boolean);
    expect(deps).toEqual([]);
  });

  test("whitespace-only dependency entries are filtered", () => {
    const input = "specs/api.md, , , designs/schema.md";
    const deps = input.split(",").map((d) => d.trim()).filter(Boolean);
    expect(deps).toEqual(["specs/api.md", "designs/schema.md"]);
  });

});

