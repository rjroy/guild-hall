import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { makeGenerateImageHandler } from "@/packages/guild-hall-replicate/tools/generate-image";
import { ReplicateClient } from "@/packages/guild-hall-replicate/replicate-client";
import { createEventBus } from "@/daemon/lib/event-bus";
import type { SystemEvent } from "@/daemon/lib/event-bus";

// -- Mock fetch --

interface QueuedResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  arrayBuffer?: ArrayBuffer;
}

function mockFetch(responses: QueuedResponse[]): typeof fetch & { calls: Array<{ url: string | URL | Request; init?: RequestInit }> } {
  const queue = [...responses];
  const calls: Array<{ url: string | URL | Request; init?: RequestInit }> = [];

  const fn = (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const next = queue.shift();
    if (!next) throw new Error(`mockFetch: no more responses (call #${calls.length})`);

    const responseHeaders = new Headers({ "Content-Type": "application/json", ...next.headers });
    const responseBody = next.arrayBuffer
      ? next.arrayBuffer
      : next.body !== undefined ? JSON.stringify(next.body) : null;

    return Promise.resolve(new Response(responseBody, {
      status: next.status,
      headers: responseHeaders,
    }));
  };

  fn.calls = calls;
  return fn as typeof fetch & { calls: typeof calls };
}

// -- Test helpers --

let tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
});

async function makeTmpDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rpl-gen-test-"));
  tmpDirs.push(dir);
  return dir;
}

function makeDeps(eventBus = createEventBus()) {
  return {
    guildHallHome: "/tmp/gh-test",
    projectName: "test-project",
    contextId: "commission-test",
    contextType: "mail" as const,
    eventBus,
  };
}

// Prediction responses
const succeededPrediction = (id = "pred-abc123") => ({
  status: 200,
  body: {
    id,
    status: "succeeded",
    output: ["https://replicate.delivery/output.png"],
    metrics: { predict_time: 2.5 },
  },
});

const imageBytes = () => ({
  status: 200,
  arrayBuffer: new TextEncoder().encode("fake-png-data").buffer,
});

// -- Tests --

describe("generate_image handler", () => {
  test("successful generation: correct API calls, output downloaded, response shape", async () => {
    const tmpDir = await makeTmpDir();
    const fetchFn = mockFetch([succeededPrediction(), imageBytes()]);
    const client = new ReplicateClient("test-token", fetchFn);
    const deps = { ...makeDeps(), guildHallHome: tmpDir };

    // Create integration worktree dir for resolveOutputDir fallback
    const integrationPath = path.join(tmpDir, "projects", "test-project");
    await fs.mkdir(integrationPath, { recursive: true });

    const handler = makeGenerateImageHandler(client, deps);
    const result = await handler({ prompt: "a cat" });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.files).toHaveLength(1);
    expect(data.model).toBe("black-forest-labs/flux-schnell");
    expect(data.prediction_id).toBe("pred-abc123");
    expect(data.cost_estimate).toBe("$0.003/image");
    expect(data.elapsed_ms).toBeGreaterThanOrEqual(0);

    // Verify file was downloaded
    const fileContents = await fs.readFile(data.files[0], "utf-8");
    expect(fileContents).toBe("fake-png-data");
  });

  test("model_params merging: named params override conflicting keys", async () => {
    const tmpDir = await makeTmpDir();
    const fetchFn = mockFetch([succeededPrediction(), imageBytes()]);
    const client = new ReplicateClient("test-token", fetchFn);
    const deps = { ...makeDeps(), guildHallHome: tmpDir };
    const integrationPath = path.join(tmpDir, "projects", "test-project");
    await fs.mkdir(integrationPath, { recursive: true });

    const handler = makeGenerateImageHandler(client, deps);
    await handler({
      prompt: "a dog",
      width: 512,
      model_params: { width: 1024, custom_param: "value" },
    });

    const body = JSON.parse(fetchFn.calls[0].init?.body as string);
    // Named param should override model_params
    expect(body.input.width).toBe(512);
    expect(body.input.custom_param).toBe("value");
    expect(body.input.prompt).toBe("a dog");
  });

  test("default model used when model parameter is omitted", async () => {
    const tmpDir = await makeTmpDir();
    const fetchFn = mockFetch([succeededPrediction(), imageBytes()]);
    const client = new ReplicateClient("test-token", fetchFn);
    const deps = { ...makeDeps(), guildHallHome: tmpDir };
    const integrationPath = path.join(tmpDir, "projects", "test-project");
    await fs.mkdir(integrationPath, { recursive: true });

    const handler = makeGenerateImageHandler(client, deps);
    await handler({ prompt: "test" });

    const url = fetchFn.calls[0].url as string;
    expect(url).toContain("black-forest-labs/flux-schnell");
  });

  test("custom output_filename is used", async () => {
    const tmpDir = await makeTmpDir();
    const fetchFn = mockFetch([succeededPrediction(), imageBytes()]);
    const client = new ReplicateClient("test-token", fetchFn);
    const deps = { ...makeDeps(), guildHallHome: tmpDir };
    const integrationPath = path.join(tmpDir, "projects", "test-project");
    await fs.mkdir(integrationPath, { recursive: true });

    const handler = makeGenerateImageHandler(client, deps);
    const result = await handler({ prompt: "test", output_filename: "my-image.png" });

    const data = JSON.parse(result.content[0].text);
    expect(path.basename(data.files[0])).toBe("my-image.png");
  });

  test("num_outputs > 1 downloads multiple files", async () => {
    const tmpDir = await makeTmpDir();
    const fetchFn = mockFetch([
      {
        status: 200,
        body: {
          id: "pred-abc123",
          status: "succeeded",
          output: [
            "https://replicate.delivery/output1.png",
            "https://replicate.delivery/output2.png",
          ],
        },
      },
      imageBytes(),
      imageBytes(),
    ]);
    const client = new ReplicateClient("test-token", fetchFn);
    const deps = { ...makeDeps(), guildHallHome: tmpDir };
    const integrationPath = path.join(tmpDir, "projects", "test-project");
    await fs.mkdir(integrationPath, { recursive: true });

    const handler = makeGenerateImageHandler(client, deps);
    const result = await handler({ prompt: "test", num_outputs: 2 });

    const data = JSON.parse(result.content[0].text);
    expect(data.files).toHaveLength(2);
  });

  test("prediction failure returns isError with error message and logs", async () => {
    const fetchFn = mockFetch([{
      status: 200,
      body: {
        id: "pred-fail",
        status: "failed",
        error: "NSFW content detected",
        logs: "safety filter triggered",
      },
    }]);
    const client = new ReplicateClient("test-token", fetchFn);
    const handler = makeGenerateImageHandler(client, makeDeps());
    const result = await handler({ prompt: "test" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("NSFW content detected");
    expect(result.content[0].text).toContain("safety filter triggered");
  });

  test("API error (4xx/5xx) returns isError with detail message", async () => {
    const fetchFn = mockFetch([{
      status: 404,
      body: { detail: "Model not found" },
    }]);
    const client = new ReplicateClient("test-token", fetchFn);
    const handler = makeGenerateImageHandler(client, makeDeps());
    const result = await handler({ prompt: "test", model: "unknown/model" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("list_models");
  });

  test("network error returns isError with human-readable message", async () => {
    const fetchFn = (() => { throw new Error("Connection refused"); }) as unknown as typeof fetch;
    const client = new ReplicateClient("test-token", fetchFn);
    const handler = makeGenerateImageHandler(client, makeDeps());
    const result = await handler({ prompt: "test" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Connection refused");
  });

  test("polling fallback triggers when synchronous wait returns non-terminal status", async () => {
    const tmpDir = await makeTmpDir();
    const fetchFn = mockFetch([
      // createPrediction returns "processing" (sync wait didn't finish)
      { status: 200, body: { id: "pred-abc123", status: "processing" } },
      // waitForCompletion polls once and gets succeeded
      { status: 200, body: { id: "pred-abc123", status: "succeeded", output: ["https://replicate.delivery/output.png"] } },
      // download
      imageBytes(),
    ]);
    const client = new ReplicateClient("test-token", fetchFn);
    const deps = { ...makeDeps(), guildHallHome: tmpDir };
    const integrationPath = path.join(tmpDir, "projects", "test-project");
    await fs.mkdir(integrationPath, { recursive: true });

    const handler = makeGenerateImageHandler(client, deps);
    const result = await handler({ prompt: "test" });

    expect(result.isError).toBeUndefined();
    // 3 calls: createPrediction, getPrediction (poll), downloadFile
    expect(fetchFn.calls).toHaveLength(3);
  });

  test("cost estimate is 'unknown' for unregistered models", async () => {
    const tmpDir = await makeTmpDir();
    const fetchFn = mockFetch([succeededPrediction(), imageBytes()]);
    const client = new ReplicateClient("test-token", fetchFn);
    const deps = { ...makeDeps(), guildHallHome: tmpDir };
    const integrationPath = path.join(tmpDir, "projects", "test-project");
    await fs.mkdir(integrationPath, { recursive: true });

    const handler = makeGenerateImageHandler(client, deps);
    const result = await handler({ prompt: "test", model: "custom/model" });

    const data = JSON.parse(result.content[0].text);
    expect(data.cost_estimate).toBe("unknown");
  });

  test("successful generation emits toolbox_replicate event", async () => {
    const tmpDir = await makeTmpDir();
    const eventBus = createEventBus();
    const events: SystemEvent[] = [];
    eventBus.subscribe((e) => events.push(e));

    const fetchFn = mockFetch([succeededPrediction(), imageBytes()]);
    const client = new ReplicateClient("test-token", fetchFn);
    const deps = { ...makeDeps(eventBus), guildHallHome: tmpDir };
    const integrationPath = path.join(tmpDir, "projects", "test-project");
    await fs.mkdir(integrationPath, { recursive: true });

    const handler = makeGenerateImageHandler(client, deps);
    await handler({ prompt: "test" });

    const replicateEvents = events.filter((e) => e.type === "toolbox_replicate");
    expect(replicateEvents).toHaveLength(1);
    const evt = replicateEvents[0] as SystemEvent & { type: "toolbox_replicate" };
    expect(evt.tool).toBe("generate_image");
    expect(evt.model).toBe("black-forest-labs/flux-schnell");
    expect(evt.projectName).toBe("test-project");
    expect(evt.contextId).toBe("commission-test");
    expect(evt.files).toHaveLength(1);
  });

  test("failed generation does not emit event", async () => {
    const eventBus = createEventBus();
    const events: SystemEvent[] = [];
    eventBus.subscribe((e) => events.push(e));

    const fetchFn = mockFetch([{
      status: 200,
      body: { id: "pred-fail", status: "failed", error: "out of memory" },
    }]);
    const client = new ReplicateClient("test-token", fetchFn);
    const handler = makeGenerateImageHandler(client, makeDeps(eventBus));
    await handler({ prompt: "test" });

    expect(events.filter((e) => e.type === "toolbox_replicate")).toHaveLength(0);
  });
});
