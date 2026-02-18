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
  describe("cancel", () => {
    it("updates a running job to cancelled with completedAt", async () => {
      const { deps, fs } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await store.createJob("Research AI safety", "Find papers");

      const result = await handlers.cancel({ jobId: "job-1" });

      expect(result).toEqual({ jobId: "job-1", status: "cancelled" });

      // Verify meta.json was updated
      const meta = JSON.parse(
        fs.files.get(`${JOBS_DIR}/job-1/meta.json`)!,  // eslint-disable-line @typescript-eslint/no-non-null-assertion -- test verifies file exists
      ) as Record<string, unknown>;
      expect(meta.status).toBe("cancelled");
      expect(meta.completedAt).toBe("2026-02-17T12:00:00Z");
    });

    it("updates a failed job to cancelled", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await store.createJob("Research task", "Do work");
      await store.setError("job-1", "Rate limit exceeded");

      const result = await handlers.cancel({ jobId: "job-1" });

      expect(result).toEqual({ jobId: "job-1", status: "cancelled" });

      const job = await store.getJob("job-1");
      expect(job!.status).toBe("cancelled"); // eslint-disable-line @typescript-eslint/no-non-null-assertion -- test verifies job exists
    });

    it("returns current status for already-completed job (no-op)", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await store.createJob("Research task", "Do work");
      await store.updateStatus("job-1", "completed");

      const result = await handlers.cancel({ jobId: "job-1" });

      expect(result).toEqual({ jobId: "job-1", status: "completed" });

      // Verify status was not changed
      const job = await store.getJob("job-1");
      expect(job!.status).toBe("completed"); // eslint-disable-line @typescript-eslint/no-non-null-assertion -- test verifies job exists
    });

    it("returns current status for already-cancelled job (no-op)", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await store.createJob("Research task", "Do work");
      await store.updateStatus("job-1", "cancelled");

      const result = await handlers.cancel({ jobId: "job-1" });

      expect(result).toEqual({ jobId: "job-1", status: "cancelled" });
    });

    it("throws HandlerError with code -32602 for unknown jobId", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      try {
        await handlers.cancel({ jobId: "nonexistent" });
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(HandlerError);
        const handlerErr = err as HandlerError;
        expect(handlerErr.code).toBe(-32602);
        expect(handlerErr.message).toBe("Unknown job ID: nonexistent");
      }
    });

    it("invokes onCancel callback when cancelling a running job", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const cancelledIds: string[] = [];
      const handlers = createHandlers(store, (jobId) => {
        cancelledIds.push(jobId);
      });

      await store.createJob("Research task", "Do work");
      await handlers.cancel({ jobId: "job-1" });

      expect(cancelledIds).toEqual(["job-1"]);
    });

    it("does not invoke onCancel for already-terminal jobs", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const cancelledIds: string[] = [];
      const handlers = createHandlers(store, (jobId) => {
        cancelledIds.push(jobId);
      });

      await store.createJob("Research task", "Do work");
      await store.updateStatus("job-1", "completed");

      await handlers.cancel({ jobId: "job-1" });

      expect(cancelledIds).toEqual([]);
    });
  });

  describe("delete", () => {
    it("removes directory for a completed job", async () => {
      const { deps, fs } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await store.createJob("Research task", "Do work");
      await store.updateStatus("job-1", "completed");

      const result = await handlers.delete({ jobId: "job-1" });

      expect(result).toEqual({ jobId: "job-1", deleted: true });

      // Verify all files for this job are gone
      const jobFiles = Array.from(fs.files.keys()).filter((k) =>
        k.startsWith(`${JOBS_DIR}/job-1`),
      );
      expect(jobFiles).toEqual([]);
    });

    it("removes directory for a cancelled job", async () => {
      const { deps, fs } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await store.createJob("Research task", "Do work");
      await store.updateStatus("job-1", "cancelled");

      const result = await handlers.delete({ jobId: "job-1" });

      expect(result).toEqual({ jobId: "job-1", deleted: true });

      const jobFiles = Array.from(fs.files.keys()).filter((k) =>
        k.startsWith(`${JOBS_DIR}/job-1`),
      );
      expect(jobFiles).toEqual([]);
    });

    it("throws HandlerError on running job", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await store.createJob("Research task", "Do work");

      try {
        await handlers.delete({ jobId: "job-1" });
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(HandlerError);
        const handlerErr = err as HandlerError;
        expect(handlerErr.code).toBe(-32602);
        expect(handlerErr.message).toBe("Cannot delete a running job");
      }
    });

    it("throws HandlerError on failed job", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await store.createJob("Research task", "Do work");
      await store.setError("job-1", "Timeout");

      try {
        await handlers.delete({ jobId: "job-1" });
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(HandlerError);
        const handlerErr = err as HandlerError;
        expect(handlerErr.code).toBe(-32602);
        expect(handlerErr.message).toBe(
          "Cannot delete a failed job. Cancel it first.",
        );
      }
    });

    it("throws HandlerError with code -32602 for unknown jobId", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      try {
        await handlers.delete({ jobId: "nonexistent" });
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(HandlerError);
        const handlerErr = err as HandlerError;
        expect(handlerErr.code).toBe(-32602);
        expect(handlerErr.message).toBe("Unknown job ID: nonexistent");
      }
    });

    it("deleted job is no longer returned by listJobs", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await store.createJob("Job A", "Task A");
      await store.createJob("Job B", "Task B");
      await store.updateStatus("job-1", "completed");

      // Delete job-1
      await handlers.delete({ jobId: "job-1" });

      // List should only show job-2
      const listResult = await handlers.list();
      expect(listResult.jobs).toHaveLength(1);
      const jobs = listResult.jobs as Array<{ jobId: string }>;
      expect(jobs[0].jobId).toBe("job-2");
    });
  });
});
