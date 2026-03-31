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

// -- Generated file exclusion patterns --

// Specific lockfile entries (package-lock.json, yarn.lock, etc.) overlap with *.lock
// in the pattern matcher but serve two purposes: (1) they're passed as git pathspec
// arguments where exact names are more reliable, and (2) they document the full
// inventory of excluded files for readability.
export const GENERATED_FILE_EXCLUSIONS: Array<{ pattern: string; category: string }> = [
  { pattern: "*.lock", category: "lockfile" },
  { pattern: "package-lock.json", category: "lockfile" },
  { pattern: "yarn.lock", category: "lockfile" },
  { pattern: "bun.lockb", category: "lockfile" },
  { pattern: "poetry.lock", category: "lockfile" },
  { pattern: "Gemfile.lock", category: "lockfile" },
  { pattern: "composer.lock", category: "lockfile" },
  { pattern: "Cargo.lock", category: "lockfile" },
  { pattern: "*.min.js", category: "minified" },
  { pattern: "*.min.css", category: "minified" },
  { pattern: "dist/*", category: "build artifact" },
  { pattern: "build/*", category: "build artifact" },
  { pattern: ".next/*", category: "build artifact" },
  { pattern: "out/*", category: "build artifact" },
  { pattern: "target/*", category: "build artifact" },
  { pattern: "__pycache__/*", category: "cache" },
  { pattern: ".cache/*", category: "cache" },
  { pattern: "*.pyc", category: "compiled" },
];

// -- Pattern matching helpers --

/**
 * Test whether a file path matches any exclusion pattern.
 * Returns the first matching exclusion entry, or null.
 *
 * Matching rules:
 * - `*.ext` patterns: file name ends with `.ext`
 * - `dir/*` patterns: file path starts with `dir/`
 * - Exact name patterns: file basename matches exactly
 */
export function matchesExclusionPattern(
  filePath: string,
  exclusions: typeof GENERATED_FILE_EXCLUSIONS,
): { pattern: string; category: string } | null {
  const basename = filePath.includes("/") ? filePath.slice(filePath.lastIndexOf("/") + 1) : filePath;

  for (const exclusion of exclusions) {
    const { pattern } = exclusion;

    if (pattern.startsWith("*") && !pattern.includes("/")) {
      // Wildcard extension: *.lock, *.min.js, *.pyc
      const suffix = pattern.slice(1); // e.g. ".lock"
      if (basename.endsWith(suffix)) return exclusion;
    } else if (pattern.endsWith("/*")) {
      // Directory prefix: dist/*, build/*, __pycache__/*
      const dir = pattern.slice(0, -2); // e.g. "dist"
      if (filePath.startsWith(dir + "/")) return exclusion;
    } else {
      // Exact basename: package-lock.json, yarn.lock
      if (basename === pattern) return exclusion;
    }
  }

  return null;
}

/**
 * Build a summary of files excluded by generated file filters.
 * Parses git --stat output and tests each path against exclusion patterns.
 * Returns empty string if no files match.
 */
export function buildExcludedSummary(
  statOutput: string,
  exclusions: typeof GENERATED_FILE_EXCLUSIONS,
): string {
  if (!statOutput) return "";

  const excluded: Array<{ file: string; category: string }> = [];

  for (const line of statOutput.split("\n")) {
    // Stat lines look like: " path | N +++---"
    const pipeIndex = line.indexOf(" | ");
    if (pipeIndex === -1) continue;

    // Skip the summary line ("N files changed, ...")
    const afterPipe = line.slice(pipeIndex + 3).trim();
    if (afterPipe.includes("changed")) continue;

    const filePath = line.slice(0, pipeIndex).trim();
    if (!filePath) continue;

    const match = matchesExclusionPattern(filePath, exclusions);
    if (match) {
      excluded.push({ file: filePath, category: match.category });
    }
  }

  if (excluded.length === 0) return "";

  const fileList = excluded.map((e) => `${e.file} (${e.category})`).join(", ");
  return `[${excluded.length} files excluded by default filters: ${fileList}]\nUse include_generated=true to include these files.`;
}

// -- Per-file and total output caps --

export const DEFAULT_MAX_FILE_SIZE = 20_480;
export const MAX_TOTAL_OUTPUT = 102_400;

/**
 * Split a unified diff into per-file segments.
 * Each segment starts with a `diff --git a/<path> b/<path>` header.
 * The path is extracted from the `b/` side (destination path).
 */
export function splitDiffByFile(diffOutput: string): Array<{ path: string; content: string }> {
  if (!diffOutput.trim()) return [];

  const files: Array<{ path: string; content: string }> = [];
  const headerPattern = /^diff --git a\/.+ b\/(.+)$/gm;

  let match: RegExpExecArray | null;
  const starts: Array<{ path: string; index: number }> = [];

  while ((match = headerPattern.exec(diffOutput)) !== null) {
    starts.push({ path: match[1], index: match.index });
  }

  if (starts.length === 0) return [];

  for (let i = 0; i < starts.length; i++) {
    const start = starts[i].index;
    const end = i + 1 < starts.length ? starts[i + 1].index : diffOutput.length;
    files.push({
      path: starts[i].path,
      content: diffOutput.slice(start, end),
    });
  }

  return files;
}

/**
 * Apply per-file size cap. Files exceeding maxFileSize get replaced with a
 * truncation notice. Set maxFileSize to 0 to disable capping.
 */
export function applyPerFileCap(
  files: Array<{ path: string; content: string }>,
  maxFileSize: number,
): Array<{ path: string; content: string; capped: boolean }> {
  if (maxFileSize === 0) {
    return files.map((f) => ({ ...f, capped: false }));
  }

  const sizeLabel = Math.round(maxFileSize / 1024) + "KB";

  return files.map((f) => {
    if (f.content.length <= maxFileSize) {
      return { ...f, capped: false };
    }

    const actualSize = f.content.length;
    const notice =
      `diff --git a/${f.path} b/${f.path}\n` +
      `[File diff exceeds ${sizeLabel} limit (${actualSize}). Use git_diff with file="${f.path}" to view full diff.]`;
    return { path: f.path, content: notice + "\n", capped: true };
  });
}

/**
 * Apply total output cap. Includes files until adding the next one would
 * exceed maxTotal, then appends a truncation notice listing remaining files.
 */
export function applyTotalCap(
  files: Array<{ path: string; content: string; capped: boolean }>,
  maxTotal: number,
): string {
  if (files.length === 0) return "";

  let total = 0;
  const included: string[] = [];
  const remaining: string[] = [];

  for (const file of files) {
    if (remaining.length > 0) {
      remaining.push(file.path);
      continue;
    }

    if (total + file.content.length > maxTotal && included.length > 0) {
      remaining.push(file.path);
      continue;
    }

    included.push(file.content);
    total += file.content.length;
  }

  let output = included.join("");

  if (remaining.length > 0) {
    const sizeLabel = Math.round(maxTotal / 1024) + "KB";
    output +=
      `[Output truncated at ${sizeLabel}. ${remaining.length} remaining files not shown: ${remaining.join(", ")}]\n` +
      `Use git_diff with file="<path>" to inspect specific files.\n`;
  }

  return output;
}

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
      },
      async (args) => {
        const gitArgs = ["log", `--format=${logFormat}`];

        gitArgs.push(`-n${args.count ?? 20}`);
        if (args.since) gitArgs.push(`--since=${args.since}`);
        if (args.author) gitArgs.push(`--author=${args.author}`);

        const { stdout } = await runGit(workingDirectory, gitArgs);
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
        include_binary: z.boolean().optional().describe("Include binary file diffs in output (default: false). Warning: can produce very large output."),
        include_generated: z.boolean().optional().describe("Include lockfiles, build artifacts, and other generated files in diff (default: false)."),
        max_file_size: z.number().optional().describe("Maximum bytes per file diff before truncation (default: 20480). Set to 0 to disable."),
      },
      async (args) => {
        // Build the excluded file summary before running the filtered diff
        let excludedSummary = "";
        if (!args.include_generated) {
          const statArgs = ["diff", "--stat"];
          if (args.staged) statArgs.push("--cached");
          if (args.ref) statArgs.push(args.ref);
          if (args.file) {
            statArgs.push("--");
            statArgs.push(args.file);
          }
          const { stdout: statOut } = await runGit(workingDirectory, statArgs, { allowNonZero: true });
          excludedSummary = buildExcludedSummary(statOut, GENERATED_FILE_EXCLUSIONS);
        }

        const gitArgs = ["diff"];
        if (!args.include_binary) gitArgs.push("--no-binary");
        if (args.staged) gitArgs.push("--cached");
        if (args.ref) gitArgs.push(args.ref);

        // Pathspec separator and arguments
        if (args.file || !args.include_generated) {
          gitArgs.push("--");
          if (args.file) gitArgs.push(args.file);
          if (!args.include_generated) {
            for (const exclusion of GENERATED_FILE_EXCLUSIONS) {
              gitArgs.push(`:!${exclusion.pattern}`);
            }
          }
        }

        const { stdout } = await runGit(workingDirectory, gitArgs, { allowNonZero: true });

        // Pipeline: split → per-file cap → total cap → reassemble
        const maxFileSize = args.max_file_size ?? DEFAULT_MAX_FILE_SIZE;
        const fileDiffs = splitDiffByFile(stdout);
        let output: string;
        if (fileDiffs.length > 0) {
          const capped = applyPerFileCap(fileDiffs, maxFileSize);
          output = applyTotalCap(capped, MAX_TOTAL_OUTPUT);
        } else {
          output = stdout || "(no differences)";
        }

        if (excludedSummary) {
          output = output + "\n\n" + excludedSummary;
        }
        return { content: [{ type: "text", text: output }] };
      },
    ),
    tool(
      "git_show",
      "Show commit details with diff for a given ref.",
      {
        ref: z.string().describe("The commit ref to show (e.g. 'HEAD', 'abc1234', 'main~2')"),
        include_binary: z.boolean().optional().describe("Include binary file diffs in output (default: false). Warning: can produce very large output."),
        include_generated: z.boolean().optional().describe("Include lockfiles, build artifacts, and other generated files in diff (default: false)."),
        max_file_size: z.number().optional().describe("Maximum bytes per file diff before truncation (default: 20480). Set to 0 to disable."),
      },
      async (args) => {
        const showFormat = `%H${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%b${LOG_SEPARATOR}`;
        const { stdout: headerOut } = await runGit(workingDirectory, [
          "show", "--no-patch", `--format=${showFormat}`, args.ref,
        ]);

        // Build excluded file summary before running the filtered diff
        let excludedSummary = "";
        if (!args.include_generated) {
          const statArgs = ["diff-tree", "--stat", "--root", args.ref];
          const { stdout: statOut } = await runGit(workingDirectory, statArgs, { allowNonZero: true });
          excludedSummary = buildExcludedSummary(statOut, GENERATED_FILE_EXCLUSIONS);
        }

        // Use git diff-tree with --root to handle initial commits (no parent).
        // --root makes diff-tree show the full diff for root commits instead of erroring.
        const diffTreeArgs = ["diff-tree", "--root"];
        if (!args.include_binary) diffTreeArgs.push("--no-binary");
        diffTreeArgs.push("-p", args.ref);
        if (!args.include_generated) {
          diffTreeArgs.push("--");
          for (const exclusion of GENERATED_FILE_EXCLUSIONS) {
            diffTreeArgs.push(`:!${exclusion.pattern}`);
          }
        }

        const { stdout: diffOut } = await runGit(workingDirectory, diffTreeArgs, { allowNonZero: true });

        // Pipeline: split → per-file cap → total cap → reassemble
        const maxFileSize = args.max_file_size ?? DEFAULT_MAX_FILE_SIZE;
        const fileDiffs = splitDiffByFile(diffOut);
        let processedDiff: string;
        if (fileDiffs.length > 0) {
          const capped = applyPerFileCap(fileDiffs, maxFileSize);
          processedDiff = applyTotalCap(capped, MAX_TOTAL_OUTPUT);
        } else {
          processedDiff = diffOut;
        }

        const fields = headerOut.replace(LOG_SEPARATOR, "").split(FIELD_SEPARATOR);
        const body = fields[4]?.trim();
        const result: Record<string, string> = {
          hash: fields[0]?.trim() ?? "",
          author: fields[1]?.trim() ?? "",
          date: fields[2]?.trim() ?? "",
          subject: fields[3]?.trim() ?? "",
          ...(body ? { body } : {}),
          diff: processedDiff,
        };
        if (excludedSummary) {
          result.excluded = excludedSummary;
        }

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
