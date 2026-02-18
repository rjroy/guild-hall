/**
 * Integration tests for dispatch handler with agent spawn.
 *
 * Tests the wiring between createDefaultWorkerHandlers (with dispatchDeps)
 * and the fire-and-forget agent lifecycle: dispatch spawns an agent,
 * agent completion updates the job, agent failure sets error, and cancel
 * aborts the running agent.
 */
import { describe, expect, it, mock } from "bun:test";

import { createDefaultWorkerHandlers } from "@/guild-members/researcher/server";
import type { WorkerDispatchDeps } from "@/guild-members/researcher/server";
import { createJobStore } from "@/guild-members/researcher/job-store";
import type { JobStoreFs, JobStoreDeps } from "@/guild-members/researcher/job-store";
import type { FullMemoryStore } from "@/guild-members/researcher/memory";
import type { QueryFn } from "@/lib/agent";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

// -- Mock SDK message factories --

function makeSuccessResult(resultText: string, sessionId = "worker-session-1"): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    duration_ms: 500,
    duration_api_ms: 400,
    is_error: false,
    num_turns: 1,
    result: resultText,
    stop_reason: "end_turn",
    total_cost_usd: 0.02,
    usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    modelUsage: {},
    permission_denials: [],
    uuid: "00000000-0000-0000-0000-000000000001",
    session_id: sessionId,
  } as unknown as SDKMessage;
}

function makeInitMessage(sessionId = "worker-session-1"): SDKMessage {
  return {
    type: "system",
    subtype: "init",
    session_id: sessionId,
    uuid: "00000000-0000-0000-0000-000000000002",
    agents: [],
    apiKeySource: "user",
    betas: [],
    claude_code_version: "2.1.45",
    cwd: "/tmp",
    tools: [],
    mcp_servers: [],
    model: "claude-sonnet-4-5-20250929",
    permissionMode: "bypassPermissions",
  } as unknown as SDKMessage;
}

// -- Mock query function factories --

function createMockQueryFn(messages: SDKMessage[]): QueryFn {
  return () => {
    async function* generator() {
      for (const msg of messages) {
        yield await Promise.resolve(msg);
      }
    }
    const gen = generator();
    (gen as unknown as Record<string, unknown>).interrupt = () => Promise.resolve();
    (gen as unknown as Record<string, unknown>).close = () => {};
    return gen as ReturnType<QueryFn>;
  };
}

function createErrorQueryFn(errorMessage: string): QueryFn {
  return () => {
    async function* generator(): AsyncGenerator<SDKMessage> {
      throw new Error(errorMessage);
    }
    const gen = generator();
    (gen as unknown as Record<string, unknown>).interrupt = () => Promise.resolve();
    (gen as unknown as Record<string, unknown>).close = () => {};
    return gen as ReturnType<QueryFn>;
  };
}

/**
 * Creates a queryFn that blocks until signaled. Useful for testing
 * cancellation of a running agent.
 */
function createBlockingQueryFn(): {
  queryFn: QueryFn;
  unblock: () => void;
  abortSignals: AbortSignal[];
} {
  let resolveBlock: (() => void) | undefined;
  const abortSignals: AbortSignal[] = [];

  const queryFn: QueryFn = (params) => {
    // Capture the abort controller's signal from the options
    const opts = params.options as Record<string, unknown> | undefined;
    if (opts?.abortController instanceof AbortController) {
      abortSignals.push(opts.abortController.signal);
    }

    async function* generator() {
      yield await Promise.resolve(makeInitMessage());
      // Block here until unblocked or aborted
      await new Promise<void>((resolve) => {
        resolveBlock = resolve;
      });
      yield makeSuccessResult("Completed after unblock");
    }
    const gen = generator();
    (gen as unknown as Record<string, unknown>).interrupt = () => Promise.resolve();
    (gen as unknown as Record<string, unknown>).close = () => {};
    return gen as ReturnType<QueryFn>;
  };

  return {
    queryFn,
    unblock: () => resolveBlock?.(),
    abortSignals,
  };
}

// -- In-memory filesystem mock (same pattern as other handler tests) --

function createMemoryFs(): JobStoreFs & { files: Map<string, string> } {
  const files = new Map<string, string>();

  function isDir(path: string): boolean {
    const dirKey = path.endsWith("/") ? path : path + "/";
    return files.has(dirKey);
  }

  return {
    files,

    async mkdir(path: string, _opts?: { recursive?: boolean }) {
      const dirKey = path.endsWith("/") ? path : path + "/";
      files.set(dirKey, "");
    },

    async writeFile(path: string, content: string) {
      files.set(path, content);
    },

    async readFile(path: string) {
      const content = files.get(path);
      if (content === undefined) {
        throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
      }
      return content;
    },

    async readdir(path: string) {
      const prefix = path.endsWith("/") ? path : path + "/";
      const entries = new Set<string>();
      for (const key of files.keys()) {
        if (key.startsWith(prefix) && key !== prefix) {
          const rest = key.slice(prefix.length);
          const segment = rest.split("/")[0];
          entries.add(segment);
        }
      }
      if (entries.size === 0 && !isDir(path)) {
        throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
      }
      return Array.from(entries);
    },

    async rm(path: string, _opts?: { recursive?: boolean; force?: boolean }) {
      const prefix = path.endsWith("/") ? path : path + "/";
      for (const key of Array.from(files.keys())) {
        if (key === path || key.startsWith(prefix)) {
          files.delete(key);
        }
      }
    },

    async stat(path: string) {
      if (isDir(path)) {
        return { isDirectory: () => true };
      }
      if (files.has(path)) {
        return { isDirectory: () => false };
      }
      throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
    },

    async access(path: string) {
      const dirKey = path.endsWith("/") ? path : path + "/";
      if (!files.has(path) && !files.has(dirKey)) {
        throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
      }
    },
  };
}

// -- Test helpers --

let uuidCounter = 0;

function createTestDeps(): {
  deps: JobStoreDeps;
  fs: ReturnType<typeof createMemoryFs>;
} {
  const memFs = createMemoryFs();
  uuidCounter = 0;

  return {
    fs: memFs,
    deps: {
      fs: memFs,
      clock: { now: () => "2026-02-17T12:00:00Z" },
      randomUUID: () => {
        uuidCounter++;
        return `job-${uuidCounter}`;
      },
    },
  };
}

function createMockMemoryStore(): FullMemoryStore {
  return {
    storeMemory: mock(() => Promise.resolve()),
    getTotalMemorySize: mock(() => Promise.resolve(0)),
    triggerCompaction: mock(() => {}),
    loadMemories: mock(() => Promise.resolve("")),
    compactMemories: mock(() => Promise.resolve()),
  };
}

const JOBS_DIR = "/tmp/test-dispatch-jobs";

/** Small delay for fire-and-forget promises to settle. */
function settle(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// -- Tests --

describe("dispatch with agent spawn", () => {
  it("creates job and returns jobId immediately", async () => {
    const { deps } = createTestDeps();
    const store = createJobStore(JOBS_DIR, deps);
    const memoryStore = createMockMemoryStore();

    const dispatchDeps: WorkerDispatchDeps = {
      queryFn: createMockQueryFn([
        makeInitMessage(),
        makeSuccessResult("Report"),
      ]),
      memoryStore,
      clock: { now: () => "2026-02-17T12:00:00Z" },
    };

    const handlers = createDefaultWorkerHandlers(store, dispatchDeps);
    const result = await handlers["worker/dispatch"]({
      description: "Research AI safety",
      task: "Find papers on alignment",
    });

    const typedResult = result as { jobId: string };
    expect(typedResult.jobId).toBe("job-1");
  });

  it("agent completion updates job status to completed and writes result", async () => {
    const { deps, fs } = createTestDeps();
    const store = createJobStore(JOBS_DIR, deps);
    const memoryStore = createMockMemoryStore();

    const dispatchDeps: WorkerDispatchDeps = {
      queryFn: createMockQueryFn([
        makeInitMessage(),
        makeSuccessResult("Final research output here"),
      ]),
      memoryStore,
      clock: { now: () => "2026-02-17T13:00:00Z" },
    };

    const handlers = createDefaultWorkerHandlers(store, dispatchDeps);
    await handlers["worker/dispatch"]({
      description: "Research AI safety",
      task: "Find papers on alignment",
    });

    // Wait for fire-and-forget agent to complete
    await settle();

    // Verify job was updated to completed
    const meta = JSON.parse(
      fs.files.get(`${JOBS_DIR}/job-1/meta.json`)!,  // eslint-disable-line @typescript-eslint/no-non-null-assertion -- test verifies file exists
    ) as Record<string, unknown>;
    expect(meta.status).toBe("completed");
    expect(meta.completedAt).toBe("2026-02-17T13:00:00Z");

    // Verify result was written
    const resultContent = fs.files.get(`${JOBS_DIR}/job-1/result.md`);
    expect(resultContent).toBe("Final research output here");
  });

  it("agent failure updates job status to failed with error in meta", async () => {
    const { deps, fs } = createTestDeps();
    const store = createJobStore(JOBS_DIR, deps);
    const memoryStore = createMockMemoryStore();

    const dispatchDeps: WorkerDispatchDeps = {
      queryFn: createErrorQueryFn("Rate limit exceeded"),
      memoryStore,
      clock: { now: () => "2026-02-17T13:00:00Z" },
    };

    const handlers = createDefaultWorkerHandlers(store, dispatchDeps);
    await handlers["worker/dispatch"]({
      description: "Research AI safety",
      task: "Find papers",
    });

    // Wait for fire-and-forget agent to fail
    await settle();

    // Verify job was updated to failed
    const meta = JSON.parse(
      fs.files.get(`${JOBS_DIR}/job-1/meta.json`)!,  // eslint-disable-line @typescript-eslint/no-non-null-assertion -- test verifies file exists
    ) as Record<string, unknown>;
    expect(meta.status).toBe("failed");
    expect(meta.error).toBe("Rate limit exceeded");
  });

  it("cancel calls abortController.abort() on running agent", async () => {
    const { deps } = createTestDeps();
    const store = createJobStore(JOBS_DIR, deps);
    const memoryStore = createMockMemoryStore();

    const { queryFn, abortSignals } = createBlockingQueryFn();

    const dispatchDeps: WorkerDispatchDeps = {
      queryFn,
      memoryStore,
      clock: { now: () => "2026-02-17T13:00:00Z" },
    };

    const handlers = createDefaultWorkerHandlers(store, dispatchDeps);
    await handlers["worker/dispatch"]({
      description: "Long running research",
      task: "Research everything",
    });

    // Give the agent time to start and register the abort controller
    await settle(20);

    // Verify we have an abort signal
    expect(abortSignals).toHaveLength(1);
    expect(abortSignals[0].aborted).toBe(false);

    // Cancel the job
    await handlers["worker/cancel"]({ jobId: "job-1" });

    // The abort signal should now be aborted
    expect(abortSignals[0].aborted).toBe(true);
  });

  it("loads memories and passes to system prompt", async () => {
    const { deps } = createTestDeps();
    const store = createJobStore(JOBS_DIR, deps);
    const memoryStore = createMockMemoryStore();
    (memoryStore.loadMemories as ReturnType<typeof mock>).mockReturnValue(
      Promise.resolve("Prior finding: API uses OAuth2"),
    );

    let capturedPrompt = "";
    const capturingQueryFn: QueryFn = (params) => {
      const opts = params.options as Record<string, unknown>;
      capturedPrompt = opts.systemPrompt as string;
      return createMockQueryFn([
        makeInitMessage(),
        makeSuccessResult("Report"),
      ])(params);
    };

    const dispatchDeps: WorkerDispatchDeps = {
      queryFn: capturingQueryFn,
      memoryStore,
      clock: { now: () => "2026-02-17T13:00:00Z" },
    };

    const handlers = createDefaultWorkerHandlers(store, dispatchDeps);
    await handlers["worker/dispatch"]({
      description: "Follow-up research",
      task: "Expand on OAuth2 findings",
    });

    await settle();

    expect(memoryStore.loadMemories).toHaveBeenCalledWith(8000);
    expect(capturedPrompt).toContain("Prior finding: API uses OAuth2");
  });

  it("dispatch without dispatchDeps does not spawn agent", async () => {
    const { deps, fs } = createTestDeps();
    const store = createJobStore(JOBS_DIR, deps);

    // No dispatchDeps: handlers without agent spawn
    const handlers = createDefaultWorkerHandlers(store);
    const result = await handlers["worker/dispatch"]({
      description: "Research task",
      task: "Find stuff",
    });

    const typedResult = result as { jobId: string };
    expect(typedResult.jobId).toBe("job-1");

    await settle();

    // Job should remain "running" (no agent to complete it)
    const meta = JSON.parse(
      fs.files.get(`${JOBS_DIR}/job-1/meta.json`)!,  // eslint-disable-line @typescript-eslint/no-non-null-assertion -- test verifies file exists
    ) as Record<string, unknown>;
    expect(meta.status).toBe("running");
  });

  it("passes config through to agent (maxTurns override)", async () => {
    const { deps } = createTestDeps();
    const store = createJobStore(JOBS_DIR, deps);
    const memoryStore = createMockMemoryStore();

    let capturedMaxTurns: number | undefined;
    const capturingQueryFn: QueryFn = (params) => {
      const opts = params.options as Record<string, unknown>;
      capturedMaxTurns = opts.maxTurns as number;
      return createMockQueryFn([
        makeInitMessage(),
        makeSuccessResult("Report"),
      ])(params);
    };

    const dispatchDeps: WorkerDispatchDeps = {
      queryFn: capturingQueryFn,
      memoryStore,
      clock: { now: () => "2026-02-17T13:00:00Z" },
    };

    const handlers = createDefaultWorkerHandlers(store, dispatchDeps);
    await handlers["worker/dispatch"]({
      description: "Research task",
      task: "Find stuff",
      config: { maxTurns: 15 },
    });

    await settle();

    expect(capturedMaxTurns).toBe(15);
  });
});
