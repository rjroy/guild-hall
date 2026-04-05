import type { Artifact } from "@/lib/types";
import { compareArtifactsByStatusAndTitle } from "@/lib/types";

export interface TagEntry {
  tag: string;
  count: number;
}

/**
 * Computes a tag index from the artifact list.
 * Only tags appearing on more than one artifact are included (REQ-TAGVIEW-4).
 * Sorted by count descending, then alphabetically ascending (REQ-TAGVIEW-5).
 */
export function computeTagIndex(artifacts: Artifact[]): TagEntry[] {
  const counts = new Map<string, number>();
  for (const artifact of artifacts) {
    for (const tag of artifact.meta.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  const entries: TagEntry[] = [];
  for (const [tag, count] of counts) {
    if (count > 1) entries.push({ tag, count });
  }
  entries.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  return entries;
}

/**
 * Filters artifacts to those carrying the given tag, sorted by status and title.
 * REQ-TAGVIEW-10, REQ-TAGVIEW-11.
 */
export function filterByTag(artifacts: Artifact[], tag: string): Artifact[] {
  const filtered = artifacts.filter((a) => a.meta.tags.includes(tag));
  filtered.sort(compareArtifactsByStatusAndTitle);
  return filtered;
}
