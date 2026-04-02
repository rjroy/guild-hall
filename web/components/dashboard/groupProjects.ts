import type { ProjectConfig } from "@/lib/types";

export interface ProjectGroup {
  name: string;
  projects: ProjectConfig[];
}

/**
 * Groups projects by their .group field, sorts groups alphabetically
 * with "ungrouped" always last, and sorts projects within each group
 * alphabetically by display title. The `reversed` flag inverts
 * within-group order only (not group order).
 */
export function groupProjects(
  projects: ProjectConfig[],
  reversed: boolean = false,
): ProjectGroup[] {
  const map = new Map<string, ProjectConfig[]>();
  for (const p of projects) {
    const g = p.group ?? "ungrouped";
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push(p);
  }

  for (const [, ps] of map) {
    ps.sort((a, b) => {
      const ta = (a.title ?? a.name).toLowerCase();
      const tb = (b.title ?? b.name).toLowerCase();
      return reversed ? tb.localeCompare(ta) : ta.localeCompare(tb);
    });
  }

  const groupNames = [...map.keys()].sort((a, b) => {
    const aIsUng = a.toLowerCase() === "ungrouped";
    const bIsUng = b.toLowerCase() === "ungrouped";
    if (aIsUng && bIsUng) return 0;
    if (aIsUng) return 1;
    if (bIsUng) return -1;
    return a.localeCompare(b);
  });

  return groupNames.map((name) => ({ name, projects: map.get(name)! }));
}
