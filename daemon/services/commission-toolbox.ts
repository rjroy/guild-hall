/**
 * Commission toolbox: context-specific tools available during an active commission.
 *
 * Provides three tools that operate on the current commission's artifact:
 * - report_progress: update current progress and log a progress report
 * - submit_result: record the final result (one-shot, cannot be called twice)
 * - log_question: record a question in the activity timeline
 *
 * Uses callbacks to notify the caller (session runner or orchestrator) of
 * tool invocations. File writes for durability happen within each handler;
 * the callback is the notification path.
 *
 * Follows the same MCP server factory pattern as base-toolbox.ts and
 * meeting-toolbox.ts.
 */

import * as path from "node:path";
import {
  createSdkMcpServer,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";
import { asCommissionId } from "@/daemon/types";
import type { CommissionId, ToolResult } from "@/daemon/types";
import { createCommissionRecordOps } from "@/daemon/services/commission/record";
import { resolveWritePath, errorMessage } from "@/daemon/lib/toolbox-utils";
import type { GuildHallToolboxDeps, ToolboxFactory } from "./toolbox-types";

type CommissionToolboxDeps = Pick<GuildHallToolboxDeps, "guildHallHome" | "projectName" | "contextId" | "eventBus">;

// -- Local path helper --

function commissionArtifactPath(projectPath: string, commissionId: CommissionId): string {
  return path.join(projectPath, ".lore", "commissions", `${commissionId}.md`);
}

// -- Callback types --

/**
 * Callbacks for the commission toolbox (Layer 4 interface).
 * These decouple the toolbox from EventBus emission, allowing the
 * session runner to receive tool invocations directly.
 */
export type CommissionToolCallbacks = {
  onProgress: (summary: string) => void;
  onResult: (summary: string, artifacts?: string[]) => void;
  onQuestion: (question: string) => void;
};

// -- Handler factories --

export function makeReportProgressHandler(
  deps: CommissionToolboxDeps,
  callbacks: CommissionToolCallbacks,
) {
  const cid = asCommissionId(deps.contextId);
  const recordOps = createCommissionRecordOps();

  return async (args: { summary: string }): Promise<ToolResult> => {
    const writePath = await resolveWritePath(
      deps.guildHallHome, deps.projectName, deps.contextId, "commission",
    );
    const artifactPath = commissionArtifactPath(writePath, cid);
    await recordOps.appendTimeline(artifactPath, "progress_report", args.summary);
    await recordOps.updateProgress(artifactPath, args.summary);

    callbacks.onProgress(args.summary);

    return {
      content: [
        { type: "text", text: `Progress reported: ${args.summary}` },
      ],
    };
  };
}

export function makeSubmitResultHandler(
  deps: CommissionToolboxDeps,
  callbacks: CommissionToolCallbacks,
) {
  const cid = asCommissionId(deps.contextId);
  const recordOps = createCommissionRecordOps();
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
      const artifactPath = commissionArtifactPath(writePath, cid);
      await recordOps.updateResult(artifactPath, args.summary, args.artifacts);
      await recordOps.appendTimeline(artifactPath, "result_submitted", args.summary);
    } catch (err: unknown) {
      // File write failed (e.g. ENOENT). Don't set the flag so
      // the model can retry after the path issue is resolved.
      return {
        content: [
          {
            type: "text",
            text: `Failed to write result: ${errorMessage(err)}`,
          },
        ],
        isError: true,
      };
    }

    // Only mark as submitted after successful file write
    resultSubmitted = true;
    callbacks.onResult(args.summary, args.artifacts);

    return {
      content: [
        { type: "text", text: `Result submitted: ${args.summary}` },
      ],
    };
  };
}

export function makeLogQuestionHandler(
  deps: CommissionToolboxDeps,
  callbacks: CommissionToolCallbacks,
) {
  const cid = asCommissionId(deps.contextId);
  const recordOps = createCommissionRecordOps();

  return async (args: { question: string }): Promise<ToolResult> => {
    const writePath = await resolveWritePath(
      deps.guildHallHome, deps.projectName, deps.contextId, "commission",
    );
    const artifactPath = commissionArtifactPath(writePath, cid);
    await recordOps.appendTimeline(artifactPath, "question", args.question);

    callbacks.onQuestion(args.question);

    return {
      content: [
        { type: "text", text: `Question logged: ${args.question}` },
      ],
    };
  };
}

// -- MCP server factory --

/**
 * Creates a commission toolbox that routes tool invocations through
 * callbacks. File writes for durability still happen; only the
 * notification path goes through callbacks.
 */
export function createCommissionToolboxWithCallbacks(
  deps: CommissionToolboxDeps,
  callbacks: CommissionToolCallbacks,
): McpSdkServerConfigWithInstance {
  const reportProgress = makeReportProgressHandler(deps, callbacks);
  const submitResult = makeSubmitResultHandler(deps, callbacks);
  const logQuestion = makeLogQuestionHandler(deps, callbacks);

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

/**
 * ToolboxFactory for the system toolbox registry. When used through
 * the toolbox resolver (session runner path), callbacks route events
 * through the EventBus so the session runner's subscription can
 * translate them into SessionCallbacks.
 */
export const commissionToolboxFactory: ToolboxFactory = (deps) => ({
  server: createCommissionToolboxWithCallbacks(deps, {
    onProgress: (summary) =>
      deps.eventBus.emit({
        type: "commission_progress",
        commissionId: deps.contextId,
        summary,
      }),
    onResult: (summary, artifacts) =>
      deps.eventBus.emit({
        type: "commission_result",
        commissionId: deps.contextId,
        summary,
        artifacts,
      }),
    onQuestion: (question) =>
      deps.eventBus.emit({
        type: "commission_question",
        commissionId: deps.contextId,
        question,
      }),
  }),
});
