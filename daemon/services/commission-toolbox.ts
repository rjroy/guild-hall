/**
 * Commission toolbox: context-specific tools available during an active commission.
 *
 * Provides three tools that operate on the current commission's artifact:
 * - report_progress: update current progress and log a progress report
 * - submit_result: record the final result (one-shot, cannot be called twice)
 * - log_question: record a question in the activity timeline
 *
 * Each tool writes to files for durability AND POSTs to the daemon socket for
 * real-time notification. The HTTP callback is best-effort: failures are logged
 * but don't fail the tool call. The file write already persisted the data.
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
  projectPath: string;
  commissionId: string;
  daemonSocketPath: string;
  guildHallHome?: string;
}

// -- HTTP callback helper --

/**
 * Best-effort notification to the daemon over Unix socket. If the POST fails
 * (daemon restarted, socket gone), the error is logged but NOT propagated.
 * The file write already persisted the data; real-time notification is a bonus.
 */
async function notifyDaemon(
  socketPath: string,
  urlPath: string,
  body: unknown,
): Promise<void> {
  try {
    const resp = await fetch(`http://localhost${urlPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      unix: socketPath,
    } as RequestInit);
    if (!resp.ok) {
      console.error(
        `[commission-toolbox] Daemon rejected notification at ${urlPath}: ${resp.status} ${resp.statusText}`,
      );
    }
  } catch (err) {
    // Best-effort: log and continue
    console.error(
      `[commission-toolbox] Failed to notify daemon at ${urlPath}:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

// -- Tool handler factories --

export function makeReportProgressHandler(
  projectPath: string,
  commissionId: string,
  daemonSocketPath: string,
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

    await notifyDaemon(
      daemonSocketPath,
      `/commissions/${commissionId}/progress`,
      { summary: args.summary },
    );

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
  daemonSocketPath: string,
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

    // Set flag immediately to prevent retry duplicates. appendTimelineEntry
    // is not idempotent, so a failed-then-retried submit would create
    // duplicate entries. A failed submit_result cannot be retried.
    resultSubmitted = true;

    await updateResultSummary(projectPath, cid, args.summary, args.artifacts);
    await appendTimelineEntry(
      projectPath,
      cid,
      "result_submitted",
      args.summary,
    );

    await notifyDaemon(
      daemonSocketPath,
      `/commissions/${commissionId}/result`,
      { summary: args.summary, artifacts: args.artifacts },
    );

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
  daemonSocketPath: string,
) {
  const cid = asCommissionId(commissionId);

  return async (args: { question: string }): Promise<ToolResult> => {
    await appendTimelineEntry(
      projectPath,
      cid,
      "question",
      args.question,
    );

    await notifyDaemon(
      daemonSocketPath,
      `/commissions/${commissionId}/question`,
      { question: args.question },
    );

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
export function createCommissionToolbox(
  deps: CommissionToolboxDeps,
): McpSdkServerConfigWithInstance {
  const reportProgress = makeReportProgressHandler(
    deps.projectPath,
    deps.commissionId,
    deps.daemonSocketPath,
  );
  const submitResult = makeSubmitResultHandler(
    deps.projectPath,
    deps.commissionId,
    deps.daemonSocketPath,
  );
  const logQuestion = makeLogQuestionHandler(
    deps.projectPath,
    deps.commissionId,
    deps.daemonSocketPath,
  );

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
