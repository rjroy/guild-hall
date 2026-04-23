/**
 * cancel_prediction tool handler (REQ-RPL-14).
 *
 * Cancels a running Replicate prediction.
 */

import type { ReplicateClient } from "../replicate-client";
import { ReplicateApiError, ReplicateNetworkError } from "../replicate-client";
import type { ToolResult } from "@/apps/daemon/types";

export interface CancelPredictionArgs {
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

export function makeCancelPredictionHandler(client: ReplicateClient) {
  return async (args: CancelPredictionArgs): Promise<ToolResult> => {
    try {
      await client.cancelPrediction(args.prediction_id);

      return textResult({
        prediction_id: args.prediction_id,
        status: "canceled",
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
