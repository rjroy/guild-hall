/**
 * check_prediction tool handler (REQ-RPL-13).
 *
 * Returns raw prediction status, output URLs (not downloaded),
 * error, elapsed time, and logs.
 */

import type { ReplicateClient } from "../replicate-client";
import { ReplicateApiError, ReplicateNetworkError } from "../replicate-client";
import type { ToolResult } from "@/daemon/types";

export interface CheckPredictionArgs {
  prediction_id: string;
}

function textResult(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(message: string): ToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

export function makeCheckPredictionHandler(client: ReplicateClient) {
  return async (args: CheckPredictionArgs): Promise<ToolResult> => {
    try {
      const prediction = await client.getPrediction(args.prediction_id);

      // Compute elapsed_seconds from timestamps when available (REQ-RPL-13)
      let elapsed_seconds: number | null = null;
      if (prediction.started_at && prediction.completed_at) {
        const started = new Date(prediction.started_at).getTime();
        const completed = new Date(prediction.completed_at).getTime();
        if (!isNaN(started) && !isNaN(completed)) {
          elapsed_seconds = (completed - started) / 1000;
        }
      }

      return textResult({
        prediction_id: prediction.id,
        status: prediction.status,
        output: prediction.output ?? null,
        error: prediction.error ?? null,
        logs: prediction.logs ?? null,
        elapsed_seconds,
        metrics: prediction.metrics ?? null,
        created_at: prediction.created_at ?? null,
        started_at: prediction.started_at ?? null,
        completed_at: prediction.completed_at ?? null,
      });
    } catch (err) {
      if (err instanceof ReplicateApiError) {
        return errorResult(err.detail);
      }
      if (err instanceof ReplicateNetworkError) {
        return errorResult(err.message);
      }
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(message);
    }
  };
}
