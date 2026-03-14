/**
 * Assembles a markdown-formatted system state summary for the Guild Master's
 * system prompt. Provides the manager with awareness of available workers,
 * commission status, active meetings, and pending meeting requests so it can
 * coordinate project work effectively.
 *
 * The output is plain text (markdown-formatted), not structured data. The
 * manager's LLM reads it as part of its system prompt.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { DiscoveredPackage, WorkerMetadata } from "@/lib/types";
import type { CommissionMeta } from "@/lib/commissions";
import type { MeetingMeta } from "@/lib/meetings";
import {
  MANAGER_PACKAGE_NAME,
  MANAGER_WORKER_NAME,
} from "@/daemon/services/manager/worker";
import { isNodeError } from "@/lib/types";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import type { Log } from "@/daemon/lib/log";
import { nullLog } from "@/daemon/lib/log";
import { loadMemories } from "@/daemon/services/memory-injector";

// -- Constants --

const MAX_CONTEXT_CHARS = 8000;
const MAX_COMPLETED_COMMISSIONS = 5;

// -- Types --

export interface ManagerContextDeps {
  packages: DiscoveredPackage[];
  projectName: string;
  integrationPath: string;
  guildHallHome: string;
  /** Override the memory character limit for the manager. */
  memoryLimit?: number;
  log?: Log;
  /**
   * DI seam: scan commissions from the integration worktree's .lore/ directory.
   * Tests provide a stub; production uses the real scanCommissions().
   */
  scanCommissionsFn?: (lorePath: string, projectName: string) => Promise<CommissionMeta[]>;
  /**
   * DI seam: scan meeting requests from the integration worktree's .lore/ directory.
   * Tests provide a stub; production uses the real scanMeetingRequests().
   */
  scanMeetingRequestsFn?: (lorePath: string, projectName: string) => Promise<MeetingMeta[]>;
  /**
   * DI seam: load memories for the manager worker. Tests provide a stub;
   * production uses the real loadMemories().
   */
  loadMemoriesFn?: (
    workerName: string,
    projectName: string,
    deps: { guildHallHome: string; memoryLimit?: number },
  ) => Promise<{ memoryBlock: string; needsCompaction: boolean }>;
}

// -- Internal helpers --

function isWorkerPackage(pkg: DiscoveredPackage): boolean {
  const type = pkg.metadata.type;
  return type === "worker" || (Array.isArray(type) && type.includes("worker"));
}

/**
 * Reads meeting state files from the state directory and returns open meetings
 * for the given project. Handles missing directory and malformed files gracefully.
 */
async function readActiveMeetings(
  guildHallHome: string,
  projectName: string,
): Promise<Array<{ meetingId: string; workerName: string }>> {
  const stateDir = path.join(guildHallHome, "state", "meetings");
  let files: string[];
  try {
    files = (await fs.readdir(stateDir)).filter((f) => f.endsWith(".json"));
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") return [];
    throw err;
  }

  const meetings: Array<{ meetingId: string; workerName: string }> = [];
  for (const file of files) {
    try {
      const raw = await fs.readFile(path.join(stateDir, file), "utf-8");
      const state = JSON.parse(raw) as {
        meetingId?: string;
        projectName?: string;
        workerName?: string;
        status?: string;
      };
      if (
        state.projectName === projectName &&
        state.status === "open" &&
        state.meetingId &&
        state.workerName
      ) {
        meetings.push({
          meetingId: state.meetingId,
          workerName: state.workerName,
        });
      }
    } catch {
      // Malformed state file, skip
      continue;
    }
  }
  return meetings;
}

// -- Section builders --

function buildWorkerSection(packages: DiscoveredPackage[]): string {
  const workers = packages.filter(
    (p) => isWorkerPackage(p) && p.name !== MANAGER_PACKAGE_NAME,
  );

  if (workers.length === 0) {
    return "## Available Workers\n\nNo workers available.";
  }

  const lines = ["## Available Workers\n"];
  for (const w of workers) {
    const meta = w.metadata as WorkerMetadata;
    lines.push(`- **${meta.identity.name}** — package: \`${w.name}\``);
    lines.push(`  ${meta.identity.displayTitle}: ${meta.identity.description}`);
    if (meta.checkoutScope) {
      lines.push(`  Checkout: ${meta.checkoutScope}`);
    }
    if (meta.domainToolboxes.length > 0) {
      lines.push(`  Domain toolboxes: ${meta.domainToolboxes.join(", ")}`);
    }
    if (meta.builtInTools.length > 0) {
      lines.push(`  Built-in tools: ${meta.builtInTools.join(", ")}`);
    }
  }
  return lines.join("\n");
}

function buildCommissionSection(commissions: CommissionMeta[]): string {
  if (commissions.length === 0) {
    return "## Commission Status\n\nNo commissions.";
  }

  const active = commissions.filter(
    (c) => c.status === "dispatched" || c.status === "in_progress",
  );
  const pending = commissions.filter(
    (c) => c.status === "pending" || c.status === "blocked",
  );
  const completed = commissions
    .filter((c) => c.status === "completed")
    .slice(0, MAX_COMPLETED_COMMISSIONS);
  const failed = commissions.filter(
    (c) => c.status === "failed" || c.status === "cancelled",
  );

  const lines = ["## Commission Status\n"];

  if (active.length > 0) {
    lines.push("### Active");
    for (const c of active) {
      lines.push(`- **${c.title || c.commissionId}** (${c.status}, worker: ${c.worker})`);
      if (c.current_progress) {
        lines.push(`  Progress: ${c.current_progress}`);
      }
    }
    lines.push("");
  }

  if (pending.length > 0) {
    lines.push("### Pending");
    for (const c of pending) {
      lines.push(`- **${c.title || c.commissionId}** (${c.status})`);
      if (c.dependencies.length > 0) {
        lines.push(`  Dependencies: ${c.dependencies.join(", ")}`);
      }
    }
    lines.push("");
  }

  if (completed.length > 0) {
    lines.push("### Recently Completed");
    for (const c of completed) {
      lines.push(`- **${c.title || c.commissionId}**`);
      if (c.result_summary) {
        lines.push(`  Result: ${c.result_summary}`);
      }
    }
    lines.push("");
  }

  if (failed.length > 0) {
    lines.push("### Failed");
    for (const c of failed) {
      lines.push(`- **${c.title || c.commissionId}** (${c.status})`);
      if (c.result_summary) {
        lines.push(`  Reason: ${c.result_summary}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function buildActiveMeetingsSection(
  meetings: Array<{ meetingId: string; workerName: string }>,
): string {
  if (meetings.length === 0) {
    return "## Active Meetings\n\nNo active meetings.";
  }

  const lines = ["## Active Meetings\n"];
  for (const m of meetings) {
    lines.push(`- **${m.meetingId}** (worker: ${m.workerName})`);
  }
  return lines.join("\n");
}

function buildMeetingRequestsSection(requests: MeetingMeta[]): string {
  if (requests.length === 0) {
    return "## Pending Meeting Requests\n\nNo pending requests.";
  }

  const lines = ["## Pending Meeting Requests\n"];
  for (const r of requests) {
    lines.push(`- **${r.title || r.meetingId}** (worker: ${r.worker})`);
    if (r.agenda) {
      lines.push(`  Reason: ${r.agenda}`);
    }
    if (r.linked_artifacts.length > 0) {
      lines.push(`  Artifacts: ${r.linked_artifacts.join(", ")}`);
    }
  }
  return lines.join("\n");
}

/**
 * Truncates the assembled context to MAX_CONTEXT_CHARS. Sections are ordered
 * by priority (highest to lowest): workers, commissions, active meetings, meeting requests.
 * When the total exceeds the limit, entire sections are dropped from the end
 * (lowest priority first): meeting requests → active meetings → commissions → workers.
 *
 * Commissions are a single section (all statuses together), not split for
 * independent truncation.
 */
function truncateContext(sections: string[]): string {
  let result = sections.join("\n\n");
  if (result.length <= MAX_CONTEXT_CHARS) return result;

  // Strategy: drop sections from the end (lowest priority) until we fit.
  // Section order: [workers, commissions, active meetings, meeting requests]
  // Remove from the end first.
  const trimmed = [...sections];
  while (trimmed.length > 1) {
    const candidate = trimmed.slice(0, -1).join("\n\n");
    if (candidate.length <= MAX_CONTEXT_CHARS) {
      return candidate;
    }
    trimmed.pop();
  }

  // Even a single section exceeds the limit; hard-truncate
  result = trimmed[0];
  if (result.length > MAX_CONTEXT_CHARS) {
    return result.slice(0, MAX_CONTEXT_CHARS - 3) + "...";
  }
  return result;
}

// -- Public API --

/**
 * Assembles a markdown-formatted context string containing:
 * 1. Available Workers (excluding the manager itself)
 * 2. Commission Status (grouped by active, pending, completed, failed)
 * 3. Active Meetings (open meetings with worker names)
 * 4. Pending Meeting Requests (requested meetings with reason and artifacts)
 *
 * If the assembled string exceeds 8000 chars, entire sections are dropped from
 * the end (lowest priority first): meeting requests → active meetings → commissions.
 * Commissions are dropped as a single section (all statuses together).
 *
 * Handles missing directories gracefully: an empty project produces minimal
 * but valid context.
 */
export async function buildManagerContext(
  deps: ManagerContextDeps,
): Promise<string> {
  const log = deps.log ?? nullLog("manager-context");
  const lorePath = path.join(deps.integrationPath, ".lore");

  // Load commissions (DI seam for testing)
  let commissions: CommissionMeta[] = [];
  if (deps.scanCommissionsFn) {
    commissions = await deps.scanCommissionsFn(lorePath, deps.projectName);
  } else {
    // Dynamic import to avoid circular dependency at module load time.
    // The lib/commissions module is a Next.js library that doesn't import
    // from daemon/, so no cycle exists, but keeping the import lazy means
    // tests can inject stubs without needing the full module loaded.
    const { scanCommissions } = await import("@/lib/commissions");
    commissions = await scanCommissions(lorePath, deps.projectName);
  }

  // Load meeting requests (DI seam for testing)
  let meetingRequests: MeetingMeta[] = [];
  if (deps.scanMeetingRequestsFn) {
    meetingRequests = await deps.scanMeetingRequestsFn(lorePath, deps.projectName);
  } else {
    const { scanMeetingRequests } = await import("@/lib/meetings");
    meetingRequests = await scanMeetingRequests(lorePath, deps.projectName);
  }

  // Load active meetings from state files
  const activeMeetings = await readActiveMeetings(
    deps.guildHallHome,
    deps.projectName,
  );

  // Load manager's memories (non-fatal if memory dirs don't exist)
  let memorySection = "";
  try {
    const loadFn = deps.loadMemoriesFn ?? loadMemories;
    const memoryResult = await loadFn(
      MANAGER_WORKER_NAME,
      deps.projectName,
      {
        guildHallHome: deps.guildHallHome,
        memoryLimit: deps.memoryLimit,
      },
    );
    memorySection = memoryResult.memoryBlock;
    if (memoryResult.needsCompaction) {
      log.info(`Manager memory exceeds limit, needs compaction`);
    }
  } catch (err: unknown) {
    log.warn(
      `Failed to load manager memories (non-fatal):`,
      errorMessage(err),
    );
  }

  // Build sections in priority order
  const workerSection = buildWorkerSection(deps.packages);
  const commissionSection = buildCommissionSection(commissions);
  const activeMeetingsSection = buildActiveMeetingsSection(activeMeetings);
  const meetingRequestsSection = buildMeetingRequestsSection(meetingRequests);

  // Assemble with truncation
  // Priority: workers > memories > commissions > active meetings > requests
  const sections = [
    workerSection,
    ...(memorySection ? [memorySection] : []),
    commissionSection,
    activeMeetingsSection,
    meetingRequestsSection,
  ];
  return truncateContext(sections);
}
