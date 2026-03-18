/**
 * remove_background tool handler (REQ-RPL-9).
 *
 * Removes background from an image, producing a transparent PNG.
 * Validates input file, uploads it, runs prediction, downloads output.
 */

import * as path from "node:path";
import type { ReplicateClient } from "../replicate-client";
import { ReplicateApiError, ReplicateNetworkError } from "../replicate-client";
import type { OutputDeps } from "../output";
import { resolveOutputDir, generateFilename, detectExtension, validateInputFile } from "../output";
import { getDefaultModel, getCostEstimate } from "../model-registry";
import type { EventBus } from "@/daemon/lib/event-bus";
import type { ToolResult } from "@/daemon/types";

export interface RemoveBackgroundArgs {
  image: string;
  model?: string;
  output_filename?: string;
}

export interface RemoveBackgroundDeps extends OutputDeps {
  eventBus: EventBus;
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

export function makeRemoveBackgroundHandler(client: ReplicateClient, deps: RemoveBackgroundDeps) {
  return async (args: RemoveBackgroundArgs): Promise<ToolResult> => {
    const start = Date.now();

    try {
      await validateInputFile(args.image);

      const model = args.model ?? getDefaultModel("background-removal");
      const uploadedUrl = await client.uploadFile(args.image);

      const input: Record<string, unknown> = { image: uploadedUrl };

      let prediction = await client.createPrediction(model, input, 60);

      if (prediction.status !== "succeeded" && prediction.status !== "failed" && prediction.status !== "canceled") {
        prediction = await client.waitForCompletion(prediction.id);
      }

      if (prediction.status === "failed") {
        const errorMsg = prediction.error ?? "unknown error";
        const logs = prediction.logs ? `\n\nLogs:\n${prediction.logs}` : "";
        return errorResult(`Prediction failed: ${errorMsg}${logs}`);
      }

      if (prediction.status === "canceled") {
        return errorResult("Prediction was canceled before completing.");
      }

      const outputDir = await resolveOutputDir(deps);
      const outputUrl = Array.isArray(prediction.output)
        ? prediction.output[0]
        : prediction.output ?? "";

      const ext = detectExtension(outputUrl);
      const filename = generateFilename("remove_background", prediction.id, ext, args.output_filename);
      const outputPath = path.join(outputDir, filename);
      await client.downloadFile(outputUrl, outputPath);

      const elapsed_ms = Date.now() - start;
      const cost_estimate = getCostEstimate(model);

      deps.eventBus.emit({
        type: "toolbox_replicate",
        action: "generated",
        tool: "remove_background",
        model,
        files: [outputPath],
        cost: cost_estimate,
        projectName: deps.projectName,
        contextId: deps.contextId,
      });

      return textResult({
        file: outputPath,
        model,
        prediction_id: prediction.id,
        cost_estimate,
        elapsed_ms,
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
