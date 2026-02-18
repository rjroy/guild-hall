import { describe, expect, it } from "bun:test";

import { createHandlers, HandlerError } from "@/guild-members/researcher/handlers";
import { createJobStore } from "@/guild-members/researcher/job-store";
import type { JobStoreFs, JobStoreDeps } from "@/guild-members/researcher/job-store";

// -- In-memory filesystem mock (same pattern as handlers-dispatch-list.test.ts) --

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

const JOBS_DIR = "/tmp/test-jobs";

// -- Tests --

describe("handlers", () => {
  describe("status", () => {
    it("returns all fields for a running job", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await store.createJob("Research AI safety", "Find papers");

      const result = await handlers.status({ jobId: "job-1" });

      expect(result.jobId).toBe("job-1");
      expect(result.status).toBe("running");
      expect(result.description).toBe("Research AI safety");
      expect(result.summary).toBeNull();
      expect(result.questions).toBeNull();
      expect(result.decisions).toBeNull();
      expect(result.error).toBeNull();
      expect(result.startedAt).toBe("2026-02-17T12:00:00Z");
      expect(result.completedAt).toBeNull();
    });

    it("returns all fields for a completed job", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await store.createJob("Research AI safety", "Find papers");
      await store.updateStatus("job-1", "completed", "2026-02-17T13:00:00Z");
      await store.writeSummary("job-1", "Found 5 relevant papers");

      const result = await handlers.status({ jobId: "job-1" });

      expect(result.jobId).toBe("job-1");
      expect(result.status).toBe("completed");
      expect(result.summary).toBe("Found 5 relevant papers");
      expect(result.completedAt).toBe("2026-02-17T13:00:00Z");
    });

    it("includes questions when present", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await store.createJob("Research task", "Do work");
      await store.appendQuestion("job-1", "Should I include pre-2020 papers?");
      await store.appendQuestion("job-1", "Is survey data acceptable?");

      const result = await handlers.status({ jobId: "job-1" });

      expect(result.questions).toEqual([
        "Should I include pre-2020 papers?",
        "Is survey data acceptable?",
      ]);
    });

    it("includes decisions when present", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await store.createJob("Research task", "Do work");
      await store.appendDecision("job-1", {
        question: "Which database to use?",
        decision: "PostgreSQL",
        reasoning: "Better JSON support for our use case",
      });

      const result = await handlers.status({ jobId: "job-1" });

      expect(result.decisions).toEqual([
        {
          question: "Which database to use?",
          decision: "PostgreSQL",
          reasoning: "Better JSON support for our use case",
        },
      ]);
    });

    it("includes error for failed jobs", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await store.createJob("Research task", "Do work");
      await store.setError("job-1", "Rate limit exceeded");

      const result = await handlers.status({ jobId: "job-1" });

      expect(result.status).toBe("failed");
      expect(result.error).toBe("Rate limit exceeded");
    });

    it("throws HandlerError with code -32602 for unknown jobId", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      try {
        await handlers.status({ jobId: "nonexistent" });
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(HandlerError);
        const handlerErr = err as HandlerError;
        expect(handlerErr.code).toBe(-32602);
        expect(handlerErr.message).toBe("Unknown job ID: nonexistent");
      }
    });
  });

  describe("result", () => {
    it("returns output and artifacts for a completed job", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await store.createJob("Research task", "Do work");
      await store.writeResult("job-1", "Here are the findings...", [
        "report.pdf",
        "data.csv",
      ]);
      await store.updateStatus("job-1", "completed");

      const result = await handlers.result({ jobId: "job-1" });

      expect(result.jobId).toBe("job-1");
      expect(result.output).toBe("Here are the findings...");
      expect(result.artifacts).toEqual(["report.pdf", "data.csv"]);
    });

    it("returns null artifacts when no artifacts exist", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await store.createJob("Research task", "Do work");
      await store.writeResult("job-1", "Simple output, no files");
      await store.updateStatus("job-1", "completed");

      const result = await handlers.result({ jobId: "job-1" });

      expect(result.jobId).toBe("job-1");
      expect(result.output).toBe("Simple output, no files");
      expect(result.artifacts).toBeNull();
    });

    it("throws HandlerError on running job", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await store.createJob("Research task", "Do work");

      try {
        await handlers.result({ jobId: "job-1" });
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(HandlerError);
        const handlerErr = err as HandlerError;
        expect(handlerErr.code).toBe(-32602);
        expect(handlerErr.message).toBe("Job is still running");
      }
    });

    it("throws HandlerError on cancelled job", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await store.createJob("Research task", "Do work");
      await store.updateStatus("job-1", "cancelled");

      try {
        await handlers.result({ jobId: "job-1" });
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(HandlerError);
        const handlerErr = err as HandlerError;
        expect(handlerErr.code).toBe(-32602);
        expect(handlerErr.message).toBe("Job was cancelled");
      }
    });

    it("throws HandlerError on failed job with error message", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await store.createJob("Research task", "Do work");
      await store.setError("job-1", "Timeout after 600s");

      try {
        await handlers.result({ jobId: "job-1" });
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(HandlerError);
        const handlerErr = err as HandlerError;
        expect(handlerErr.code).toBe(-32602);
        expect(handlerErr.message).toBe("Job failed: Timeout after 600s");
      }
    });

    it("throws HandlerError on failed job without error message", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await store.createJob("Research task", "Do work");
      await store.updateStatus("job-1", "failed");

      try {
        await handlers.result({ jobId: "job-1" });
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(HandlerError);
        const handlerErr = err as HandlerError;
        expect(handlerErr.code).toBe(-32602);
        expect(handlerErr.message).toBe("Job failed: unknown error");
      }
    });

    it("throws HandlerError with code -32602 for unknown jobId", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      try {
        await handlers.result({ jobId: "nonexistent" });
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(HandlerError);
        const handlerErr = err as HandlerError;
        expect(handlerErr.code).toBe(-32602);
        expect(handlerErr.message).toBe("Unknown job ID: nonexistent");
      }
    });
  });
});
