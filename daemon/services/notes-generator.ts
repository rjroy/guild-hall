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
import { readTranscript } from "@/daemon/services/transcript";
import { readLinkedArtifacts } from "@/daemon/services/meeting-artifact-helpers";
import type { MeetingId } from "@/daemon/types";
import type { QueryOptions } from "@/daemon/services/meeting-session";

// -- Types --

export type NotesResult =
  | { success: true; notes: string }
  | { success: false; reason: string };

export type NotesQueryFn = (params: {
  prompt: string;
  options: QueryOptions;
}) => AsyncGenerator<SDKMessage>;

export interface NotesGeneratorDeps {
  guildHallHome?: string;
  queryFn?: NotesQueryFn;
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
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[notes-generator] Failed to parse JSONL line ${index} in decisions for meeting ${meetingId}: ${reason}`);
      return `- (unparseable entry)`;
    }
  });

  return formatted.join("\n");
}

/**
 * Collects text from an SDK async generator for a single-turn, no-tool
 * invocation. Iterates all messages and extracts text content from assistant
 * messages only.
 *
 * Notes generation does not use includePartialMessages, so the SDK emits a
 * single assistant message. We extract text blocks from it. See
 * event-translator.ts lines 8-10 for why we never mix streaming deltas with
 * assistant message text blocks.
 */
async function collectNotesText(
  generator: AsyncGenerator<SDKMessage>,
): Promise<string> {
  const textParts: string[] = [];

  for await (const message of generator) {
    const msg = message as unknown as { type: string };

    if (msg.type === "assistant") {
      const assistantMsg = message as unknown as {
        type: "assistant";
        message?: { content?: unknown[] };
      };
      const content = assistantMsg.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          const typed = block as Record<string, unknown>;
          if (typed.type === "text" && typeof typed.text === "string") {
            textParts.push(typed.text);
          }
        }
      }
    }
  }

  return textParts.join("");
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
  const guildHallHome = deps.guildHallHome ?? defaultGuildHallHome();

  if (!deps.queryFn) {
    console.warn(`[notes-generator] notesQueryFn not configured for meeting ${meetingId}; notes generation skipped`);
    return { success: false, reason: "Notes generation not available." };
  }

  // 1. Read transcript
  const transcript = await readTranscript(meetingId, guildHallHome);
  const truncatedTranscript = transcript.length > MAX_TRANSCRIPT_CHARS
    ? transcript.slice(-MAX_TRANSCRIPT_CHARS)
    : transcript;

  // 2. Read decisions
  const decisions = await readDecisions(meetingId, guildHallHome);

  // 3. Read linked artifacts
  let linkedArtifacts: string[];
  try {
    const meetingIdBranded = meetingId as MeetingId;
    linkedArtifacts = await readLinkedArtifacts(projectPath, meetingIdBranded);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "ENOENT") {
      linkedArtifacts = [];
    } else {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[notes-generator] Failed to read linked artifacts for meeting ${meetingId}: ${reason}`);
      linkedArtifacts = [];
    }
  }

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

  // 5. Call queryFn
  try {
    const generator = deps.queryFn({
      prompt,
      options: {
        systemPrompt: "You are a meeting notes generator. Produce clear, concise summaries.",
        maxTurns: 1,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        settingSources: [],
        maxBudgetUsd: 0.10,
      },
    });

    const notes = await collectNotesText(generator);
    return { success: true, notes: notes || "No content generated." };
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[notes-generator] SDK invocation failed for meeting ${meetingId}: ${reason}`);
    return { success: false, reason: `Notes generation failed: ${reason}` };
  }
}

/**
 * Writes notes_summary to a meeting artifact using YAML block scalar format.
 * Replaces `notes_summary: ""` with a `|` block scalar containing the notes.
 */
export function formatNotesForYaml(notes: string): string {
  const lines = notes.split("\n");
  const indented = lines.map((line) => `  ${line}`).join("\n");
  return `notes_summary: |\n${indented}`;
}

// -- Utility --

function defaultGuildHallHome(): string {
  const home = process.env.HOME;
  if (!home) {
    throw new Error("Cannot determine home directory: HOME is not set");
  }
  return path.join(home, ".guild-hall");
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
