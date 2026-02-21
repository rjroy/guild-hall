export interface ProjectConfig {
  name: string;
  path: string;
  description?: string;
  repoUrl?: string;
  meetingCap?: number;
}

export interface AppConfig {
  projects: ProjectConfig[];
  settings?: Record<string, unknown>;
}

export interface ArtifactMeta {
  title: string;
  date: string;
  status: string;
  tags: string[];
  modules?: string[];
  related?: string[];
}

export interface Artifact {
  meta: ArtifactMeta;
  filePath: string;
  relativePath: string;
  content: string;
  lastModified: Date;
}

export type GemStatus = "active" | "pending" | "blocked" | "info";

const ACTIVE_STATUSES = new Set([
  "approved",
  "active",
  "current",
  "complete",
  "resolved",
]);

const PENDING_STATUSES = new Set(["draft", "open", "pending"]);

const BLOCKED_STATUSES = new Set(["superseded", "outdated", "wontfix"]);

/**
 * Maps a freeform status string from artifact frontmatter to one of four
 * gem display states. Unrecognized statuses default to "info" (blue).
 */
export function statusToGem(status: string): GemStatus {
  const normalized = status.toLowerCase().trim();
  if (ACTIVE_STATUSES.has(normalized)) return "active";
  if (PENDING_STATUSES.has(normalized)) return "pending";
  if (BLOCKED_STATUSES.has(normalized)) return "blocked";
  return "info";
}
