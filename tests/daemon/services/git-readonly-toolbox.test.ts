import { describe, test, expect } from "bun:test";
import {
  createGitReadonlyTools,
  parseGitStatus,
  parseGitLog,
  parseGitBranch,
  LOG_SEPARATOR,
  FIELD_SEPARATOR,
} from "@/daemon/services/git-readonly-toolbox";
import type { GitRunner } from "@/daemon/services/git-readonly-toolbox";

const SEP = FIELD_SEPARATOR;
const END = LOG_SEPARATOR;

// -- Parser unit tests --

describe("parseGitStatus", () => {
  test("empty output returns empty arrays", () => {
    expect(parseGitStatus("")).toEqual({ staged: [], unstaged: [], untracked: [] });
  });

  test("staged file detected from index status", () => {
    const result = parseGitStatus("M  src/index.ts");
    expect(result.staged).toEqual(["src/index.ts"]);
    expect(result.unstaged).toEqual([]);
    expect(result.untracked).toEqual([]);
  });

  test("unstaged file detected from worktree status", () => {
    const result = parseGitStatus(" M src/index.ts");
    expect(result.staged).toEqual([]);
    expect(result.unstaged).toEqual(["src/index.ts"]);
    expect(result.untracked).toEqual([]);
  });

  test("untracked files detected", () => {
    const result = parseGitStatus("?? new-file.ts");
    expect(result.staged).toEqual([]);
    expect(result.unstaged).toEqual([]);
    expect(result.untracked).toEqual(["new-file.ts"]);
  });

  test("mixed status parsed correctly", () => {
    const porcelain = [
      "M  staged.ts",
      " M unstaged.ts",
      "MM both.ts",
      "?? untracked.ts",
      "A  added.ts",
    ].join("\n");

    const result = parseGitStatus(porcelain);
    expect(result.staged).toContain("staged.ts");
    expect(result.staged).toContain("both.ts");
    expect(result.staged).toContain("added.ts");
    expect(result.unstaged).toContain("unstaged.ts");
    expect(result.unstaged).toContain("both.ts");
    expect(result.untracked).toEqual(["untracked.ts"]);
  });
});

describe("parseGitLog", () => {
  test("empty output returns empty array", () => {
    expect(parseGitLog("")).toEqual([]);
  });

  test("single commit parsed with all fields", () => {
    const raw = `abc123${SEP}Alice${SEP}2026-03-22${SEP}Fix bug${SEP}Detailed description${END}`;
    const result = parseGitLog(raw);
    expect(result).toHaveLength(1);
    expect(result[0].hash).toBe("abc123");
    expect(result[0].author).toBe("Alice");
    expect(result[0].date).toBe("2026-03-22");
    expect(result[0].subject).toBe("Fix bug");
    expect(result[0].body).toBe("Detailed description");
  });

  test("commit without body omits body field", () => {
    const raw = `abc123${SEP}Alice${SEP}2026-03-22${SEP}Fix bug${SEP}${END}`;
    const result = parseGitLog(raw);
    expect(result).toHaveLength(1);
    expect(result[0].body).toBeUndefined();
  });

  test("multiple commits parsed", () => {
    const raw = [
      `abc${SEP}A${SEP}2026-01${SEP}First${SEP}${END}`,
      `def${SEP}B${SEP}2026-02${SEP}Second${SEP}${END}`,
    ].join("\n");
    const result = parseGitLog(raw);
    expect(result).toHaveLength(2);
    expect(result[0].hash).toBe("abc");
    expect(result[1].hash).toBe("def");
  });
});

describe("parseGitBranch", () => {
  test("empty output returns empty array", () => {
    expect(parseGitBranch("")).toEqual([]);
  });

  test("current branch marked", () => {
    const raw = "* main\n  feature";
    const result = parseGitBranch(raw);
    expect(result).toEqual([
      { name: "main", current: true },
      { name: "feature", current: false },
    ]);
  });

  test("no current branch (detached HEAD)", () => {
    const raw = "  main\n  feature";
    const result = parseGitBranch(raw);
    expect(result.every((b) => !b.current)).toBe(true);
  });
});

// -- Tool handler tests (via createGitReadonlyTools) --

function mockGitRunner(responses: Record<string, { stdout: string; stderr?: string; exitCode?: number }>): GitRunner {
  return async (_cwd, args) => {
    const key = args.join(" ");
    for (const [pattern, response] of Object.entries(responses)) {
      if (key.includes(pattern) || key === pattern) {
        return {
          stdout: response.stdout,
          stderr: response.stderr ?? "",
          exitCode: response.exitCode ?? 0,
        };
      }
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  };
}

function findTool(tools: ReturnType<typeof createGitReadonlyTools>, name: string) {
  const t = tools.find((t) => t.name === name);
  if (!t) throw new Error(`Tool ${name} not found`);
  return t;
}

async function callTool(
  tools: ReturnType<typeof createGitReadonlyTools>,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<string> {
  const t = findTool(tools, toolName);
  const result = await t.handler(args as never, undefined);
  const content = result.content as Array<{ type: string; text: string }>;
  return content[0].text;
}

describe("git_status tool", () => {
  test("returns structured data, not raw output", async () => {
    const runner = mockGitRunner({
      "status --porcelain": { stdout: "M  file.ts\n?? new.ts" },
    });
    const tools = createGitReadonlyTools("/test", runner);
    const text = await callTool(tools, "git_status");
    const parsed = JSON.parse(text);

    expect(parsed).toHaveProperty("staged");
    expect(parsed).toHaveProperty("unstaged");
    expect(parsed).toHaveProperty("untracked");
    expect(parsed.staged).toContain("file.ts");
    expect(parsed.untracked).toContain("new.ts");
  });
});

describe("git_log tool", () => {
  test("passes count argument to git", async () => {
    let capturedArgs: string[] = [];
    const runner: GitRunner = async (_cwd, args) => {
      capturedArgs = args;
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const tools = createGitReadonlyTools("/test", runner);
    await callTool(tools, "git_log", { count: 5 });

    expect(capturedArgs).toContain("-n5");
  });

  test("passes since filter to git", async () => {
    let capturedArgs: string[] = [];
    const runner: GitRunner = async (_cwd, args) => {
      capturedArgs = args;
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const tools = createGitReadonlyTools("/test", runner);
    await callTool(tools, "git_log", { since: "2026-01-01" });

    expect(capturedArgs.some((a) => a.includes("--since=2026-01-01"))).toBe(true);
  });

  test("passes author filter to git", async () => {
    let capturedArgs: string[] = [];
    const runner: GitRunner = async (_cwd, args) => {
      capturedArgs = args;
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const tools = createGitReadonlyTools("/test", runner);
    await callTool(tools, "git_log", { author: "alice" });

    expect(capturedArgs.some((a) => a.includes("--author=alice"))).toBe(true);
  });

  test("does not accept a format parameter", () => {
    const runner: GitRunner = async () => ({ stdout: "", stderr: "", exitCode: 0 });
    const tools = createGitReadonlyTools("/test", runner);
    const logTool = findTool(tools, "git_log");
    const schema = logTool.inputSchema as { properties?: Record<string, unknown> };
    expect(schema.properties).not.toHaveProperty("format");
  });

  test("returns structured commit objects", async () => {
    const runner = mockGitRunner({
      log: {
        stdout: `abc${SEP}Alice${SEP}2026-03-22${SEP}Fix${SEP}${END}`,
      },
    });
    const tools = createGitReadonlyTools("/test", runner);
    const text = await callTool(tools, "git_log");
    const parsed = JSON.parse(text);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toHaveProperty("hash");
    expect(parsed[0]).toHaveProperty("author");
    expect(parsed[0]).toHaveProperty("date");
    expect(parsed[0]).toHaveProperty("subject");
  });
});

describe("git_diff tool", () => {
  test("staged flag passes --cached", async () => {
    let capturedArgs: string[] = [];
    const runner: GitRunner = async (_cwd, args) => {
      capturedArgs = args;
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const tools = createGitReadonlyTools("/test", runner);
    await callTool(tools, "git_diff", { staged: true });

    expect(capturedArgs).toContain("--cached");
  });

  test("ref argument passed through", async () => {
    let capturedArgs: string[] = [];
    const runner: GitRunner = async (_cwd, args) => {
      capturedArgs = args;
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const tools = createGitReadonlyTools("/test", runner);
    await callTool(tools, "git_diff", { ref: "HEAD~3" });

    expect(capturedArgs).toContain("HEAD~3");
  });

  test("file argument scopes diff", async () => {
    let capturedArgs: string[] = [];
    const runner: GitRunner = async (_cwd, args) => {
      capturedArgs = args;
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const tools = createGitReadonlyTools("/test", runner);
    await callTool(tools, "git_diff", { file: "src/index.ts" });

    expect(capturedArgs).toContain("--");
    expect(capturedArgs).toContain("src/index.ts");
  });

  test("returns diff as string", async () => {
    const runner = mockGitRunner({
      diff: { stdout: "--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new" },
    });
    const tools = createGitReadonlyTools("/test", runner);
    const text = await callTool(tools, "git_diff");
    expect(text).toContain("--- a/file.ts");
  });
});

describe("git_show tool", () => {
  test("returns structured commit with diff", async () => {
    const runner: GitRunner = async (_cwd, args) => {
      if (args.includes("--no-patch")) {
        return {
          stdout: `abc123${SEP}Alice${SEP}2026-03-22${SEP}Fix${SEP}${END}`,
          stderr: "",
          exitCode: 0,
        };
      }
      return { stdout: "diff output here", stderr: "", exitCode: 0 };
    };
    const tools = createGitReadonlyTools("/test", runner);
    const text = await callTool(tools, "git_show", { ref: "HEAD" });
    const parsed = JSON.parse(text);

    expect(parsed).toHaveProperty("hash");
    expect(parsed).toHaveProperty("author");
    expect(parsed).toHaveProperty("diff");
  });

  test("uses diff-tree --root for initial commit support", async () => {
    let capturedDiffArgs: string[] = [];
    const runner: GitRunner = async (_cwd, args) => {
      if (args.includes("--no-patch")) {
        return {
          stdout: `abc123${SEP}Alice${SEP}2026-03-22${SEP}Initial${SEP}${END}`,
          stderr: "",
          exitCode: 0,
        };
      }
      capturedDiffArgs = args;
      return { stdout: "diff for root commit", stderr: "", exitCode: 0 };
    };
    const tools = createGitReadonlyTools("/test", runner);
    const text = await callTool(tools, "git_show", { ref: "abc123" });
    const parsed = JSON.parse(text);

    expect(capturedDiffArgs).toContain("diff-tree");
    expect(capturedDiffArgs).toContain("--root");
    expect(capturedDiffArgs).toContain("-p");
    expect(capturedDiffArgs).toContain("abc123");
    expect(parsed.hash).toBe("abc123");
    expect(parsed.subject).toBe("Initial");
    expect(parsed.diff).toBe("diff for root commit");
  });
});

describe("git_branch tool", () => {
  test("returns structured branch objects", async () => {
    const runner = mockGitRunner({
      branch: { stdout: "* main\n  feature" },
    });
    const tools = createGitReadonlyTools("/test", runner);
    const text = await callTool(tools, "git_branch");
    const parsed = JSON.parse(text);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toEqual({ name: "main", current: true });
    expect(parsed[1]).toEqual({ name: "feature", current: false });
  });

  test("all flag passes --all", async () => {
    let capturedArgs: string[] = [];
    const runner: GitRunner = async (_cwd, args) => {
      capturedArgs = args;
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const tools = createGitReadonlyTools("/test", runner);
    await callTool(tools, "git_branch", { all: true });

    expect(capturedArgs).toContain("--all");
  });

  test("remote flag passes --remotes", async () => {
    let capturedArgs: string[] = [];
    const runner: GitRunner = async (_cwd, args) => {
      capturedArgs = args;
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const tools = createGitReadonlyTools("/test", runner);
    await callTool(tools, "git_branch", { remote: true });

    expect(capturedArgs).toContain("--remotes");
  });
});

describe("tool set completeness", () => {
  test("no write operations exist in tool definitions", () => {
    const runner: GitRunner = async () => ({ stdout: "", stderr: "", exitCode: 0 });
    const tools = createGitReadonlyTools("/test", runner);
    const toolNames = tools.map((t) => t.name);

    const writeOps = [
      "git_commit", "git_push", "git_checkout", "git_reset",
      "git_rebase", "git_merge", "git_stash", "git_tag",
    ];

    for (const op of writeOps) {
      expect(toolNames).not.toContain(op);
    }

    // Verify the exact set of tools
    expect(toolNames).toEqual(["git_status", "git_log", "git_diff", "git_show", "git_branch"]);
  });
});
