/**
 * Mail toolbox: context-specific tools for mail reader sessions.
 *
 * Provides a single tool (reply) that lets the mail reader submit
 * a response to the sender's consultation request. Follows the same
 * one-call guard and EventBus signaling pattern as commission toolbox's
 * submit_result.
 */

import {
  createSdkMcpServer,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";
import type { ToolResult } from "@/daemon/types";
import type { GuildHallToolboxDeps, ToolboxFactory } from "@/daemon/services/toolbox-types";
import { createMailRecordOps } from "./record";
import type { MailRecordOps } from "./record";

// -- Callbacks --

export type MailSessionCallbacks = {
  onReply: (summary: string) => void;
};

// -- Handler factory --

export function makeReplyHandler(
  mailFilePath: string,
  callbacks: MailSessionCallbacks,
  recordOps?: MailRecordOps,
) {
  const ops = recordOps ?? createMailRecordOps();
  let replyReceived = false;

  return async (args: {
    summary: string;
    details?: string;
    files_modified?: string[];
  }): Promise<ToolResult> => {
    if (replyReceived) {
      return {
        content: [
          {
            type: "text",
            text: "Reply already submitted. reply can only be called once per mail session.",
          },
        ],
        isError: true,
      };
    }

    try {
      await ops.writeReply(mailFilePath, args.summary, args.details, args.files_modified);
    } catch (err: unknown) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to write reply: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }

    replyReceived = true;
    callbacks.onReply(args.summary);

    return {
      content: [
        { type: "text", text: `Reply submitted: ${args.summary}` },
      ],
    };
  };
}

// -- MCP server factory --

export function createMailToolboxWithCallbacks(
  mailFilePath: string,
  callbacks: MailSessionCallbacks,
  recordOps?: MailRecordOps,
) {
  const replyHandler = makeReplyHandler(mailFilePath, callbacks, recordOps);

  return createSdkMcpServer({
    name: "guild-hall-mail",
    version: "0.1.0",
    tools: [
      tool(
        "reply",
        "Submit your response to the mail consultation. Include a summary of your findings. This can only be called once.",
        {
          summary: z.string(),
          details: z.string().optional(),
          files_modified: z.array(z.string()).optional(),
        },
        (args) => replyHandler(args),
      ),
    ],
  });
}

// -- Factory interface --

/**
 * ToolboxFactory for the system toolbox registry. When used through the
 * toolbox resolver, callbacks route events through the EventBus.
 *
 * The mail file path is expected in deps.config.settings?.mailFilePath
 * (set by the orchestrator before session prep). If not available,
 * uses a placeholder path (the orchestrator will set it properly).
 */
export const mailToolboxFactory: ToolboxFactory = (deps: GuildHallToolboxDeps) => {
  const mailFilePath = (deps.config.settings?.mailFilePath as string) ?? "";

  return {
    server: createMailToolboxWithCallbacks(mailFilePath, {
      onReply: (summary) =>
        deps.eventBus.emit({
          type: "mail_reply_received",
          contextId: deps.contextId,
          commissionId: (deps.config.settings?.commissionId as string) ?? "",
          summary,
        }),
    }),
  };
};
