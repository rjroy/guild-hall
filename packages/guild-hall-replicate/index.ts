/**
 * Guild Hall Replicate Toolbox
 *
 * Image generation, editing, background removal, and upscaling via Replicate's
 * REST API. Two initialization paths:
 *
 * 1. Unconfigured (REQ-RPL-5): REPLICATE_API_TOKEN absent. All tools exist
 *    but return a configuration error with isError: true.
 * 2. Configured (REQ-RPL-6): Token present. ReplicateClient wired into all
 *    tool handlers.
 */

import {
  createSdkMcpServer,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";
import type { ToolResult } from "@/apps/daemon/types";
import type { ToolboxFactory } from "@/apps/daemon/services/toolbox-types";
import { ReplicateClient } from "./replicate-client";
import { makeGenerateImageHandler } from "./tools/generate-image";
import { makeEditImageHandler } from "./tools/edit-image";
import { makeRemoveBackgroundHandler } from "./tools/remove-background";
import { makeUpscaleImageHandler } from "./tools/upscale-image";
import { makeListModelsHandler } from "./tools/list-models";
import { makeGetModelParamsHandler } from "./tools/get-model-params";
import { makeCheckPredictionHandler } from "./tools/check-prediction";
import { makeCancelPredictionHandler } from "./tools/cancel-prediction";

// -- Unconfigured state helpers --

const UNCONFIGURED_MESSAGE =
  "Replicate toolbox is not configured. Set the REPLICATE_API_TOKEN environment variable. Get a token at replicate.com/account/api-tokens.";

function makeUnconfiguredHandler() {
  return (): Promise<ToolResult> =>
    Promise.resolve({
      content: [{ type: "text", text: UNCONFIGURED_MESSAGE }],
      isError: true,
    });
}

// -- Tool schemas (shared between configured and unconfigured servers) --

const generateImageSchema = {
  prompt: z.string().describe("What to generate"),
  model: z.string().optional().describe('Replicate model identifier (default: "black-forest-labs/flux-schnell")'),
  output_filename: z.string().optional().describe("Basename for the output file (no directory)"),
  aspect_ratio: z.string().optional().describe('e.g. "16:9", "1:1", "9:16"'),
  width: z.number().optional().describe("Image width in pixels"),
  height: z.number().optional().describe("Image height in pixels"),
  num_outputs: z.number().optional().describe("Number of images to generate (default: 1)"),
  seed: z.number().optional().describe("For reproducible output"),
  model_params: z.record(z.string(), z.unknown()).optional().describe("Additional model-specific parameters"),
};

const editImageSchema = {
  image: z.string().describe("Local file path to the source image"),
  prompt: z.string().describe("What to change or how to transform"),
  model: z.string().optional().describe("Replicate model identifier"),
  strength: z.number().optional().describe("0.0 (no change) to 1.0 (full regeneration), default 0.75"),
  output_filename: z.string().optional().describe("Basename for the output file"),
  model_params: z.record(z.string(), z.unknown()).optional().describe("Additional model-specific parameters"),
};

const removeBackgroundSchema = {
  image: z.string().describe("Local file path to the source image"),
  model: z.string().optional().describe("Replicate model identifier"),
  output_filename: z.string().optional().describe("Basename for the output file"),
};

const upscaleImageSchema = {
  image: z.string().describe("Local file path to the source image"),
  scale: z.number().optional().describe("Upscale factor: 2 or 4 (default: 2)"),
  model: z.string().optional().describe("Replicate model identifier"),
  output_filename: z.string().optional().describe("Basename for the output file"),
};

const listModelsSchema = {
  capability: z.string().optional().describe('Filter: "text-to-image", "image-to-image", "background-removal", "upscale"'),
};

const getModelParamsSchema = {
  model: z.string().describe("Replicate model identifier"),
};

const checkPredictionSchema = {
  prediction_id: z.string().describe("Replicate prediction ID"),
};

const cancelPredictionSchema = {
  prediction_id: z.string().describe("Replicate prediction ID"),
};

// -- Server creators --

function createUnconfiguredServer() {
  const handler = makeUnconfiguredHandler();
  return createSdkMcpServer({
    name: "guild-hall-replicate",
    version: "0.1.0",
    tools: [
      tool("generate_image", "Generate an image from a text prompt using Replicate.", generateImageSchema, () => handler()),
      tool("edit_image", "Transform an existing image using an img2img model on Replicate.", editImageSchema, () => handler()),
      tool("remove_background", "Remove the background from an image, producing a transparent PNG.", removeBackgroundSchema, () => handler()),
      tool("upscale_image", "Increase the resolution of an existing image.", upscaleImageSchema, () => handler()),
      tool("list_models", "List available Replicate models with cost and speed metadata.", listModelsSchema, () => handler()),
      tool("get_model_params", "Discover what parameters a specific Replicate model accepts.", getModelParamsSchema, () => handler()),
      tool("check_prediction", "Check the status of a running Replicate prediction.", checkPredictionSchema, () => handler()),
      tool("cancel_prediction", "Cancel a running Replicate prediction.", cancelPredictionSchema, () => handler()),
    ],
  });
}

function createConfiguredServer(client: ReplicateClient, deps: { guildHallHome: string; projectName: string; contextId: string; contextType: string; eventBus: import("@/apps/daemon/lib/event-bus").EventBus }) {
  const toolDeps = {
    guildHallHome: deps.guildHallHome,
    projectName: deps.projectName,
    contextId: deps.contextId,
    contextType: deps.contextType,
    eventBus: deps.eventBus,
  };

  const generateImage = makeGenerateImageHandler(client, toolDeps);
  const editImage = makeEditImageHandler(client, toolDeps);
  const removeBackground = makeRemoveBackgroundHandler(client, toolDeps);
  const upscaleImage = makeUpscaleImageHandler(client, toolDeps);
  const listModels = makeListModelsHandler();
  const getModelParams = makeGetModelParamsHandler(client);
  const checkPrediction = makeCheckPredictionHandler(client);
  const cancelPrediction = makeCancelPredictionHandler(client);

  return createSdkMcpServer({
    name: "guild-hall-replicate",
    version: "0.1.0",
    tools: [
      tool("generate_image", "Generate an image from a text prompt using Replicate.", generateImageSchema, (args) => generateImage(args)),
      tool("edit_image", "Transform an existing image using an img2img model on Replicate.", editImageSchema, (args) => editImage(args)),
      tool("remove_background", "Remove the background from an image, producing a transparent PNG.", removeBackgroundSchema, (args) => removeBackground(args)),
      tool("upscale_image", "Increase the resolution of an existing image.", upscaleImageSchema, (args) => upscaleImage(args)),
      tool("list_models", "List available Replicate models with cost and speed metadata.", listModelsSchema, (args) => Promise.resolve(listModels(args))),
      tool("get_model_params", "Discover what parameters a specific Replicate model accepts.", getModelParamsSchema, (args) => getModelParams(args)),
      tool("check_prediction", "Check the status of a running Replicate prediction.", checkPredictionSchema, (args) => checkPrediction(args)),
      tool("cancel_prediction", "Cancel a running Replicate prediction.", cancelPredictionSchema, (args) => cancelPrediction(args)),
    ],
  });
}

// -- Factory --

export const toolboxFactory: ToolboxFactory = (deps) => {
  const token = process.env.REPLICATE_API_TOKEN;

  if (!token) {
    return { server: createUnconfiguredServer() };
  }

  const client = new ReplicateClient(token);
  return {
    server: createConfiguredServer(client, {
      guildHallHome: deps.guildHallHome,
      projectName: deps.projectName,
      contextId: deps.contextId,
      contextType: deps.contextType,
      eventBus: deps.eventBus,
    }),
  };
};
