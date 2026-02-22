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
 * All functions accept a guildHallHome override for testing (DI pattern).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getGuildHallHome } from "@/lib/paths";

// -- Types --

export type ToolUseEntry = {
  toolName: string;
  result: string;
};

export type TranscriptMessage = {
  role: "user" | "assistant";
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
      section += `\n> Tool: ${tool.toolName}\n> ${tool.result}\n`;
    }
  }

  await fs.appendFile(filePath, section, "utf-8");
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
  const headingPattern = /^## (User|Assistant) \(([^)]+)\)\s*$/gm;
  const headings: Array<{
    role: "user" | "assistant";
    timestamp: string;
    index: number;
    length: number;
  }> = [];

  let match: RegExpExecArray | null;
  while ((match = headingPattern.exec(raw)) !== null) {
    headings.push({
      role: match[1].toLowerCase() as "user" | "assistant",
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

    if (heading.role === "assistant") {
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

// -- Utility --

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
