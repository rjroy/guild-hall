import { describe, expect, it, mock } from "bun:test";

import {
  createWorkerTools,
  createWorkerToolDefs,
} from "@/guild-members/researcher/worker-tools";
import type { MemoryStore } from "@/guild-members/researcher/worker-tools";
import type { JobStore, JobDecision } from "@/guild-members/researcher/job-store";

// -- Result type from MCP tool handlers --

type CallToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

/**
 * Flattened tool representation for test ergonomics. Strips the generics
 * from SdkMcpToolDefinition so tests can call handlers with plain objects.
 */
type TestTool = {
  name: string;
  description: string;
  handler: (args: Record<string, unknown>, extra: unknown) => Promise<CallToolResult>;
};

/**
 * Helper to find a tool by name from createWorkerToolDefs.
 * Casts to TestTool for ergonomic handler invocation in tests.
 */
function findTool(tools: ReturnType<typeof createWorkerToolDefs>, name: string): TestTool {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`Tool "${name}" not found`);
  return found as unknown as TestTool;
}

// -- Mock factories --

/**
 * Creates a mock JobStore with only the methods the worker tools use.
 * Tracks calls via bun mock functions.
 */
function createMockJobStore() {
  return {
    writeSummary: mock(() => Promise.resolve()),
    appendDecision: mock(() => Promise.resolve()),
    appendQuestion: mock(() => Promise.resolve()),
    // Unused by worker tools, stubbed for type completeness
    createJob: mock(() => Promise.resolve("unused")),
    getJob: mock(() => Promise.resolve(null)),
    listJobs: mock(() => Promise.resolve([])),
    updateStatus: mock(() => Promise.resolve()),
    writeResult: mock(() => Promise.resolve()),
    readResult: mock(() => Promise.resolve(null)),
    readSummary: mock(() => Promise.resolve(null)),
    readQuestions: mock(() => Promise.resolve(null)),
    readDecisions: mock(() => Promise.resolve(null)),
    deleteJob: mock(() => Promise.resolve()),
    jobExists: mock(() => Promise.resolve(false)),
    setError: mock(() => Promise.resolve()),
  } satisfies JobStore;
}

/**
 * Creates a mock MemoryStore. getTotalMemorySize returns the provided value
 * (defaults to 0, well under the compaction threshold).
 */
function createMockMemoryStore(totalSize = 0): MemoryStore & {
  storeMemory: ReturnType<typeof mock>;
  getTotalMemorySize: ReturnType<typeof mock>;
  triggerCompaction: ReturnType<typeof mock>;
} {
  return {
    storeMemory: mock(() => Promise.resolve()),
    getTotalMemorySize: mock(() => Promise.resolve(totalSize)),
    triggerCompaction: mock(() => {}),
  };
}

// -- Tests --

describe("createWorkerTools", () => {
  it("creates a server config with name 'worker-internal'", () => {
    const jobStore = createMockJobStore();
    const memoryStore = createMockMemoryStore();
    const config = createWorkerTools("job-1", jobStore, memoryStore);

    expect(config.type).toBe("sdk");
    expect(config.name).toBe("worker-internal");
    expect(config.instance).toBeDefined();
  });
});

describe("createWorkerToolDefs", () => {
  it("creates five tools with correct names", () => {
    const jobStore = createMockJobStore();
    const memoryStore = createMockMemoryStore();
    const tools = createWorkerToolDefs("job-1", jobStore, memoryStore);

    expect(tools).toHaveLength(5);
    const names = tools.map((t) => t.name);
    expect(names).toContain("update_summary");
    expect(names).toContain("record_decision");
    expect(names).toContain("log_question");
    expect(names).toContain("store_memory");
    expect(names).toContain("submit_result");
  });

  describe("update_summary", () => {
    it("writes summary to status.md via JobStore", async () => {
      const jobStore = createMockJobStore();
      const memoryStore = createMockMemoryStore();
      const tools = createWorkerToolDefs("job-42", jobStore, memoryStore);
      const updateSummary = findTool(tools, "update_summary");

      await updateSummary.handler({ summary: "Found 3 papers on topic X" }, {});

      expect(jobStore.writeSummary).toHaveBeenCalledWith(
        "job-42",
        "Found 3 papers on topic X",
      );
    });

    it("overwrites previous content (call twice, second value wins)", async () => {
      const jobStore = createMockJobStore();
      const memoryStore = createMockMemoryStore();
      const tools = createWorkerToolDefs("job-42", jobStore, memoryStore);
      const updateSummary = findTool(tools, "update_summary");

      await updateSummary.handler({ summary: "First draft" }, {});
      await updateSummary.handler({ summary: "Revised draft" }, {});

      expect(jobStore.writeSummary).toHaveBeenCalledTimes(2);
      // writeSummary overwrites (not appends), so the store sees both calls
      // and the second call is the current value
      expect(jobStore.writeSummary).toHaveBeenLastCalledWith("job-42", "Revised draft");
    });

    it("returns correct response shape", async () => {
      const jobStore = createMockJobStore();
      const memoryStore = createMockMemoryStore();
      const tools = createWorkerToolDefs("job-42", jobStore, memoryStore);
      const updateSummary = findTool(tools, "update_summary");

      const result = await updateSummary.handler({ summary: "test" }, {});

      expect(result).toEqual({
        content: [{ type: "text", text: "Summary updated." }],
      });
    });
  });

  describe("record_decision", () => {
    it("appends decision to decisions.json via JobStore", async () => {
      const jobStore = createMockJobStore();
      const memoryStore = createMockMemoryStore();
      const tools = createWorkerToolDefs("job-99", jobStore, memoryStore);
      const recordDecision = findTool(tools, "record_decision");

      await recordDecision.handler(
        {
          question: "Which API version to use?",
          decision: "v2",
          reasoning: "v1 is deprecated",
        },
        {},
      );

      expect(jobStore.appendDecision).toHaveBeenCalledWith("job-99", {
        question: "Which API version to use?",
        decision: "v2",
        reasoning: "v1 is deprecated",
      } satisfies JobDecision);
    });

    it("creates decisions.json on first append (delegates to JobStore)", async () => {
      const jobStore = createMockJobStore();
      const memoryStore = createMockMemoryStore();
      const tools = createWorkerToolDefs("job-new", jobStore, memoryStore);
      const recordDecision = findTool(tools, "record_decision");

      // The first call works even when decisions.json doesn't exist yet.
      // JobStore.appendDecision handles the create-if-missing logic internally.
      await recordDecision.handler(
        {
          question: "Include subfield?",
          decision: "Yes",
          reasoning: "The spec requires it",
        },
        {},
      );

      expect(jobStore.appendDecision).toHaveBeenCalledTimes(1);
      expect(jobStore.appendDecision).toHaveBeenCalledWith("job-new", {
        question: "Include subfield?",
        decision: "Yes",
        reasoning: "The spec requires it",
      });
    });

    it("returns correct response shape", async () => {
      const jobStore = createMockJobStore();
      const memoryStore = createMockMemoryStore();
      const tools = createWorkerToolDefs("job-99", jobStore, memoryStore);
      const recordDecision = findTool(tools, "record_decision");

      const result = await recordDecision.handler(
        { question: "q", decision: "d", reasoning: "r" },
        {},
      );

      expect(result).toEqual({
        content: [{ type: "text", text: "Decision recorded." }],
      });
    });
  });

  describe("log_question", () => {
    it("appends question to questions.md via JobStore", async () => {
      const jobStore = createMockJobStore();
      const memoryStore = createMockMemoryStore();
      const tools = createWorkerToolDefs("job-7", jobStore, memoryStore);
      const logQuestion = findTool(tools, "log_question");

      await logQuestion.handler({ question: "What license applies here?" }, {});

      expect(jobStore.appendQuestion).toHaveBeenCalledWith(
        "job-7",
        "What license applies here?",
      );
    });

    it("creates questions.md on first append (delegates to JobStore)", async () => {
      const jobStore = createMockJobStore();
      const memoryStore = createMockMemoryStore();
      const tools = createWorkerToolDefs("job-fresh", jobStore, memoryStore);
      const logQuestion = findTool(tools, "log_question");

      // JobStore.appendQuestion handles create-if-missing internally.
      await logQuestion.handler({ question: "First question ever" }, {});

      expect(jobStore.appendQuestion).toHaveBeenCalledTimes(1);
      expect(jobStore.appendQuestion).toHaveBeenCalledWith(
        "job-fresh",
        "First question ever",
      );
    });

    it("returns correct response shape", async () => {
      const jobStore = createMockJobStore();
      const memoryStore = createMockMemoryStore();
      const tools = createWorkerToolDefs("job-7", jobStore, memoryStore);
      const logQuestion = findTool(tools, "log_question");

      const result = await logQuestion.handler({ question: "test" }, {});

      expect(result).toEqual({
        content: [{ type: "text", text: "Question logged." }],
      });
    });
  });

  describe("store_memory", () => {
    it("calls memoryStore.storeMemory with key and content", async () => {
      const jobStore = createMockJobStore();
      const memoryStore = createMockMemoryStore();
      const tools = createWorkerToolDefs("job-1", jobStore, memoryStore);
      const storeMemoryTool = findTool(tools, "store_memory");

      await storeMemoryTool.handler(
        { key: "api-rate-limits", content: "Rate limit is 100 req/min" },
        {},
      );

      expect(memoryStore.storeMemory).toHaveBeenCalledWith(
        "api-rate-limits",
        "Rate limit is 100 req/min",
      );
    });

    it("triggers compaction when total memory exceeds threshold", async () => {
      const jobStore = createMockJobStore();
      // 20000 characters exceeds the 16000 threshold
      const memoryStore = createMockMemoryStore(20000);
      const tools = createWorkerToolDefs("job-1", jobStore, memoryStore);
      const storeMemoryTool = findTool(tools, "store_memory");

      await storeMemoryTool.handler({ key: "large-finding", content: "data" }, {});

      expect(memoryStore.triggerCompaction).toHaveBeenCalledTimes(1);
    });

    it("does not trigger compaction when under threshold", async () => {
      const jobStore = createMockJobStore();
      // 5000 characters is well under the 16000 threshold
      const memoryStore = createMockMemoryStore(5000);
      const tools = createWorkerToolDefs("job-1", jobStore, memoryStore);
      const storeMemoryTool = findTool(tools, "store_memory");

      await storeMemoryTool.handler({ key: "small-finding", content: "data" }, {});

      expect(memoryStore.triggerCompaction).not.toHaveBeenCalled();
    });

    it("does not trigger compaction at exactly the threshold", async () => {
      const jobStore = createMockJobStore();
      // Exactly 16000 is not > 16000, so no compaction
      const memoryStore = createMockMemoryStore(16000);
      const tools = createWorkerToolDefs("job-1", jobStore, memoryStore);
      const storeMemoryTool = findTool(tools, "store_memory");

      await storeMemoryTool.handler({ key: "boundary", content: "data" }, {});

      expect(memoryStore.triggerCompaction).not.toHaveBeenCalled();
    });

    it("returns correct response shape", async () => {
      const jobStore = createMockJobStore();
      const memoryStore = createMockMemoryStore();
      const tools = createWorkerToolDefs("job-1", jobStore, memoryStore);
      const storeMemoryTool = findTool(tools, "store_memory");

      const result = await storeMemoryTool.handler(
        { key: "test", content: "data" },
        {},
      );

      expect(result).toEqual({
        content: [{ type: "text", text: "Memory stored." }],
      });
    });
  });

  describe("submit_result", () => {
    it("reads file and writes content to result.md via JobStore.writeResult", async () => {
      const jobStore = createMockJobStore();
      const memoryStore = createMockMemoryStore();
      const reportContent = "## Summary\nFound 3 relevant papers.\n\n## Key Findings\n- Paper A covers X.";
      const mockReadFile = mock(() => Promise.resolve(reportContent));
      const tools = createWorkerToolDefs("job-res", jobStore, memoryStore, mockReadFile);
      const submitResult = findTool(tools, "submit_result");

      await submitResult.handler({ path: "/tmp/report.md" }, {});

      expect(mockReadFile).toHaveBeenCalledWith("/tmp/report.md");
      expect(jobStore.writeResult).toHaveBeenCalledWith("job-res", reportContent);
    });

    it("returns correct response shape", async () => {
      const jobStore = createMockJobStore();
      const memoryStore = createMockMemoryStore();
      const mockReadFile = mock(() => Promise.resolve("test report"));
      const tools = createWorkerToolDefs("job-res", jobStore, memoryStore, mockReadFile);
      const submitResult = findTool(tools, "submit_result");

      const result = await submitResult.handler({ path: "/tmp/report.md" }, {});

      expect(result).toEqual({
        content: [{ type: "text", text: "Result submitted." }],
      });
    });

    it("returns error when file cannot be read", async () => {
      const jobStore = createMockJobStore();
      const memoryStore = createMockMemoryStore();
      const mockReadFile = mock(() => Promise.reject(new Error("ENOENT: no such file")));
      const tools = createWorkerToolDefs("job-res", jobStore, memoryStore, mockReadFile);
      const submitResult = findTool(tools, "submit_result");

      const result = await submitResult.handler({ path: "/tmp/nonexistent.md" }, {});

      expect(result).toEqual({
        content: [{ type: "text", text: "Error reading file: ENOENT: no such file" }],
        isError: true,
      });
      expect(jobStore.writeResult).not.toHaveBeenCalled();
    });

    it("returns error when readFile is not provided", async () => {
      const jobStore = createMockJobStore();
      const memoryStore = createMockMemoryStore();
      // No readFile provided
      const tools = createWorkerToolDefs("job-res", jobStore, memoryStore);
      const submitResult = findTool(tools, "submit_result");

      const result = await submitResult.handler({ path: "/tmp/report.md" }, {});

      expect(result).toEqual({
        content: [{ type: "text", text: "Error: readFile not available." }],
        isError: true,
      });
    });
  });
});
