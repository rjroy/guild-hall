/**
 * Meeting toolbox: context-specific tools available during an active meeting.
 *
 * Provides three tools that operate on the current meeting's artifact:
 * - link_artifact: associate an existing artifact with this meeting
 * - propose_followup: create a follow-up meeting request for the same worker
 * - summarize_progress: snapshot current progress into the meeting log
 *
 * Follows the same MCP server factory pattern as base-toolbox.ts.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  createSdkMcpServer,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";
import { asMeetingId } from "@/daemon/types";
import {
  meetingArtifactPath,
  appendMeetingLog,
  addLinkedArtifact,
} from "@/daemon/services/meeting-artifact-helpers";

// -- Types --

/**
 * Matches the CallToolResult type from @modelcontextprotocol/sdk/types.js.
 * Defined locally because the MCP SDK is not a direct dependency.
 */
type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export interface MeetingToolboxDeps {
  projectPath: string;
  meetingId: string;
  workerName: string;
  guildHallHome?: string;
}

// -- Path safety --

/**
 * Validates that a user-provided path stays within a base directory.
 * Throws on path traversal attempts.
 */
function validateContainedPath(basePath: string, userPath: string): string {
  const resolvedBase = path.resolve(basePath);
  const resolved = path.resolve(basePath, userPath);
  if (
    !resolved.startsWith(resolvedBase + path.sep) &&
    resolved !== resolvedBase
  ) {
    throw new Error(`Path traversal detected: ${userPath} escapes ${basePath}`);
  }
  return resolved;
}

// -- Timestamp formatting --

/**
 * Formats a Date as YYYYMMDD-HHMMSS, matching the format used by
 * formatMeetingId in meeting-session.ts.
 */
function formatTimestamp(now: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

// -- Tool handler factories --

export function makeLinkArtifactHandler(
  projectPath: string,
  meetingId: string,
) {
  const mid = asMeetingId(meetingId);
  const lorePath = path.join(projectPath, ".lore");

  return async (args: { artifactPath: string }): Promise<ToolResult> => {
    // Validate path doesn't escape .lore/
    try {
      validateContainedPath(lorePath, args.artifactPath);
    } catch {
      return {
        content: [
          {
            type: "text",
            text: `Path traversal rejected: ${args.artifactPath}`,
          },
        ],
        isError: true,
      };
    }

    // Validate the artifact exists
    const fullPath = path.join(lorePath, args.artifactPath);
    try {
      await fs.access(fullPath);
    } catch {
      return {
        content: [
          {
            type: "text",
            text: `Artifact not found: ${args.artifactPath}`,
          },
        ],
        isError: true,
      };
    }

    // Add to linked_artifacts
    const added = await addLinkedArtifact(projectPath, mid, args.artifactPath);
    if (!added) {
      return {
        content: [
          {
            type: "text",
            text: `Already linked: ${args.artifactPath}`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Linked artifact: ${args.artifactPath}`,
        },
      ],
    };
  };
}

export function makeProposeFollowupHandler(
  projectPath: string,
  meetingId: string,
  workerName: string,
) {
  return async (args: {
    reason: string;
    referencedArtifacts?: string[];
  }): Promise<ToolResult> => {
    const now = new Date();
    const ts = formatTimestamp(now);
    const followupId = `followup-${workerName}-${ts}`;
    const followupMeetingId = asMeetingId(followupId);

    const dateStr = now.toISOString().split("T")[0];
    const isoStr = now.toISOString();

    const linkedArtifacts = args.referencedArtifacts ?? [];
    const linkedYaml =
      linkedArtifacts.length === 0
        ? "linked_artifacts: []"
        : "linked_artifacts:\n" +
          linkedArtifacts.map((a) => `  - ${a}`).join("\n");

    const reasonForLog = `Worker proposed follow-up from meeting ${meetingId}`;

    // Use the same template literal format as writeMeetingArtifact in
    // meeting-session.ts, with status: requested.
    const content = `---
title: "Follow-up with ${workerName}"
date: ${dateStr}
status: requested
tags: [meeting]
worker: ${workerName}
workerDisplayTitle: "${workerName}"
agenda: "${args.reason.replace(/"/g, '\\"')}"
deferred_until: ""
${linkedYaml}
meeting_log:
  - timestamp: ${isoStr}
    event: requested
    reason: "${reasonForLog.replace(/"/g, '\\"')}"
notes_summary: ""
---
`;

    const artifactPath = meetingArtifactPath(projectPath, followupMeetingId);
    await fs.mkdir(path.dirname(artifactPath), { recursive: true });
    await fs.writeFile(artifactPath, content, "utf-8");

    return {
      content: [
        {
          type: "text",
          text: `Follow-up meeting proposed: ${followupId}`,
        },
      ],
    };
  };
}

export function makeSummarizeProgressHandler(
  projectPath: string,
  meetingId: string,
) {
  const mid = asMeetingId(meetingId);

  return async (args: { summary: string }): Promise<ToolResult> => {
    await appendMeetingLog(
      projectPath,
      mid,
      "progress_summary",
      args.summary,
    );

    return {
      content: [
        {
          type: "text",
          text: "Progress summary recorded",
        },
      ],
    };
  };
}

// -- MCP server factory --

/**
 * Creates the meeting toolbox MCP server. This toolbox is present only
 * during active meetings, providing tools to link artifacts, propose
 * follow-up meetings, and record progress summaries.
 */
export function createMeetingToolbox(
  deps: MeetingToolboxDeps,
): McpSdkServerConfigWithInstance {
  const linkArtifact = makeLinkArtifactHandler(
    deps.projectPath,
    deps.meetingId,
  );
  const proposeFollowup = makeProposeFollowupHandler(
    deps.projectPath,
    deps.meetingId,
    deps.workerName,
  );
  const summarizeProgress = makeSummarizeProgressHandler(
    deps.projectPath,
    deps.meetingId,
  );

  return createSdkMcpServer({
    name: "guild-hall-meeting",
    version: "0.1.0",
    tools: [
      tool(
        "link_artifact",
        "Associate an existing artifact with this meeting. The artifact path is relative to the project's .lore/ directory (e.g., 'specs/api-design.md').",
        {
          artifactPath: z.string(),
        },
        (args) => linkArtifact(args),
      ),
      tool(
        "propose_followup",
        "Propose a follow-up meeting for the same worker. Creates a meeting request artifact that the user can accept or decline.",
        {
          reason: z.string(),
          referencedArtifacts: z.array(z.string()).optional(),
        },
        (args) => proposeFollowup(args),
      ),
      tool(
        "summarize_progress",
        "Record a progress summary snapshot in the meeting log. Use this to checkpoint work completed so far.",
        {
          summary: z.string(),
        },
        (args) => summarizeProgress(args),
      ),
    ],
  });
}
