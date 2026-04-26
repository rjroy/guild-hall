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
import { asMeetingId } from "@/apps/daemon/types";
import type { ToolResult } from "@/apps/daemon/types";
import {
  meetingArtifactPath,
  appendMeetingLog,
  addLinkedArtifact,
  renameMeetingArtifact,
} from "@/apps/daemon/services/meeting/record";
import { validateContainedPath, formatTimestamp, resolveWritePath } from "@/apps/daemon/lib/toolbox-utils";
import { integrationWorktreePath } from "@/lib/paths";
import type { ToolboxFactory } from "@/apps/daemon/services/toolbox-types";

export interface MeetingToolboxDeps {
  guildHallHome: string;
  projectName: string;
  contextId: string;
  workerName: string;
}

// -- Tool handler factories --

export function makeLinkArtifactHandler(deps: MeetingToolboxDeps) {
  const mid = asMeetingId(deps.contextId);

  return async (args: { artifactPath: string }): Promise<ToolResult> => {
    const writePath = await resolveWritePath(
      deps.guildHallHome, deps.projectName, deps.contextId, "meeting",
    );
    const lorePath = path.join(writePath, ".lore");

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
    const added = await addLinkedArtifact(writePath, mid, args.artifactPath);
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

export function makeProposeFollowupHandler(deps: MeetingToolboxDeps) {
  return async (args: {
    reason: string;
    referencedArtifacts?: string[];
  }): Promise<ToolResult> => {
    const now = new Date();
    const ts = formatTimestamp(now);
    const followupId = `followup-${deps.workerName}-${ts}`;
    const followupMeetingId = asMeetingId(followupId);

    const dateStr = now.toISOString().split("T")[0];
    const isoStr = now.toISOString();

    const linkedArtifacts = args.referencedArtifacts ?? [];
    const linkedYaml =
      linkedArtifacts.length === 0
        ? "linked_artifacts: []"
        : "linked_artifacts:\n" +
          linkedArtifacts.map((a) => `  - ${a}`).join("\n");

    const reasonForLog = `Worker proposed follow-up from meeting ${deps.contextId}`;

    // Use the same template literal format as writeMeetingArtifact in
    // meeting/record.ts, with status: requested.
    const content = `---
title: "Follow-up with ${deps.workerName}"
date: ${dateStr}
status: requested
tags: [meeting]
worker: ${deps.workerName}
workerDisplayTitle: "${deps.workerName}"
agenda: "${args.reason.replace(/"/g, '\\"')}"
deferred_until: ""
${linkedYaml}
meeting_log:
  - timestamp: ${isoStr}
    event: requested
    reason: "${reasonForLog.replace(/"/g, '\\"')}"
---
`;

    // propose_followup always writes to the integration worktree so the
    // dashboard can see the request before the parent meeting closes.
    const intPath = integrationWorktreePath(deps.guildHallHome, deps.projectName);
    const artifactPath = meetingArtifactPath(intPath, followupMeetingId);
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

export function makeSummarizeProgressHandler(deps: MeetingToolboxDeps) {
  const mid = asMeetingId(deps.contextId);

  return async (args: { summary: string }): Promise<ToolResult> => {
    const writePath = await resolveWritePath(
      deps.guildHallHome, deps.projectName, deps.contextId, "meeting",
    );
    await appendMeetingLog(writePath, mid, "progress_summary", args.summary);

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

export function makeRenameMeetingHandler(deps: MeetingToolboxDeps) {
  const mid = asMeetingId(deps.contextId);

  return async (args: { title: string }): Promise<ToolResult> => {
    const trimmed = args.title.trim();

    if (trimmed.length === 0) {
      return {
        content: [{ type: "text", text: "Title must not be empty." }],
        isError: true,
      };
    }

    if (trimmed.length > 200) {
      return {
        content: [{
          type: "text",
          text: `Title must be 200 characters or fewer (received ${trimmed.length}).`,
        }],
        isError: true,
      };
    }

    if (/[\n\r]/.test(trimmed)) {
      return {
        content: [{ type: "text", text: "Title must not contain newline or carriage return characters." }],
        isError: true,
      };
    }

    const writePath = await resolveWritePath(
      deps.guildHallHome, deps.projectName, deps.contextId, "meeting",
    );
    const { renamed } = await renameMeetingArtifact(writePath, mid, trimmed);

    if (!renamed) {
      return {
        content: [{ type: "text", text: "No change: title is already set to that value." }],
      };
    }

    return {
      content: [{ type: "text", text: `Meeting renamed to: ${trimmed}` }],
    };
  };
}

/** ToolboxFactory adapter for the meeting toolbox. */
export const meetingToolboxFactory: ToolboxFactory = (deps) => ({
  server: createMeetingToolbox(deps),
});

// -- MCP server factory --

/**
 * Creates the meeting toolbox MCP server. This toolbox is present only
 * during active meetings, providing tools to link artifacts, propose
 * follow-up meetings, and record progress summaries.
 */
export function createMeetingToolbox(
  deps: MeetingToolboxDeps,
): McpSdkServerConfigWithInstance {
  const linkArtifact = makeLinkArtifactHandler(deps);
  const proposeFollowup = makeProposeFollowupHandler(deps);
  const summarizeProgress = makeSummarizeProgressHandler(deps);
  const renameMeeting = makeRenameMeetingHandler(deps);

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
      tool(
        "rename_meeting",
        "Rename this meeting to a more descriptive title. The new title appears in meeting listing views. Use this once you have enough context to give the meeting a name that will be meaningful when the user returns to it later.",
        {
          title: z.string(),
        },
        (args) => renameMeeting(args),
      ),
    ],
  });
}
