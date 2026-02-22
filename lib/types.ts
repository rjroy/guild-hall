import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";

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
  /** Frontmatter fields not covered by the typed properties above. */
  extras?: Record<string, unknown>;
}

export interface Artifact {
  meta: ArtifactMeta;
  filePath: string;
  relativePath: string;
  content: string;
  lastModified: Date;
}

export type GemStatus = "active" | "pending" | "blocked" | "info";

// -- Package metadata types (Phase 2) --

export type CheckoutScope = "sparse" | "full";

export interface ResourceDefaults {
  maxTurns?: number;
  maxBudgetUsd?: number;
}

export interface WorkerIdentity {
  name: string;
  description: string;
  displayTitle: string;
  portraitPath?: string;
}

/**
 * Metadata for a worker package. The type field is "worker" for pure workers,
 * or ["worker", "toolbox"] for packages that serve both roles.
 */
export interface WorkerMetadata {
  type: "worker" | ["worker", "toolbox"];
  identity: WorkerIdentity;
  posture: string;
  domainToolboxes: string[];
  builtInTools: string[];
  checkoutScope: CheckoutScope;
  resourceDefaults?: ResourceDefaults;
}

/**
 * Metadata for a toolbox package. The type field is "toolbox" for pure toolboxes,
 * or ["worker", "toolbox"] for packages that serve both roles.
 */
export interface ToolboxMetadata {
  type: "toolbox" | ["worker", "toolbox"];
  name: string;
  description: string;
}

export type PackageMetadata = WorkerMetadata | ToolboxMetadata;

/**
 * A package discovered on disk. The name comes from package.json's name field,
 * path is the absolute directory path, and metadata is the validated guildHall key.
 */
export interface DiscoveredPackage {
  name: string;
  path: string;
  metadata: PackageMetadata;
}

// -- Activation types (Phase 2, Task 003) --

/**
 * The resolved set of tools available to a worker during a meeting.
 * mcpServers contains SDK MCP server instances created via createSdkMcpServer().
 * allowedTools lists the Claude Code built-in tool names the worker may use.
 */
export interface ResolvedToolSet {
  mcpServers: McpSdkServerConfigWithInstance[];
  allowedTools: string[];
}

/**
 * Context passed to a worker's activate() function. Contains everything the
 * worker needs to assemble its system prompt and configure its tool access.
 */
export interface ActivationContext {
  posture: string;
  injectedMemory: string;
  resolvedTools: ResolvedToolSet;
  resourceDefaults: {
    maxTurns?: number;
    maxBudgetUsd?: number;
  };
  meetingContext?: {
    meetingId: string;
    agenda: string;
    referencedArtifacts: string[];
  };
  commissionContext?: {
    commissionId: string;
    prompt: string;
    dependencies: string[];
  };
  projectPath: string;
  workingDirectory: string;
}

/**
 * The result of a worker's activate() call. The daemon uses this to configure
 * the Claude Agent SDK session.
 */
export interface ActivationResult {
  systemPrompt: string;
  tools: ResolvedToolSet;
  resourceBounds: {
    maxTurns?: number;
    maxBudgetUsd?: number;
  };
}

const ACTIVE_STATUSES = new Set([
  "approved",
  "active",
  "current",
  "complete",
  "resolved",
  "in_progress",
  "dispatched",
]);

const PENDING_STATUSES = new Set(["draft", "open", "pending", "requested", "blocked"]);

const BLOCKED_STATUSES = new Set([
  "superseded",
  "outdated",
  "wontfix",
  "declined",
  "failed",
  "cancelled",
]);

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

// -- Error utilities --

/**
 * Type guard for Node.js filesystem errors (ENOENT, ECONNREFUSED, etc.).
 */
export function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
