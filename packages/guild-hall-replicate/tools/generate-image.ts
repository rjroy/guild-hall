/**
 * generate_image tool handler (REQ-RPL-7).
 *
 * Creates an image from a text prompt via Replicate's prediction API.
 * Downloads output to .lore/generated/ and returns file paths with metadata.
 */

import * as path from "node:path";
import type { ReplicateClient } from "../replicate-client";
import { ReplicateApiError, ReplicateNetworkError } from "../replicate-client";
import type { OutputDeps } from "../output";
import { resolveOutputDir, generateFilename, detectExtension } from "../output";
import { getDefaultModel, getCostEstimate } from "../model-registry";
import type { EventBus } from "@/apps/daemon/lib/event-bus";
import type { ToolResult } from "@/apps/daemon/types";

export interface GenerateImageArgs {
  prompt: string;
  model?: string;
  output_filename?: string;
  aspect_ratio?: string;
  width?: number;
  height?: number;
  num_outputs?: number;
  seed?: number;
  model_params?: Record<string, unknown>;
}

export interface GenerateImageDeps extends OutputDeps {
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

export function makeGenerateImageHandler(client: ReplicateClient, deps: GenerateImageDeps) {
  return async (args: GenerateImageArgs): Promise<ToolResult> => {
    const start = Date.now();

    try {
      const model = args.model ?? getDefaultModel("text-to-image");

      // Build prediction input: named params take precedence over model_params (REQ-RPL-26)
      const input: Record<string, unknown> = {
        ...args.model_params,
        prompt: args.prompt,
      };
      if (args.aspect_ratio !== undefined) input.aspect_ratio = args.aspect_ratio;
      if (args.width !== undefined) input.width = args.width;
      if (args.height !== undefined) input.height = args.height;
      if (args.num_outputs !== undefined) input.num_outputs = args.num_outputs;
      if (args.seed !== undefined) input.seed = args.seed;

      // Create prediction with synchronous wait (REQ-RPL-19)
      let prediction = await client.createPrediction(model, input, 60);

      // Polling fallback if synchronous wait returns non-terminal status
      if (prediction.status !== "succeeded" && prediction.status !== "failed" && prediction.status !== "canceled") {
        prediction = await client.waitForCompletion(prediction.id);
      }

      // Check for prediction failure (REQ-RPL-33)
      if (prediction.status === "failed") {
        const errorMsg = prediction.error ?? "unknown error";
        const logs = prediction.logs ? `\n\nLogs:\n${prediction.logs}` : "";
        return errorResult(`Prediction failed: ${errorMsg}${logs}`);
      }

      if (prediction.status === "canceled") {
        return errorResult("Prediction was canceled before completing.");
      }

      // Download output files
      const outputDir = await resolveOutputDir(deps);
      const outputs = Array.isArray(prediction.output)
        ? prediction.output
        : prediction.output
          ? [prediction.output]
          : [];

      const files: string[] = [];
      for (let i = 0; i < outputs.length; i++) {
        const url = outputs[i];
        const ext = detectExtension(url);
        const filename = outputs.length === 1
          ? generateFilename("generate_image", prediction.id, ext, args.output_filename)
          : generateFilename("generate_image", prediction.id, ext, i === 0 ? args.output_filename : undefined);
        const outputPath = path.join(outputDir, filename);
        await client.downloadFile(url, outputPath);
        files.push(outputPath);
      }

      const elapsed_ms = Date.now() - start;
      const cost_estimate = getCostEstimate(model);

      // Emit event on success (REQ-RPL-27)
      deps.eventBus.emit({
        type: "toolbox_replicate",
        action: "generated",
        tool: "generate_image",
        model,
        files,
        cost: cost_estimate,
        projectName: deps.projectName,
        contextId: deps.contextId,
      });

      return textResult({
        files,
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
