/**
 * Generates meeting notes from transcript, decisions, and linked artifacts.
 *
 * Called during closeMeeting to produce a summary before the transcript is
 * removed. Uses the same queryFn DI seam as meeting sessions, but with
 * simpler options (no tools, single turn, small budget).
 *
 * Returns a discriminated union so the caller can distinguish success from
 * failure without fragile string matching.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { getGuildHallHome } from "@/lib/paths";
import { readTranscript } from "@/apps/daemon/services/meeting/transcript";
import { readLinkedArtifacts } from "@/apps/daemon/services/meeting/record";
import type { MeetingId } from "@/apps/daemon/types";
import type { SdkQueryOptions } from "@/apps/daemon/lib/agent-sdk/sdk-runner";
import { isNodeError, resolveModel } from "@/lib/types";
import type { AppConfig } from "@/lib/types";
import { collectSdkText } from "@/apps/daemon/lib/sdk-text";
import { errorMessage } from "@/apps/daemon/lib/toolbox-utils";
import type { Log } from "@/apps/daemon/lib/log";
import { nullLog } from "@/apps/daemon/lib/log";

// -- Types --

export type NotesResult =
  | { success: true; notes: string }
  | { success: false; reason: string };

export type NotesQueryFn = (params: {
  prompt: string;
  options: SdkQueryOptions;
}) => AsyncGenerator<SDKMessage>;

export interface NotesGeneratorDeps {
  guildHallHome?: string;
  queryFn?: NotesQueryFn;
  config?: AppConfig;
  log?: Log;
}

// -- Constants --

/** Truncate transcripts longer than this to avoid blowing the context window. */
const MAX_TRANSCRIPT_CHARS = 50_000;

// -- Helpers --

/**
 * Reads decisions from the JSONL file written by the record_decision base tool.
 * Returns formatted text or "No decisions recorded" if the file doesn't exist.
 */
async function readDecisions(
  meetingId: string,
  guildHallHome: string,
  log: Log,
): Promise<string> {
  const decisionsPath = path.join(
    guildHallHome,
    "state",
    "meetings",
    meetingId,
    "decisions.jsonl",
  );

  let raw: string;
  try {
    raw = await fs.readFile(decisionsPath, "utf-8");
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return "No decisions recorded";
    }
    throw err;
  }

  const lines = raw.trim().split("\n").filter((line) => line.trim());
  if (lines.length === 0) {
    return "No decisions recorded";
  }

  const formatted = lines.map((line, index) => {
    try {
      const entry = JSON.parse(line) as {
        question: string;
        decision: string;
        reasoning: string;
      };
      return `- Question: ${entry.question}\n  Decision: ${entry.decision}\n  Reasoning: ${entry.reasoning}`;
    } catch (err: unknown) {
      const reason = errorMessage(err);
      log.error(`Failed to parse JSONL line ${index} in decisions for meeting ${meetingId}: ${reason}`);
      return `- (unparseable entry)`;
    }
  });

  return formatted.join("\n");
}

// -- Public API --

/**
 * Generates meeting notes by reading transcript, decisions, and linked
 * artifacts, then calling the SDK for a single-turn summary.
 *
 * Returns a discriminated union: { success: true, notes } on success, or
 * { success: false, reason } on failure (missing queryFn or SDK error).
 */
export async function generateMeetingNotes(
  meetingId: string,
  projectPath: string,
  workerName: string,
  deps: NotesGeneratorDeps,
): Promise<NotesResult> {
  const guildHallHome = deps.guildHallHome ?? getGuildHallHome();
  const log = deps.log ?? nullLog("notes-generator");

  if (!deps.queryFn) {
    log.warn(`notesQueryFn not configured for meeting ${meetingId}; notes generation skipped`);
    return { success: false, reason: "Notes generation not available." };
  }

  // Read transcript, decisions, and linked artifacts in parallel
  const [transcript, decisions, linkedArtifacts] = await Promise.all([
    readTranscript(meetingId, guildHallHome),
    readDecisions(meetingId, guildHallHome, log),
    readLinkedArtifacts(projectPath, meetingId as MeetingId).catch((err: unknown) => {
      if (isNodeError(err) && err.code === "ENOENT") return [];
      log.error(`Failed to read linked artifacts for meeting ${meetingId}: ${errorMessage(err)}`);
      return [];
    }),
  ]);

  const truncatedTranscript = transcript.length > MAX_TRANSCRIPT_CHARS
    ? transcript.slice(-MAX_TRANSCRIPT_CHARS)
    : transcript;

  const artifactsList = linkedArtifacts.length > 0
    ? linkedArtifacts.map((a) => `- ${a}`).join("\n")
    : "No artifacts linked";

  // 4. Assemble prompt
  const prompt = `You are generating meeting notes for a Guild Hall audience with ${workerName}.

## Transcript
${truncatedTranscript || "(empty transcript)"}

## Decisions Made
${decisions}

## Artifacts Linked
${artifactsList}

Generate concise meeting notes covering:
1. Summary of what was discussed (2-3 paragraphs)
2. Key decisions made and their reasoning
3. Artifacts produced or referenced
4. Any open items or follow-ups proposed

Use plain text, no markdown headers. Be factual, not conversational.`;

  // 5. Resolve configured model (falls back to "sonnet")
  const rawModelName = deps.config?.systemModels?.meetingNotes ?? "sonnet";
  let notesModel: string = rawModelName;
  let notesEnv: Record<string, string | undefined> | undefined;

  try {
    const resolved = resolveModel(rawModelName, deps.config);
    if (resolved.type === "local") {
      const { definition } = resolved;
      notesModel = definition.modelId;
      notesEnv = {
        ...process.env,
        ANTHROPIC_BASE_URL: definition.baseUrl,
        ANTHROPIC_AUTH_TOKEN: definition.auth?.token ?? "ollama",
        ANTHROPIC_API_KEY: definition.auth?.apiKey ?? "",
      };
    }
  } catch {
    return { success: false, reason: `Notes generation failed: unrecognized model "${rawModelName}"` };
  }

  // 6. Call queryFn
  try {
    const generator = deps.queryFn({
      prompt,
      options: {
        systemPrompt: "You are a meeting notes generator. Produce clear, concise summaries.",
        maxTurns: 1,
        model: notesModel,
        ...(notesEnv ? { env: notesEnv } : {}),
        permissionMode: "dontAsk",
        settingSources: ['user', 'project', 'local'],
      },
    });

    const notes = await collectSdkText(generator);
    return { success: true, notes: notes || "No content generated." };
  } catch (err: unknown) {
    const reason = errorMessage(err);
    log.error(`SDK invocation failed for meeting ${meetingId}: ${reason}`);
    return { success: false, reason: `Notes generation failed: ${reason}` };
  }
}

