import { describe, expect, it } from "bun:test";

import { createHandlers } from "@/guild-members/researcher/handlers";
import { createJobStore } from "@/guild-members/researcher/job-store";
import type { JobStoreFs, JobStoreDeps } from "@/guild-members/researcher/job-store";

// -- In-memory filesystem mock (same pattern as job-store.test.ts) --

function createMemoryFs(): JobStoreFs & { files: Map<string, string> } {
  const files = new Map<string, string>();

  function isDir(path: string): boolean {
    const dirKey = path.endsWith("/") ? path : path + "/";
    return files.has(dirKey);
  }

  /* eslint-disable @typescript-eslint/require-await -- mock fs implements async interface synchronously */
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
  /* eslint-enable @typescript-eslint/require-await */
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
  describe("dispatch", () => {
    it("creates a job and returns its jobId", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      const result = await handlers.dispatch({
        description: "Research AI safety",
        task: "Find recent papers on AI alignment",
      });

      expect(result.jobId).toBe("job-1");
    });

    it("writes task.md with the task content", async () => {
      const { deps, fs } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await handlers.dispatch({
        description: "Research AI safety",
        task: "Find recent papers on AI alignment",
      });

      expect(fs.files.get(`${JOBS_DIR}/job-1/task.md`)).toBe(
        "Find recent papers on AI alignment",
      );
    });

    it("writes config.json with provided config", async () => {
      const { deps, fs } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await handlers.dispatch({
        description: "Deep research",
        task: "Investigate topic X",
        config: { timeout: 600, depth: "comprehensive" },
      });

      const config = JSON.parse(
        fs.files.get(`${JOBS_DIR}/job-1/config.json`)!,   
      ) as Record<string, unknown>;
      expect(config).toEqual({ timeout: 600, depth: "comprehensive" });
    });

    it("writes empty object config.json when no config provided", async () => {
      const { deps, fs } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await handlers.dispatch({
        description: "Simple research",
        task: "Find stuff",
      });

      expect(fs.files.get(`${JOBS_DIR}/job-1/config.json`)).toBe("{}");
    });

    it("sets meta.json status to running with startedAt", async () => {
      const { deps, fs } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await handlers.dispatch({
        description: "Research task",
        task: "Do the work",
      });

      const meta = JSON.parse(
        fs.files.get(`${JOBS_DIR}/job-1/meta.json`)!,   
      ) as Record<string, unknown>;
      expect(meta.status).toBe("running");
      expect(meta.startedAt).toBe("2026-02-17T12:00:00Z");
      expect(meta.jobId).toBe("job-1");
      expect(meta.description).toBe("Research task");
    });
  });

  describe("list", () => {
    it("returns all jobs in simple mode (default)", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await store.createJob("Job A", "Task A");
      await store.createJob("Job B", "Task B");

      const result = await handlers.list();

      expect(result.jobs).toHaveLength(2);
      const jobs = result.jobs as Array<{ jobId: string; status: string }>;
      const ids = jobs.map((j) => j.jobId).sort();
      expect(ids).toEqual(["job-1", "job-2"]);
      // Simple mode should only have jobId and status
      expect(jobs[0]).toEqual(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- expect.any() returns any
        expect.objectContaining({ jobId: expect.any(String), status: "running" }),
      );
      expect("description" in jobs[0]).toBe(false);
    });

    it("returns all jobs in detailed mode with summary", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await store.createJob("Job A", "Task A");
      await store.createJob("Job B", "Task B");
      await store.writeSummary("job-1", "Making progress");

      const result = await handlers.list({ detail: "detailed" });

      expect(result.jobs).toHaveLength(2);
      const jobs = result.jobs as Array<{
        jobId: string;
        status: string;
        description: string;
        summary: string | null;
      }>;

      const jobA = jobs.find((j) => j.jobId === "job-1");
      const jobB = jobs.find((j) => j.jobId === "job-2");

      expect(jobA).toBeDefined();
      expect(jobA!.description).toBe("Job A");
      expect(jobA!.summary).toBe("Making progress");

      expect(jobB).toBeDefined();
      expect(jobB!.description).toBe("Job B");
      expect(jobB!.summary).toBeNull();
    });

    it("filters by description using exact match", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await store.createJob("Research AI safety", "Task A");
      await store.createJob("Research quantum computing", "Task B");
      await store.createJob("Write documentation", "Task C");

      const result = await handlers.list({ filter: "Research AI safety" });

      expect(result.jobs).toHaveLength(1);
      const jobs = result.jobs as Array<{ jobId: string }>;
      expect(jobs[0].jobId).toBe("job-1");
    });

    it("filters with glob wildcard pattern", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await store.createJob("Research AI safety", "Task A");
      await store.createJob("Research quantum computing", "Task B");
      await store.createJob("Write documentation", "Task C");

      const result = await handlers.list({ filter: "Research*" });

      expect(result.jobs).toHaveLength(2);
      const ids = (result.jobs as Array<{ jobId: string }>)
        .map((j) => j.jobId)
        .sort();
      expect(ids).toEqual(["job-1", "job-2"]);
    });

    it("filters with glob partial match using wildcards", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await store.createJob("Research AI safety", "Task A");
      await store.createJob("Research quantum computing", "Task B");
      await store.createJob("Write AI documentation", "Task C");

      const result = await handlers.list({ filter: "*AI*" });

      expect(result.jobs).toHaveLength(2);
      const ids = (result.jobs as Array<{ jobId: string }>)
        .map((j) => j.jobId)
        .sort();
      expect(ids).toEqual(["job-1", "job-3"]);
    });

    it("returns empty array when no jobs exist", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      const result = await handlers.list();

      expect(result.jobs).toEqual([]);
    });

    it("returns empty array when filter matches nothing", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await store.createJob("Research AI safety", "Task A");

      const result = await handlers.list({ filter: "Nonexistent*" });

      expect(result.jobs).toEqual([]);
    });

    it("uses injected JobStore without touching real disk", async () => {
      const { deps, fs } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await handlers.dispatch({
        description: "Test job",
        task: "Test task",
      });

      // Verify the in-memory filesystem was used, not real disk
      expect(fs.files.size).toBeGreaterThan(0);
      expect(fs.files.has(`${JOBS_DIR}/job-1/meta.json`)).toBe(true);

      const result = await handlers.list();
      expect(result.jobs).toHaveLength(1);
    });

    it("filter works with detailed mode", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);
      const handlers = createHandlers(store);

      await store.createJob("Research AI safety", "Task A");
      await store.createJob("Write documentation", "Task B");
      await store.writeSummary("job-1", "Found 3 papers");

      const result = await handlers.list({
        detail: "detailed",
        filter: "Research*",
      });

      expect(result.jobs).toHaveLength(1);
      const job = result.jobs[0] as {
        jobId: string;
        status: string;
        description: string;
        summary: string | null;
      };
      expect(job.jobId).toBe("job-1");
      expect(job.description).toBe("Research AI safety");
      expect(job.summary).toBe("Found 3 papers");
    });
  });
});
