import { describe, test, expect } from "bun:test";
import { makeListModelsHandler } from "@/packages/guild-hall-replicate/tools/list-models";
import { makeGetModelParamsHandler } from "@/packages/guild-hall-replicate/tools/get-model-params";
import { makeCheckPredictionHandler } from "@/packages/guild-hall-replicate/tools/check-prediction";
import { makeCancelPredictionHandler } from "@/packages/guild-hall-replicate/tools/cancel-prediction";
import { ReplicateClient } from "@/packages/guild-hall-replicate/replicate-client";

// -- Mock fetch --

interface QueuedResponse {
  status: number;
  body?: unknown;
}

function mockFetch(responses: QueuedResponse[]): typeof fetch & { calls: Array<{ url: string | URL | Request; init?: RequestInit }> } {
  const queue = [...responses];
  const calls: Array<{ url: string | URL | Request; init?: RequestInit }> = [];

  const fn = (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const next = queue.shift();
    if (!next) throw new Error(`mockFetch: no more responses (call #${calls.length})`);

    return Promise.resolve(new Response(
      next.body !== undefined ? JSON.stringify(next.body) : null,
      { status: next.status, headers: new Headers({ "Content-Type": "application/json" }) },
    ));
  };

  fn.calls = calls;
  return fn as typeof fetch & { calls: typeof calls };
}

// -- Tests --

describe("list_models handler", () => {
  test("returns all models with no filter", async () => {
    const handler = makeListModelsHandler();
    const result = await handler({});

    const data = JSON.parse(result.content[0].text);
    expect(data.models.length).toBeGreaterThanOrEqual(7);
    expect(data.count).toBe(data.models.length);
  });

  test("filters by capability", async () => {
    const handler = makeListModelsHandler();
    const result = await handler({ capability: "text-to-image" });

    const data = JSON.parse(result.content[0].text);
    for (const model of data.models) {
      expect(model.capability).toBe("text-to-image");
    }
    expect(data.count).toBeGreaterThan(0);
  });

  test("unknown capability returns empty array", async () => {
    const handler = makeListModelsHandler();
    const result = await handler({ capability: "nonexistent" });

    const data = JSON.parse(result.content[0].text);
    expect(data.models).toHaveLength(0);
    expect(data.count).toBe(0);
  });
});

describe("get_model_params handler", () => {
  test("parses version schema into parameter array", async () => {
    const fetchFn = mockFetch([{
      status: 200,
      body: {
        results: [{
          id: "v1",
          openapi_schema: {
            components: {
              schemas: {
                Input: {
                  properties: {
                    prompt: { type: "string", description: "Text prompt", "x-order": 0 },
                    width: { type: "integer", description: "Width", default: 1024, minimum: 64, maximum: 4096, "x-order": 1 },
                    style: { type: "string", enum: ["natural", "vivid"], "x-order": 2 },
                  },
                },
              },
            },
          },
        }],
      },
    }]);
    const client = new ReplicateClient("test-token", fetchFn);
    const handler = makeGetModelParamsHandler(client);
    const result = await handler({ model: "owner/model" });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.parameters).toHaveLength(3);
    expect(data.parameters[0].name).toBe("prompt");
    expect(data.parameters[1].name).toBe("width");
    expect(data.parameters[1].minimum).toBe(64);
    expect(data.parameters[2].enum).toEqual(["natural", "vivid"]);
  });

  test("returns error for model with no versions", async () => {
    const fetchFn = mockFetch([{
      status: 200,
      body: { results: [] },
    }]);
    const client = new ReplicateClient("test-token", fetchFn);
    const handler = makeGetModelParamsHandler(client);
    const result = await handler({ model: "owner/model" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("No versions found");
  });

  test("returns error for invalid model format", async () => {
    const fetchFn = mockFetch([]);
    const client = new ReplicateClient("test-token", fetchFn);
    const handler = makeGetModelParamsHandler(client);
    const result = await handler({ model: "badmodel" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid model format");
  });
});

describe("check_prediction handler", () => {
  test("returns status and output for succeeded prediction", async () => {
    const fetchFn = mockFetch([{
      status: 200,
      body: {
        id: "pred-1",
        status: "succeeded",
        output: ["https://replicate.delivery/img.png"],
        metrics: { predict_time: 2.1 },
        created_at: "2026-01-01T00:00:00Z",
        started_at: "2026-01-01T00:00:01Z",
        completed_at: "2026-01-01T00:00:03Z",
      },
    }]);
    const client = new ReplicateClient("test-token", fetchFn);
    const handler = makeCheckPredictionHandler(client);
    const result = await handler({ prediction_id: "pred-1" });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.status).toBe("succeeded");
    expect(data.output).toEqual(["https://replicate.delivery/img.png"]);
    expect(data.prediction_id).toBe("pred-1");
    expect(data.elapsed_seconds).toBe(2);
  });

  test("returns status and error for failed prediction", async () => {
    const fetchFn = mockFetch([{
      status: 200,
      body: {
        id: "pred-2",
        status: "failed",
        error: "out of memory",
      },
    }]);
    const client = new ReplicateClient("test-token", fetchFn);
    const handler = makeCheckPredictionHandler(client);
    const result = await handler({ prediction_id: "pred-2" });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.status).toBe("failed");
    expect(data.error).toBe("out of memory");
  });

  test("API error returns isError", async () => {
    const fetchFn = mockFetch([{ status: 404, body: { detail: "Prediction not found" } }]);
    const client = new ReplicateClient("test-token", fetchFn);
    const handler = makeCheckPredictionHandler(client);
    const result = await handler({ prediction_id: "nonexistent" });

    expect(result.isError).toBe(true);
  });
});

describe("cancel_prediction handler", () => {
  test("sends POST and returns canceled status", async () => {
    const fetchFn = mockFetch([{
      status: 200,
      body: { id: "pred-1", status: "canceled" },
    }]);
    const client = new ReplicateClient("test-token", fetchFn);
    const handler = makeCancelPredictionHandler(client);
    const result = await handler({ prediction_id: "pred-1" });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.prediction_id).toBe("pred-1");
    expect(data.status).toBe("canceled");

    // Verify POST to correct endpoint
    const url = fetchFn.calls[0].url as string;
    expect(url).toContain("/predictions/pred-1/cancel");
  });

  test("API error returns isError", async () => {
    const fetchFn = mockFetch([{ status: 404, body: { detail: "Not found" } }]);
    const client = new ReplicateClient("test-token", fetchFn);
    const handler = makeCancelPredictionHandler(client);
    const result = await handler({ prediction_id: "nonexistent" });

    expect(result.isError).toBe(true);
  });
});
