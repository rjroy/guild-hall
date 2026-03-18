/**
 * edit_image tool handler (REQ-RPL-8).
 *
 * Transforms an existing image via an img2img model on Replicate.
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

export interface EditImageArgs {
  image: string;
  prompt: string;
  model?: string;
  strength?: number;
  output_filename?: string;
  model_params?: Record<string, unknown>;
}

export interface EditImageDeps extends OutputDeps {
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

export function makeEditImageHandler(client: ReplicateClient, deps: EditImageDeps) {
  return async (args: EditImageArgs): Promise<ToolResult> => {
    const start = Date.now();

    try {
      // Validate input file before any API call (REQ-RPL-22)
      await validateInputFile(args.image);

      const model = args.model ?? getDefaultModel("image-to-image");

      // Upload file (REQ-RPL-21)
      const uploadedUrl = await client.uploadFile(args.image);

      // Build prediction input: named params take precedence over model_params (REQ-RPL-26)
      const input: Record<string, unknown> = {
        ...args.model_params,
        image: uploadedUrl,
        prompt: args.prompt,
      };
      if (args.strength !== undefined) input.strength = args.strength;

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
      const outputs = Array.isArray(prediction.output)
        ? prediction.output
        : prediction.output
          ? [prediction.output]
          : [];

      const files: string[] = [];
      for (const url of outputs) {
        const ext = detectExtension(url);
        const filename = files.length === 0
          ? generateFilename("edit_image", prediction.id, ext, args.output_filename)
          : generateFilename("edit_image", prediction.id, ext);
        const outputPath = path.join(outputDir, filename);
        await client.downloadFile(url, outputPath);
        files.push(outputPath);
      }

      const elapsed_ms = Date.now() - start;
      const cost_estimate = getCostEstimate(model);

      deps.eventBus.emit({
        type: "toolbox_replicate",
        action: "generated",
        tool: "edit_image",
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
