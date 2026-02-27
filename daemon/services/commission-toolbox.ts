/**
 * Commission toolbox: context-specific tools available during an active commission.
 *
 * Provides three tools that operate on the current commission's artifact:
 * - report_progress: update current progress and log a progress report
 * - submit_result: record the final result (one-shot, cannot be called twice)
 * - log_question: record a question in the activity timeline
 *
 * Each tool writes to files for durability, then invokes an injected callback
 * for real-time notification. The caller (commission session) owns the callback
 * implementation, which may emit events, update state, or do nothing.
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

export interface CommissionToolboxDeps {
  /** Must be the activity worktree path (commission config.workingDirectory).
   *  Writing to the project root instead of the activity worktree would put
   *  artifact changes on the wrong branch. */
  projectPath: string;
  commissionId: string;
  guildHallHome?: string;
  /** Called after a progress report is persisted to disk. */
  onProgress: (summary: string) => void;
  /** Called after the final result is persisted to disk. */
  onResult: (summary: string, artifacts?: string[]) => void;
  /** Called after a question is persisted to disk. */
  onQuestion: (question: string) => void;
}

// -- Tool handler factories --

export function makeReportProgressHandler(
  projectPath: string,
  commissionId: string,
  onProgress: (summary: string) => void,
) {
  const cid = asCommissionId(commissionId);

  return async (args: { summary: string }): Promise<ToolResult> => {
    await appendTimelineEntry(
      projectPath,
      cid,
      "progress_report",
      args.summary,
    );
    await updateCurrentProgress(projectPath, cid, args.summary);

    onProgress(args.summary);

    return {
      content: [
        { type: "text", text: `Progress reported: ${args.summary}` },
      ],
    };
  };
}

export function makeSubmitResultHandler(
  projectPath: string,
  commissionId: string,
  onResult: (summary: string, artifacts?: string[]) => void,
) {
  const cid = asCommissionId(commissionId);
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
      await updateResultSummary(projectPath, cid, args.summary, args.artifacts);
      await appendTimelineEntry(
        projectPath,
        cid,
        "result_submitted",
        args.summary,
      );
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

    onResult(args.summary, args.artifacts);

    return {
      content: [
        { type: "text", text: `Result submitted: ${args.summary}` },
      ],
    };
  };
}

export function makeLogQuestionHandler(
  projectPath: string,
  commissionId: string,
  onQuestion: (question: string) => void,
) {
  const cid = asCommissionId(commissionId);

  return async (args: { question: string }): Promise<ToolResult> => {
    await appendTimelineEntry(
      projectPath,
      cid,
      "question",
      args.question,
    );

    onQuestion(args.question);

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
 * The resultSubmitted flag is scoped to the closure created by this call,
 * so each createCommissionToolbox() invocation gets its own independent flag.
 */
export interface CommissionToolboxResult {
  server: McpSdkServerConfigWithInstance;
  wasResultSubmitted: () => boolean;
}

export function createCommissionToolbox(
  deps: CommissionToolboxDeps,
): CommissionToolboxResult {
  const reportProgress = makeReportProgressHandler(
    deps.projectPath,
    deps.commissionId,
    deps.onProgress,
  );
  const submitResult = makeSubmitResultHandler(
    deps.projectPath,
    deps.commissionId,
    deps.onResult,
  );
  const logQuestion = makeLogQuestionHandler(
    deps.projectPath,
    deps.commissionId,
    deps.onQuestion,
  );

  // Track whether submit_result was called so the worker can detect
  // sessions that finished without submitting.
  let resultSubmitted = false;

  const server = createSdkMcpServer({
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
        async (args) => {
          const result = await submitResult(args);
          if (!result.isError) resultSubmitted = true;
          return result;
        },
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

  return { server, wasResultSubmitted: () => resultSubmitted };
}
