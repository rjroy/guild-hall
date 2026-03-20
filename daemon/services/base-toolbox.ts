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
import { memoryScopeFile, memoryScopeDir, migrateIfNeeded } from "./memory-injector";
import type { MemoryScope } from "./memory-injector";
import {
  parseMemorySections,
  renderMemorySections,
  withMemoryLock,
} from "./memory-sections";
import type { ToolboxFactory } from "./toolbox-types";
import type { BriefingResult } from "./briefing-generator";

// -- Constants --

const DEFAULT_MEMORY_LIMIT = 16000;

// -- Types --

interface BaseToolboxDeps {
  contextId: string;
  contextType: "meeting" | "commission" | "mail" | "briefing";
  workerName: string;
  projectName: string;
  guildHallHome: string;
  getCachedBriefing?: (projectName: string) => Promise<BriefingResult | null>;
}

// -- Helpers --

function resolveScopeKey(
  scope: MemoryScope,
  workerName: string,
  projectName: string,
): string {
  switch (scope) {
    case "global": return "global";
    case "project": return projectName;
    case "worker": return workerName;
  }
}

function mutexKey(scope: MemoryScope, scopeKey: string): string {
  return `${scope}:${scopeKey}`;
}

/**
 * Reads a memory scope file, returning its content or empty string if not found.
 */
async function readScopeFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") return "";
    throw err;
  }
}

/**
 * Atomic write: write to temp file then rename. Prevents partial writes.
 */
async function atomicWrite(filePath: string, content: string): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tmpPath, content, "utf-8");
  await fs.rename(tmpPath, filePath);
}

// -- Tool handler factories --

export function makeReadMemoryHandler(
  guildHallHome: string,
  workerName: string,
  projectName: string,
  readScopes: Set<string>,
) {
  return async (args: {
    scope: MemoryScope;
    section?: string | undefined;
  }): Promise<ToolResult> => {
    const scopeKey = resolveScopeKey(args.scope, workerName, projectName);
    const filePath = memoryScopeFile(guildHallHome, args.scope, scopeKey);

    // Auto-migrate legacy directory on first read (REQ-MEM-23)
    const legacyDir = memoryScopeDir(guildHallHome, args.scope, scopeKey);
    await migrateIfNeeded(filePath, legacyDir);

    const content = await readScopeFile(filePath);

    // Track that this scope has been read (for edit_memory guard)
    readScopes.add(args.scope);

    if (content === "") {
      return {
        content: [{ type: "text", text: "No memories saved yet." }],
      };
    }

    if (!args.section) {
      return { content: [{ type: "text", text: content }] };
    }

    // Section-specific read (case-insensitive)
    const sections = parseMemorySections(content);
    const match = sections.find(
      (s) => s.name.toLowerCase() === args.section!.toLowerCase(),
    );
    if (!match) {
      return {
        content: [{ type: "text", text: `Section not found: ${args.section}` }],
        isError: true,
      };
    }
    return { content: [{ type: "text", text: match.content }] };
  };
}

export function makeEditMemoryHandler(
  guildHallHome: string,
  workerName: string,
  projectName: string,
  readScopes: Set<string>,
) {
  return async (args: {
    scope: MemoryScope;
    section: string;
    operation: "upsert" | "append" | "delete";
    content?: string | undefined;
  }): Promise<ToolResult> => {
    // Read-before-write guard (REQ-MEM-27)
    if (!readScopes.has(args.scope)) {
      return {
        content: [{
          type: "text",
          text: `Read memory before editing. Call read_memory with scope '${args.scope}' first.`,
        }],
        isError: true,
      };
    }

    // Validate section name (REQ-MEM-3)
    if (!args.section || args.section.length === 0) {
      return {
        content: [{ type: "text", text: "Section name must be non-empty." }],
        isError: true,
      };
    }
    if (args.section.includes("\n")) {
      return {
        content: [{ type: "text", text: "Section name must not contain newlines." }],
        isError: true,
      };
    }
    if (args.section.length >= 100) {
      return {
        content: [{ type: "text", text: "Section name must be under 100 characters." }],
        isError: true,
      };
    }

    // Validate content for upsert/append
    if (args.operation !== "delete" && (args.content === undefined || args.content === null)) {
      return {
        content: [{ type: "text", text: `Content is required for '${args.operation}' operation.` }],
        isError: true,
      };
    }

    const scopeKey = resolveScopeKey(args.scope, workerName, projectName);
    const filePath = memoryScopeFile(guildHallHome, args.scope, scopeKey);
    const lockKey = mutexKey(args.scope, scopeKey);

    return withMemoryLock(lockKey, async () => {
      const raw = await readScopeFile(filePath);
      let sections = parseMemorySections(raw);

      // Find existing section (case-insensitive)
      const idx = sections.findIndex(
        (s) => s.name.toLowerCase() === args.section.toLowerCase(),
      );

      switch (args.operation) {
        case "upsert": {
          if (idx >= 0) {
            // Replace content, preserve original casing
            sections[idx] = { name: sections[idx].name, content: args.content! + "\n" };
          } else {
            // Append new section with provided casing
            sections.push({ name: args.section, content: args.content! + "\n" });
          }
          break;
        }
        case "append": {
          if (idx >= 0) {
            // Append with blank line separator
            const existing = sections[idx].content.trimEnd();
            sections[idx] = {
              name: sections[idx].name,
              content: existing + "\n\n" + args.content! + "\n",
            };
          } else {
            sections.push({ name: args.section, content: args.content! + "\n" });
          }
          break;
        }
        case "delete": {
          if (idx >= 0) {
            sections = sections.filter((_, i) => i !== idx);
          }
          // Idempotent: missing section returns success
          break;
        }
      }

      const rendered = sections.length > 0 ? renderMemorySections(sections) : "";
      await atomicWrite(filePath, rendered);

      // Budget warning (REQ-MEM-11)
      const charCount = rendered.length;
      let message = `Memory updated: ${args.scope}/${args.section} (${args.operation})`;
      if (charCount > DEFAULT_MEMORY_LIMIT) {
        const pct = Math.round((charCount / DEFAULT_MEMORY_LIMIT) * 100);
        message += `\n\nMemory file is at ${charCount} characters (${pct}% of ${DEFAULT_MEMORY_LIMIT} budget). Consider condensing older entries.`;
      }

      return { content: [{ type: "text", text: message }] };
    });
  };
}

/**
 * Deprecated alias: maps write_memory(scope, path, content) to
 * edit_memory(scope, section=path, operation="upsert", content=content).
 */
export function makeWriteMemoryHandler(
  guildHallHome: string,
  workerName: string,
  projectName: string,
  readScopes: Set<string>,
) {
  const editMemory = makeEditMemoryHandler(guildHallHome, workerName, projectName, readScopes);

  return async (args: {
    scope: MemoryScope;
    path: string;
    content: string;
  }): Promise<ToolResult> => {
    return editMemory({
      scope: args.scope,
      section: args.path,
      operation: "upsert",
      content: args.content,
    });
  };
}

export function makeProjectBriefingHandler(
  getCachedBriefing: ((projectName: string) => Promise<BriefingResult | null>) | undefined,
  projectName: string,
) {
  return async (): Promise<ToolResult> => {
    if (!getCachedBriefing) {
      return {
        content: [{ type: "text", text: "Project briefing is not available in this context." }],
      };
    }

    const result = await getCachedBriefing(projectName);
    if (!result) {
      return {
        content: [{ type: "text", text: "No project briefing is currently cached. The background refresh may not have run yet." }],
      };
    }

    return {
      content: [{ type: "text", text: `${result.briefing}\n\n(Generated: ${result.generatedAt})` }],
    };
  };
}

export function makeRecordDecisionHandler(
  guildHallHome: string,
  contextId: string,
  contextType: "meeting" | "commission" | "mail" | "briefing",
) {
  const stateSubdir = contextType === "meeting" ? "meetings" : contextType === "briefing" ? "briefings" : "commissions";
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
 */
/** ToolboxFactory adapter for the base toolbox. */
export const baseToolboxFactory: ToolboxFactory = (deps) => ({
  server: createBaseToolbox(deps),
});

export function createBaseToolbox(deps: BaseToolboxDeps): McpSdkServerConfigWithInstance {
  // Per-toolbox read tracking for REQ-MEM-27 read-before-write guard.
  // Each SDK session gets its own toolbox instance, so no cross-session sharing.
  const readScopes = new Set<string>();

  const readMemory = makeReadMemoryHandler(deps.guildHallHome, deps.workerName, deps.projectName, readScopes);
  const editMemory = makeEditMemoryHandler(deps.guildHallHome, deps.workerName, deps.projectName, readScopes);
  const writeMemory = makeWriteMemoryHandler(deps.guildHallHome, deps.workerName, deps.projectName, readScopes);
  const recordDecision = makeRecordDecisionHandler(deps.guildHallHome, deps.contextId, deps.contextType);
  const projectBriefing = makeProjectBriefingHandler(deps.getCachedBriefing, deps.projectName);

  return createSdkMcpServer({
    name: "guild-hall-base",
    version: "0.1.0",
    tools: [
      tool(
        "read_memory",
        "Read from the shared memory system. Scope: global (shared across all workers and projects), project (shared across all workers in the active project), worker (private to you, no other worker can access). Worker scope always reads YOUR memory; you cannot access another worker's memory. Without a section parameter, returns the full memory file. With a section parameter, returns only that section's content (case-insensitive match).",
        {
          scope: z.enum(["global", "project", "worker"]),
          section: z.string().optional(),
        },
        (args) => readMemory(args),
      ),
      tool(
        "edit_memory",
        "Edit the shared memory system. Operates on named sections within a single memory file per scope. Scope: global (shared across all workers and projects), project (shared across all workers in the active project), worker (private to you, no other worker can access). Operations: upsert (replace or create section), append (add to section with blank line separator), delete (remove section). You must call read_memory for the scope before editing.",
        {
          scope: z.enum(["global", "project", "worker"]),
          section: z.string(),
          operation: z.enum(["upsert", "append", "delete"]),
          content: z.string().optional(),
        },
        (args) => editMemory(args),
      ),
      tool(
        "write_memory",
        "[DEPRECATED: Use edit_memory instead.] Write to the shared memory system. Maps to edit_memory upsert. The 'path' parameter becomes the section name.",
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
      tool(
        "project_briefing",
        "Get the current project status briefing. Returns a summary of active commissions, meetings, and recent activity. Read-only, returns cached data.",
        {},
        () => projectBriefing(),
      ),
    ],
  });
}
