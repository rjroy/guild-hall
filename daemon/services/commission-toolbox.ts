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

import {
  createSdkMcpServer,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";
import { asCommissionId } from "@/daemon/types";
import type { ToolResult } from "@/daemon/types";
import type { CommissionRecordOps } from "@/daemon/services/commission/record";
import { createCommissionRecordOps } from "@/daemon/services/commission/record";
import { resolveWritePath, errorMessage } from "@/daemon/lib/toolbox-utils";
import { commissionArtifactPath } from "@/lib/paths";
import type { SessionCallbacks } from "@/daemon/services/session-runner";
import type { GuildHallToolboxDeps, ToolboxFactory } from "./toolbox-types";

type CommissionToolboxDeps = Pick<GuildHallToolboxDeps, "guildHallHome" | "projectName" | "contextId" | "eventBus">;

/**
 * @deprecated Use SessionCallbacks from session-runner.ts instead.
 * Kept as a re-export alias for backward compatibility with tests.
 */
export type CommissionToolCallbacks = SessionCallbacks;

/**
 * Shared resources created once per toolbox and passed to handler factories.
 * Avoids creating a new CommissionRecordOps per handler and resolving the
 * write path on every tool call.
 */
type ToolboxResources = {
  recordOps: CommissionRecordOps;
  /** Lazily resolved on first use, then cached for the toolbox lifetime. */
  writePathPromise: Promise<string>;
};

function createToolboxResources(deps: CommissionToolboxDeps): ToolboxResources {
  const recordOps = createCommissionRecordOps();
  // Resolve write path once and cache the promise. All handlers await
  // the same promise, so the fs.access() call happens at most once.
  const writePathPromise = resolveWritePath(
    deps.guildHallHome, deps.projectName, deps.contextId, "commission",
  );
  return { recordOps, writePathPromise };
}

// -- Handler factories --

export function makeReportProgressHandler(
  deps: CommissionToolboxDeps,
  callbacks: SessionCallbacks,
  resources?: ToolboxResources,
) {
  const cid = asCommissionId(deps.contextId);
  const { recordOps, writePathPromise } = resources ?? createToolboxResources(deps);

  return async (args: { summary: string }): Promise<ToolResult> => {
    const writePath = await writePathPromise;
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
  callbacks: SessionCallbacks,
  resources?: ToolboxResources,
) {
  const cid = asCommissionId(deps.contextId);
  const { recordOps, writePathPromise } = resources ?? createToolboxResources(deps);
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
      const writePath = await writePathPromise;
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
  callbacks: SessionCallbacks,
  resources?: ToolboxResources,
) {
  const cid = asCommissionId(deps.contextId);
  const { recordOps, writePathPromise } = resources ?? createToolboxResources(deps);

  return async (args: { question: string }): Promise<ToolResult> => {
    const writePath = await writePathPromise;
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
 *
 * Creates a single CommissionRecordOps instance and resolves the write
 * path once, sharing them across all handlers for the toolbox lifetime.
 */
export function createCommissionToolboxWithCallbacks(
  deps: CommissionToolboxDeps,
  callbacks: SessionCallbacks,
): McpSdkServerConfigWithInstance {
  const resources = createToolboxResources(deps);

  const reportProgress = makeReportProgressHandler(deps, callbacks, resources);
  const submitResult = makeSubmitResultHandler(deps, callbacks, resources);
  const logQuestion = makeLogQuestionHandler(deps, callbacks, resources);

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
