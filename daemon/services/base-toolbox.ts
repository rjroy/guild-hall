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
import { readArtifact, writeArtifactContent, scanArtifacts } from "@/lib/artifacts";
import { isNodeError } from "@/lib/types";
import { projectLorePath } from "@/lib/paths";

// -- Types --

export interface BaseToolboxDeps {
  projectPath: string;
  contextId: string;                          // meetingId or commissionId
  contextType: "meeting" | "commission";      // determines storage path
  guildHallHome?: string;                     // defaults to ~/.guild-hall
}

// -- Path safety --

/**
 * Resolves a path within a base directory and verifies it doesn't escape.
 * Throws on path traversal attempts.
 */
function validateContainedPath(basePath: string, userPath: string): string {
  const resolvedBase = path.resolve(basePath);
  const resolved = path.resolve(basePath, userPath);
  if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
    throw new Error(`Path traversal detected: ${userPath} escapes ${basePath}`);
  }
  return resolved;
}

// -- Memory scope resolution --

function resolveMemoryBase(
  guildHallHome: string,
  scope: "global" | "project" | "worker",
  projectName?: string,
  workerName?: string,
): string {
  const memoryRoot = path.join(guildHallHome, "memory");
  switch (scope) {
    case "global":
      return path.join(memoryRoot, "global");
    case "project":
      return path.join(memoryRoot, "projects", projectName ?? "unknown");
    case "worker":
      return path.join(memoryRoot, "workers", workerName ?? "unknown");
  }
}

// -- Tool handler factories --
// Each factory returns a tool handler function that can be tested independently
// or registered with the MCP server.

export function makeReadMemoryHandler(guildHallHome: string) {
  return async (args: {
    scope: "global" | "project" | "worker";
    path?: string | undefined;
  }): Promise<ToolResult> => {
    const base = resolveMemoryBase(guildHallHome, args.scope);
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

export function makeWriteMemoryHandler(guildHallHome: string) {
  return async (args: {
    scope: "global" | "project" | "worker";
    path: string;
    content: string;
  }): Promise<ToolResult> => {
    const base = resolveMemoryBase(guildHallHome, args.scope);
    const targetPath = validateContainedPath(base, args.path);

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, args.content, "utf-8");
    return {
      content: [{ type: "text", text: `Written: ${args.scope}/${args.path}` }],
    };
  };
}

export function makeReadArtifactHandler(projectPath: string) {
  return async (args: { relativePath: string }): Promise<ToolResult> => {
    const lorePath = projectLorePath(projectPath);
    try {
      const artifact = await readArtifact(lorePath, args.relativePath);
      const frontmatterSummary = [
        `title: ${artifact.meta.title}`,
        `date: ${artifact.meta.date}`,
        `status: ${artifact.meta.status}`,
        `tags: ${artifact.meta.tags.join(", ")}`,
      ].join("\n");

      return {
        content: [
          { type: "text", text: `--- Frontmatter ---\n${frontmatterSummary}\n\n--- Content ---\n${artifact.content}` },
        ],
      };
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === "ENOENT") {
        return {
          content: [{ type: "text", text: `Artifact not found: ${args.relativePath}` }],
          isError: true,
        };
      }
      throw err;
    }
  };
}

export function makeWriteArtifactHandler(projectPath: string) {
  return async (args: {
    relativePath: string;
    content: string;
  }): Promise<ToolResult> => {
    const lorePath = projectLorePath(projectPath);
    try {
      await writeArtifactContent(lorePath, args.relativePath, args.content);
      return {
        content: [{ type: "text", text: `Updated: ${args.relativePath}` }],
      };
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === "ENOENT") {
        return {
          content: [{ type: "text", text: `Artifact not found: ${args.relativePath}` }],
          isError: true,
        };
      }
      throw err;
    }
  };
}

export function makeListArtifactsHandler(projectPath: string) {
  return async (args: {
    directory?: string | undefined;
  }): Promise<ToolResult> => {
    const lorePath = projectLorePath(projectPath);
    const artifacts = await scanArtifacts(lorePath);

    const filtered = args.directory
      ? artifacts.filter((a) => a.relativePath.startsWith(args.directory!))
      : artifacts;

    if (filtered.length === 0) {
      return {
        content: [{ type: "text", text: "(no artifacts found)" }],
      };
    }

    const listing = filtered.map(
      (a) => `${a.relativePath} [${a.meta.status || "no status"}] ${a.meta.title || "(untitled)"}`
    );
    return {
      content: [{ type: "text", text: listing.join("\n") }],
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
 * every worker, providing memory, artifact, and decision-recording tools.
 */
export function createBaseToolbox(deps: BaseToolboxDeps): McpSdkServerConfigWithInstance {
  const guildHallHome = deps.guildHallHome ?? defaultGuildHallHome();

  const readMemory = makeReadMemoryHandler(guildHallHome);
  const writeMemory = makeWriteMemoryHandler(guildHallHome);
  const readArtifactHandler = makeReadArtifactHandler(deps.projectPath);
  const writeArtifactHandler = makeWriteArtifactHandler(deps.projectPath);
  const listArtifactsHandler = makeListArtifactsHandler(deps.projectPath);
  const recordDecision = makeRecordDecisionHandler(guildHallHome, deps.contextId, deps.contextType);

  return createSdkMcpServer({
    name: "guild-hall-base",
    version: "0.1.0",
    tools: [
      tool(
        "read_memory",
        "Read from the shared memory system. Scope: global (all workers, all projects), project (all workers, one project), worker (one worker, all projects). If path is a directory, lists contents. If path is a file, returns content. If path omitted, lists the scope root.",
        {
          scope: z.enum(["global", "project", "worker"]),
          path: z.string().optional(),
        },
        (args) => readMemory(args),
      ),
      tool(
        "write_memory",
        "Write to the shared memory system. Creates parent directories as needed. Scope: global, project, or worker.",
        {
          scope: z.enum(["global", "project", "worker"]),
          path: z.string(),
          content: z.string(),
        },
        (args) => writeMemory(args),
      ),
      tool(
        "read_artifact",
        "Read an artifact from the project's .lore/ directory. Returns parsed frontmatter and body content.",
        {
          relativePath: z.string(),
        },
        (args) => readArtifactHandler(args),
      ),
      tool(
        "write_artifact",
        "Update an artifact's body content in the project's .lore/ directory. Preserves existing frontmatter.",
        {
          relativePath: z.string(),
          content: z.string(),
        },
        (args) => writeArtifactHandler(args),
      ),
      tool(
        "list_artifacts",
        "List artifacts in the project's .lore/ directory. Optionally filter by subdirectory prefix.",
        {
          directory: z.string().optional(),
        },
        (args) => listArtifactsHandler(args),
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

// -- Helpers --

function defaultGuildHallHome(): string {
  const home = process.env.HOME;
  if (!home) {
    throw new Error("Cannot determine home directory: HOME is not set");
  }
  return path.join(home, ".guild-hall");
}
