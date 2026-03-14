import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type { ZodType } from "zod";
import type { Hono } from "hono";

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

export interface SystemModels {
  memoryCompaction?: string;
  meetingNotes?: string;
  briefing?: string;
  guildMaster?: string;
}

export interface AppConfig {
  projects: ProjectConfig[];
  models?: ModelDefinition[];
  systemModels?: SystemModels;
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

/**
 * Five-group status priority for artifact browsing views.
 * Groups are ordered by actionability: work needing attention surfaces first,
 * completed work sinks below, closed/negative is near the bottom.
 *
 * This intentionally differs from gem color grouping (statusToGem). For example,
 * "implemented" maps to the green gem (active) but sorts in the Terminal group
 * (priority 2) because it's done and needs no action.
 */
export const ARTIFACT_STATUS_GROUP: Record<string, number> = {
  // Group 0: Active work (needs attention) [pending gem]
  draft: 0,
  open: 0,
  pending: 0,
  requested: 0,
  queued: 0,
  paused: 0,
  // Group 1: In progress [active gem]
  approved: 1,
  active: 1,
  current: 1,
  in_progress: 1,
  dispatched: 1,
  sleeping: 1,
  // Group 2: Closed negative [blocked gem]
  blocked: 2,
  failed: 2,
  cancelled: 2,
  // Group 3: Terminal (done, no action needed) [info gem]
  complete: 3,
  completed: 3,
  resolved: 3,
  implemented: 3,
  closed: 3,
  executed: 3,
  // Group 4: Inactive (inactive, no action needed) [inactive gem]
  wontfix: 4,
  declined: 4,
  superseded: 4,
  outdated: 4,
  abandoned: 4,
  duplicate: 4,
  invalid: 4,
  archived: 4,
};
export const UNKNOWN_STATUS_PRIORITY = 2;

export type GemStatus = "pending" | "active" | "blocked" | "info" | "inactive";

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
  canUseToolRules?: CanUseToolRule[];
  checkoutScope: CheckoutScope;
  resourceDefaults?: ResourceDefaults;
  /** Determines git isolation for meetings. "project" runs in the integration worktree; "activity" (default) gets its own branch/worktree. */
  meetingScope?: "project" | "activity";
  /** Skill eligibility constraints for CLI skill access. Determines which
   *  daemon-governed skills this worker can invoke via guild-hall commands.
   *  Omit for default: tier "any", no read-only restriction. */
  skillAccess?: {
    tiers: Array<SkillEligibility["tier"]>;
    readOnlyOnly?: boolean;
  };
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
export interface CanUseToolRule {
  /** The built-in tool this rule applies to. Must be in builtInTools. */
  tool: string;
  /** Command patterns to match (Bash tool only). Glob patterns supported. */
  commands?: string[];
  /** File path patterns to match (Read, Write, Edit, Glob, Grep). Glob patterns supported. */
  paths?: string[];
  /** Whether to allow or deny the call when this rule matches. */
  allow: boolean;
  /** Denial message shown in the session when allow is false. */
  reason?: string;
}

export interface ResolvedToolSet {
  mcpServers: McpSdkServerConfigWithInstance[];
  allowedTools: string[];
  builtInTools: string[];
  canUseToolRules: CanUseToolRule[];
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

/**
 * Maps a freeform status string from artifact frontmatter to a numeric priority for sorting.
 * Lower numbers are higher priority (surface first). Unrecognized statuses default to 2.
 */
export function statusToPriority(status: string): number {
  const normalized = status.toLowerCase().trim(); 
  return ARTIFACT_STATUS_GROUP[normalized] ?? UNKNOWN_STATUS_PRIORITY;
} 

/**
 * Maps a freeform status string from artifact frontmatter to one of four
 * gem display states. Unrecognized statuses default to "info" (blue).
 */
export function statusToGem(status: string): GemStatus {
  const normalized = status.toLowerCase().trim();
  const priority = statusToPriority(normalized);
  switch (priority) {
    case 0:
      return "pending";
    case 1:
      return "active";
    case 2:
      return "blocked";
    case 3:
      return "info";
    case 4:
      return "inactive";
    default:
      return "blocked";
  } 
}

/**
 * Formats a raw status string for display. Replaces underscores with spaces
 * and title-cases each word. "in_progress" -> "In Progress", "complete" -> "Complete".
 */
export function formatStatus(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
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

/**
 * Compare function for artifact browsing views (Surface 2: tree view).
 * Sorts by: status group (REQ-SORT-4), date descending, title/path alphabetical.
 * Missing fields sort after present ones (REQ-SORT-3).
 * Empty titles fall back to relativePath as tiebreaker (REQ-SORT-15).
 */
export function compareArtifactsByStatusAndTitle(a: Artifact, b: Artifact): number {
  // 1. Status group priority
  const priorityDiff = statusToPriority(a.meta.status) - statusToPriority(b.meta.status);
  if (priorityDiff !== 0) return priorityDiff;

  const statusDiff = a.meta.status.localeCompare(b.meta.status);
  if (statusDiff !== 0) return statusDiff;

  // 2. Date descending (newer first). Empty dates sort last.
  const aDate = a.meta.date;
  const bDate = b.meta.date;
  if (aDate && !bDate) return -1;
  if (!aDate && bDate) return 1;
  if (aDate && bDate) {
    const dateCmp = bDate.localeCompare(aDate);
    if (dateCmp !== 0) return dateCmp;
  }

  // 3. Title alphabetical tiebreaker. Empty titles fall back to relativePath.
  const aTitle = a.meta.title || a.relativePath;
  const bTitle = b.meta.title || b.relativePath;
  return aTitle.localeCompare(bTitle);
}

// -- Skill contract types (REQ-DAB-8 through REQ-DAB-10) --

/** Context fields a skill requires from the caller. */
export interface SkillContext {
  project?: boolean;
  commissionId?: boolean;
  meetingId?: boolean;
  scheduleId?: boolean;
}

/** Eligibility rules controlling who can invoke a skill. */
export interface SkillEligibility {
  /** Base tier. "any" = all clients, "manager" = Guild Master or human, "admin" = human only. */
  tier: "any" | "manager" | "admin";
  /** If true, the skill only reads state. Never creates, modifies, or deletes application state. */
  readOnly: boolean;
}

/**
 * A daemon-owned capability contract. Each SkillDefinition describes
 * one invocable operation in the public API.
 */
/** Declares a positional CLI parameter for a skill. */
export interface SkillParameter {
  /** Parameter name, used as the query/body field key. */
  name: string;
  /** Whether the parameter is required. */
  required: boolean;
  /** Where to place the parameter in the HTTP request. */
  in: "query" | "body";
}

/**
 * A daemon-owned capability contract. Each SkillDefinition describes
 * one invocable operation in the public API.
 */
export interface SkillDefinition {
  /** Stable dotted name derived from the route path. Example: "commission.run.dispatch" */
  skillId: string;
  /** Semver-ish version string. Starts at "1". Bump on breaking changes. */
  version: string;
  /** Human-readable operation name. Example: "dispatch" */
  name: string;
  /** One-sentence description of what the skill does. */
  description: string;
  /** HTTP invocation contract. */
  invocation: {
    method: "GET" | "POST";
    /** Full path. Example: "/commission/run/dispatch" */
    path: string;
  };
  /** Zod schema for request body/query validation. Optional for parameter-less GETs. */
  requestSchema?: ZodType;
  /** Zod schema for the response body. */
  responseSchema?: ZodType;
  /** Free-text summary of side effects. Empty string for read-only operations. */
  sideEffects: string;
  /** What context fields the caller must provide. */
  context: SkillContext;
  /** Who can invoke this skill. */
  eligibility: SkillEligibility;
  /** Streaming metadata. Omit for non-streaming operations. */
  streaming?: {
    /** SSE event type discriminators the client should expect. */
    eventTypes: string[];
  };
  /** Whether repeated identical calls produce the same result. */
  idempotent: boolean;
  /** Position in the API hierarchy, for navigation rendering. */
  hierarchy: {
    root: string;
    feature: string;
    object?: string;
  };
  /** Positional CLI parameters, in order. The CLI maps trailing argv words to these. */
  parameters?: SkillParameter[];
}

/**
 * Return type for route factories. Each factory returns its Hono routes
 * plus skill metadata for the registry.
 */
export interface RouteModule {
  routes: Hono;
  skills: SkillDefinition[];
  /** Descriptions for non-leaf navigation nodes (root, feature, object).
   *  Keyed by dotted path (e.g., "commission" for root, "commission.run" for feature). */
  descriptions?: Record<string, string>;
}

// Re-export domain types so server components can import from lib/types.ts
// instead of lib/commissions.ts or lib/meetings.ts (DAB migration: server
// components must not import from lib files that perform filesystem reads).
export type { CommissionMeta, TimelineEntry } from "./commissions";
export type { MeetingMeta, TranscriptChatMessage } from "./meetings";
export type { DependencyGraph } from "./dependency-graph";
