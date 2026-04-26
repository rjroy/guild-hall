/**
 * Transcript read/write operations for meeting sessions.
 *
 * Transcripts are markdown files at `<guildHallHome>/meetings/<meetingId>.md`.
 * They are created when a meeting starts, appended during turns, and removed
 * after meeting close (once notes have been generated).
 *
 * Format:
 * - YAML frontmatter with meeting metadata
 * - ## User (timestamp) sections for user turns
 * - ## Assistant (timestamp) sections for assistant turns
 * - Tool use blocks rendered as blockquotes within assistant sections
 *
 * Also provides transcript utilities (truncation, safe append) that operate
 * on transcript content without SDK knowledge.
 *
 * All functions accept a guildHallHome override for testing (DI pattern).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getGuildHallHome } from "@/lib/paths";
import { isNodeError } from "@/lib/types";
import { errorMessage } from "@/apps/daemon/lib/toolbox-utils";
import type { Log } from "@/apps/daemon/lib/log";
import { nullLog } from "@/apps/daemon/lib/log";

// -- Types --

export type ToolUseEntry = {
  toolName: string;
  result: string;
};

export type TranscriptMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  toolUses?: ToolUseEntry[];
  timestamp: string;
};

// -- Path traversal validation --

/**
 * Validates a meetingId to reject path traversal attempts.
 * Rejects any meetingId containing `/`, `\`, or `..`.
 */
function validateMeetingId(meetingId: string): void {
  if (
    meetingId.includes("/") ||
    meetingId.includes("\\") ||
    meetingId.includes("..")
  ) {
    throw new Error(
      `Invalid meetingId "${meetingId}": must not contain path separators or ".."`,
    );
  }
}

// -- Path resolution --

function meetingsDir(guildHallHome?: string): string {
  const home = guildHallHome ?? getGuildHallHome();
  return path.join(home, "meetings");
}

/**
 * Returns the file path for a transcript. Useful for direct reads by
 * Next.js server components.
 */
export function transcriptPath(
  meetingId: string,
  guildHallHome?: string,
): string {
  validateMeetingId(meetingId);
  return path.join(meetingsDir(guildHallHome), `${meetingId}.md`);
}

// -- Write operations --

/**
 * Creates a new transcript file with YAML frontmatter.
 * Called during meeting creation.
 */
export async function createTranscript(
  meetingId: string,
  workerName: string,
  projectName: string,
  guildHallHome?: string,
): Promise<void> {
  validateMeetingId(meetingId);
  const filePath = transcriptPath(meetingId, guildHallHome);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const now = new Date().toISOString();
  const content = `---
meetingId: ${meetingId}
worker: "${workerName.replace(/"/g, '\\"')}"
project: "${projectName.replace(/"/g, '\\"')}"
started: ${now}
---
`;
  await fs.writeFile(filePath, content, "utf-8");
}

/**
 * Appends a user turn to the transcript.
 */
export async function appendUserTurn(
  meetingId: string,
  message: string,
  guildHallHome?: string,
): Promise<void> {
  validateMeetingId(meetingId);
  const filePath = transcriptPath(meetingId, guildHallHome);
  const timestamp = new Date().toISOString();
  const section = `\n## User (${timestamp})\n\n${message}\n`;
  await fs.appendFile(filePath, section, "utf-8");
}

/**
 * Appends an assistant turn to the transcript, with optional tool use blocks
 * rendered as blockquotes.
 */
export async function appendAssistantTurn(
  meetingId: string,
  content: string,
  toolUses?: ToolUseEntry[],
  guildHallHome?: string,
): Promise<void> {
  validateMeetingId(meetingId);
  const filePath = transcriptPath(meetingId, guildHallHome);
  const timestamp = new Date().toISOString();

  let section = `\n## Assistant (${timestamp})\n\n`;

  if (content.trim()) {
    section += `${content.trim()}\n`;
  }

  if (toolUses && toolUses.length > 0) {
    for (const tool of toolUses) {
      section += `\n> Tool: ${tool.toolName}\n`;
      const resultLines = tool.result.split("\n");
      for (const line of resultLines) {
        section += `> ${line}\n`;
      }
    }
  }

  await fs.appendFile(filePath, section, "utf-8");
}

// -- Transcript utilities --

/** Default max length for transcript truncation. */
export const TRANSCRIPT_MAX_CHARS = 30000;

/**
 * Truncates a transcript to approximately maxChars, preserving complete
 * turn boundaries. Splits on `## User` or `## Assistant` headings and
 * drops leading turns until the remainder fits.
 */
export function truncateTranscript(transcript: string, maxChars = TRANSCRIPT_MAX_CHARS): string {
  if (transcript.length <= maxChars) return transcript;

  // Split on turn headings, keeping the delimiter with the following section
  const turnPattern = /^(## (?:User|Assistant|Context Compacted|Error) \([^)]+\))/m;
  const parts = transcript.split(turnPattern);

  // parts alternates: [preamble, heading1, body1, heading2, body2, ...]
  // Reassemble into turns (heading + body pairs)
  const turns: string[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    turns.push(parts[i] + (parts[i + 1] ?? ""));
  }

  // Walk backward from the end, summing turn lengths until we exceed the
  // budget. This avoids the O(N^2) of repeatedly slicing and joining.
  let totalLen = 0;
  let startIdx = turns.length;
  for (let i = turns.length - 1; i >= 0; i--) {
    if (totalLen + turns[i].length > maxChars && startIdx < turns.length) break;
    totalLen += turns[i].length;
    startIdx = i;
  }

  return turns.slice(startIdx).join("");
}

/**
 * Appends an assistant turn to the transcript, swallowing errors so
 * transcript failures don't break the meeting flow.
 */
export async function appendAssistantTurnSafe(
  meetingId: string,
  textParts: string[],
  toolUses: ToolUseEntry[],
  guildHallHome: string,
  log: Log = nullLog("transcript"),
): Promise<void> {
  const text = textParts.join("");
  if (!text && toolUses.length === 0) return;
  try {
    await appendAssistantTurn(
      meetingId,
      text,
      toolUses.length > 0 ? toolUses : undefined,
      guildHallHome,
    );
  } catch (err: unknown) {
    const reason = errorMessage(err);
    log.warn(`Transcript append failed for meeting ${meetingId} (non-fatal): ${reason}`);
  }
}

/**
 * Appends an error section to the transcript.
 * Follows the same heading convention as User/Assistant/Context Compacted.
 */
export async function appendError(
  meetingId: string,
  reason: string,
  guildHallHome?: string,
): Promise<void> {
  validateMeetingId(meetingId);
  const filePath = transcriptPath(meetingId, guildHallHome);
  const timestamp = new Date().toISOString();
  const section = `\n## Error (${timestamp})\n\n${reason}\n`;
  await fs.appendFile(filePath, section, "utf-8");
}

/**
 * Safe wrapper for appendError: swallows errors so transcript
 * failures don't break the meeting flow.
 */
export async function appendErrorSafe(
  meetingId: string,
  reason: string,
  guildHallHome: string,
  log: Log = nullLog("transcript"),
): Promise<void> {
  try {
    await appendError(meetingId, reason, guildHallHome);
  } catch (err: unknown) {
    log.warn(`Transcript error append failed for meeting ${meetingId} (non-fatal): ${errorMessage(err)}`);
  }
}

/**
 * Appends a context compaction marker to the transcript.
 */
export async function appendCompactionMarker(
  meetingId: string,
  trigger: "manual" | "auto",
  preTokens: number,
  summary: string | undefined,
  guildHallHome?: string,
): Promise<void> {
  validateMeetingId(meetingId);
  const filePath = transcriptPath(meetingId, guildHallHome);
  const timestamp = new Date().toISOString();

  let section = `\n## Context Compacted (${timestamp})\n\n`;
  section += `Context was compressed (${trigger}, ${preTokens} tokens before compaction).\n`;

  if (summary) {
    section += `\n> Summary: ${summary}\n`;
  }

  await fs.appendFile(filePath, section, "utf-8");
}

/**
 * Safe wrapper for appendCompactionMarker: swallows errors so transcript
 * failures don't break the meeting flow.
 */
export async function appendCompactionMarkerSafe(
  meetingId: string,
  trigger: "manual" | "auto",
  preTokens: number,
  summary: string | undefined,
  guildHallHome: string,
  log: Log = nullLog("transcript"),
): Promise<void> {
  try {
    await appendCompactionMarker(meetingId, trigger, preTokens, summary, guildHallHome);
  } catch (err: unknown) {
    log.warn(`Transcript compaction marker failed for meeting ${meetingId} (non-fatal): ${errorMessage(err)}`);
  }
}

/**
 * Appends a late-arriving compact summary to the transcript. Used when the
 * PostCompact hook fires after the boundary event has already been written.
 */
export async function appendCompactSummarySafe(
  meetingId: string,
  summary: string,
  guildHallHome: string,
  log: Log = nullLog("transcript"),
): Promise<void> {
  try {
    validateMeetingId(meetingId);
    const filePath = transcriptPath(meetingId, guildHallHome);
    const section = `\n> Summary: ${summary}\n`;
    await fs.appendFile(filePath, section, "utf-8");
  } catch (err: unknown) {
    log.warn(`Transcript compact summary append failed for meeting ${meetingId} (non-fatal): ${errorMessage(err)}`);
  }
}

// -- Read operations --

/**
 * Reads the full transcript content as a string.
 * Returns an empty string if the transcript does not exist.
 */
export async function readTranscript(
  meetingId: string,
  guildHallHome?: string,
): Promise<string> {
  validateMeetingId(meetingId);
  const filePath = transcriptPath(meetingId, guildHallHome);
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return "";
    }
    throw err;
  }
}

/**
 * Parses a transcript into an array of messages for UI display and session
 * renewal. Splits on `## User` and `## Assistant` headings.
 *
 * Returns an empty array if the transcript does not exist.
 */
export async function readTranscriptMessages(
  meetingId: string,
  guildHallHome?: string,
): Promise<TranscriptMessage[]> {
  const raw = await readTranscript(meetingId, guildHallHome);
  if (!raw) return [];
  return parseTranscriptMessages(raw);
}

/**
 * Pure parsing function, separated from I/O for testability.
 * Splits transcript content on `## User (timestamp)` and
 * `## Assistant (timestamp)` headings.
 */
export function parseTranscriptMessages(raw: string): TranscriptMessage[] {
  const messages: TranscriptMessage[] = [];

  // Split on ## headings that start a new turn.
  // The regex captures: role and timestamp from the heading.
  const headingPattern = /^## (User|Assistant|Context Compacted|Error) \(([^)]+)\)\s*$/gm;
  const headings: Array<{
    role: "user" | "assistant" | "system";
    headingType: string;
    timestamp: string;
    index: number;
    length: number;
  }> = [];

  let match: RegExpExecArray | null;
  while ((match = headingPattern.exec(raw)) !== null) {
    headings.push({
      role: match[1] === "Context Compacted" || match[1] === "Error"
        ? ("system" as const)
        : (match[1].toLowerCase() as "user" | "assistant"),
      headingType: match[1],
      timestamp: match[2],
      index: match.index,
      length: match[0].length,
    });
  }

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const bodyStart = heading.index + heading.length;
    const bodyEnd = i + 1 < headings.length ? headings[i + 1].index : raw.length;
    const body = raw.slice(bodyStart, bodyEnd).trim();

    if (heading.role === "system") {
      messages.push({
        role: "system",
        content: heading.headingType === "Error" ? `Error: ${body}` : body,
        timestamp: heading.timestamp,
      });
    } else if (heading.role === "assistant") {
      const { text, toolUses } = parseAssistantBody(body);
      const msg: TranscriptMessage = {
        role: "assistant",
        content: text,
        timestamp: heading.timestamp,
      };
      if (toolUses.length > 0) {
        msg.toolUses = toolUses;
      }
      messages.push(msg);
    } else {
      messages.push({
        role: "user",
        content: body,
        timestamp: heading.timestamp,
      });
    }
  }

  return messages;
}

/**
 * Parses an assistant turn body into text content and tool use entries.
 * Tool uses are blockquote lines matching `> Tool: <name>` followed by
 * `> <result>` lines.
 */
function parseAssistantBody(body: string): {
  text: string;
  toolUses: ToolUseEntry[];
} {
  const lines = body.split("\n");
  const textLines: string[] = [];
  const toolUses: ToolUseEntry[] = [];
  let i = 0;

  while (i < lines.length) {
    const toolMatch = lines[i].match(/^> Tool: (.+)$/);
    if (toolMatch) {
      const toolName = toolMatch[1];
      const resultLines: string[] = [];
      i++;
      // Collect subsequent blockquote lines as the tool result
      while (i < lines.length && lines[i].startsWith("> ")) {
        resultLines.push(lines[i].slice(2)); // Strip "> " prefix
        i++;
      }
      toolUses.push({
        toolName,
        result: resultLines.join("\n"),
      });
    } else {
      textLines.push(lines[i]);
      i++;
    }
  }

  return {
    text: textLines.join("\n").trim(),
    toolUses,
  };
}

// -- Delete operations --

/**
 * Deletes the transcript file. Called on meeting close after notes generation.
 */
export async function removeTranscript(
  meetingId: string,
  guildHallHome?: string,
): Promise<void> {
  validateMeetingId(meetingId);
  const filePath = transcriptPath(meetingId, guildHallHome);
  try {
    await fs.unlink(filePath);
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") {
      // Already gone, not an error
      return;
    }
    throw err;
  }
}
