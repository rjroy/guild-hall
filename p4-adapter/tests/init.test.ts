import { describe, it, expect, afterEach } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { P4Runner, P4Result } from "../p4";
import type { CommandRunner } from "../init";
import { init } from "../init";
import { readState } from "../state";

const OK: P4Result = { stdout: "", stderr: "", exitCode: 0 };

let tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "p4-init-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

/** Whitelist .gitignore content used across tests. */
const VALID_GITIGNORE = "*\n!/Source/\n!/Source/Runtime/**\n";

/** Set up a temp workspace with a valid .gitignore. */
function setupWorkspace(): string {
  const dir = createTempDir();
  writeFileSync(join(dir, ".gitignore"), VALID_GITIGNORE, "utf-8");
  return dir;
}

/** Create a mock P4Runner that responds to `info` and `changes` commands. */
function createMockP4Runner(
  workspaceDir: string,
  overrides?: {
    infoResult?: P4Result;
    changesResult?: P4Result;
  },
): { runner: P4Runner; calls: string[][] } {
  const calls: string[][] = [];
  const runner: P4Runner = async (args) => {
    calls.push([...args]);
    if (args[0] === "info") {
      return (
        overrides?.infoResult ?? {
          stdout: `Client root: ${workspaceDir}\nUser name: testuser\n`,
          stderr: "",
          exitCode: 0,
        }
      );
    }
    if (args[0] === "changes") {
      return (
        overrides?.changesResult ?? {
          stdout: "Change 12345 on 2026/03/25 by testuser@testclient 'sync'\n",
          stderr: "",
          exitCode: 0,
        }
      );
    }
    return OK;
  };
  return { runner, calls };
}

type MockCall = { command: string; args: string[] };

/**
 * Create a mock CommandRunner that records calls and returns configurable
 * responses. The handler function can return specific results based on
 * command/args; returning undefined falls through to the default response.
 */
function createMockCommandRunner(
  handler?: (command: string, args: string[]) => P4Result | undefined,
): { run: CommandRunner; calls: MockCall[] } {
  const calls: MockCall[] = [];
  const run: CommandRunner = async (command, args) => {
    calls.push({ command, args: [...args] });
    const result = handler?.(command, args);
    if (result) return result;

    // Smart defaults for git commands
    if (command === "git" && args.includes("rev-parse")) {
      return { stdout: "abc123def456\n", stderr: "", exitCode: 0 };
    }
    if (command === "git" && args.includes("ls-files")) {
      return {
        stdout: "Source/file1.cpp\nSource/file2.h\n",
        stderr: "",
        exitCode: 0,
      };
    }
    if (command === "git" && args.includes("worktree")) {
      // Single worktree (main only)
      return {
        stdout: `worktree /path/to/main\nHEAD abc123\nbranch refs/heads/main\n`,
        stderr: "",
        exitCode: 0,
      };
    }
    return OK;
  };
  return { run, calls };
}

function findCall(
  calls: MockCall[],
  command: string,
  argSubstring: string,
): MockCall | undefined {
  return calls.find(
    (c) => c.command === command && c.args.some((a) => a.includes(argSubstring)),
  );
}

// Test case 1: Creates .git/ and baseline commit
describe("init: happy path", () => {
  it("creates .git/ directory and baseline commit", async () => {
    const dir = setupWorkspace();
    const { runner: p4Runner } = createMockP4Runner(dir);
    const { run, calls } = createMockCommandRunner();

    const result = await init({
      workspaceDir: dir,
      p4Runner,
      run,
      platform: "linux",
    });

    // Verify git init was called
    const initCall = findCall(calls, "git", "init");
    expect(initCall).toBeDefined();
    expect(initCall!.args).toContain(dir);

    // Verify git add was called
    const addCall = findCall(calls, "git", "add");
    expect(addCall).toBeDefined();

    // Verify git commit was called with baseline message
    const commitCall = findCall(calls, "git", "commit");
    expect(commitCall).toBeDefined();
    expect(commitCall!.args).toContain("P4 baseline @12345");

    // Verify result
    expect(result.baselineChangelist).toBe(12345);
    expect(result.trackedFileCount).toBe(2);
  });
});

// Test case 2: Records baseline changelist in .p4-adapter.json
describe("init: state file", () => {
  it("records baseline changelist in .p4-adapter.json", async () => {
    const dir = setupWorkspace();
    const { runner: p4Runner } = createMockP4Runner(dir);
    const { run } = createMockCommandRunner();

    await init({ workspaceDir: dir, p4Runner, run, platform: "linux" });

    const state = readState(dir);
    expect(state).not.toBeNull();
    expect(state!.baselineChangelist).toBe(12345);
    expect(state!.baselineCommitSha).toBe("abc123def456");
    expect(state!.workspaceRoot).toBe(dir);
    expect(state!.initTimestamp).toBeTruthy();
  });
});

// Test case 3: Destroys existing .git/ before re-init
describe("init: re-init", () => {
  it("destroys existing .git/ before re-initializing", async () => {
    const dir = setupWorkspace();
    // Create a fake .git directory
    const gitDir = join(dir, ".git");
    mkdirSync(gitDir);
    writeFileSync(join(gitDir, "HEAD"), "ref: refs/heads/main\n");

    const { runner: p4Runner } = createMockP4Runner(dir);
    const { run, calls } = createMockCommandRunner();

    await init({ workspaceDir: dir, p4Runner, run, platform: "linux" });

    // The old .git was checked for worktrees
    const worktreeCall = findCall(calls, "git", "worktree");
    expect(worktreeCall).toBeDefined();

    // git init was called (recreating .git)
    const initCall = findCall(calls, "git", "init");
    expect(initCall).toBeDefined();
  });
});

// Test case 4: Fails on invalid P4 workspace
describe("init: P4 workspace validation", () => {
  it("fails when workspace is not a valid P4 workspace", async () => {
    const dir = setupWorkspace();
    const { runner: p4Runner } = createMockP4Runner(dir, {
      infoResult: {
        stdout: "Client root: /some/other/path\n",
        stderr: "",
        exitCode: 0,
      },
    });
    const { run } = createMockCommandRunner();

    await expect(
      init({ workspaceDir: dir, p4Runner, run, platform: "linux" }),
    ).rejects.toThrow("Not a P4 workspace");
  });

  it("fails when p4 info returns an error", async () => {
    const dir = setupWorkspace();
    const { runner: p4Runner } = createMockP4Runner(dir, {
      infoResult: {
        stdout: "",
        stderr: "Perforce client error",
        exitCode: 1,
      },
    });
    const { run } = createMockCommandRunner();

    await expect(
      init({ workspaceDir: dir, p4Runner, run, platform: "linux" }),
    ).rejects.toThrow("Not a P4 workspace");
  });
});

// Test case 5: Fails on missing/non-whitelist .gitignore
describe("init: .gitignore validation", () => {
  it("fails when .gitignore is missing", async () => {
    const dir = createTempDir();
    // No .gitignore created
    const { runner: p4Runner } = createMockP4Runner(dir);
    const { run } = createMockCommandRunner();

    await expect(
      init({ workspaceDir: dir, p4Runner, run, platform: "linux" }),
    ).rejects.toThrow("No .gitignore found");
  });

  it("fails when .gitignore does not use whitelist model", async () => {
    const dir = createTempDir();
    writeFileSync(join(dir, ".gitignore"), "node_modules/\n*.log\n", "utf-8");
    const { runner: p4Runner } = createMockP4Runner(dir);
    const { run } = createMockCommandRunner();

    await expect(
      init({ workspaceDir: dir, p4Runner, run, platform: "linux" }),
    ).rejects.toThrow("whitelist model");
  });
});

// Test case 6: Warns on broken parent chains
describe("init: parent chain warnings", () => {
  it("includes warnings for broken parent chains in result", async () => {
    const dir = createTempDir();
    // Missing !/Source/Runtime/ parent
    const content = "*\n!/Source/\n!/Source/Runtime/MyFeature/**\n";
    writeFileSync(join(dir, ".gitignore"), content, "utf-8");

    const { runner: p4Runner } = createMockP4Runner(dir);
    const { run } = createMockCommandRunner();

    const result = await init({
      workspaceDir: dir,
      p4Runner,
      run,
      platform: "linux",
    });

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("Source/Runtime/");
  });
});

// Test case 7: Makes tracked files writable
describe("init: file permissions", () => {
  it("calls attrib on Windows to remove read-only flags", async () => {
    const dir = setupWorkspace();
    const { runner: p4Runner } = createMockP4Runner(dir);
    const { run, calls } = createMockCommandRunner();

    await init({ workspaceDir: dir, p4Runner, run, platform: "win32" });

    const attribCall = calls.find((c) => c.command === "attrib");
    expect(attribCall).toBeDefined();
    expect(attribCall!.args).toContain("-R");
    expect(attribCall!.args).toContain("/S");
  });

  it("calls chmod on Unix to make files writable", async () => {
    const dir = setupWorkspace();
    const { runner: p4Runner } = createMockP4Runner(dir);
    const { run, calls } = createMockCommandRunner();

    await init({ workspaceDir: dir, p4Runner, run, platform: "linux" });

    const chmodCall = calls.find((c) => c.command === "chmod");
    expect(chmodCall).toBeDefined();
    expect(chmodCall!.args).toContain("u+w");
  });
});

// Test case 8: Cleans up .git/ on partial failure
describe("init: cleanup on failure (REQ-P4A-14)", () => {
  it("removes .git/ and .p4-adapter.json when git commit fails", async () => {
    const dir = setupWorkspace();
    const { runner: p4Runner } = createMockP4Runner(dir);

    // Make git commit fail
    const { run } = createMockCommandRunner((command, args) => {
      if (command === "git" && args.includes("commit")) {
        return { stdout: "", stderr: "commit failed", exitCode: 1 };
      }
      // git init creates .git/ in real life, simulate it
      if (command === "git" && args.includes("init")) {
        mkdirSync(join(dir, ".git"), { recursive: true });
        return OK;
      }
      return undefined;
    });

    await expect(
      init({ workspaceDir: dir, p4Runner, run, platform: "linux" }),
    ).rejects.toThrow("git commit failed");

    // .git/ must be cleaned up
    expect(existsSync(join(dir, ".git"))).toBe(false);
    // .p4-adapter.json must not exist
    expect(existsSync(join(dir, ".p4-adapter.json"))).toBe(false);
  });

  it("removes .git/ when make-writable step fails", async () => {
    const dir = setupWorkspace();
    const { runner: p4Runner } = createMockP4Runner(dir);

    const { run } = createMockCommandRunner((command, args) => {
      if (command === "chmod") {
        throw new Error("chmod failed");
      }
      if (command === "git" && args.includes("init")) {
        mkdirSync(join(dir, ".git"), { recursive: true });
        return OK;
      }
      return undefined;
    });

    await expect(
      init({ workspaceDir: dir, p4Runner, run, platform: "linux" }),
    ).rejects.toThrow("chmod failed");

    expect(existsSync(join(dir, ".git"))).toBe(false);
  });
});

// Test case 9: Fails when active worktrees exist
describe("init: worktree safety (REQ-P4A-30)", () => {
  it("fails when active git worktrees exist", async () => {
    const dir = setupWorkspace();
    // Create a fake .git directory so the worktree check runs
    mkdirSync(join(dir, ".git"));

    const { runner: p4Runner } = createMockP4Runner(dir);

    // Mock shows two worktrees
    const { run } = createMockCommandRunner((command, args) => {
      if (command === "git" && args.includes("worktree")) {
        return {
          stdout: [
            `worktree ${dir}`,
            "HEAD abc123",
            "branch refs/heads/main",
            "",
            "worktree /some/other/worktree",
            "HEAD def456",
            "branch refs/heads/feature",
            "",
          ].join("\n"),
          stderr: "",
          exitCode: 0,
        };
      }
      return undefined;
    });

    await expect(
      init({ workspaceDir: dir, p4Runner, run, platform: "linux" }),
    ).rejects.toThrow("Active git worktrees found");
  });

  it("proceeds when only the main worktree exists", async () => {
    const dir = setupWorkspace();
    mkdirSync(join(dir, ".git"));

    const { runner: p4Runner } = createMockP4Runner(dir);
    const { run } = createMockCommandRunner();

    // Should not throw - single worktree is fine
    const result = await init({
      workspaceDir: dir,
      p4Runner,
      run,
      platform: "linux",
    });
    expect(result.baselineChangelist).toBe(12345);
  });
});

// Integration: verify P4/git mutual exclusion (REQ-P4A-29)
describe("init: mutual exclusion", () => {
  it("ensures .gitignore excludes P4 metadata after init", async () => {
    const dir = setupWorkspace();
    const { runner: p4Runner } = createMockP4Runner(dir);
    const { run } = createMockCommandRunner();

    await init({ workspaceDir: dir, p4Runner, run, platform: "linux" });

    const gitignore = require("fs").readFileSync(
      join(dir, ".gitignore"),
      "utf-8",
    );
    expect(gitignore).toContain(".p4config");
    expect(gitignore).toContain(".p4ignore");
    expect(gitignore).toContain(".p4-adapter.json");
  });

  it("ensures .p4ignore excludes git artifacts after init", async () => {
    const dir = setupWorkspace();
    const { runner: p4Runner } = createMockP4Runner(dir);
    const { run } = createMockCommandRunner();

    await init({ workspaceDir: dir, p4Runner, run, platform: "linux" });

    const p4ignore = require("fs").readFileSync(
      join(dir, ".p4ignore"),
      "utf-8",
    );
    expect(p4ignore).toContain(".git/");
    expect(p4ignore).toContain(".gitignore");
    expect(p4ignore).toContain(".p4-adapter.json");
  });
});
