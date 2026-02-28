/**
 * Commission toolbox: context-specific tools available during an active commission.
 *
 * Provides three tools that operate on the current commission's artifact:
 * - report_progress: update current progress and log a progress report
 * - submit_result: record the final result (one-shot, cannot be called twice)
 * - log_question: record a question in the activity timeline
 *
 * Each tool writes to files for durability, then emits an event to the EventBus
 * for real-time notification. The commission session subscribes to these events
 * to update its own state (resultSubmitted, lastActivity, etc.).
 *
 * Follows the same MCP server factory pattern as base-toolbox.ts and
 * meeting-toolbox.ts.
 */

import {
  createSdkMcpServer,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";
import { asCommissionId } from "@/daemon/types";
import type { ToolResult } from "@/daemon/types";
import {
  appendTimelineEntry,
  updateCurrentProgress,
  updateResultSummary,
} from "@/daemon/services/commission-artifact-helpers";
import { resolveWritePath } from "@/daemon/lib/toolbox-utils";
import type { EventBus } from "./event-bus";
import type { ToolboxFactory } from "./toolbox-types";

export interface CommissionToolboxDeps {
  guildHallHome: string;
  projectName: string;
  contextId: string;
  eventBus: EventBus;
}

// -- Tool handler factories --

export function makeReportProgressHandler(
  deps: CommissionToolboxDeps,
) {
  const cid = asCommissionId(deps.contextId);

  return async (args: { summary: string }): Promise<ToolResult> => {
    const writePath = await resolveWritePath(
      deps.guildHallHome, deps.projectName, deps.contextId, "commission",
    );
    await appendTimelineEntry(writePath, cid, "progress_report", args.summary);
    await updateCurrentProgress(writePath, cid, args.summary);

    deps.eventBus.emit({
      type: "commission_progress",
      commissionId: deps.contextId,
      summary: args.summary,
    });

    return {
      content: [
        { type: "text", text: `Progress reported: ${args.summary}` },
      ],
    };
  };
}

export function makeSubmitResultHandler(
  deps: CommissionToolboxDeps,
) {
  const cid = asCommissionId(deps.contextId);
  let resultSubmitted = false;

  return async (args: {
    summary: string;
    artifacts?: string[];
  }): Promise<ToolResult> => {
    if (resultSubmitted) {
      return {
        content: [
          {
            type: "text",
            text: "Result already submitted. submit_result can only be called once per commission.",
          },
        ],
        isError: true,
      };
    }

    try {
      const writePath = await resolveWritePath(
        deps.guildHallHome, deps.projectName, deps.contextId, "commission",
      );
      await updateResultSummary(writePath, cid, args.summary, args.artifacts);
      await appendTimelineEntry(writePath, cid, "result_submitted", args.summary);
    } catch (err: unknown) {
      // File write failed (e.g. ENOENT). Don't set the flag so
      // the model can retry after the path issue is resolved.
      return {
        content: [
          {
            type: "text",
            text: `Failed to write result: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }

    // Only mark as submitted after successful file write
    resultSubmitted = true;

    deps.eventBus.emit({
      type: "commission_result",
      commissionId: deps.contextId,
      summary: args.summary,
      artifacts: args.artifacts,
    });

    return {
      content: [
        { type: "text", text: `Result submitted: ${args.summary}` },
      ],
    };
  };
}

export function makeLogQuestionHandler(
  deps: CommissionToolboxDeps,
) {
  const cid = asCommissionId(deps.contextId);

  return async (args: { question: string }): Promise<ToolResult> => {
    const writePath = await resolveWritePath(
      deps.guildHallHome, deps.projectName, deps.contextId, "commission",
    );
    await appendTimelineEntry(writePath, cid, "question", args.question);

    deps.eventBus.emit({
      type: "commission_question",
      commissionId: deps.contextId,
      question: args.question,
    });

    return {
      content: [
        { type: "text", text: `Question logged: ${args.question}` },
      ],
    };
  };
}

// -- MCP server factory --

/**
 * Creates the commission toolbox MCP server. This toolbox is present only
 * during active commissions, providing tools to report progress, submit
 * results, and log questions.
 *
 * The submit_result handler has its own resultSubmitted flag for idempotency
 * (preventing double-call within the same MCP session). The commission session
 * tracks result submission separately via EventBus subscription.
 */
export function createCommissionToolbox(
  deps: CommissionToolboxDeps,
): McpSdkServerConfigWithInstance {
  const reportProgress = makeReportProgressHandler(deps);
  const submitResult = makeSubmitResultHandler(deps);
  const logQuestion = makeLogQuestionHandler(deps);

  return createSdkMcpServer({
    name: "guild-hall-commission",
    version: "0.1.0",
    tools: [
      tool(
        "report_progress",
        "Report current progress on the commission. Updates the commission's current progress field and logs a timeline entry. Use this periodically to keep the user informed.",
        {
          summary: z.string(),
        },
        (args) => reportProgress(args),
      ),
      tool(
        "submit_result",
        "Submit the final result of the commission. This can only be called once. Records the result summary, optionally links artifacts, and logs the submission in the timeline.",
        {
          summary: z.string(),
          artifacts: z.array(z.string()).optional(),
        },
        (args) => submitResult(args),
      ),
      tool(
        "log_question",
        "Log a question that arose during commission work. Records the question in the activity timeline for the user to review.",
        {
          question: z.string(),
        },
        (args) => logQuestion(args),
      ),
    ],
  });
}

// -- Factory interface --

/** Binds an EventBus, returns a ToolboxFactory. */
export function createCommissionToolboxFactory(
  eventBus: EventBus,
): ToolboxFactory {
  return (ctx) => {
    const server = createCommissionToolbox({
      guildHallHome: ctx.guildHallHome,
      projectName: ctx.projectName,
      contextId: ctx.contextId,
      eventBus,
    });
    return { server };
  };
}
