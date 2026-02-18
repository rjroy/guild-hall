import { describe, expect, it } from "bun:test";

import { createJobStore } from "@/guild-members/researcher/job-store";
import type { JobStoreFs, JobStoreDeps, JobDecision } from "@/guild-members/researcher/job-store";

// -- In-memory filesystem mock --

/**
 * Map-based filesystem that satisfies JobStoreFs. Keys are absolute paths,
 * values are file contents. Directories are tracked as entries with a
 * trailing slash sentinel (value is empty string).
 */
function createMemoryFs(): JobStoreFs & { files: Map<string, string> } {
  const files = new Map<string, string>();

  /**
   * Returns true if the path is a directory (has entries underneath it
   * or was explicitly created with mkdir).
   */
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
          // Get the first path segment after the prefix
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

function createTestDeps(fs?: ReturnType<typeof createMemoryFs>): {
  deps: JobStoreDeps;
  fs: ReturnType<typeof createMemoryFs>;
} {
  const memFs = fs ?? createMemoryFs();
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

describe("createJobStore", () => {
  describe("createJob", () => {
    it("creates directory with correct file structure", async () => {
      const { deps, fs } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      const jobId = await store.createJob("Test research", "Find papers about X");

      expect(jobId).toBe("job-1");

      // Verify all expected files exist
      const meta = JSON.parse(fs.files.get(`${JOBS_DIR}/job-1/meta.json`)!) as Record<string, unknown>;
      expect(meta.jobId).toBe("job-1");
      expect(meta.status).toBe("running");
      expect(meta.description).toBe("Test research");
      expect(meta.startedAt).toBe("2026-02-17T12:00:00Z");

      expect(fs.files.get(`${JOBS_DIR}/job-1/task.md`)).toBe("Find papers about X");
      expect(fs.files.get(`${JOBS_DIR}/job-1/config.json`)).toBe("{}");
      expect(fs.files.get(`${JOBS_DIR}/job-1/status.md`)).toBe("");
    });

    it("generates valid UUID job IDs", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      const jobId1 = await store.createJob("Job 1", "Task 1");
      const jobId2 = await store.createJob("Job 2", "Task 2");

      expect(jobId1).toBe("job-1");
      expect(jobId2).toBe("job-2");
      expect(jobId1).not.toBe(jobId2);
    });

    it("writes config when provided", async () => {
      const { deps, fs } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      await store.createJob("Research", "Task", { timeout: 300, depth: "deep" });

      const config = JSON.parse(fs.files.get(`${JOBS_DIR}/job-1/config.json`)!) as Record<string, unknown>;
      expect(config).toEqual({ timeout: 300, depth: "deep" });
    });

    it("creates artifacts directory", async () => {
      const { deps, fs } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      await store.createJob("Research", "Task");

      // artifacts directory should be created
      expect(fs.files.has(`${JOBS_DIR}/job-1/artifacts/`)).toBe(true);
    });
  });

  describe("getJob", () => {
    it("reads meta.json correctly", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      const jobId = await store.createJob("Test", "Task content");
      const meta = await store.getJob(jobId);

      expect(meta).not.toBeNull();
      expect(meta!.jobId).toBe("job-1");
      expect(meta!.status).toBe("running");
      expect(meta!.description).toBe("Test");
      expect(meta!.startedAt).toBe("2026-02-17T12:00:00Z");
    });

    it("returns null for nonexistent job", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      const meta = await store.getJob("nonexistent-id");
      expect(meta).toBeNull();
    });
  });

  describe("listJobs", () => {
    it("returns all jobs", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      await store.createJob("Job A", "Task A");
      await store.createJob("Job B", "Task B");
      await store.createJob("Job C", "Task C");

      const jobs = await store.listJobs();

      expect(jobs).toHaveLength(3);
      const descriptions = jobs.map((j) => j.description).sort();
      expect(descriptions).toEqual(["Job A", "Job B", "Job C"]);
    });

    it("returns empty array when no jobs exist", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      const jobs = await store.listJobs();
      expect(jobs).toEqual([]);
    });
  });

  describe("updateStatus", () => {
    it("transitions status correctly", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      const jobId = await store.createJob("Test", "Task");

      await store.updateStatus(jobId, "completed");
      const meta = await store.getJob(jobId);

      expect(meta!.status).toBe("completed");
      expect(meta!.completedAt).toBe("2026-02-17T12:00:00Z");
    });

    it("sets explicit completedAt when provided", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      const jobId = await store.createJob("Test", "Task");

      await store.updateStatus(jobId, "completed", "2026-02-17T15:30:00Z");
      const meta = await store.getJob(jobId);

      expect(meta!.completedAt).toBe("2026-02-17T15:30:00Z");
    });

    it("auto-sets completedAt for terminal statuses", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      const jobId = await store.createJob("Test", "Task");

      await store.updateStatus(jobId, "failed");
      const meta = await store.getJob(jobId);

      expect(meta!.status).toBe("failed");
      expect(meta!.completedAt).toBeDefined();
    });

    it("throws for nonexistent job", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      // eslint-disable-next-line @typescript-eslint/await-thenable -- bun:test expect().rejects returns Promise
      await expect(store.updateStatus("nonexistent", "completed")).rejects.toThrow(
        "Job not found: nonexistent",
      );
    });
  });

  describe("writeResult and readResult", () => {
    it("roundtrip correctly", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      const jobId = await store.createJob("Test", "Task");

      await store.writeResult(jobId, "# Research Report\n\nFindings here.");
      const result = await store.readResult(jobId);

      expect(result).not.toBeNull();
      expect(result!.output).toBe("# Research Report\n\nFindings here.");
    });

    it("returns null for jobs without results", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      const jobId = await store.createJob("Test", "Task");
      const result = await store.readResult(jobId);

      expect(result).toBeNull();
    });

    it("writes and reads artifacts", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      const jobId = await store.createJob("Test", "Task");

      await store.writeResult(jobId, "Done", ["report.pdf", "data.csv"]);
      const result = await store.readResult(jobId);

      expect(result).not.toBeNull();
      expect(result!.artifacts).toContain("report.pdf");
      expect(result!.artifacts).toContain("data.csv");
    });
  });

  describe("readSummary", () => {
    it("returns null for initial empty summary", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      const jobId = await store.createJob("Test", "Task");
      const summary = await store.readSummary(jobId);

      expect(summary).toBeNull();
    });

    it("returns content after writeSummary", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      const jobId = await store.createJob("Test", "Task");

      await store.writeSummary(jobId, "Making progress on research.");
      const summary = await store.readSummary(jobId);

      expect(summary).toBe("Making progress on research.");
    });
  });

  describe("readQuestions", () => {
    it("returns null when no questions file exists", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      const jobId = await store.createJob("Test", "Task");
      const questions = await store.readQuestions(jobId);

      expect(questions).toBeNull();
    });

    it("returns content after appendQuestion", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      const jobId = await store.createJob("Test", "Task");

      await store.appendQuestion(jobId, "What scope should the research cover?");
      const questions = await store.readQuestions(jobId);

      expect(questions).toBe("What scope should the research cover?");
    });
  });

  describe("readDecisions", () => {
    it("returns null when no decisions file exists", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      const jobId = await store.createJob("Test", "Task");
      const decisions = await store.readDecisions(jobId);

      expect(decisions).toBeNull();
    });

    it("returns array after appendDecision", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      const jobId = await store.createJob("Test", "Task");

      const decision: JobDecision = {
        question: "Include patents?",
        decision: "Yes",
        reasoning: "Patents are a primary source for technical research.",
      };
      await store.appendDecision(jobId, decision);
      const decisions = await store.readDecisions(jobId);

      expect(decisions).toHaveLength(1);
      expect(decisions![0]).toEqual(decision);
    });
  });

  describe("appendQuestion", () => {
    it("accumulates entries", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      const jobId = await store.createJob("Test", "Task");

      await store.appendQuestion(jobId, "Question 1?");
      await store.appendQuestion(jobId, "Question 2?");
      await store.appendQuestion(jobId, "Question 3?");

      const questions = await store.readQuestions(jobId);
      expect(questions).toBe("Question 1?\nQuestion 2?\nQuestion 3?");
    });
  });

  describe("appendDecision", () => {
    it("accumulates entries", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      const jobId = await store.createJob("Test", "Task");

      await store.appendDecision(jobId, {
        question: "Q1",
        decision: "D1",
        reasoning: "R1",
      });
      await store.appendDecision(jobId, {
        question: "Q2",
        decision: "D2",
        reasoning: "R2",
      });

      const decisions = await store.readDecisions(jobId);
      expect(decisions).toHaveLength(2);
      expect(decisions![0].question).toBe("Q1");
      expect(decisions![1].question).toBe("Q2");
    });
  });

  describe("writeSummary", () => {
    it("overwrites previous summary", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      const jobId = await store.createJob("Test", "Task");

      await store.writeSummary(jobId, "First update");
      await store.writeSummary(jobId, "Second update");

      const summary = await store.readSummary(jobId);
      expect(summary).toBe("Second update");
    });
  });

  describe("deleteJob", () => {
    it("removes directory recursively", async () => {
      const { deps, fs } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      const jobId = await store.createJob("Test", "Task");

      // Verify the job exists before deletion
      expect(await store.jobExists(jobId)).toBe(true);

      await store.deleteJob(jobId);

      // All files for this job should be gone
      const remaining = Array.from(fs.files.keys()).filter((k) =>
        k.startsWith(`${JOBS_DIR}/${jobId}`),
      );
      expect(remaining).toHaveLength(0);
    });

    it("job is no longer listed after deletion", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      const jobId = await store.createJob("Test", "Task");
      await store.deleteJob(jobId);

      const jobs = await store.listJobs();
      expect(jobs).toHaveLength(0);
    });
  });

  describe("jobExists", () => {
    it("returns true for existing job", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      const jobId = await store.createJob("Test", "Task");
      expect(await store.jobExists(jobId)).toBe(true);
    });

    it("returns false for nonexistent job", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      expect(await store.jobExists("does-not-exist")).toBe(false);
    });
  });

  describe("setError", () => {
    it("writes error to meta.json", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      const jobId = await store.createJob("Test", "Task");

      await store.setError(jobId, "Connection timeout after 30s");
      const meta = await store.getJob(jobId);

      expect(meta!.error).toBe("Connection timeout after 30s");
      expect(meta!.status).toBe("failed");
      expect(meta!.completedAt).toBeDefined();
    });

    it("throws for nonexistent job", async () => {
      const { deps } = createTestDeps();
      const store = createJobStore(JOBS_DIR, deps);

      // eslint-disable-next-line @typescript-eslint/await-thenable -- bun:test expect().rejects returns Promise
      await expect(store.setError("nonexistent", "some error")).rejects.toThrow(
        "Job not found: nonexistent",
      );
    });
  });
});
