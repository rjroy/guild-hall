/**
 * Meeting artifact reading and scanning for Next.js server components.
 *
 * Reads meeting artifacts from {projectPath}/.lore/meetings/ and parses
 * their YAML frontmatter into typed metadata. Read-only; mutations go
 * through the daemon.
 *
 * Follows the same pattern as lib/artifacts.ts: gray-matter for parsing,
 * graceful handling of missing directories and malformed frontmatter.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import matter from "gray-matter";
import { isNodeError } from "@/lib/types";
import type { Artifact } from "@/lib/types";

// -- Types --

export interface MeetingMeta {
  meetingId: string;
  title: string;
  status: string;
  worker: string;
  agenda: string;
  date: string;
  deferred_until: string;
  linked_artifacts: string[];
  /** Meeting notes, read from the markdown body (after frontmatter). */
  notes: string;
  workerDisplayTitle: string;
  projectName: string;
}

// -- Internal helpers --

/**
 * Extracts the meeting ID from a filename.
 * "audience-Assistant-20260221-120000.md" -> "audience-Assistant-20260221-120000"
 */
function meetingIdFromFilename(filename: string): string {
  return filename.replace(/\.md$/, "");
}

/**
 * Parses a gray-matter data object into MeetingMeta.
 * Missing or malformed fields fall back to empty defaults.
 * Notes are read from the markdown body (content), not frontmatter.
 */
function parseMeetingData(
  data: Record<string, unknown>,
  meetingId: string,
  projectName: string,
  body: string = "",
): MeetingMeta {
  return {
    meetingId,
    title: typeof data.title === "string" ? data.title : "",
    status: typeof data.status === "string" ? data.status : "",
    worker: typeof data.worker === "string" ? data.worker : "",
    agenda: typeof data.agenda === "string" ? data.agenda : "",
    date: data.date instanceof Date
      ? data.date.toISOString().split("T")[0]
      : typeof data.date === "string"
        ? data.date
        : "",
    deferred_until: typeof data.deferred_until === "string" ? data.deferred_until : "",
    linked_artifacts: Array.isArray(data.linked_artifacts)
      ? data.linked_artifacts.filter((a): a is string => typeof a === "string")
      : [],
    notes: body.trim(),
    workerDisplayTitle: typeof data.workerDisplayTitle === "string"
      ? data.workerDisplayTitle
      : "",
    projectName,
  };
}

// -- Public API --

/**
 * Reads a single meeting artifact's frontmatter into typed metadata.
 */
export async function readMeetingMeta(
  filePath: string,
  projectName: string,
): Promise<MeetingMeta> {
  const raw = await fs.readFile(filePath, "utf-8");
  const meetingId = meetingIdFromFilename(path.basename(filePath));

  try {
    const parsed = matter(raw);
    return parseMeetingData(
      parsed.data as Record<string, unknown>,
      meetingId,
      projectName,
      parsed.content,
    );
  } catch {
    // Malformed frontmatter: return empty defaults
    return {
      meetingId,
      title: "",
      status: "",
      worker: "",
      agenda: "",
      date: "",
      deferred_until: "",
      linked_artifacts: [],
      notes: "",
      workerDisplayTitle: "",
      projectName,
    };
  }
}

/**
 * Reads all .md files in {projectLorePath}/meetings/, parses frontmatter,
 * and returns an array of meeting metadata.
 *
 * Returns an empty array if the meetings directory doesn't exist.
 */
export async function scanMeetings(
  projectLorePath: string,
  projectName: string,
): Promise<MeetingMeta[]> {
  const meetingsDir = path.join(projectLorePath, "meetings");

  let entries: string[];
  try {
    const dirEntries = await fs.readdir(meetingsDir, { withFileTypes: true });
    entries = dirEntries
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name);
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return [];
    }
    throw err;
  }

  const meetings: MeetingMeta[] = [];

  for (const filename of entries) {
    const filePath = path.join(meetingsDir, filename);
    try {
      const meta = await readMeetingMeta(filePath, projectName);
      meetings.push(meta);
    } catch {
      // Skip files we can't read
    }
  }

  return meetings;
}

/**
 * Filters scanMeetings to status: "requested" and returns the results unsorted.
 * The caller (app/page.tsx) merges requests across all projects and applies
 * a single global sort, so sorting here would be redundant dead work.
 */
export async function scanMeetingRequests(
  projectLorePath: string,
  projectName: string,
): Promise<MeetingMeta[]> {
  const all = await scanMeetings(projectLorePath, projectName);
  return all.filter((m) => m.status === "requested");
}

/**
 * Returns worktree paths for active meetings belonging to a project.
 * Scans state files in ~/.guild-hall/state/meetings/ for open meetings
 * that have a worktreeDir. Used by the project page to find meeting
 * artifacts that haven't been squash-merged to the integration worktree yet.
 */
export async function getActiveMeetingWorktrees(
  ghHome: string,
  projectName: string,
): Promise<string[]> {
  const stateDir = path.join(ghHome, "state", "meetings");
  let files: string[];
  try {
    files = (await fs.readdir(stateDir)).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }

  const worktrees: string[] = [];
  for (const file of files) {
    try {
      const raw = await fs.readFile(path.join(stateDir, file), "utf-8");
      const state = JSON.parse(raw) as {
        projectName?: string;
        status?: string;
        worktreeDir?: string;
      };
      if (
        state.projectName === projectName &&
        state.status === "open" &&
        state.worktreeDir
      ) {
        worktrees.push(state.worktreeDir);
      }
    } catch {
      continue;
    }
  }
  return worktrees;
}

// -- Sorting --

/**
 * Sorts meeting artifacts for the project Meetings tab (Surface 4).
 * Open meetings first, then by date descending.
 * REQ-SORT-10
 */
export function sortMeetingArtifacts(meetings: Artifact[]): Artifact[] {
  return [...meetings].sort((a, b) => {
    const aOpen = a.meta.status === "open" ? 0 : 1;
    const bOpen = b.meta.status === "open" ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    return (b.meta.date || "").localeCompare(a.meta.date || "");
  });
}

/**
 * Sorts active (open-status) meetings for the dashboard ActiveMeetings panel.
 * By date descending — most recently started first.
 * REQ-SORT-12
 */
export function sortActiveMeetings(meetings: MeetingMeta[]): MeetingMeta[] {
  return [...meetings].sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Sorts meeting requests for the dashboard Pending Audiences (Surface 5).
 * Non-deferred first, deferred by deferred_until ascending, then date descending.
 * REQ-SORT-11
 */
export function sortMeetingRequests(requests: MeetingMeta[]): MeetingMeta[] {
  return [...requests].sort((a, b) => {
    const aDeferEmpty = !a.deferred_until;
    const bDeferEmpty = !b.deferred_until;

    if (aDeferEmpty && !bDeferEmpty) return -1;
    if (!aDeferEmpty && bDeferEmpty) return 1;

    if (!aDeferEmpty && !bDeferEmpty) {
      const deferCmp = a.deferred_until.localeCompare(b.deferred_until);
      if (deferCmp !== 0) return deferCmp;
    }

    return b.date.localeCompare(a.date);
  });
}

// -- Transcript parsing for meeting resume --

/**
 * A chat message suitable for the UI's ChatInterface component.
 * Mirrors the ChatMessage type from components/meeting/types.ts but defined
 * here so Next.js server components can produce messages without importing
 * client component modules.
 */
export interface TranscriptChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  toolUses?: Array<{
    name: string;
    status: "complete";
    output?: string;
  }>;
}

/**
 * Parses a markdown transcript (from daemon/services/transcript.ts format)
 * into ChatMessage-compatible objects for the UI.
 *
 * Splits on `## User (timestamp)` and `## Assistant (timestamp)` headings.
 * Tool uses within assistant turns are extracted from blockquote lines
 * matching `> Tool: <name>` followed by `> <result>` lines.
 *
 * This is a pure function (no I/O) for testability. The transcript format
 * mirrors daemon/services/transcript.ts parseTranscriptMessages, but
 * outputs the UI ChatMessage shape instead of the daemon TranscriptMessage shape.
 *
 * REQ-MTG-13
 */
export function parseTranscriptToMessages(raw: string): TranscriptChatMessage[] {
  if (!raw || !raw.trim()) return [];

  const messages: TranscriptChatMessage[] = [];

  // Split on ## headings that start a new turn.
  const headingPattern = /^## (User|Assistant|Context Compacted|Error) \(([^)]+)\)\s*$/gm;
  const headings: Array<{
    role: "user" | "assistant" | "system";
    headingType: string;
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
      index: match.index,
      length: match[0].length,
    });
  }

  let nextId = 1;

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const bodyStart = heading.index + heading.length;
    const bodyEnd = i + 1 < headings.length ? headings[i + 1].index : raw.length;
    const body = raw.slice(bodyStart, bodyEnd).trim();

    if (heading.role === "system") {
      messages.push({
        id: `transcript-${nextId++}`,
        role: "system",
        content: heading.headingType === "Error" ? `Error: ${body}` : body,
      });
    } else if (heading.role === "assistant") {
      const { text, toolUses } = parseAssistantBody(body);
      const msg: TranscriptChatMessage = {
        id: `transcript-${nextId++}`,
        role: "assistant",
        content: text,
      };
      if (toolUses.length > 0) {
        msg.toolUses = toolUses;
      }
      messages.push(msg);
    } else {
      messages.push({
        id: `transcript-${nextId++}`,
        role: "user",
        content: body,
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
  toolUses: Array<{ name: string; status: "complete"; output?: string }>;
} {
  const lines = body.split("\n");
  const textLines: string[] = [];
  const toolUses: Array<{ name: string; status: "complete"; output?: string }> = [];
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
      const output = resultLines.join("\n");
      toolUses.push({
        name: toolName,
        status: "complete",
        output: output || undefined,
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
