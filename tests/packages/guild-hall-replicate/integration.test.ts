/**
 * Integration tests for the Replicate toolbox.
 *
 * Gated behind REPLICATE_INTEGRATION_TESTS=true. When absent, all tests skip.
 * Requires REPLICATE_API_TOKEN to be set.
 *
 * These tests make real API calls:
 * - Test 1: generate_image with flux-schnell (~$0.003)
 * - Test 2: get_model_params (free, read-only)
 * - Test 3: check_prediction using Test 1's prediction ID (free, read-only)
 *
 * Tests run sequentially because Test 3 depends on Test 1's output.
 * Total cost per run: ~$0.003.
 */

import { describe, test, expect, afterAll } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ReplicateClient } from "@/packages/guild-hall-replicate/replicate-client";
import { makeGenerateImageHandler } from "@/packages/guild-hall-replicate/tools/generate-image";
import { makeGetModelParamsHandler } from "@/packages/guild-hall-replicate/tools/get-model-params";
import { makeCheckPredictionHandler } from "@/packages/guild-hall-replicate/tools/check-prediction";
import { createEventBus } from "@/daemon/lib/event-bus";

const ENABLED = process.env.REPLICATE_INTEGRATION_TESTS === "true";
const TOKEN = process.env.REPLICATE_API_TOKEN ?? "";

const describeIntegration = ENABLED ? describe : describe.skip;

// Shared state across sequential tests
let predictionId: string;
let outputDir: string;

describeIntegration("Replicate integration (live API)", () => {
  afterAll(async () => {
    if (outputDir) {
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  });

  test("generate_image end-to-end with flux-schnell", async () => {
    outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "rpl-integration-"));
    const client = new ReplicateClient(TOKEN);
    const eventBus = createEventBus();

    // Point output at our temp dir by using it as guildHallHome
    // and creating the expected project directory structure
    const projectDir = path.join(outputDir, "projects", "integration-test");
    await fs.mkdir(projectDir, { recursive: true });

    const handler = makeGenerateImageHandler(client, {
      guildHallHome: outputDir,
      projectName: "integration-test",
      contextId: "integration-test",
      contextType: "mail",
      eventBus,
    });

    const result = await handler({
      prompt: "a small red circle on a white background",
      model: "black-forest-labs/flux-schnell",
      num_outputs: 1,
    });

    expect(result.isError).toBeUndefined();

    const data = JSON.parse(result.content[0].text);
    expect(data.prediction_id).toBeTruthy();
    expect(data.cost_estimate).toBeTruthy();
    expect(data.elapsed_ms).toBeGreaterThan(0);
    expect(data.files).toHaveLength(1);

    // Verify the file exists on disk and has content
    const stat = await fs.stat(data.files[0]);
    expect(stat.size).toBeGreaterThan(0);

    // Store prediction ID for Test 3
    predictionId = data.prediction_id;
  }, 120_000); // 2-minute timeout for API call

  test("get_model_params for flux-schnell (free)", async () => {
    const client = new ReplicateClient(TOKEN);
    const handler = makeGetModelParamsHandler(client);

    const result = await handler({ model: "black-forest-labs/flux-schnell" });

    expect(result.isError).toBeUndefined();

    const data = JSON.parse(result.content[0].text);
    expect(data.model).toBe("black-forest-labs/flux-schnell");
    expect(data.parameters.length).toBeGreaterThan(0);

    // The prompt parameter should always exist
    const promptParam = data.parameters.find(
      (p: { name: string }) => p.name === "prompt",
    );
    expect(promptParam).toBeTruthy();
    expect(promptParam.type).toBe("string");
  }, 30_000);

  test("check_prediction using prediction ID from generate_image (free)", async () => {
    expect(predictionId).toBeTruthy();

    const client = new ReplicateClient(TOKEN);
    const handler = makeCheckPredictionHandler(client);

    const result = await handler({ prediction_id: predictionId });

    expect(result.isError).toBeUndefined();

    const data = JSON.parse(result.content[0].text);
    expect(data.prediction_id).toBe(predictionId);
    expect(data.status).toBe("succeeded");
    expect(data.output).toBeTruthy();
  }, 30_000);
});
