import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";

export interface ProjectConfig {
  name: string;
  path: string;
  description?: string;
  repoUrl?: string;
  meetingCap?: number;
  commissionCap?: number;
  defaultBranch?: string;
  memoryLimit?: number;
}

export interface ModelDefinition {
  name: string;
  modelId: string;
  baseUrl: string;
  auth?: {
    token?: string;
    apiKey?: string;
  };
  guidance?: string;
}

export interface AppConfig {
  projects: ProjectConfig[];
  models?: ModelDefinition[];
  settings?: Record<string, unknown>;
  maxConcurrentCommissions?: number;
  maxConcurrentMailReaders?: number;
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
  rawContent?: string;
  lastModified: Date;
}

export type GemStatus = "active" | "pending" | "blocked" | "info";

// -- Package metadata types (Phase 2) --

export type CheckoutScope = "sparse" | "full";

/** Single source of truth for valid model names (REQ-MODEL-4). */
export const VALID_MODELS = ["opus", "sonnet", "haiku"] as const;
export type ModelName = (typeof VALID_MODELS)[number];

export type ResolvedModel =
  | { type: "builtin"; name: ModelName }
  | { type: "local"; definition: ModelDefinition };

/**
 * Resolves a model name to either a built-in name or a local definition.
 * Throws with a descriptive error if the name is unrecognized.
 *
 * Resolution order (REQ-LOCAL-8):
 * 1. Built-in names (opus, sonnet, haiku)
 * 2. config.models definitions by name
 * 3. Unknown → throw
 */
export function resolveModel(name: string, config?: AppConfig): ResolvedModel {
  if ((VALID_MODELS as readonly string[]).includes(name)) {
    return { type: "builtin", name: name as ModelName };
  }
  const local = config?.models?.find((m) => m.name === name);
  if (local) {
    return { type: "local", definition: local };
  }
  const hint = config?.models?.length
    ? ` Configured local models: ${config.models.map((m) => m.name).join(", ")}.`
    : "";
  throw new Error(
    `Unknown model "${name}". Valid built-in models: ${VALID_MODELS.join(", ")}.${hint}`,
  );
}

/**
 * Returns true if the model name resolves to a known model (built-in or
 * configured local). When config is omitted, only built-in names pass.
 */
export function isValidModel(value: string, config?: AppConfig): boolean {
  try {
    resolveModel(value, config);
    return true;
  } catch {
    return false;
  }
}

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
  soul?: string;
  model?: string;
  systemToolboxes?: string[];
  domainToolboxes: string[];
  domainPlugins?: string[];
  builtInTools: string[];
  checkoutScope: CheckoutScope;
  resourceDefaults?: ResourceDefaults;
  /** Determines git isolation for meetings. "project" runs in the integration worktree; "activity" (default) gets its own branch/worktree. */
  meetingScope?: "project" | "activity";
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
  pluginPath?: string;
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
  identity: WorkerIdentity;
  posture: string;
  soul?: string;
  injectedMemory: string;
  model?: string;
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
  mailContext?: {
    subject: string;
    message: string;
    commissionTitle: string;
  };
  /** System state summary for the Guild Master. Populated by the daemon when activating the manager worker. */
  managerContext?: string;
  /** Local model definitions from config, for assembling model guidance (REQ-LOCAL-20). */
  localModelDefinitions?: ModelDefinition[];
  projectPath: string;
  workingDirectory: string;
}

/**
 * The result of a worker's activate() call. The daemon uses this to configure
 * the Claude Agent SDK session.
 */
export interface ActivationResult {
  systemPrompt: string;
  model?: string;
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
  "completed",
  "resolved",
  "in_progress",
  "dispatched",
  "sleeping",
]);

const PENDING_STATUSES = new Set(["draft", "open", "pending", "requested", "blocked", "queued", "paused"]);

const BLOCKED_STATUSES = new Set([
  "superseded",
  "outdated",
  "wontfix",
  "declined",
  "failed",
  "cancelled",
  "abandoned",
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

// -- Chat / SSE message types --

export interface ToolUseEntry {
  id?: string;
  name: string;
  input?: unknown;
  output?: string;
  status: "running" | "complete";
}

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolUses?: ToolUseEntry[];
};
