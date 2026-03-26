import { existsSync, readFileSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import type { P4Runner, P4Result } from "./p4";
import { writeState } from "./state";
import {
  validateWhitelistModel,
  validateParentChains,
  ensureP4Exclusions,
  ensureP4Ignore,
} from "./gitignore";

/**
 * Generic subprocess runner. Used for git, attrib, chmod, and other
 * non-P4 commands. The first argument is the command name, the rest
 * are its arguments. Same result shape as P4Runner.
 */
export type CommandRunner = (
  command: string,
  args: string[],
) => Promise<P4Result>;

export type InitOptions = {
  workspaceDir: string;
  gitignorePath?: string;
  p4Runner: P4Runner;
  run?: CommandRunner;
  platform?: string;
};

export type InitResult = {
  baselineChangelist: number;
  trackedFileCount: number;
  warnings: string[];
};

function createDefaultRunner(): CommandRunner {
  return async (command, args) => {
    const proc = Bun.spawn([command, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    return { stdout, stderr, exitCode };
  };
}

/**
 * Initialize a disposable git repo from a P4 workspace.
 *
 * Follows REQ-P4A-12's 10-step sequence exactly:
 * 1. Validate preconditions (P4 workspace + .gitignore)
 * 2. Destroy existing git state (with worktree safety check)
 * 3. Record baseline P4 changelist
 * 4. git init
 * 5. Apply .gitignore with P4 exclusions
 * 6. Ensure .p4ignore excludes git artifacts
 * 7. Validate .gitignore parent chains (warnings)
 * 8. Make tracked files writable
 * 9. Create baseline commit
 * 10. Write adapter state
 *
 * Cleanup on partial failure (REQ-P4A-14): if any step after git init
 * fails, .git/ and .p4-adapter.json are removed before re-throwing.
 */
export async function init(options: InitOptions): Promise<InitResult> {
  const {
    workspaceDir,
    gitignorePath = join(workspaceDir, ".gitignore"),
    p4Runner,
    run = createDefaultRunner(),
    platform = process.platform,
  } = options;

  const warnings: string[] = [];

  // --- Step 1: Validate preconditions ---

  // 1a: Validate P4 workspace (REQ-P4A-10)
  const p4Info = await p4Runner(["info"]);
  if (p4Info.exitCode !== 0) {
    throw new Error(
      `Not a P4 workspace: ${workspaceDir}. Run p4 sync first.`,
    );
  }
  const clientRootMatch = p4Info.stdout.match(/Client root:\s*(.+)/i);
  if (!clientRootMatch) {
    throw new Error(
      `Not a P4 workspace: ${workspaceDir}. Run p4 sync first.`,
    );
  }
  const clientRoot = clientRootMatch[1].trim();
  const normalize = (p: string) =>
    p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  if (normalize(clientRoot) !== normalize(workspaceDir)) {
    throw new Error(
      `Not a P4 workspace: ${workspaceDir}. Run p4 sync first.`,
    );
  }

  // 1b: Validate .gitignore (REQ-P4A-11)
  if (!existsSync(gitignorePath)) {
    throw new Error(
      `No .gitignore found at ${gitignorePath}. Create a whitelist .gitignore before running init.`,
    );
  }
  const gitignoreContent = readFileSync(gitignorePath, "utf-8");
  const validation = validateWhitelistModel(gitignoreContent);
  if (!validation.valid) {
    throw new Error(
      `The .gitignore at ${gitignorePath} does not use the whitelist model. The first rule must be * (deny all).`,
    );
  }

  // --- Step 2: Destroy existing git state ---

  const gitDir = join(workspaceDir, ".git");
  if (existsSync(gitDir)) {
    // REQ-P4A-30: Check for active worktrees before destroying .git
    const worktreeResult = await run("git", [
      "-C",
      workspaceDir,
      "worktree",
      "list",
      "--porcelain",
    ]);
    if (worktreeResult.exitCode === 0) {
      const worktreeCount = (
        worktreeResult.stdout.match(/^worktree /gm) || []
      ).length;
      if (worktreeCount > 1) {
        throw new Error(
          "Active git worktrees found. Resolve all commissions and meetings before re-initializing.",
        );
      }
    }
    rmSync(gitDir, { recursive: true, force: true });
  }

  // --- Step 3: Record baseline P4 changelist ---

  const changesResult = await p4Runner(["changes", "-m1", "//...#have"]);
  if (changesResult.exitCode !== 0) {
    throw new Error(
      `Failed to get baseline changelist: ${changesResult.stderr}`,
    );
  }
  const clMatch = changesResult.stdout.match(/Change (\d+)/);
  if (!clMatch) {
    throw new Error(
      `Failed to parse baseline changelist from: ${changesResult.stdout}`,
    );
  }
  const baselineChangelist = parseInt(clMatch[1], 10);

  // Steps 4-10 wrapped in try/catch for cleanup on partial failure (REQ-P4A-14)
  try {
    // --- Step 4: Initialize git repo ---
    const gitInitResult = await run("git", ["init", workspaceDir]);
    if (gitInitResult.exitCode !== 0) {
      throw new Error(`git init failed: ${gitInitResult.stderr}`);
    }

    // --- Step 5: Apply .gitignore with P4 exclusions (REQ-P4A-6) ---
    const finalGitignoreContent = ensureP4Exclusions(gitignoreContent);
    writeFileSync(
      join(workspaceDir, ".gitignore"),
      finalGitignoreContent,
      "utf-8",
    );

    // --- Step 6: Ensure .p4ignore excludes git artifacts (REQ-P4A-7) ---
    ensureP4Ignore(workspaceDir);

    // --- Step 7: Validate .gitignore parent chains (REQ-P4A-8) ---
    const chainWarnings = validateParentChains(finalGitignoreContent);
    warnings.push(...chainWarnings);

    // --- Step 8: Make tracked files writable ---
    if (platform === "win32") {
      await run("attrib", ["-R", "/S", join(workspaceDir, "*.*")]);
    } else {
      await run("chmod", ["-R", "u+w", workspaceDir]);
    }

    // --- Step 9: Create baseline commit ---
    const addResult = await run("git", ["-C", workspaceDir, "add", "."]);
    if (addResult.exitCode !== 0) {
      throw new Error(`git add failed: ${addResult.stderr}`);
    }

    const commitResult = await run("git", [
      "-C",
      workspaceDir,
      "commit",
      "-m",
      `P4 baseline @${baselineChangelist}`,
    ]);
    if (commitResult.exitCode !== 0) {
      throw new Error(`git commit failed: ${commitResult.stderr}`);
    }

    // Get commit SHA
    const revParseResult = await run("git", [
      "-C",
      workspaceDir,
      "rev-parse",
      "HEAD",
    ]);
    if (revParseResult.exitCode !== 0) {
      throw new Error(`git rev-parse failed: ${revParseResult.stderr}`);
    }
    const commitSha = revParseResult.stdout.trim();

    // Get tracked file count
    const lsFilesResult = await run("git", [
      "-C",
      workspaceDir,
      "ls-files",
    ]);
    const trackedFileCount = lsFilesResult.stdout
      .trim()
      .split("\n")
      .filter(Boolean).length;

    // --- Step 10: Write adapter state ---
    writeState(workspaceDir, {
      baselineChangelist,
      baselineCommitSha: commitSha,
      initTimestamp: new Date().toISOString(),
      workspaceRoot: workspaceDir,
    });

    return { baselineChangelist, trackedFileCount, warnings };
  } catch (error) {
    // REQ-P4A-14: Cleanup on partial failure.
    // A failed init must not leave .git/ or .p4-adapter.json behind.
    const gitDirCleanup = join(workspaceDir, ".git");
    if (existsSync(gitDirCleanup)) {
      rmSync(gitDirCleanup, { recursive: true, force: true });
    }
    const stateCleanup = join(workspaceDir, ".p4-adapter.json");
    if (existsSync(stateCleanup)) {
      rmSync(stateCleanup, { force: true });
    }
    throw error;
  }
}
