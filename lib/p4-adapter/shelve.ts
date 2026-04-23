import { readState } from "./state";
import type { P4Runner, P4Result } from "./p4";

// WARNING: Do not run `p4 sync` between init and shelve. The cycle is atomic:
// sync -> init -> work -> shelve. Running `p4 sync` mid-cycle invalidates
// the baseline and can destroy uncommitted git changes. (REQ-P4A-25)

export type GitRunner = (
  args: string[],
) => Promise<{ stdout: string; exitCode: number }>;

export type ShelveOptions = {
  workspaceDir: string;
  description: string;
  force?: boolean;
  p4Runner: P4Runner;
  gitRunner: GitRunner;
};

export type ShelveResult = {
  changelist: number;
  added: number;
  modified: number;
  deleted: number;
  warnings: string[];
};

type ManifestEntry = {
  status: "A" | "M" | "D" | "R";
  file: string;
  renamedFrom?: string;
};

type ConflictInfo = {
  file: string;
  changelist: number;
  user: string;
};

/**
 * Parse `git diff --name-status` output into a manifest of changed files.
 * Renames appear as `R###\told\tnew` and are split into delete + add (REQ-P4A-21).
 */
function parseManifest(output: string): ManifestEntry[] {
  const entries: ManifestEntry[] = [];
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("R")) {
      // Rename: R###\told-path\tnew-path -> delete old + add new
      const parts = trimmed.split("\t");
      if (parts.length >= 3) {
        const oldPath = parts[1];
        const newPath = parts[2];
        entries.push({ status: "R", file: newPath, renamedFrom: oldPath });
      }
    } else {
      const parts = trimmed.split("\t");
      if (parts.length >= 2) {
        const status = parts[0] as "A" | "M" | "D";
        entries.push({ status, file: parts[1] });
      }
    }
  }
  return entries;
}

/**
 * Parse `p4 filelog -m1` output to extract the head changelist and user.
 *
 * Example output:
 * //depot/path/file.cpp
 * ... #3 change 12350 edit on 2026/03/25 by user.name@workspace ...
 */
function parseFilelogHead(output: string): { changelist: number; user: string } | null {
  const match = output.match(/change (\d+) \w+ on .+ by ([^\s@]+)/);
  if (!match) return null;
  return { changelist: parseInt(match[1], 10), user: match[2] };
}

/**
 * Parse a changelist number from `p4 change -i` output.
 * Example: "Change 12360 created."
 */
function parseChangelistNumber(output: string): number | null {
  const match = output.match(/Change (\d+) created/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

/**
 * Log file types detected by `p4 reconcile` output (REQ-P4A-35).
 *
 * Example reconcile output lines:
 * //depot/path/file.cpp#1 - opened for add
 * //depot/path/file.h#2 - opened for edit
 */
function logReconcileFileTypes(output: string): void {
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    console.log(`  reconcile: ${trimmed}`);
  }
}

/**
 * Shelve git changes back to Perforce as a shelved changelist.
 *
 * Follows REQ-P4A-22's sequence exactly. The adapter never calls
 * `p4 sync` (REQ-P4A-27) or `p4 submit` (REQ-P4A-36).
 */
export async function shelve(options: ShelveOptions): Promise<ShelveResult> {
  const { workspaceDir, description, force, p4Runner, gitRunner } = options;
  const warnings: string[] = [];

  // Step 1: Validate preconditions (REQ-P4A-16, REQ-P4A-17)
  const state = readState(workspaceDir);
  if (!state) {
    throw new Error("No adapter state found. Run p4-adapter init first.");
  }

  // Check for active worktrees (REQ-P4A-17)
  const worktreeResult = await gitRunner(["worktree", "list", "--porcelain"]);
  const worktreeLines = worktreeResult.stdout
    .split("\n")
    .filter((l) => l.startsWith("worktree "));
  if (worktreeLines.length > 1) {
    throw new Error(
      "Active worktrees found. Resolve all commissions and meetings before shelving.",
    );
  }

  // Step 2: Derive the change manifest (REQ-P4A-21)
  const diffResult = await gitRunner([
    "diff",
    "--name-status",
    state.baselineCommitSha,
    "HEAD",
  ]);
  const manifest = parseManifest(diffResult.stdout);

  // Step 3: Check for empty manifest
  if (manifest.length === 0) {
    throw new Error("No changes to shelve.");
  }

  // Step 4: Run conflict detection (REQ-P4A-18, REQ-P4A-19, REQ-P4A-28)
  if (!force) {
    const conflicts = await detectConflicts(
      manifest,
      state.baselineChangelist,
      p4Runner,
    );
    if (conflicts.length > 0) {
      const details = conflicts
        .map((c) => `  ${c.file}  @${c.changelist} by ${c.user}`)
        .join("\n");
      throw new Error(
        `Conflicts detected (files modified in P4 since baseline @${state.baselineChangelist}):\n${details}\n\n` +
          "Resolve conflicts before shelving. Options:\n" +
          "  1. p4 sync, then p4-adapter init to start a new cycle\n" +
          "  2. Manually merge the conflicting files and re-run shelve with --force",
      );
    }
  } else {
    // --force: still check but only warn (REQ-P4A-20)
    const conflicts = await detectConflicts(
      manifest,
      state.baselineChangelist,
      p4Runner,
    );
    if (conflicts.length > 0) {
      const details = conflicts
        .map((c) => `  ${c.file}  @${c.changelist} by ${c.user}`)
        .join("\n");
      const warning =
        `WARNING: Conflicts detected but proceeding with --force:\n${details}`;
      warnings.push(warning);
      console.warn(warning);
    }
  }

  // Step 5-8: P4 operations in a new pending changelist
  // Create the pending changelist first, then open files, reconcile, shelve, revert.
  let changelist: number | null = null;
  let added = 0;
  let modified = 0;
  let deleted = 0;

  try {
    // Create a new pending changelist (all operations target this, not default)
    const changeSpec = [
      "Change: new",
      `Description: ${description}`,
    ].join("\n");

    const changeResult = await p4Runner(["change", "-i"], {
      STDIN: changeSpec,
    });
    if (changeResult.exitCode !== 0) {
      throw new Error(
        `Failed to create pending changelist: ${changeResult.stderr}`,
      );
    }
    changelist = parseChangelistNumber(changeResult.stdout);
    if (changelist === null) {
      throw new Error(
        `Could not parse changelist number from: ${changeResult.stdout}`,
      );
    }

    // Step 5: Open files for P4 operations (REQ-P4A-21)
    for (const entry of manifest) {
      const filePath = entry.file;
      let result: P4Result;

      switch (entry.status) {
        case "A":
          result = await p4Runner([
            "add",
            "-c",
            String(changelist),
            filePath,
          ]);
          if (result.exitCode !== 0) {
            throw new Error(
              `p4 add failed for ${filePath}: ${result.stderr}`,
            );
          }
          added++;
          break;

        case "M":
          result = await p4Runner([
            "edit",
            "-c",
            String(changelist),
            filePath,
          ]);
          if (result.exitCode !== 0) {
            throw new Error(
              `p4 edit failed for ${filePath}: ${result.stderr}`,
            );
          }
          modified++;
          break;

        case "D":
          result = await p4Runner([
            "delete",
            "-c",
            String(changelist),
            filePath,
          ]);
          if (result.exitCode !== 0) {
            throw new Error(
              `p4 delete failed for ${filePath}: ${result.stderr}`,
            );
          }
          deleted++;
          break;

        case "R":
          // Rename = delete old + add new (REQ-P4A-21, decided constraint)
          if (entry.renamedFrom) {
            result = await p4Runner([
              "delete",
              "-c",
              String(changelist),
              entry.renamedFrom,
            ]);
            if (result.exitCode !== 0) {
              throw new Error(
                `p4 delete failed for ${entry.renamedFrom}: ${result.stderr}`,
              );
            }
            deleted++;
          }
          result = await p4Runner([
            "add",
            "-c",
            String(changelist),
            filePath,
          ]);
          if (result.exitCode !== 0) {
            throw new Error(
              `p4 add failed for ${filePath}: ${result.stderr}`,
            );
          }
          added++;
          break;
      }
    }

    // Step 6: Run p4 reconcile for file type inference (REQ-P4A-35)
    const reconcileResult = await p4Runner([
      "reconcile",
      "-c",
      String(changelist),
    ]);
    if (reconcileResult.stdout.trim()) {
      logReconcileFileTypes(reconcileResult.stdout);
    }

    // Step 7: Create the shelve (REQ-P4A-31)
    const shelveResult = await p4Runner([
      "shelve",
      "-c",
      String(changelist),
    ]);
    if (shelveResult.exitCode !== 0) {
      throw new Error(
        `p4 shelve failed: ${shelveResult.stderr}`,
      );
    }

    // Step 8: Revert the opened files (release locks, shelve persists)
    await p4Runner(["revert", "-c", String(changelist), "//..."]);

    return { changelist, added, modified, deleted, warnings };
  } catch (error) {
    // REQ-P4A-24: Cleanup on failure - revert and delete pending changelist
    if (changelist !== null) {
      try {
        await p4Runner(["revert", "-c", String(changelist), "//..."]);
      } catch {
        // Best effort cleanup
      }
      try {
        await p4Runner(["change", "-d", String(changelist)]);
      } catch {
        // Best effort cleanup
      }
    }
    throw error;
  }
}

/**
 * Check each file in the manifest against P4 head revisions.
 * Returns files whose head changelist exceeds the baseline (REQ-P4A-18).
 */
async function detectConflicts(
  manifest: ManifestEntry[],
  baselineChangelist: number,
  p4Runner: P4Runner,
): Promise<ConflictInfo[]> {
  const conflicts: ConflictInfo[] = [];

  // Collect unique file paths (for renames, check both old and new paths)
  const filePaths = new Set<string>();
  for (const entry of manifest) {
    filePaths.add(entry.file);
    if (entry.renamedFrom) {
      filePaths.add(entry.renamedFrom);
    }
  }

  for (const filePath of filePaths) {
    const result = await p4Runner(["filelog", "-m1", filePath]);
    if (result.exitCode !== 0) continue; // File may not exist in depot yet (new file)

    const head = parseFilelogHead(result.stdout);
    if (head && head.changelist > baselineChangelist) {
      conflicts.push({
        file: filePath,
        changelist: head.changelist,
        user: head.user,
      });
    }
  }

  return conflicts;
}
