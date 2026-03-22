/**
 * Git-readonly toolbox: provides structured read-only git tools via MCP.
 *
 * Workers that lose Bash but need git inspection get this toolbox via
 * systemToolboxes: ["git-readonly"]. All tools wrap git subprocess calls
 * through cleanGitEnv() and return structured data, not raw output.
 *
 * REQ-WTB-1, REQ-WTB-2, REQ-WTB-3
 */

import {
  createSdkMcpServer,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";
import { cleanGitEnv } from "@/daemon/lib/git";
import type { ToolboxFactory } from "./toolbox-types";

// -- Types --

export interface GitRunnerResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type GitRunner = (
  cwd: string,
  args: string[],
  opts?: { allowNonZero?: boolean },
) => Promise<GitRunnerResult>;

// -- Default git runner (production) --

async function defaultRunGit(
  cwd: string,
  args: string[],
  opts?: { allowNonZero?: boolean },
): Promise<GitRunnerResult> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: cleanGitEnv(),
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;

  if (exitCode !== 0 && !opts?.allowNonZero) {
    throw new Error(`git ${args[0]} failed (exit ${exitCode}): ${stderr.trim()}`);
  }

  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

// -- Parsers --

interface StatusResult {
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

export function parseGitStatus(porcelain: string): StatusResult {
  const staged: string[] = [];
  const unstaged: string[] = [];
  const untracked: string[] = [];

  if (porcelain === "") return { staged, unstaged, untracked };

  for (const line of porcelain.split("\n")) {
    if (line.length < 2) continue;
    const indexStatus = line[0];
    const workTreeStatus = line[1];
    const filePath = line.slice(3);

    if (indexStatus === "?" && workTreeStatus === "?") {
      untracked.push(filePath);
    } else {
      if (indexStatus !== " " && indexStatus !== "?") {
        staged.push(filePath);
      }
      if (workTreeStatus !== " " && workTreeStatus !== "?") {
        unstaged.push(filePath);
      }
    }
  }

  return { staged, unstaged, untracked };
}

interface CommitInfo {
  hash: string;
  author: string;
  date: string;
  subject: string;
  body?: string;
}

export const LOG_SEPARATOR = "---GH-COMMIT-SEP---";
export const FIELD_SEPARATOR = "---GH-FIELD-SEP---";

export function parseGitLog(raw: string): CommitInfo[] {
  if (raw === "") return [];

  const entries = raw.split(LOG_SEPARATOR).filter((e) => e.trim() !== "");
  return entries.map((entry) => {
    const fields = entry.split(FIELD_SEPARATOR);
    const body = fields[4]?.trim();
    return {
      hash: fields[0]?.trim() ?? "",
      author: fields[1]?.trim() ?? "",
      date: fields[2]?.trim() ?? "",
      subject: fields[3]?.trim() ?? "",
      ...(body ? { body } : {}),
    };
  });
}

interface BranchInfo {
  name: string;
  current: boolean;
}

export function parseGitBranch(raw: string): BranchInfo[] {
  if (raw === "") return [];

  return raw.split("\n").filter(Boolean).map((line) => {
    const current = line.startsWith("* ");
    const name = current ? line.slice(2).trim() : line.trim();
    return { name, current };
  });
}

// -- Toolbox factory --

/** Build the tool definitions array. Exported for direct handler testing. */
export function createGitReadonlyTools(
  workingDirectory: string,
  runGit: GitRunner = defaultRunGit,
) {
  const logFormat = `%H${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%b${LOG_SEPARATOR}`;

  return [
    tool(
      "git_status",
      "Show working tree state: staged, unstaged, and untracked files.",
      {},
      async () => {
        const { stdout } = await runGit(workingDirectory, ["status", "--porcelain=v1"]);
        const result = parseGitStatus(stdout);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      },
    ),
    tool(
      "git_log",
      "Show commit history with optional filters.",
      {
        count: z.number().optional().describe("Number of commits to show (default: 20)"),
        since: z.string().optional().describe("Show commits after this date (e.g. '2024-01-01')"),
        author: z.string().optional().describe("Filter by author name or email"),
        format: z.string().optional().describe("Custom format string (overrides structured output)"),
      },
      async (args) => {
        const gitArgs = ["log"];

        if (args.format) {
          gitArgs.push(`--format=${args.format}`);
        } else {
          gitArgs.push(`--format=${logFormat}`);
        }

        gitArgs.push(`-n${args.count ?? 20}`);
        if (args.since) gitArgs.push(`--since=${args.since}`);
        if (args.author) gitArgs.push(`--author=${args.author}`);

        const { stdout } = await runGit(workingDirectory, gitArgs);

        if (args.format) {
          return { content: [{ type: "text", text: stdout }] };
        }

        const commits = parseGitLog(stdout);
        return { content: [{ type: "text", text: JSON.stringify(commits, null, 2) }] };
      },
    ),
    tool(
      "git_diff",
      "Show unified diff of changes.",
      {
        staged: z.boolean().optional().describe("Show staged changes (--cached)"),
        ref: z.string().optional().describe("Diff against a ref (e.g. 'HEAD~3', 'main..feature')"),
        file: z.string().optional().describe("Scope diff to a specific file"),
      },
      async (args) => {
        const gitArgs = ["diff"];
        if (args.staged) gitArgs.push("--cached");
        if (args.ref) gitArgs.push(args.ref);
        if (args.file) {
          gitArgs.push("--");
          gitArgs.push(args.file);
        }

        const { stdout } = await runGit(workingDirectory, gitArgs, { allowNonZero: true });
        return { content: [{ type: "text", text: stdout || "(no differences)" }] };
      },
    ),
    tool(
      "git_show",
      "Show commit details with diff for a given ref.",
      {
        ref: z.string().describe("The commit ref to show (e.g. 'HEAD', 'abc1234', 'main~2')"),
      },
      async (args) => {
        const showFormat = `%H${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%b${LOG_SEPARATOR}`;
        const { stdout: headerOut } = await runGit(workingDirectory, [
          "show", "--no-patch", `--format=${showFormat}`, args.ref,
        ]);
        const { stdout: diffOut } = await runGit(workingDirectory, [
          "diff", `${args.ref}~1`, args.ref,
        ], { allowNonZero: true });

        const fields = headerOut.replace(LOG_SEPARATOR, "").split(FIELD_SEPARATOR);
        const body = fields[4]?.trim();
        const result = {
          hash: fields[0]?.trim() ?? "",
          author: fields[1]?.trim() ?? "",
          date: fields[2]?.trim() ?? "",
          subject: fields[3]?.trim() ?? "",
          ...(body ? { body } : {}),
          diff: diffOut,
        };

        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      },
    ),
    tool(
      "git_branch",
      "List branches.",
      {
        all: z.boolean().optional().describe("Include remote-tracking branches (--all)"),
        remote: z.boolean().optional().describe("Show only remote-tracking branches (--remotes)"),
      },
      async (args) => {
        const gitArgs = ["branch"];
        if (args.all) gitArgs.push("--all");
        else if (args.remote) gitArgs.push("--remotes");

        const { stdout } = await runGit(workingDirectory, gitArgs);
        const branches = parseGitBranch(stdout);
        return { content: [{ type: "text", text: JSON.stringify(branches, null, 2) }] };
      },
    ),
  ];
}

export function createGitReadonlyToolbox(
  workingDirectory: string,
  runGit: GitRunner = defaultRunGit,
) {
  return createSdkMcpServer({
    name: "guild-hall-git-readonly",
    version: "0.1.0",
    tools: createGitReadonlyTools(workingDirectory, runGit),
  });
}

/** ToolboxFactory adapter for the git-readonly toolbox. */
export const gitReadonlyToolboxFactory: ToolboxFactory = (deps) => ({
  server: createGitReadonlyToolbox(deps.workingDirectory ?? process.cwd()),
});
