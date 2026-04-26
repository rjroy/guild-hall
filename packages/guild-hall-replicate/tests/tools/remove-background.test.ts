import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { makeRemoveBackgroundHandler } from "@/packages/guild-hall-replicate/tools/remove-background";
import { ReplicateClient } from "@/packages/guild-hall-replicate/replicate-client";
import { createEventBus } from "@/apps/daemon/lib/event-bus";
import type { SystemEvent } from "@/apps/daemon/lib/event-bus";

// -- Mock fetch --

interface QueuedResponse {
  status: number;
  body?: unknown;
  arrayBuffer?: ArrayBuffer;
}

function mockFetch(responses: QueuedResponse[]): typeof fetch & { calls: Array<{ url: string | URL | Request; init?: RequestInit }> } {
  const queue = [...responses];
  const calls: Array<{ url: string | URL | Request; init?: RequestInit }> = [];

  const fn = (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const next = queue.shift();
    if (!next) throw new Error(`mockFetch: no more responses (call #${calls.length})`);

    const responseBody = next.arrayBuffer
      ? next.arrayBuffer
      : next.body !== undefined ? JSON.stringify(next.body) : null;

    return Promise.resolve(new Response(responseBody, {
      status: next.status,
      headers: new Headers({ "Content-Type": "application/json" }),
    }));
  };

  fn.calls = calls;
  return fn as typeof fetch & { calls: typeof calls };
}

let tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
});

async function makeTmpDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rpl-rmbg-test-"));
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

describe("remove_background handler", () => {
  test("successful removal: validates, uploads, downloads output", async () => {
    const tmpDir = await makeTmpDir();
    const inputFile = await createInputFile(tmpDir);
    const fetchFn = mockFetch([
      { status: 200, body: { urls: { get: "https://replicate.delivery/uploaded.png" } } },
      { status: 200, body: { id: "pred-bg123", status: "succeeded", output: "https://replicate.delivery/nobg.png" } },
      { status: 200, arrayBuffer: new TextEncoder().encode("transparent-data").buffer },
    ]);
    const client = new ReplicateClient("test-token", fetchFn);
    const deps = { ...makeDeps(), guildHallHome: tmpDir };
    await fs.mkdir(path.join(tmpDir, "projects", "test-project"), { recursive: true });

    const handler = makeRemoveBackgroundHandler(client, deps);
    const result = await handler({ image: inputFile });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.file).toBeTruthy();
    expect(data.prediction_id).toBe("pred-bg123");
    expect(data.model).toBe("lucataco/remove-bg");
  });

  test("rejects missing input file before any API call", async () => {
    const fetchFn = mockFetch([]);
    const client = new ReplicateClient("test-token", fetchFn);
    const handler = makeRemoveBackgroundHandler(client, makeDeps());
    const result = await handler({ image: "/nonexistent/file.png" });

    expect(result.isError).toBe(true);
    expect(fetchFn.calls).toHaveLength(0);
  });

  test("emits event on success", async () => {
    const tmpDir = await makeTmpDir();
    const inputFile = await createInputFile(tmpDir);
    const eventBus = createEventBus();
    const events: SystemEvent[] = [];
    eventBus.subscribe((e) => events.push(e));

    const fetchFn = mockFetch([
      { status: 200, body: { urls: { get: "https://replicate.delivery/uploaded.png" } } },
      { status: 200, body: { id: "pred-bg123", status: "succeeded", output: "https://replicate.delivery/nobg.png" } },
      { status: 200, arrayBuffer: new TextEncoder().encode("data").buffer },
    ]);
    const client = new ReplicateClient("test-token", fetchFn);
    const deps = { ...makeDeps(eventBus), guildHallHome: tmpDir };
    await fs.mkdir(path.join(tmpDir, "projects", "test-project"), { recursive: true });

    const handler = makeRemoveBackgroundHandler(client, deps);
    await handler({ image: inputFile });

    const replicateEvents = events.filter((e) => e.type === "toolbox_replicate");
    expect(replicateEvents).toHaveLength(1);
    expect((replicateEvents[0] as SystemEvent & { type: "toolbox_replicate" }).tool).toBe("remove_background");
  });
});
