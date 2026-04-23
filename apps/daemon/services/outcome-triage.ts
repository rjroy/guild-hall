/**
 * Outcome Triage: evaluates commission and meeting outcomes, writing
 * noteworthy findings to project memory via a Haiku triage session.
 *
 * Subscribes to the EventBus for `commission_result` and `meeting_ended`
 * events. Fire-and-forget: failures are logged, never block the activity.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  createSdkMcpServer,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";
import type { EventBus, SystemEvent } from "@/apps/daemon/lib/event-bus";
import type { Log } from "@/apps/daemon/lib/log";
import type { AppConfig } from "@/lib/types";
import { isNodeError } from "@/lib/types";
import { integrationWorktreePath } from "@/lib/paths";
import { makeReadMemoryHandler, makeEditMemoryHandler } from "./base-toolbox";
import matter from "gray-matter";

// -- Constants --

const TRIAGE_MODEL = "claude-haiku-4-5-20251001";
const TRIAGE_MAX_TURNS = 10;

// REQ-OTMEM-9: Exact triage prompt template
export const TRIAGE_PROMPT_TEMPLATE = `You are a memory triage filter for a software project. You receive the outcome
of a completed work item (a commission or meeting) and decide whether anything
from that outcome belongs in the project's long-term memory.

Most outcomes produce nothing worth remembering. A routine feature built to spec,
a standard review with no surprises, a meeting that confirmed existing plans: these
are normal work. The artifacts and notes already record what happened. Memory is for
the signal that future workers need and wouldn't find by reading the artifacts alone.

## What You're Looking At

Type: {input_type}
Worker: {worker_name}
Task: {task_description}
Status: {outcome_status}

### Outcome
{result_text}

### Artifacts
{artifact_list}

## What to Extract

Look for these categories. If nothing fits, do nothing.

- **Decisions**: A design choice, technology selection, or approach change was made
  with rationale that future work should know about. Not "followed the spec" but
  "deviated from the spec because X" or "chose approach A over B because Y."

- **Discoveries**: A constraint, bug, limitation, or behavior was found that wasn't
  known before and that future work needs to account for. "Bun's mock.module() causes
  infinite loops" is a discovery. "The tests pass" is not.

- **Capabilities**: Something new the system can do that changes what's possible.
  A major feature, integration, or tool. Not internal refactoring or minor fixes.

- **Failures worth noting**: The outcome describes an approach that didn't work or
  a dead end that future workers should avoid. Not transient failures (rate limits,
  timeouts), but "we tried X and it doesn't work because Y."

- **Process lessons**: How the work should be done going forward. A workflow
  insight, coordination pattern, or approach that worked (or didn't) and would
  generalize beyond this one commission.

- **Status changes**: An issue was resolved, a spec was approved, a blocker was
  cleared, or a new gap was identified. Only when the status change isn't already
  reflected in the artifact's own frontmatter.

- **User direction**: The user stated a preference, correction, or decision about
  how things should be done. Meetings are the primary source for these.

## What to Skip

- Routine completions with no surprises. "Built feature X per spec, tests pass."
- Transient failures: rate limits, network errors, timeout-and-retry.
- Process details: how many turns it took, which files were read, what tools were used.
- Information already in memory. Read it first. Do not duplicate.
- Information that lives in the artifact itself. If the commission created or updated
  a spec, the knowledge is there. Memory should not duplicate spec content.
- Restating what the worker said. Extract what was decided, discovered, or changed.

## How to Write

Use read_memory to check what's already stored, then edit_memory to write entries.
Write to the "project" scope only.

Rules for entries:
- Each entry must be a standalone fact. A reader encountering it months later,
  with no other context, should understand what it means.
- Include a date (e.g., "2026-03-20") so the reader knows when this was true.
- Use "append" to add a fact to an existing section. Use "upsert" only when
  replacing outdated information in a section.
- Section names should match existing sections in memory when the topic fits.
  Create new sections only when no existing section is appropriate.
- Keep entries concise. One to two sentences per entry. If it needs a paragraph,
  it belongs in a spec or retro, not memory.
- A meeting with five decisions produces five entries, not one combined entry.

If nothing is worth remembering, do nothing.`;

// -- Types --

export interface TriageInput {
  inputType: "commission" | "meeting";
  workerName: string;
  taskDescription: string;
  outcomeStatus: string;
  resultText: string;
  artifactList: string;
}

export interface ArtifactReadResult {
  projectName: string;
  workerName: string;
  taskDescription: string;
  artifactList: string;
  status: string;
  notesText?: string;
}

export interface OutcomeTriageDeps {
  eventBus: EventBus;
  guildHallHome: string;
  log: Log;
  readArtifact: (
    activityType: "commission" | "meeting",
    activityId: string,
  ) => Promise<ArtifactReadResult | null>;
  runTriageSession: (
    systemPrompt: string,
    userMessage: string,
    tools: Record<string, McpSdkServerConfigWithInstance>,
  ) => Promise<void>;
}

// -- Prompt assembly (REQ-OTMEM-10) --

export function assemblePrompt(input: TriageInput): string {
  return TRIAGE_PROMPT_TEMPLATE
    .replace("{input_type}", input.inputType)
    .replace("{worker_name}", input.workerName)
    .replace("{task_description}", input.taskDescription)
    .replace("{outcome_status}", input.outcomeStatus)
    .replace("{result_text}", input.resultText)
    .replace("{artifact_list}", input.artifactList);
}

// -- Memory tool construction (REQ-OTMEM-11, REQ-OTMEM-12) --

export function buildMemoryTools(
  guildHallHome: string,
  projectName: string,
): McpSdkServerConfigWithInstance {
  const readScopes = new Set<string>();
  const workerName = "outcome-triage";

  const readMemory = makeReadMemoryHandler(guildHallHome, workerName, projectName, readScopes);
  const editMemory = makeEditMemoryHandler(guildHallHome, workerName, projectName, readScopes);

  return createSdkMcpServer({
    name: "outcome-triage-memory",
    version: "0.1.0",
    tools: [
      tool(
        "read_memory",
        "Read from the shared memory system. Scope: global (shared across all workers and projects), project (shared across all workers in the active project), worker (private to you, no other worker can access). Without a section parameter, returns the full memory file. With a section parameter, returns only that section's content (case-insensitive match).",
        {
          scope: z.enum(["global", "project", "worker"]),
          section: z.string().optional(),
        },
        (args) => readMemory(args),
      ),
      tool(
        "edit_memory",
        "Edit the shared memory system. Operates on named sections within a single memory file per scope. Operations: upsert (replace or create section), append (add to section with blank line separator), delete (remove section). You must call read_memory for the scope before editing.",
        {
          scope: z.enum(["global", "project", "worker"]),
          section: z.string(),
          operation: z.enum(["upsert", "append", "delete"]),
          content: z.string().optional(),
        },
        (args) => editMemory(args),
      ),
    ],
  });
}

// -- Artifact reader (REQ-OTMEM-4, REQ-OTMEM-21) --

export function createArtifactReader(
  config: AppConfig,
  guildHallHome: string,
): (activityType: "commission" | "meeting", activityId: string) => Promise<ArtifactReadResult | null> {
  return async (activityType, activityId) => {
    const subdir = activityType === "commission" ? "commissions" : "meetings";
    const artifactFilename = `${activityId}.md`;

    // Check integration worktrees first
    for (const project of config.projects) {
      const iPath = integrationWorktreePath(guildHallHome, project.name);
      const artifactPath = path.join(iPath, ".lore", subdir, artifactFilename);
      try {
        const raw = await fs.readFile(artifactPath, "utf-8");
        return parseArtifact(raw, project.name, activityType);
      } catch (err: unknown) {
        if (isNodeError(err) && err.code === "ENOENT") continue;
        throw err;
      }
    }

    // Commission fallback: check activity worktree via state file
    if (activityType === "commission") {
      const statePath = path.join(guildHallHome, "state", "commissions", `${activityId}.json`);
      try {
        const stateRaw = await fs.readFile(statePath, "utf-8");
        const state = JSON.parse(stateRaw) as {
          projectName?: string;
          worktreeDir?: string;
        };
        if (state.worktreeDir && state.projectName) {
          const artifactPath = path.join(state.worktreeDir, ".lore", "commissions", artifactFilename);
          try {
            const raw = await fs.readFile(artifactPath, "utf-8");
            return parseArtifact(raw, state.projectName, activityType);
          } catch (innerErr: unknown) {
            if (isNodeError(innerErr) && innerErr.code === "ENOENT") return null;
            throw innerErr;
          }
        }
      } catch (err: unknown) {
        if (isNodeError(err) && err.code === "ENOENT") return null;
        throw err;
      }
    }

    return null;
  };
}

function parseArtifact(
  raw: string,
  projectName: string,
  activityType: "commission" | "meeting",
): ArtifactReadResult {
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;

  const workerName = typeof data.worker === "string" ? data.worker : "unknown";
  const status = typeof data.status === "string" ? data.status : "unknown";

  let taskDescription: string;
  if (activityType === "commission") {
    taskDescription = typeof data.task === "string" ? data.task : "No task description";
  } else {
    taskDescription = typeof data.agenda === "string" ? data.agenda : "No agenda";
  }

  const linkedArtifacts = Array.isArray(data.linked_artifacts)
    ? (data.linked_artifacts as string[]).join(", ")
    : "None";

  const result: ArtifactReadResult = {
    projectName,
    workerName,
    taskDescription,
    artifactList: linkedArtifacts,
    status,
  };

  // For meetings, include the body as notes text
  if (activityType === "meeting" && parsed.content.trim()) {
    result.notesText = parsed.content.trim();
  }

  return result;
}

// -- Triage session runner (REQ-OTMEM-14, REQ-OTMEM-15) --

type QueryFn = (params: {
  prompt: string;
  options: Record<string, unknown>;
}) => AsyncGenerator<unknown>;

export function createTriageSessionRunner(
  queryFn: QueryFn,
  log: Log,
): OutcomeTriageDeps["runTriageSession"] {
  return async (systemPrompt, userMessage, tools) => {
    const generator = queryFn({
      prompt: userMessage,
      options: {
        systemPrompt,
        mcpServers: tools,
        model: TRIAGE_MODEL,
        maxTurns: TRIAGE_MAX_TURNS,
        permissionMode: "dontAsk",
      },
    });

    let turns = 0;
    for await (const _message of generator) {
      turns++;
    }

    log.info(`triage session completed after ${turns} turn(s)`);
  };
}

// -- Factory (REQ-OTMEM-1, REQ-OTMEM-20) --

export function createOutcomeTriage(deps: OutcomeTriageDeps): () => void {
  const { eventBus, guildHallHome, log, readArtifact, runTriageSession } = deps;

  const unsubscribe = eventBus.subscribe((event: SystemEvent) => {
    if (event.type === "commission_result") {
      const { commissionId, summary, artifacts } = event;
      log.info(`triage initiated for commission ${commissionId}`);

      void (async () => {
        try {
          const artifact = await readArtifact("commission", commissionId);
          if (!artifact) {
            log.warn(`triage skipped: no artifact found for commission ${commissionId}`);
            return;
          }

          // Read decisions from state directory (still exists at this point)
          let resultText = summary;
          try {
            const { readDecisions, formatDecisionsSection } =
              await import("@/apps/daemon/services/decisions-persistence");
            const decisions = await readDecisions(guildHallHome, commissionId, "commissions");
            const decisionsText = formatDecisionsSection(decisions);
            if (decisionsText) {
              resultText = `${summary}\n\n${decisionsText}`;
            }
          } catch {
            // Best-effort: proceed without decisions
          }

          const input: TriageInput = {
            inputType: "commission",
            workerName: artifact.workerName,
            taskDescription: artifact.taskDescription,
            outcomeStatus: "completed",
            resultText,
            artifactList: artifacts ? artifacts.join(", ") : artifact.artifactList,
          };

          const systemPrompt = assemblePrompt(input);
          const memoryTools = buildMemoryTools(guildHallHome, artifact.projectName);
          await runTriageSession(systemPrompt, formatUserMessage(), {
            "outcome-triage-memory": memoryTools,
          });

          log.info(`triage completed for commission ${commissionId}`);
        } catch (err) {
          log.warn(
            `triage failed for commission ${commissionId}:`,
            err instanceof Error ? err.message : String(err),
          );
        }
      })();
    }

    if (event.type === "meeting_ended") {
      const { meetingId } = event;
      log.info(`triage initiated for meeting ${meetingId}`);

      void (async () => {
        try {
          const artifact = await readArtifact("meeting", meetingId);
          if (!artifact) {
            log.warn(`triage skipped: no artifact found for meeting ${meetingId}`);
            return;
          }

          // Skip non-closed meetings (declined, stale cleanup, etc.)
          if (artifact.status !== "closed") {
            log.debug(`triage skipped for non-closed meeting ${meetingId}, status: ${artifact.status}`);
            return;
          }

          const input: TriageInput = {
            inputType: "meeting",
            workerName: artifact.workerName,
            taskDescription: artifact.taskDescription,
            outcomeStatus: "closed",
            resultText: artifact.notesText ?? "No notes generated.",
            artifactList: artifact.artifactList,
          };

          const systemPrompt = assemblePrompt(input);
          const memoryTools = buildMemoryTools(guildHallHome, artifact.projectName);
          await runTriageSession(systemPrompt, formatUserMessage(), {
            "outcome-triage-memory": memoryTools,
          });

          log.info(`triage completed for meeting ${meetingId}`);
        } catch (err) {
          log.warn(
            `triage failed for meeting ${meetingId}:`,
            err instanceof Error ? err.message : String(err),
          );
        }
      })();
    }
  });

  return unsubscribe;
}

function formatUserMessage(): string {
  return "Triage the outcome described in your instructions. Read project memory first, then write entries if anything is worth remembering.";
}
