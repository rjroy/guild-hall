/**
 * Worker method handlers for all six worker operations: dispatch, list,
 * status, result, cancel, and delete.
 *
 * These are pure functions that operate on a JobStore. They accept params
 * and return results, with no HTTP or JSON-RPC awareness. The server wires
 * them into the worker method handler map.
 *
 * Uses picomatch for glob filtering in worker/list.
 */

import picomatch from "picomatch";
import type { JobStore, JobDecision } from "./job-store.js";

// -- Types --

export type DispatchParams = {
  description: string;
  task: string;
  config?: Record<string, unknown>;
};

export type DispatchResult = {
  jobId: string;
};

export type ListParams = {
  detail?: "simple" | "detailed";
  filter?: string;
};

type SimpleJob = {
  jobId: string;
  status: string;
};

type DetailedJob = SimpleJob & {
  description: string;
  summary: string | null;
};

export type ListResult = {
  jobs: SimpleJob[] | DetailedJob[];
};

export type StatusParams = {
  jobId: string;
};

export type StatusResult = {
  jobId: string;
  status: "running" | "completed" | "failed" | "cancelled";
  description: string;
  summary: string | null;
  questions: string[] | null;
  decisions: JobDecision[] | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
};

export type ResultParams = {
  jobId: string;
};

export type ResultResult = {
  jobId: string;
  output: string;
  artifacts: string[] | null;
};

export type CancelParams = {
  jobId: string;
};

export type CancelResult = {
  jobId: string;
  status: string;
};

export type DeleteParams = {
  jobId: string;
};

export type DeleteResult = {
  jobId: string;
  deleted: true;
};

// -- Error type --

/**
 * Error with a JSON-RPC error code. The server's worker method router
 * propagates the code into the JSON-RPC error response.
 */
export class HandlerError extends Error {
  code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

// -- Handler types --

export type WorkerHandlers = {
  dispatch: (params: DispatchParams) => Promise<DispatchResult>;
  list: (params?: ListParams) => Promise<ListResult>;
  status: (params: StatusParams) => Promise<StatusResult>;
  result: (params: ResultParams) => Promise<ResultResult>;
  cancel: (params: CancelParams) => Promise<CancelResult>;
  delete: (params: DeleteParams) => Promise<DeleteResult>;
};

/** Optional callback invoked when a running job is cancelled. Phase 12 will
 *  use this to abort the Agent SDK session. */
export type OnCancelFn = (jobId: string) => void;

// -- Factory --

/**
 * Creates worker method handlers bound to a JobStore.
 *
 * @param jobStore - The job store to operate on.
 * @param onCancel - Optional callback invoked when a running job is cancelled.
 *   Phase 12 will supply this to abort the Agent SDK session.
 */
export function createHandlers(jobStore: JobStore, onCancel?: OnCancelFn): WorkerHandlers {
  return {
    async dispatch(params: DispatchParams): Promise<DispatchResult> {
      const { description, task, config } = params;
      const jobId = await jobStore.createJob(description, task, config);
      return { jobId };
    },

    async list(params?: ListParams): Promise<ListResult> {
      const detail = params?.detail ?? "simple";
      const filter = params?.filter;

      let allJobs = await jobStore.listJobs();

      if (filter) {
        const isMatch = picomatch(filter);
        allJobs = allJobs.filter((job) => isMatch(job.description));
      }

      if (detail === "detailed") {
        const detailed: DetailedJob[] = await Promise.all(
          allJobs.map(async (job) => ({
            jobId: job.jobId,
            status: job.status,
            description: job.description,
            summary: await jobStore.readSummary(job.jobId),
          })),
        );
        return { jobs: detailed };
      }

      const simple: SimpleJob[] = allJobs.map((job) => ({
        jobId: job.jobId,
        status: job.status,
      }));
      return { jobs: simple };
    },

    async status(params: StatusParams): Promise<StatusResult> {
      const job = await jobStore.getJob(params.jobId);
      if (!job) {
        throw new HandlerError(-32602, `Unknown job ID: ${params.jobId}`);
      }
      const summary = await jobStore.readSummary(params.jobId);
      const rawQuestions = await jobStore.readQuestions(params.jobId);
      const questions = rawQuestions
        ? rawQuestions.split("\n").filter((line) => line.length > 0)
        : null;
      const decisions = await jobStore.readDecisions(params.jobId);
      return {
        jobId: job.jobId,
        status: job.status as StatusResult["status"],
        description: job.description,
        summary,
        questions,
        decisions,
        error: job.error ?? null,
        startedAt: job.startedAt,
        completedAt: job.completedAt ?? null,
      };
    },

    async result(params: ResultParams): Promise<ResultResult> {
      const job = await jobStore.getJob(params.jobId);
      if (!job) {
        throw new HandlerError(-32602, `Unknown job ID: ${params.jobId}`);
      }
      if (job.status === "running") {
        throw new HandlerError(-32602, "Job is still running");
      }
      if (job.status === "cancelled") {
        throw new HandlerError(-32602, "Job was cancelled");
      }
      if (job.status === "failed") {
        throw new HandlerError(-32602, `Job failed: ${job.error ?? "unknown error"}`);
      }
      // Status must be "completed"
      const resultData = await jobStore.readResult(params.jobId);
      return {
        jobId: params.jobId,
        output: resultData?.output ?? "",
        artifacts: resultData?.artifacts ?? null,
      };
    },

    async cancel(params: CancelParams): Promise<CancelResult> {
      const job = await jobStore.getJob(params.jobId);
      if (!job) {
        throw new HandlerError(-32602, `Unknown job ID: ${params.jobId}`);
      }

      // Idempotent: already terminal, return current status
      if (job.status === "completed" || job.status === "cancelled") {
        return { jobId: job.jobId, status: job.status };
      }

      // Running or failed: transition to cancelled
      await jobStore.updateStatus(params.jobId, "cancelled");
      onCancel?.(params.jobId);

      return { jobId: params.jobId, status: "cancelled" };
    },

    async delete(params: DeleteParams): Promise<DeleteResult> {
      const job = await jobStore.getJob(params.jobId);
      if (!job) {
        throw new HandlerError(-32602, `Unknown job ID: ${params.jobId}`);
      }

      if (job.status === "running") {
        throw new HandlerError(-32602, "Cannot delete a running job");
      }
      if (job.status === "failed") {
        throw new HandlerError(-32602, "Cannot delete a failed job. Cancel it first.");
      }

      // completed or cancelled: safe to remove
      await jobStore.deleteJob(params.jobId);
      return { jobId: params.jobId, deleted: true };
    },
  };
}
