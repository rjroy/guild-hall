/**
 * Worker Tools - In-process MCP server providing internal tools for worker agents.
 *
 * These tools are injected into the worker agent's MCP server configuration
 * so the worker can report progress, record decisions, log questions, and
 * store persistent memories. The main Guild Hall app creates this server and
 * passes it alongside other MCP configs when spawning a worker query.
 *
 * Follows the DI factory pattern: createWorkerTools(jobId, jobStore, memoryStore)
 * returns a McpSdkServerConfigWithInstance ready for the mcpServers record.
 *
 * Tool definitions are separated into createWorkerToolDefs() so tests can
 * invoke handlers directly without going through the MCP server layer.
 */

import { z } from "zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type {
  McpSdkServerConfigWithInstance,
  SdkMcpToolDefinition,
} from "@anthropic-ai/claude-agent-sdk";

import type { JobStore } from "./job-store.js";

// -- Memory store interface (implemented in Phase 11: memory.ts) --

export type MemoryStore = {
  storeMemory: (key: string, content: string) => Promise<void>;
  getTotalMemorySize: () => Promise<number>;
  /** Fire-and-forget compaction trigger. Does not return a result. */
  triggerCompaction: () => void;
};

/** Reads a file by path. Injected for testability. */
export type ReadFileFn = (path: string) => Promise<string>;

// -- Compaction threshold --

/** Memory size in characters above which compaction is triggered. */
const COMPACTION_THRESHOLD = 16000;

// -- Tool definitions --

/**
 * Create the five worker tool definitions. Separated from createWorkerTools
 * so tests can invoke tool handlers directly without the MCP server layer.
 *
 * Each tool handler is strongly typed via Zod schemas. The return type
 * is the array of SdkMcpToolDefinition instances that createSdkMcpServer
 * accepts.
 */
export function createWorkerToolDefs(
  jobId: string,
  jobStore: JobStore,
  memoryStore: MemoryStore,
  readFile?: ReadFileFn,
) {
  const updateSummary = tool(
    "update_summary",
    "Update the worker's progress summary. Overwrites previous summary.",
    { summary: z.string().describe("Current progress summary") },
    async (input) => {
      await jobStore.writeSummary(jobId, input.summary);
      return { content: [{ type: "text" as const, text: "Summary updated." }] };
    },
  );

  const recordDecision = tool(
    "record_decision",
    "Record an autonomous decision made during research.",
    {
      question: z.string().describe("The question or ambiguity encountered"),
      decision: z.string().describe("The decision made"),
      reasoning: z.string().describe("Why this decision was made"),
    },
    async (input) => {
      await jobStore.appendDecision(jobId, {
        question: input.question,
        decision: input.decision,
        reasoning: input.reasoning,
      });
      return { content: [{ type: "text" as const, text: "Decision recorded." }] };
    },
  );

  const logQuestion = tool(
    "log_question",
    "Log a question that cannot be resolved autonomously.",
    { question: z.string().describe("The unresolved question") },
    async (input) => {
      await jobStore.appendQuestion(jobId, input.question);
      return { content: [{ type: "text" as const, text: "Question logged." }] };
    },
  );

  const storeMemory = tool(
    "store_memory",
    "Store a finding in persistent memory for future jobs. Key must be filename-safe.",
    {
      key: z.string().describe("Memory key (filename-safe, no extension)"),
      content: z.string().describe("Memory content to store"),
    },
    async (input) => {
      await memoryStore.storeMemory(input.key, input.content);
      const totalSize = await memoryStore.getTotalMemorySize();
      if (totalSize > COMPACTION_THRESHOLD) {
        memoryStore.triggerCompaction();
      }
      return { content: [{ type: "text" as const, text: "Memory stored." }] };
    },
  );

  const submitResult = tool(
    "submit_result",
    "Submit your final research report. This is REQUIRED before finishing. Write your complete report to a file using the Write tool, then call this with the file path. The file contents are what the requesting agent receives.",
    {
      path: z.string().describe("Path to the report file (written via the Write tool)"),
    },
    async (input) => {
      if (!readFile) {
        return { content: [{ type: "text" as const, text: "Error: readFile not available." }], isError: true };
      }
      try {
        const content = await readFile(input.path);
        await jobStore.writeResult(jobId, content);
        return { content: [{ type: "text" as const, text: "Result submitted." }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error reading file: ${msg}` }], isError: true };
      }
    },
  );

  return [updateSummary, recordDecision, logQuestion, storeMemory, submitResult];
}

// -- Worker tools MCP server factory --

/**
 * Create an in-process MCP server providing internal tools for a worker agent.
 * Returns a McpSdkServerConfigWithInstance that can be placed directly into
 * the mcpServers record passed to the Agent SDK's query().
 *
 * The server is named "worker-internal" and exposes five tools:
 * update_summary, record_decision, log_question, store_memory, submit_result.
 */
export function createWorkerTools(
  jobId: string,
  jobStore: JobStore,
  memoryStore: MemoryStore,
  readFileFn?: ReadFileFn,
): McpSdkServerConfigWithInstance {
  const tools = createWorkerToolDefs(jobId, jobStore, memoryStore, readFileFn);

  // Cast required: createSdkMcpServer expects SdkMcpToolDefinition<any>[]
  // but our tools are concretely typed per-schema. The SDK accepts both.
  return createSdkMcpServer({
    name: "worker-internal",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: tools as SdkMcpToolDefinition<any>[],
  });
}
