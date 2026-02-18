/**
 * JobStore: persistent storage for worker dispatch jobs.
 *
 * Each job gets a directory under the jobs root containing task details,
 * metadata, status, results, and optional artifacts. All filesystem and
 * clock operations are injected for testability.
 *
 * Directory layout per job:
 *   jobs/{uuid}/
 *     task.md          - original task prompt
 *     config.json      - dispatch config (or {} if none)
 *     meta.json        - { jobId, status, description, startedAt, completedAt?, error? }
 *     status.md        - worker's self-reported summary (initially empty)
 *     result.md        - final output (written on completion)
 *     questions.md     - unresolved questions (optional, appended)
 *     decisions.json   - judgment calls array (optional, appended)
 *     artifacts/       - files the worker creates (optional)
 */

import { join } from "node:path";
import { mkdir, writeFile, readFile, readdir, rm, stat, access } from "node:fs/promises";
import { randomUUID } from "node:crypto";

// -- Types --

type JobStatus = "running" | "completed" | "failed" | "cancelled";

export type JobMeta = {
  jobId: string;
  status: JobStatus;
  description: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
};

export type JobDecision = {
  question: string;
  decision: string;
  reasoning: string;
};

export type JobResult = {
  output: string;
  artifacts: string[] | null;
};

/** Filesystem operations required by JobStore. Subset of node:fs/promises. */
export type JobStoreFs = {
  mkdir: (path: string, opts?: { recursive?: boolean }) => Promise<void>;
  writeFile: (path: string, content: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  readdir: (path: string) => Promise<string[]>;
  rm: (path: string, opts?: { recursive?: boolean; force?: boolean }) => Promise<void>;
  stat: (path: string) => Promise<{ isDirectory: () => boolean }>;
  access: (path: string) => Promise<void>;
};

export type JobStoreDeps = {
  fs: JobStoreFs;
  clock: { now: () => string };
  randomUUID: () => string;
};

export type JobStore = {
  createJob: (description: string, task: string, config?: Record<string, unknown>) => Promise<string>;
  getJob: (jobId: string) => Promise<JobMeta | null>;
  listJobs: () => Promise<JobMeta[]>;
  updateStatus: (jobId: string, status: JobStatus, completedAt?: string) => Promise<void>;
  writeResult: (jobId: string, output: string, artifacts?: string[]) => Promise<void>;
  readResult: (jobId: string) => Promise<JobResult | null>;
  readSummary: (jobId: string) => Promise<string | null>;
  readQuestions: (jobId: string) => Promise<string | null>;
  readDecisions: (jobId: string) => Promise<JobDecision[] | null>;
  appendQuestion: (jobId: string, question: string) => Promise<void>;
  appendDecision: (jobId: string, decision: JobDecision) => Promise<void>;
  writeSummary: (jobId: string, summary: string) => Promise<void>;
  deleteJob: (jobId: string) => Promise<void>;
  jobExists: (jobId: string) => Promise<boolean>;
  setError: (jobId: string, error: string) => Promise<void>;
};

// -- Default deps (production wiring) --

/**
 * Creates default dependencies using real filesystem, clock, and crypto.
 * Extracted as a named function so coverage reflects real test quality.
 */
export function createDefaultDeps(): JobStoreDeps {
  return {
    fs: {
      mkdir: (path, opts) => mkdir(path, opts).then(() => undefined),
      writeFile: (path, content) => writeFile(path, content, "utf-8"),
      readFile: (path) => readFile(path, "utf-8"),
      readdir: (path) => readdir(path),
      rm: (path, opts) => rm(path, opts),
      stat: (path) => stat(path),
      access: (path) => access(path),
    },
    clock: { now: () => new Date().toISOString() },
    randomUUID: () => randomUUID(),
  };
}

// -- Factory --

/**
 * Creates a JobStore bound to a jobs root directory.
 *
 * @param jobsDir - Root directory where job subdirectories are created.
 * @param deps - Injected filesystem, clock, and UUID generator.
 */
export function createJobStore(jobsDir: string, deps?: JobStoreDeps): JobStore {
  const { fs, clock, randomUUID } = deps ?? createDefaultDeps();

  /** Returns the path to a job's directory. */
  function jobDir(jobId: string): string {
    return join(jobsDir, jobId);
  }

  /** Reads a file, returning null if it doesn't exist. */
  async function readFileOrNull(path: string): Promise<string | null> {
    try {
      return await fs.readFile(path);
    } catch {
      return null;
    }
  }

  /** Reads and parses meta.json for a job. Returns null if missing. */
  async function readMeta(jobId: string): Promise<JobMeta | null> {
    const content = await readFileOrNull(join(jobDir(jobId), "meta.json"));
    if (content === null) return null;
    return JSON.parse(content) as JobMeta;
  }

  /** Writes meta.json for a job. */
  async function writeMeta(jobId: string, meta: JobMeta): Promise<void> {
    await fs.writeFile(join(jobDir(jobId), "meta.json"), JSON.stringify(meta, null, 2));
  }

  return {
    async createJob(description, task, config) {
      const jobId = randomUUID();
      const dir = jobDir(jobId);

      await fs.mkdir(dir, { recursive: true });
      await fs.mkdir(join(dir, "artifacts"), { recursive: true });

      const meta: JobMeta = {
        jobId,
        status: "running",
        description,
        startedAt: clock.now(),
      };

      await Promise.all([
        writeMeta(jobId, meta),
        fs.writeFile(join(dir, "task.md"), task),
        fs.writeFile(join(dir, "config.json"), JSON.stringify(config ?? {}, null, 2)),
        fs.writeFile(join(dir, "status.md"), ""),
      ]);

      return jobId;
    },

    getJob: readMeta,

    async listJobs() {
      let entries: string[];
      try {
        entries = await fs.readdir(jobsDir);
      } catch {
        return [];
      }

      const jobs: JobMeta[] = [];
      for (const entry of entries) {
        try {
          const s = await fs.stat(join(jobsDir, entry));
          if (s.isDirectory()) {
            const meta = await readMeta(entry);
            if (meta) jobs.push(meta);
          }
        } catch {
          // Skip entries that can't be read
        }
      }
      return jobs;
    },

    async updateStatus(jobId, status, completedAt) {
      const meta = await readMeta(jobId);
      if (!meta) throw new Error(`Job not found: ${jobId}`);

      meta.status = status;
      if (completedAt) {
        meta.completedAt = completedAt;
      } else if (status === "completed" || status === "failed" || status === "cancelled") {
        meta.completedAt = clock.now();
      }

      await writeMeta(jobId, meta);
    },

    async writeResult(jobId, output, artifacts) {
      const dir = jobDir(jobId);
      await fs.writeFile(join(dir, "result.md"), output);

      if (artifacts && artifacts.length > 0) {
        const artifactsDir = join(dir, "artifacts");
        await fs.mkdir(artifactsDir, { recursive: true });
        for (const artifact of artifacts) {
          await fs.writeFile(join(artifactsDir, artifact), "");
        }
      }
    },

    async readResult(jobId) {
      const dir = jobDir(jobId);
      const output = await readFileOrNull(join(dir, "result.md"));
      if (output === null) return null;

      let artifacts: string[] | null = null;
      try {
        const entries = await fs.readdir(join(dir, "artifacts"));
        artifacts = entries.length > 0 ? entries : null;
      } catch {
        // artifacts/ may not exist
      }

      return { output, artifacts };
    },

    async readSummary(jobId) {
      const content = await readFileOrNull(join(jobDir(jobId), "status.md"));
      // Return null for empty files (initial state)
      return content === "" ? null : content;
    },

    async readQuestions(jobId) {
      return readFileOrNull(join(jobDir(jobId), "questions.md"));
    },

    async readDecisions(jobId) {
      const content = await readFileOrNull(join(jobDir(jobId), "decisions.json"));
      if (content === null) return null;
      return JSON.parse(content) as JobDecision[];
    },

    async appendQuestion(jobId, question) {
      const filePath = join(jobDir(jobId), "questions.md");
      const existing = await readFileOrNull(filePath);
      const updated = existing ? `${existing}\n${question}` : question;
      await fs.writeFile(filePath, updated);
    },

    async appendDecision(jobId, decision) {
      const filePath = join(jobDir(jobId), "decisions.json");
      const existing = await readFileOrNull(filePath);
      const decisions: JobDecision[] = existing ? (JSON.parse(existing) as JobDecision[]) : [];
      decisions.push(decision);
      await fs.writeFile(filePath, JSON.stringify(decisions, null, 2));
    },

    async writeSummary(jobId, summary) {
      await fs.writeFile(join(jobDir(jobId), "status.md"), summary);
    },

    async deleteJob(jobId) {
      await fs.rm(jobDir(jobId), { recursive: true, force: true });
    },

    async jobExists(jobId) {
      try {
        await fs.access(jobDir(jobId));
        return true;
      } catch {
        return false;
      }
    },

    async setError(jobId, error) {
      const meta = await readMeta(jobId);
      if (!meta) throw new Error(`Job not found: ${jobId}`);

      meta.error = error;
      meta.status = "failed";
      meta.completedAt = meta.completedAt ?? clock.now();

      await writeMeta(jobId, meta);
    },
  };
}
