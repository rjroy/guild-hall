import type { Artifact } from "@/lib/types";

/**
 * Extracts the first directory segment from a relative path.
 * "specs/foo.md" -> "specs", "notes.md" -> "root"
 */
export function groupKey(relativePath: string): string {
  const slashIndex = relativePath.indexOf("/");
  if (slashIndex === -1) return "root";
  return relativePath.slice(0, slashIndex);
}

/**
 * Capitalizes the first letter of a string.
 */
export function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Returns a display title for an artifact.
 * Uses frontmatter title if available, otherwise derives from filename.
 */
export function displayTitle(artifact: Artifact): string {
  if (artifact.meta.title) {
    return artifact.meta.title;
  }
  const segments = artifact.relativePath.split("/");
  const filename = segments[segments.length - 1];
  return filename.replace(/\.md$/, "");
}

export interface ArtifactGroup {
  group: string;
  items: Artifact[];
}

/**
 * Groups artifacts by their top-level directory within .lore/.
 * Returns groups sorted alphabetically by directory name, with "root"
 * (ungrouped files) at the end.
 */
export function groupArtifacts(artifacts: Artifact[]): ArtifactGroup[] {
  const groups = new Map<string, Artifact[]>();

  for (const artifact of artifacts) {
    const key = groupKey(artifact.relativePath);
    const existing = groups.get(key);
    if (existing) {
      existing.push(artifact);
    } else {
      groups.set(key, [artifact]);
    }
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => {
      // "root" sorts last
      if (a === "root") return 1;
      if (b === "root") return -1;
      return a.localeCompare(b);
    })
    .map(([group, items]) => ({ group, items }));
}
