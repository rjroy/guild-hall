import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  createSdkMcpServer,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  McpSdkServerConfigWithInstance,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";
import type { ToolResult } from "@/daemon/types";
import { isNodeError } from "@/lib/types";
import { validateContainedPath } from "@/daemon/lib/toolbox-utils";
import { memoryScopeDir } from "./memory-injector";
import type { ToolboxFactory } from "./toolbox-types";

// -- Types --

interface BaseToolboxDeps {
  contextId: string;                          // meetingId or commissionId
  contextType: "meeting" | "commission";      // determines storage path
  workerName: string;                         // identity of the active worker (enforces worker scope)
  projectName: string;                        // active project name (enforces project scope)
  guildHallHome: string;
}

// -- Tool handler factories --
// Each factory returns a tool handler function that can be tested independently
// or registered with the MCP server.

export function makeReadMemoryHandler(
  guildHallHome: string,
  workerName: string,
  projectName: string,
) {
  return async (args: {
    scope: "global" | "project" | "worker";
    path?: string | undefined;
  }): Promise<ToolResult> => {
    const scopeKey = args.scope === "project" ? projectName : args.scope === "worker" ? workerName : "global";
    const base = memoryScopeDir(guildHallHome, args.scope, scopeKey);
    const targetPath = args.path
      ? validateContainedPath(base, args.path)
      : base;

    try {
      const stat = await fs.stat(targetPath);
      if (stat.isDirectory()) {
        const entries = await fs.readdir(targetPath, { withFileTypes: true });
        const listing = entries.map((e) =>
          e.isDirectory() ? `${e.name}/` : e.name
        );
        return {
          content: [{ type: "text", text: listing.join("\n") || "(empty)" }],
        };
      }
      const content = await fs.readFile(targetPath, "utf-8");
      return { content: [{ type: "text", text: content }] };
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === "ENOENT") {
        return {
          content: [{ type: "text", text: `Not found: ${args.path ?? "(root)"}` }],
          isError: true,
        };
      }
      throw err;
    }
  };
}

export function makeWriteMemoryHandler(
  guildHallHome: string,
  workerName: string,
  projectName: string,
) {
  return async (args: {
    scope: "global" | "project" | "worker";
    path: string;
    content: string;
  }): Promise<ToolResult> => {
    const scopeKey = args.scope === "project" ? projectName : args.scope === "worker" ? workerName : "global";
    const base = memoryScopeDir(guildHallHome, args.scope, scopeKey);
    const targetPath = validateContainedPath(base, args.path);

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, args.content, "utf-8");
    return {
      content: [{ type: "text", text: `Written: ${args.scope}/${args.path}` }],
    };
  };
}

export function makeRecordDecisionHandler(
  guildHallHome: string,
  contextId: string,
  contextType: "meeting" | "commission",
) {
  const stateSubdir = contextType === "meeting" ? "meetings" : "commissions";
  return async (args: {
    question: string;
    decision: string;
    reasoning: string;
  }): Promise<ToolResult> => {
    const decisionsDir = path.join(
      guildHallHome,
      "state",
      stateSubdir,
      contextId,
    );
    const decisionsPath = path.join(decisionsDir, "decisions.jsonl");

    const entry = {
      timestamp: new Date().toISOString(),
      question: args.question,
      decision: args.decision,
      reasoning: args.reasoning,
    };

    await fs.mkdir(decisionsDir, { recursive: true });
    await fs.appendFile(decisionsPath, JSON.stringify(entry) + "\n", "utf-8");

    return {
      content: [{ type: "text", text: `Decision recorded for ${contextType} ${contextId}` }],
    };
  };
}

// -- MCP server factory --

/**
 * Creates the base toolbox MCP server. This toolbox is always present for
 * every worker, providing memory and decision-recording tools.
 *
 * Workers access .lore/ artifacts directly via filesystem (the activity
 * worktree has .lore/ via sparse checkout). Context-specific tools
 * (commission toolbox, meeting toolbox) handle structured updates that
 * need metadata tracking and daemon notifications.
 */
/** ToolboxFactory adapter for the base toolbox. */
export const baseToolboxFactory: ToolboxFactory = (deps) => ({
  server: createBaseToolbox(deps),
});

export function createBaseToolbox(deps: BaseToolboxDeps): McpSdkServerConfigWithInstance {
  const readMemory = makeReadMemoryHandler(deps.guildHallHome, deps.workerName, deps.projectName);
  const writeMemory = makeWriteMemoryHandler(deps.guildHallHome, deps.workerName, deps.projectName);
  const recordDecision = makeRecordDecisionHandler(deps.guildHallHome, deps.contextId, deps.contextType);

  return createSdkMcpServer({
    name: "guild-hall-base",
    version: "0.1.0",
    tools: [
      tool(
        "read_memory",
        "Read from the shared memory system. Scope: global (shared across all workers and projects), project (shared across all workers in the active project), worker (private to you, no other worker can access). Worker scope always reads YOUR memory; you cannot access another worker's memory. If path is a directory, lists contents. If path is a file, returns content. If path omitted, lists the scope root.",
        {
          scope: z.enum(["global", "project", "worker"]),
          path: z.string().optional(),
        },
        (args) => readMemory(args),
      ),
      tool(
        "write_memory",
        "Write to the shared memory system. Creates parent directories as needed. Scope: global (shared across all workers and projects), project (shared across all workers in the active project), worker (private to you, no other worker can access). Worker scope always writes to YOUR memory; you cannot write to another worker's memory.",
        {
          scope: z.enum(["global", "project", "worker"]),
          path: z.string(),
          content: z.string(),
        },
        (args) => writeMemory(args),
      ),
      tool(
        "record_decision",
        "Record a decision made during this session. Appends to the session's decision log.",
        {
          question: z.string(),
          decision: z.string(),
          reasoning: z.string(),
        },
        (args) => recordDecision(args),
      ),
    ],
  });
}

