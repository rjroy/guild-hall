import { describe, it, expect, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { writeState, type AdapterState } from "../state";
import { shelve, type GitRunner } from "../shelve";
import type { P4Runner, P4Result } from "../p4";

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "p4-shelve-test-"));
  tempDirs.push(dir);
  return dir;
}

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

const BASELINE_STATE: AdapterState = {
  baselineChangelist: 12345,
  baselineCommitSha: "abc123def456789",
  initTimestamp: "2026-03-25T08:00:00Z",
  workspaceRoot: "/workspace",
};

/**
 * Create a mock P4Runner that records calls and returns canned responses.
 * The responder function maps args to P4Result; defaults to success.
 */
function mockP4Runner(
  responder?: (args: string[]) => P4Result,
): { runner: P4Runner; calls: string[][] } {
  const calls: string[][] = [];
  const runner: P4Runner = (args: string[]) => {
    calls.push(args);
    if (responder) return Promise.resolve(responder(args));
    return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
  };
  return { runner, calls };
}

/**
 * Create a mock GitRunner that returns canned responses.
 */
function mockGitRunner(
  responder?: (args: string[]) => { stdout: string; exitCode: number },
): { runner: GitRunner; calls: string[][] } {
  const calls: string[][] = [];
  const runner: GitRunner = (args: string[]) => {
    calls.push(args);
    if (responder) return Promise.resolve(responder(args));
    return Promise.resolve({ stdout: "", exitCode: 0 });
  };
  return { runner, calls };
}

/** Standard git runner that reports one worktree and a given diff output. */
function standardGitRunner(diffOutput: string): GitRunner {
  return mockGitRunner((args) => {
    if (args[0] === "worktree") {
      return { stdout: "worktree /workspace\n", exitCode: 0 };
    }
    if (args[0] === "diff") {
      return { stdout: diffOutput, exitCode: 0 };
    }
    return { stdout: "", exitCode: 0 };
  }).runner;
}

/** Standard P4 responder that handles change creation and basic operations. */
function standardP4Responder(
  overrides?: (args: string[]) => P4Result | null,
): (args: string[]) => P4Result {
  return (args: string[]) => {
    if (overrides) {
      const result = overrides(args);
      if (result) return result;
    }
    // p4 change -i -> create changelist
    if (args[0] === "change" && args[1] === "-i") {
      return { stdout: "Change 12360 created.", stderr: "", exitCode: 0 };
    }
    // p4 filelog -> no conflicts by default (exit 1 = file not in depot)
    if (args[0] === "filelog") {
      return { stdout: "", stderr: "", exitCode: 1 };
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  };
}

// Test case 10: Translates A (added) to p4 add
describe("shelve manifest translation", () => {
  it("translates A to p4 add", async () => {
    const dir = createTempDir();
    writeState(dir, BASELINE_STATE);

    const { runner: p4Runner, calls: p4Calls } = mockP4Runner(
      standardP4Responder(),
    );
    const gitRunner = standardGitRunner("A\tSource/NewFile.cpp\n");

    const result = await shelve({
      workspaceDir: dir,
      description: "Add new file",
      p4Runner,
      gitRunner,
    });

    expect(result.added).toBe(1);
    expect(result.modified).toBe(0);
    expect(result.deleted).toBe(0);

    const addCalls = p4Calls.filter(
      (c) => c[0] === "add" && c.includes("Source/NewFile.cpp"),
    );
    expect(addCalls.length).toBe(1);
    // Verify it targets the changelist, not default
    expect(addCalls[0]).toContain("-c");
    expect(addCalls[0]).toContain("12360");
  });

  // Test case 11: Translates M (modified) to p4 edit
  it("translates M to p4 edit", async () => {
    const dir = createTempDir();
    writeState(dir, BASELINE_STATE);

    const { runner: p4Runner, calls: p4Calls } = mockP4Runner(
      standardP4Responder(),
    );
    const gitRunner = standardGitRunner("M\tSource/Existing.cpp\n");

    const result = await shelve({
      workspaceDir: dir,
      description: "Edit file",
      p4Runner,
      gitRunner,
    });

    expect(result.modified).toBe(1);

    const editCalls = p4Calls.filter(
      (c) => c[0] === "edit" && c.includes("Source/Existing.cpp"),
    );
    expect(editCalls.length).toBe(1);
    expect(editCalls[0]).toContain("-c");
  });

  // Test case 12: Translates D (deleted) to p4 delete
  it("translates D to p4 delete", async () => {
    const dir = createTempDir();
    writeState(dir, BASELINE_STATE);

    const { runner: p4Runner, calls: p4Calls } = mockP4Runner(
      standardP4Responder(),
    );
    const gitRunner = standardGitRunner("D\tSource/Removed.cpp\n");

    const result = await shelve({
      workspaceDir: dir,
      description: "Delete file",
      p4Runner,
      gitRunner,
    });

    expect(result.deleted).toBe(1);

    const deleteCalls = p4Calls.filter(
      (c) => c[0] === "delete" && c.includes("Source/Removed.cpp"),
    );
    expect(deleteCalls.length).toBe(1);
    expect(deleteCalls[0]).toContain("-c");
  });

  // Test case 13: Translates R (renamed) to p4 delete + p4 add
  it("translates R to p4 delete (old) + p4 add (new)", async () => {
    const dir = createTempDir();
    writeState(dir, BASELINE_STATE);

    const { runner: p4Runner, calls: p4Calls } = mockP4Runner(
      standardP4Responder(),
    );
    const gitRunner = standardGitRunner(
      "R100\tSource/OldName.cpp\tSource/NewName.cpp\n",
    );

    const result = await shelve({
      workspaceDir: dir,
      description: "Rename file",
      p4Runner,
      gitRunner,
    });

    // Rename = 1 delete + 1 add
    expect(result.deleted).toBe(1);
    expect(result.added).toBe(1);

    const deleteCalls = p4Calls.filter(
      (c) => c[0] === "delete" && c.includes("Source/OldName.cpp"),
    );
    expect(deleteCalls.length).toBe(1);

    const addCalls = p4Calls.filter(
      (c) => c[0] === "add" && c.includes("Source/NewName.cpp"),
    );
    expect(addCalls.length).toBe(1);
  });
});

// Test case 14: Creates a shelved changelist with correct description
describe("shelve changelist", () => {
  it("creates a shelved changelist with the provided description", async () => {
    const dir = createTempDir();
    writeState(dir, BASELINE_STATE);

    const { runner: p4Runner, calls: p4Calls } = mockP4Runner(
      standardP4Responder(),
    );
    const gitRunner = standardGitRunner("A\tSource/File.cpp\n");

    const result = await shelve({
      workspaceDir: dir,
      description: "My custom description",
      p4Runner,
      gitRunner,
    });

    expect(result.changelist).toBe(12360);

    // Verify p4 change -i was called
    const changeCalls = p4Calls.filter(
      (c) => c[0] === "change" && c[1] === "-i",
    );
    expect(changeCalls.length).toBe(1);

    // Verify p4 shelve was called with the changelist
    const shelveCalls = p4Calls.filter((c) => c[0] === "shelve");
    expect(shelveCalls.length).toBe(1);
    expect(shelveCalls[0]).toContain("-c");
    expect(shelveCalls[0]).toContain("12360");
  });
});

// Test case 15: Reports "no changes" on empty manifest
describe("shelve empty manifest", () => {
  it("reports 'no changes' when manifest is empty", async () => {
    const dir = createTempDir();
    writeState(dir, BASELINE_STATE);

    const { runner: p4Runner } = mockP4Runner(standardP4Responder());
    const gitRunner = standardGitRunner(""); // empty diff

    expect(
      shelve({
        workspaceDir: dir,
        description: "Empty shelve",
        p4Runner,
        gitRunner,
      }),
    ).rejects.toThrow("No changes to shelve.");
  });
});

// Test case 16: Detects conflicts when P4 head revision exceeds baseline
describe("shelve conflict detection", () => {
  it("detects conflicts when P4 head revision exceeds baseline", async () => {
    const dir = createTempDir();
    writeState(dir, BASELINE_STATE);

    const { runner: p4Runner } = mockP4Runner(
      standardP4Responder((args) => {
        if (args[0] === "filelog" && args[2] === "Source/Conflict.cpp") {
          return {
            stdout:
              "//depot/Source/Conflict.cpp\n... #5 change 12350 edit on 2026/03/25 by other.user@workspace ...\n",
            stderr: "",
            exitCode: 0,
          };
        }
        return null;
      }),
    );
    const gitRunner = standardGitRunner("M\tSource/Conflict.cpp\n");

    expect(
      shelve({
        workspaceDir: dir,
        description: "Conflict shelve",
        p4Runner,
        gitRunner,
      }),
    ).rejects.toThrow(/Conflicts detected/);
  });

  // Test case 17: Blocks shelve on conflict without --force
  it("blocks shelve on conflict without --force", async () => {
    const dir = createTempDir();
    writeState(dir, BASELINE_STATE);

    const { runner: p4Runner } = mockP4Runner(
      standardP4Responder((args) => {
        if (args[0] === "filelog") {
          return {
            stdout:
              "//depot/path\n... #3 change 12350 edit on 2026/03/25 by user.name@ws ...\n",
            stderr: "",
            exitCode: 0,
          };
        }
        return null;
      }),
    );
    const gitRunner = standardGitRunner("M\tSource/File.cpp\n");

    expect(
      shelve({
        workspaceDir: dir,
        description: "Blocked shelve",
        p4Runner,
        gitRunner,
      }),
    ).rejects.toThrow("Resolve conflicts before shelving");
  });

  // Test case 18: Proceeds with warning when --force is used
  it("proceeds with warning when --force is set", async () => {
    const dir = createTempDir();
    writeState(dir, BASELINE_STATE);

    const { runner: p4Runner } = mockP4Runner(
      standardP4Responder((args) => {
        if (args[0] === "filelog") {
          return {
            stdout:
              "//depot/path\n... #3 change 12350 edit on 2026/03/25 by user.name@ws ...\n",
            stderr: "",
            exitCode: 0,
          };
        }
        return null;
      }),
    );
    const gitRunner = standardGitRunner("M\tSource/File.cpp\n");

    const result = await shelve({
      workspaceDir: dir,
      description: "Forced shelve",
      force: true,
      p4Runner,
      gitRunner,
    });

    expect(result.changelist).toBe(12360);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("Conflicts detected");
  });
});

// Test case 19: Reverts and cleans up on P4 operation failure
describe("shelve cleanup on failure", () => {
  it("reverts and deletes pending changelist on P4 failure", async () => {
    const dir = createTempDir();
    writeState(dir, BASELINE_STATE);

    const { runner: p4Runner, calls: p4Calls } = mockP4Runner(
      standardP4Responder((args) => {
        // Make p4 edit fail
        if (args[0] === "edit") {
          return {
            stdout: "",
            stderr: "file(s) locked by other.user",
            exitCode: 1,
          };
        }
        return null;
      }),
    );
    const gitRunner = standardGitRunner("M\tSource/Locked.cpp\n");

    expect(
      shelve({
        workspaceDir: dir,
        description: "Failing shelve",
        p4Runner,
        gitRunner,
      }),
    ).rejects.toThrow("p4 edit failed");

    // Verify cleanup: revert and change -d were called
    const revertCalls = p4Calls.filter((c) => c[0] === "revert");
    expect(revertCalls.length).toBeGreaterThanOrEqual(1);

    const changeDeleteCalls = p4Calls.filter(
      (c) => c[0] === "change" && c[1] === "-d",
    );
    expect(changeDeleteCalls.length).toBe(1);
    expect(changeDeleteCalls[0]).toContain("12360");
  });
});

// Test case 20: Fails when .p4-adapter.json is missing
describe("shelve preconditions", () => {
  it("fails when .p4-adapter.json is missing", async () => {
    const dir = createTempDir();
    // No state file written

    const { runner: p4Runner } = mockP4Runner();
    const { runner: gitRunner } = mockGitRunner();

    expect(
      shelve({
        workspaceDir: dir,
        description: "No state",
        p4Runner,
        gitRunner,
      }),
    ).rejects.toThrow("No adapter state found. Run p4-adapter init first.");
  });

  // Test case 21: Fails when active worktrees exist
  it("fails when active worktrees exist", async () => {
    const dir = createTempDir();
    writeState(dir, BASELINE_STATE);

    const { runner: p4Runner } = mockP4Runner();
    const gitRunner = mockGitRunner((args) => {
      if (args[0] === "worktree") {
        return {
          stdout:
            "worktree /workspace\n\nworktree /workspace/.guild-hall/worktrees/commission-1\n",
          exitCode: 0,
        };
      }
      return { stdout: "", exitCode: 0 };
    }).runner;

    expect(
      shelve({
        workspaceDir: dir,
        description: "With worktrees",
        p4Runner,
        gitRunner,
      }),
    ).rejects.toThrow("Active worktrees found");
  });
});

// Verify no p4 submit or p4 sync calls appear in any shelve workflow
describe("shelve safety constraints", () => {
  it("never calls p4 submit or p4 sync (REQ-P4A-27, REQ-P4A-36)", async () => {
    const dir = createTempDir();
    writeState(dir, BASELINE_STATE);

    const { runner: p4Runner, calls: p4Calls } = mockP4Runner(
      standardP4Responder(),
    );
    const gitRunner = standardGitRunner(
      "A\tSource/New.cpp\nM\tSource/Edit.cpp\nD\tSource/Del.cpp\n",
    );

    await shelve({
      workspaceDir: dir,
      description: "Safety check",
      p4Runner,
      gitRunner,
    });

    const forbidden = p4Calls.filter(
      (c) => c[0] === "submit" || c[0] === "sync",
    );
    expect(forbidden).toEqual([]);
  });
});
