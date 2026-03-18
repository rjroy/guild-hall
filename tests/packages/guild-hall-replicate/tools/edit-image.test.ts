import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { makeEditImageHandler } from "@/packages/guild-hall-replicate/tools/edit-image";
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

    return Promise.resolve(new Response(responseBody, { status: next.status, headers: responseHeaders }));
  };

  fn.calls = calls;
  return fn as typeof fetch & { calls: typeof calls };
}

// -- Helpers --

let tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
});

async function makeTmpDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rpl-edit-test-"));
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

async function createInputFile(dir: string): Promise<string> {
  const filePath = path.join(dir, "input.png");
  await fs.writeFile(filePath, "fake-image");
  return filePath;
}

const uploadResponse = () => ({
  status: 200,
  body: { urls: { get: "https://replicate.delivery/uploaded.png" } },
});

const succeededPrediction = () => ({
  status: 200,
  body: {
    id: "pred-edit123",
    status: "succeeded",
    output: ["https://replicate.delivery/edited.png"],
  },
});

const imageBytes = () => ({
  status: 200,
  arrayBuffer: new TextEncoder().encode("fake-edited-data").buffer as ArrayBuffer,
});

// -- Tests --

describe("edit_image handler", () => {
  test("successful edit: validates, uploads, creates prediction, downloads", async () => {
    const tmpDir = await makeTmpDir();
    const inputFile = await createInputFile(tmpDir);
    const fetchFn = mockFetch([uploadResponse(), succeededPrediction(), imageBytes()]);
    const client = new ReplicateClient("test-token", fetchFn);
    const deps = { ...makeDeps(), guildHallHome: tmpDir };
    await fs.mkdir(path.join(tmpDir, "projects", "test-project"), { recursive: true });

    const handler = makeEditImageHandler(client, deps);
    const result = await handler({ image: inputFile, prompt: "make it blue" });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.files).toHaveLength(1);
    expect(data.prediction_id).toBe("pred-edit123");
  });

  test("input file validation rejects missing files before any API call", async () => {
    const fetchFn = mockFetch([]);
    const client = new ReplicateClient("test-token", fetchFn);
    const handler = makeEditImageHandler(client, makeDeps());
    const result = await handler({ image: "/nonexistent/file.png", prompt: "test" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
    expect(fetchFn.calls).toHaveLength(0);
  });

  test("file upload happens before prediction creation", async () => {
    const tmpDir = await makeTmpDir();
    const inputFile = await createInputFile(tmpDir);
    const fetchFn = mockFetch([uploadResponse(), succeededPrediction(), imageBytes()]);
    const client = new ReplicateClient("test-token", fetchFn);
    const deps = { ...makeDeps(), guildHallHome: tmpDir };
    await fs.mkdir(path.join(tmpDir, "projects", "test-project"), { recursive: true });

    const handler = makeEditImageHandler(client, deps);
    await handler({ image: inputFile, prompt: "test" });

    // First call is upload, second is createPrediction
    const uploadUrl = fetchFn.calls[0].url as string;
    expect(uploadUrl).toContain("/v1/files");
    const predUrl = fetchFn.calls[1].url as string;
    expect(predUrl).toContain("/predictions");
  });

  test("strength parameter is passed to prediction input", async () => {
    const tmpDir = await makeTmpDir();
    const inputFile = await createInputFile(tmpDir);
    const fetchFn = mockFetch([uploadResponse(), succeededPrediction(), imageBytes()]);
    const client = new ReplicateClient("test-token", fetchFn);
    const deps = { ...makeDeps(), guildHallHome: tmpDir };
    await fs.mkdir(path.join(tmpDir, "projects", "test-project"), { recursive: true });

    const handler = makeEditImageHandler(client, deps);
    await handler({ image: inputFile, prompt: "test", strength: 0.5 });

    const body = JSON.parse(fetchFn.calls[1].init?.body as string);
    expect(body.input.strength).toBe(0.5);
  });

  test("prediction failure returns isError", async () => {
    const tmpDir = await makeTmpDir();
    const inputFile = await createInputFile(tmpDir);
    const fetchFn = mockFetch([
      uploadResponse(),
      { status: 200, body: { id: "pred-fail", status: "failed", error: "bad image" } },
    ]);
    const client = new ReplicateClient("test-token", fetchFn);

    const handler = makeEditImageHandler(client, makeDeps());
    const result = await handler({ image: inputFile, prompt: "test" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("bad image");
  });

  test("emits event on success", async () => {
    const tmpDir = await makeTmpDir();
    const inputFile = await createInputFile(tmpDir);
    const eventBus = createEventBus();
    const events: SystemEvent[] = [];
    eventBus.subscribe((e) => events.push(e));

    const fetchFn = mockFetch([uploadResponse(), succeededPrediction(), imageBytes()]);
    const client = new ReplicateClient("test-token", fetchFn);
    const deps = { ...makeDeps(eventBus), guildHallHome: tmpDir };
    await fs.mkdir(path.join(tmpDir, "projects", "test-project"), { recursive: true });

    const handler = makeEditImageHandler(client, deps);
    await handler({ image: inputFile, prompt: "test" });

    const replicateEvents = events.filter((e) => e.type === "toolbox_replicate");
    expect(replicateEvents).toHaveLength(1);
    expect((replicateEvents[0] as SystemEvent & { type: "toolbox_replicate" }).tool).toBe("edit_image");
  });
});
