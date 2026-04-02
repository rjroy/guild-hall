import { describe, expect, it } from "bun:test";
import { groupProjects } from "@/web/components/dashboard/groupProjects";
import type { ProjectConfig } from "@/lib/types";

function makeProject(name: string, opts: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    name,
    path: `/projects/${name}`,
    ...opts,
  };
}

describe("groupProjects", () => {
  it("returns empty array for empty input", () => {
    expect(groupProjects([])).toEqual([]);
  });

  it("groups all ungrouped projects into a single 'ungrouped' group", () => {
    const projects = [makeProject("alpha"), makeProject("beta")];
    const groups = groupProjects(projects);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("ungrouped");
    expect(groups[0].projects.map((p) => p.name)).toEqual(["alpha", "beta"]);
  });

  it("projects without group field default to 'ungrouped'", () => {
    const projects = [makeProject("zed"), makeProject("alpha")];
    const groups = groupProjects(projects);
    expect(groups[0].name).toBe("ungrouped");
    expect(groups[0].projects.map((p) => p.name)).toEqual(["alpha", "zed"]);
  });

  it("sorts multiple groups A-Z with 'ungrouped' last", () => {
    const projects = [
      makeProject("p1", { group: "Backend" }),
      makeProject("p2", { group: "ungrouped" }),
      makeProject("p3", { group: "Frontend" }),
      makeProject("p4", { group: "Alpha" }),
    ];
    const groups = groupProjects(projects);
    expect(groups.map((g) => g.name)).toEqual(["Alpha", "Backend", "Frontend", "ungrouped"]);
  });

  it("'Ungrouped' (capitalized) also sorts last", () => {
    const projects = [
      makeProject("p1", { group: "Backend" }),
      makeProject("p2", { group: "Ungrouped" }),
      makeProject("p3", { group: "Alpha" }),
    ];
    const groups = groupProjects(projects);
    const names = groups.map((g) => g.name);
    expect(names[names.length - 1]).toBe("Ungrouped");
    expect(names.slice(0, -1)).toEqual(["Alpha", "Backend"]);
  });

  it("sorts projects within each group by display title (title ?? name) A-Z", () => {
    const projects = [
      makeProject("p-z", { group: "g1", title: "Zeta" }),
      makeProject("p-a", { group: "g1", title: "Alpha" }),
      makeProject("p-m", { group: "g1", title: "Mango" }),
    ];
    const groups = groupProjects(projects);
    expect(groups[0].projects.map((p) => p.title)).toEqual(["Alpha", "Mango", "Zeta"]);
  });

  it("uses name as fallback when title is absent", () => {
    const projects = [
      makeProject("zebra", { group: "g1" }),
      makeProject("apple", { group: "g1" }),
      makeProject("mango", { group: "g1" }),
    ];
    const groups = groupProjects(projects);
    expect(groups[0].projects.map((p) => p.name)).toEqual(["apple", "mango", "zebra"]);
  });

  it("reversed flag inverts within-group order but not group order", () => {
    const projects = [
      makeProject("p1", { group: "Alpha", title: "Aardvark" }),
      makeProject("p2", { group: "Alpha", title: "Zebra" }),
      makeProject("p3", { group: "Beta", title: "Mango" }),
      makeProject("p4", { group: "Beta", title: "Apple" }),
      makeProject("p5", { group: "ungrouped", title: "Mid" }),
    ];
    const groups = groupProjects(projects, true);
    expect(groups.map((g) => g.name)).toEqual(["Alpha", "Beta", "ungrouped"]);
    expect(groups[0].projects.map((p) => p.title)).toEqual(["Zebra", "Aardvark"]);
    expect(groups[1].projects.map((p) => p.title)).toEqual(["Mango", "Apple"]);
  });

  it("handles mixed projects with and without group field", () => {
    const projects = [
      makeProject("has-group", { group: "Backend" }),
      makeProject("no-group"),
    ];
    const groups = groupProjects(projects);
    expect(groups).toHaveLength(2);
    expect(groups[0].name).toBe("Backend");
    expect(groups[1].name).toBe("ungrouped");
  });

  it("is case-insensitive for sorting within groups", () => {
    const projects = [
      makeProject("p1", { group: "g1", title: "banana" }),
      makeProject("p2", { group: "g1", title: "Apple" }),
      makeProject("p3", { group: "g1", title: "Cherry" }),
    ];
    const groups = groupProjects(projects);
    expect(groups[0].projects.map((p) => p.title)).toEqual(["Apple", "banana", "Cherry"]);
  });
});
