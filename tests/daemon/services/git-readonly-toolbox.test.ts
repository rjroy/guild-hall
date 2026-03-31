/* eslint-disable @typescript-eslint/require-await -- mock GitRunners are async to match the type but don't need await */
import { describe, test, expect } from "bun:test";
import {
  createGitReadonlyTools,
  parseGitStatus,
  parseGitLog,
  parseGitBranch,
  LOG_SEPARATOR,
  FIELD_SEPARATOR,
  GENERATED_FILE_EXCLUSIONS,
  matchesExclusionPattern,
  buildExcludedSummary,
  splitDiffByFile,
  applyPerFileCap,
  applyTotalCap,
  DEFAULT_MAX_FILE_SIZE,
  MAX_TOTAL_OUTPUT,
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

// -- Phase 1: Binary exclusion tests --

describe("git_diff binary exclusion", () => {
  test("passes --no-binary by default, before -- separator", async () => {
    let capturedArgs: string[] = [];
    const runner: GitRunner = async (_cwd, args) => {
      if (args[0] === "diff" && !args.includes("--stat")) {
        capturedArgs = args;
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const tools = createGitReadonlyTools("/test", runner);
    await callTool(tools, "git_diff");

    expect(capturedArgs).toContain("--no-binary");
    const noBinaryIdx = capturedArgs.indexOf("--no-binary");
    const dashDashIdx = capturedArgs.indexOf("--");
    expect(dashDashIdx).toBeGreaterThan(-1);
    expect(noBinaryIdx).toBeLessThan(dashDashIdx);
  });

  test("omits --no-binary when include_binary is true", async () => {
    let capturedArgs: string[] = [];
    const runner: GitRunner = async (_cwd, args) => {
      capturedArgs = args;
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const tools = createGitReadonlyTools("/test", runner);
    await callTool(tools, "git_diff", { include_binary: true, include_generated: true });

    expect(capturedArgs).not.toContain("--no-binary");
  });
});

describe("git_show binary exclusion", () => {
  test("passes --no-binary to diff-tree by default, before -- separator", async () => {
    let capturedDiffArgs: string[] = [];
    const runner: GitRunner = async (_cwd, args) => {
      if (args.includes("--no-patch")) {
        return {
          stdout: `abc${SEP}A${SEP}2026-01${SEP}Fix${SEP}${END}`,
          stderr: "",
          exitCode: 0,
        };
      }
      if (args[0] === "diff-tree" && !args.includes("--stat")) {
        capturedDiffArgs = args;
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const tools = createGitReadonlyTools("/test", runner);
    await callTool(tools, "git_show", { ref: "HEAD" });

    expect(capturedDiffArgs).toContain("diff-tree");
    expect(capturedDiffArgs).toContain("--no-binary");
    const noBinaryIdx = capturedDiffArgs.indexOf("--no-binary");
    const dashDashIdx = capturedDiffArgs.indexOf("--");
    expect(dashDashIdx).toBeGreaterThan(-1);
    expect(noBinaryIdx).toBeLessThan(dashDashIdx);
  });

  test("omits --no-binary when include_binary is true", async () => {
    let capturedDiffArgs: string[] = [];
    const runner: GitRunner = async (_cwd, args) => {
      if (args.includes("--no-patch")) {
        return {
          stdout: `abc${SEP}A${SEP}2026-01${SEP}Fix${SEP}${END}`,
          stderr: "",
          exitCode: 0,
        };
      }
      capturedDiffArgs = args;
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const tools = createGitReadonlyTools("/test", runner);
    await callTool(tools, "git_show", { ref: "HEAD", include_binary: true, include_generated: true });

    expect(capturedDiffArgs).toContain("diff-tree");
    expect(capturedDiffArgs).not.toContain("--no-binary");
  });
});

// -- Phase 2: Generated file exclusion tests --

describe("matchesExclusionPattern", () => {
  test("matches wildcard extension patterns", () => {
    expect(matchesExclusionPattern("Gemfile.lock", GENERATED_FILE_EXCLUSIONS)).toEqual({ pattern: "*.lock", category: "lockfile" });
    expect(matchesExclusionPattern("src/app.min.js", GENERATED_FILE_EXCLUSIONS)).toEqual({ pattern: "*.min.js", category: "minified" });
    expect(matchesExclusionPattern("lib/utils.min.css", GENERATED_FILE_EXCLUSIONS)).toEqual({ pattern: "*.min.css", category: "minified" });
    // __pycache__/foo.pyc matches __pycache__/* first (directory prefix before *.pyc)
    expect(matchesExclusionPattern("__pycache__/foo.pyc", GENERATED_FILE_EXCLUSIONS)).not.toBeNull();
    // Test *.pyc with a path that doesn't match a directory prefix
    expect(matchesExclusionPattern("src/foo.pyc", GENERATED_FILE_EXCLUSIONS)).toEqual({ pattern: "*.pyc", category: "compiled" });
  });

  test("matches exact basename patterns", () => {
    expect(matchesExclusionPattern("package-lock.json", GENERATED_FILE_EXCLUSIONS)).toEqual({ pattern: "package-lock.json", category: "lockfile" });
    // yarn.lock matches *.lock first (wildcard before exact); both are lockfile category
    expect(matchesExclusionPattern("yarn.lock", GENERATED_FILE_EXCLUSIONS)).toEqual({ pattern: "*.lock", category: "lockfile" });
    expect(matchesExclusionPattern("bun.lockb", GENERATED_FILE_EXCLUSIONS)).toEqual({ pattern: "bun.lockb", category: "lockfile" });
    // These all match *.lock first; the exact-match entries exist as fallback documentation
    expect(matchesExclusionPattern("poetry.lock", GENERATED_FILE_EXCLUSIONS)).toEqual({ pattern: "*.lock", category: "lockfile" });
    expect(matchesExclusionPattern("Cargo.lock", GENERATED_FILE_EXCLUSIONS)).toEqual({ pattern: "*.lock", category: "lockfile" });
    expect(matchesExclusionPattern("composer.lock", GENERATED_FILE_EXCLUSIONS)).toEqual({ pattern: "*.lock", category: "lockfile" });
  });

  test("matches directory prefix patterns", () => {
    expect(matchesExclusionPattern("dist/bundle.js", GENERATED_FILE_EXCLUSIONS)).toEqual({ pattern: "dist/*", category: "build artifact" });
    expect(matchesExclusionPattern("build/output.css", GENERATED_FILE_EXCLUSIONS)).toEqual({ pattern: "build/*", category: "build artifact" });
    expect(matchesExclusionPattern(".next/cache/file", GENERATED_FILE_EXCLUSIONS)).toEqual({ pattern: ".next/*", category: "build artifact" });
    expect(matchesExclusionPattern("out/index.html", GENERATED_FILE_EXCLUSIONS)).toEqual({ pattern: "out/*", category: "build artifact" });
    expect(matchesExclusionPattern("target/debug/bin", GENERATED_FILE_EXCLUSIONS)).toEqual({ pattern: "target/*", category: "build artifact" });
    expect(matchesExclusionPattern("__pycache__/mod.cpython-312.pyc", GENERATED_FILE_EXCLUSIONS)).not.toBeNull();
    expect(matchesExclusionPattern(".cache/data", GENERATED_FILE_EXCLUSIONS)).toEqual({ pattern: ".cache/*", category: "cache" });
  });

  test("returns null for non-matching paths", () => {
    expect(matchesExclusionPattern("src/index.ts", GENERATED_FILE_EXCLUSIONS)).toBeNull();
    expect(matchesExclusionPattern("lib/utils.ts", GENERATED_FILE_EXCLUSIONS)).toBeNull();
    expect(matchesExclusionPattern("README.md", GENERATED_FILE_EXCLUSIONS)).toBeNull();
    expect(matchesExclusionPattern("package.json", GENERATED_FILE_EXCLUSIONS)).toBeNull();
  });
});

describe("buildExcludedSummary", () => {
  test("returns formatted summary for excluded files", () => {
    const statOutput = [
      " package-lock.json | 500 +++",
      " dist/bundle.js    | 200 +++",
      " src/index.ts      |  10 +++",
      " 3 files changed, 710 insertions(+)",
    ].join("\n");

    const result = buildExcludedSummary(statOutput, GENERATED_FILE_EXCLUSIONS);
    expect(result).toContain("2 files excluded by default filters");
    expect(result).toContain("package-lock.json (lockfile)");
    expect(result).toContain("dist/bundle.js (build artifact)");
    expect(result).toContain("Use include_generated=true to include these files.");
  });

  test("returns empty string when no files match", () => {
    const statOutput = [
      " src/index.ts | 10 +++",
      " src/utils.ts |  5 +++",
      " 2 files changed, 15 insertions(+)",
    ].join("\n");

    const result = buildExcludedSummary(statOutput, GENERATED_FILE_EXCLUSIONS);
    expect(result).toBe("");
  });

  test("returns empty string for empty input", () => {
    expect(buildExcludedSummary("", GENERATED_FILE_EXCLUSIONS)).toBe("");
  });
});

describe("GENERATED_FILE_EXCLUSIONS completeness", () => {
  test("contains all patterns from REQ-TEG-5", () => {
    const patterns = GENERATED_FILE_EXCLUSIONS.map((e) => e.pattern);

    // Lockfiles
    expect(patterns).toContain("*.lock");
    expect(patterns).toContain("package-lock.json");
    expect(patterns).toContain("yarn.lock");
    expect(patterns).toContain("bun.lockb");
    expect(patterns).toContain("poetry.lock");
    expect(patterns).toContain("Gemfile.lock");
    expect(patterns).toContain("composer.lock");
    expect(patterns).toContain("Cargo.lock");

    // Minified
    expect(patterns).toContain("*.min.js");
    expect(patterns).toContain("*.min.css");

    // Build artifacts
    expect(patterns).toContain("dist/*");
    expect(patterns).toContain("build/*");
    expect(patterns).toContain(".next/*");
    expect(patterns).toContain("out/*");
    expect(patterns).toContain("target/*");

    // Cache/compiled
    expect(patterns).toContain("__pycache__/*");
    expect(patterns).toContain(".cache/*");
    expect(patterns).toContain("*.pyc");
  });
});

describe("git_diff generated file exclusion", () => {
  test("appends pathspec exclusions by default", async () => {
    let capturedArgs: string[] = [];
    const runner: GitRunner = async (_cwd, args) => {
      // Capture only the main diff call, not the stat call
      if (args[0] === "diff" && !args.includes("--stat")) {
        capturedArgs = args;
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const tools = createGitReadonlyTools("/test", runner);
    await callTool(tools, "git_diff");

    expect(capturedArgs).toContain("--");
    expect(capturedArgs).toContain(":!*.lock");
    expect(capturedArgs).toContain(":!package-lock.json");
    expect(capturedArgs).toContain(":!dist/*");
  });

  test("omits exclusions when include_generated is true", async () => {
    let capturedArgs: string[] = [];
    const runner: GitRunner = async (_cwd, args) => {
      if (args[0] === "diff" && !args.includes("--stat")) {
        capturedArgs = args;
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const tools = createGitReadonlyTools("/test", runner);
    await callTool(tools, "git_diff", { include_generated: true });

    expect(capturedArgs).not.toContain(":!*.lock");
    expect(capturedArgs).not.toContain("--");
  });

  test("file arg placed before exclusion patterns after --", async () => {
    let capturedArgs: string[] = [];
    const runner: GitRunner = async (_cwd, args) => {
      if (args[0] === "diff" && !args.includes("--stat")) {
        capturedArgs = args;
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const tools = createGitReadonlyTools("/test", runner);
    await callTool(tools, "git_diff", { file: "src/index.ts" });

    const dashDashIndex = capturedArgs.indexOf("--");
    const fileIndex = capturedArgs.indexOf("src/index.ts");
    const exclusionIndex = capturedArgs.indexOf(":!*.lock");

    expect(dashDashIndex).toBeGreaterThan(-1);
    expect(fileIndex).toBe(dashDashIndex + 1);
    expect(exclusionIndex).toBeGreaterThan(fileIndex);
  });

  test("output includes excluded summary when files are filtered", async () => {
    const runner: GitRunner = async (_cwd, args) => {
      if (args.includes("--stat")) {
        return {
          stdout: " package-lock.json | 100 +++\n src/index.ts | 5 +++\n 2 files changed",
          stderr: "",
          exitCode: 0,
        };
      }
      return { stdout: "diff output here", stderr: "", exitCode: 0 };
    };
    const tools = createGitReadonlyTools("/test", runner);
    const text = await callTool(tools, "git_diff");

    expect(text).toContain("diff output here");
    expect(text).toContain("1 files excluded by default filters");
    expect(text).toContain("package-lock.json (lockfile)");
  });

  test("output omits summary when include_generated is true", async () => {
    const runner: GitRunner = async () => {
      return { stdout: "diff output here", stderr: "", exitCode: 0 };
    };
    const tools = createGitReadonlyTools("/test", runner);
    const text = await callTool(tools, "git_diff", { include_generated: true });

    expect(text).not.toContain("excluded by default filters");
  });
});

describe("git_show generated file exclusion", () => {
  test("appends pathspec exclusions to diff-tree by default", async () => {
    let capturedDiffArgs: string[] = [];
    const runner: GitRunner = async (_cwd, args) => {
      if (args.includes("--no-patch")) {
        return {
          stdout: `abc${SEP}A${SEP}2026-01${SEP}Fix${SEP}${END}`,
          stderr: "",
          exitCode: 0,
        };
      }
      if (args[0] === "diff-tree" && !args.includes("--stat")) {
        capturedDiffArgs = args;
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const tools = createGitReadonlyTools("/test", runner);
    await callTool(tools, "git_show", { ref: "HEAD" });

    expect(capturedDiffArgs).toContain("--");
    expect(capturedDiffArgs).toContain(":!*.lock");
    expect(capturedDiffArgs).toContain(":!dist/*");
  });

  test("omits exclusions when include_generated is true", async () => {
    let capturedDiffArgs: string[] = [];
    const runner: GitRunner = async (_cwd, args) => {
      if (args.includes("--no-patch")) {
        return {
          stdout: `abc${SEP}A${SEP}2026-01${SEP}Fix${SEP}${END}`,
          stderr: "",
          exitCode: 0,
        };
      }
      if (args[0] === "diff-tree" && !args.includes("--stat")) {
        capturedDiffArgs = args;
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const tools = createGitReadonlyTools("/test", runner);
    await callTool(tools, "git_show", { ref: "HEAD", include_generated: true });

    expect(capturedDiffArgs).not.toContain("--");
    expect(capturedDiffArgs).not.toContain(":!*.lock");
  });

  test("response includes excluded field when files are filtered", async () => {
    const runner: GitRunner = async (_cwd, args) => {
      if (args.includes("--no-patch")) {
        return {
          stdout: `abc${SEP}A${SEP}2026-01${SEP}Fix${SEP}${END}`,
          stderr: "",
          exitCode: 0,
        };
      }
      if (args.includes("--stat")) {
        return {
          stdout: " bun.lockb | 100 +++\n src/app.ts | 5 +++\n 2 files changed",
          stderr: "",
          exitCode: 0,
        };
      }
      return { stdout: "filtered diff", stderr: "", exitCode: 0 };
    };
    const tools = createGitReadonlyTools("/test", runner);
    const text = await callTool(tools, "git_show", { ref: "HEAD" });
    const parsed = JSON.parse(text);

    expect(parsed.excluded).toContain("1 files excluded by default filters");
    expect(parsed.excluded).toContain("bun.lockb (lockfile)");
  });

  test("omits excluded field when include_generated is true", async () => {
    const runner: GitRunner = async (_cwd, args) => {
      if (args.includes("--no-patch")) {
        return {
          stdout: `abc${SEP}A${SEP}2026-01${SEP}Fix${SEP}${END}`,
          stderr: "",
          exitCode: 0,
        };
      }
      return { stdout: "diff output", stderr: "", exitCode: 0 };
    };
    const tools = createGitReadonlyTools("/test", runner);
    const text = await callTool(tools, "git_show", { ref: "HEAD", include_generated: true });
    const parsed = JSON.parse(text);

    expect(parsed.excluded).toBeUndefined();
  });
});

// -- Phase 3: Per-file size cap and total output cap tests --

describe("splitDiffByFile", () => {
  test("splits multi-file diff output", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1 +1 @@",
      "-old a",
      "+new a",
      "diff --git a/src/b.ts b/src/b.ts",
      "--- a/src/b.ts",
      "+++ b/src/b.ts",
      "@@ -1 +1 @@",
      "-old b",
      "+new b",
    ].join("\n");

    const result = splitDiffByFile(diff);
    expect(result).toHaveLength(2);
    expect(result[0].path).toBe("src/a.ts");
    expect(result[0].content).toContain("diff --git a/src/a.ts b/src/a.ts");
    expect(result[0].content).toContain("-old a");
    expect(result[0].content).not.toContain("-old b");
    expect(result[1].path).toBe("src/b.ts");
    expect(result[1].content).toContain("-old b");
  });

  test("handles single-file diffs", () => {
    const diff = [
      "diff --git a/file.ts b/file.ts",
      "--- a/file.ts",
      "+++ b/file.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
    ].join("\n");

    const result = splitDiffByFile(diff);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("file.ts");
  });

  test("handles empty diff", () => {
    expect(splitDiffByFile("")).toEqual([]);
    expect(splitDiffByFile("  ")).toEqual([]);
  });

  test("handles rename headers", () => {
    const diff = [
      "diff --git a/old-name.ts b/new-name.ts",
      "similarity index 95%",
      "rename from old-name.ts",
      "rename to new-name.ts",
      "--- a/old-name.ts",
      "+++ b/new-name.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
    ].join("\n");

    const result = splitDiffByFile(diff);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("new-name.ts");
  });
});

describe("applyPerFileCap", () => {
  test("replaces oversized file with notice", () => {
    const files = [
      { path: "big.ts", content: "x".repeat(25_000) },
      { path: "small.ts", content: "y".repeat(100) },
    ];

    const result = applyPerFileCap(files, DEFAULT_MAX_FILE_SIZE);
    expect(result).toHaveLength(2);
    expect(result[0].capped).toBe(true);
    expect(result[0].content).toContain("[File diff exceeds 20KB limit (25000)");
    expect(result[0].content).toContain('Use git_diff with file="big.ts" to view full diff.');
    expect(result[0].content).toContain("diff --git a/big.ts b/big.ts");
    expect(result[1].capped).toBe(false);
    expect(result[1].content).toBe("y".repeat(100));
  });

  test("preserves files under the cap", () => {
    const files = [
      { path: "a.ts", content: "small content" },
    ];
    const result = applyPerFileCap(files, DEFAULT_MAX_FILE_SIZE);
    expect(result[0].capped).toBe(false);
    expect(result[0].content).toBe("small content");
  });

  test("notice includes actual file size", () => {
    const files = [{ path: "huge.ts", content: "z".repeat(50_000) }];
    const result = applyPerFileCap(files, DEFAULT_MAX_FILE_SIZE);
    expect(result[0].content).toContain("(50000)");
  });

  test("with maxFileSize 0 disables capping", () => {
    const files = [
      { path: "big.ts", content: "x".repeat(100_000) },
    ];
    const result = applyPerFileCap(files, 0);
    expect(result[0].capped).toBe(false);
    expect(result[0].content).toBe("x".repeat(100_000));
  });

  test("custom maxFileSize changes the limit label", () => {
    const files = [{ path: "a.ts", content: "x".repeat(50_000) }];
    const result = applyPerFileCap(files, 40_960);
    expect(result[0].capped).toBe(true);
    expect(result[0].content).toContain("40KB limit");
  });
});

describe("applyTotalCap", () => {
  test("includes all files when under limit", () => {
    const files = [
      { path: "a.ts", content: "aaa\n", capped: false },
      { path: "b.ts", content: "bbb\n", capped: false },
    ];
    const result = applyTotalCap(files, MAX_TOTAL_OUTPUT);
    expect(result).toBe("aaa\nbbb\n");
    expect(result).not.toContain("truncated");
  });

  test("truncates at file boundary when over limit", () => {
    const files = [
      { path: "a.ts", content: "a".repeat(60), capped: false },
      { path: "b.ts", content: "b".repeat(60), capped: false },
      { path: "c.ts", content: "c".repeat(60), capped: false },
    ];
    const result = applyTotalCap(files, 100);
    expect(result).toContain("a".repeat(60));
    expect(result).not.toContain("b".repeat(60));
    expect(result).toContain("truncated");
  });

  test("lists remaining file names in the notice", () => {
    const files = [
      { path: "a.ts", content: "a".repeat(80), capped: false },
      { path: "b.ts", content: "b".repeat(80), capped: false },
      { path: "c.ts", content: "c".repeat(80), capped: false },
    ];
    const result = applyTotalCap(files, 100);
    expect(result).toContain("2 remaining files not shown: b.ts, c.ts");
    expect(result).toContain('Use git_diff with file="<path>" to inspect specific files.');
  });

  test("always includes at least the first file even if it exceeds the cap", () => {
    const files = [
      { path: "huge.ts", content: "x".repeat(200), capped: false },
      { path: "small.ts", content: "y", capped: false },
    ];
    const result = applyTotalCap(files, 100);
    expect(result).toContain("x".repeat(200));
    expect(result).toContain("1 remaining files not shown: small.ts");
  });

  test("returns empty string for empty input", () => {
    expect(applyTotalCap([], MAX_TOTAL_OUTPUT)).toBe("");
  });
});

describe("git_diff per-file cap integration", () => {
  test("applies per-file cap by default", async () => {
    const largeDiff = [
      "diff --git a/big.ts b/big.ts",
      "--- a/big.ts",
      "+++ b/big.ts",
      "@@ -1 +1 @@",
      "x".repeat(25_000),
    ].join("\n");

    const runner: GitRunner = async (_cwd, args) => {
      if (args.includes("--stat")) return { stdout: "", stderr: "", exitCode: 0 };
      return { stdout: largeDiff, stderr: "", exitCode: 0 };
    };
    const tools = createGitReadonlyTools("/test", runner);
    const text = await callTool(tools, "git_diff", { include_generated: true });

    expect(text).toContain("[File diff exceeds 20KB limit");
    expect(text).toContain('file="big.ts"');
    expect(text).not.toContain("x".repeat(25_000));
  });

  test("respects custom max_file_size parameter", async () => {
    const mediumDiff = [
      "diff --git a/med.ts b/med.ts",
      "--- a/med.ts",
      "+++ b/med.ts",
      "@@ -1 +1 @@",
      "m".repeat(5_000),
    ].join("\n");

    const runner: GitRunner = async (_cwd, args) => {
      if (args.includes("--stat")) return { stdout: "", stderr: "", exitCode: 0 };
      return { stdout: mediumDiff, stderr: "", exitCode: 0 };
    };
    const tools = createGitReadonlyTools("/test", runner);
    const text = await callTool(tools, "git_diff", { max_file_size: 1000, include_generated: true });

    expect(text).toContain("[File diff exceeds 1KB limit");
  });

  test("max_file_size 0 disables capping", async () => {
    const largeDiff = [
      "diff --git a/big.ts b/big.ts",
      "--- a/big.ts",
      "+++ b/big.ts",
      "@@ -1 +1 @@",
      "x".repeat(25_000),
    ].join("\n");

    const runner: GitRunner = async (_cwd, args) => {
      if (args.includes("--stat")) return { stdout: "", stderr: "", exitCode: 0 };
      return { stdout: largeDiff, stderr: "", exitCode: 0 };
    };
    const tools = createGitReadonlyTools("/test", runner);
    const text = await callTool(tools, "git_diff", { max_file_size: 0, include_generated: true });

    expect(text).toContain("x".repeat(25_000));
    expect(text).not.toContain("File diff exceeds");
  });
});

describe("git_show per-file cap integration", () => {
  test("applies per-file cap to diff output", async () => {
    const largeDiff = [
      "diff --git a/big.ts b/big.ts",
      "--- a/big.ts",
      "+++ b/big.ts",
      "@@ -1 +1 @@",
      "x".repeat(25_000),
    ].join("\n");

    const runner: GitRunner = async (_cwd, args) => {
      if (args.includes("--no-patch")) {
        return {
          stdout: `abc${SEP}A${SEP}2026-01${SEP}Fix${SEP}${END}`,
          stderr: "",
          exitCode: 0,
        };
      }
      if (args.includes("--stat")) return { stdout: "", stderr: "", exitCode: 0 };
      return { stdout: largeDiff, stderr: "", exitCode: 0 };
    };
    const tools = createGitReadonlyTools("/test", runner);
    const text = await callTool(tools, "git_show", { ref: "HEAD", include_generated: true });
    const parsed = JSON.parse(text);

    expect(parsed.diff).toContain("[File diff exceeds 20KB limit");
    expect(parsed.diff).not.toContain("x".repeat(25_000));
  });
});

describe("full pipeline integration", () => {
  test("split then per-file cap then total cap", () => {
    // Build a diff with several files: 2 oversized, 1 normal, and enough total to trigger total cap
    const makeFileDiff = (name: string, size: number) => [
      `diff --git a/${name} b/${name}`,
      `--- a/${name}`,
      `+++ b/${name}`,
      "@@ -1 +1 @@",
      "x".repeat(size),
    ].join("\n") + "\n";

    const diff =
      makeFileDiff("a.ts", 25_000) +
      makeFileDiff("b.ts", 100) +
      makeFileDiff("c.ts", 25_000) +
      makeFileDiff("d.ts", 100);

    const files = splitDiffByFile(diff);
    expect(files).toHaveLength(4);

    const capped = applyPerFileCap(files, DEFAULT_MAX_FILE_SIZE);
    expect(capped[0].capped).toBe(true);
    expect(capped[1].capped).toBe(false);
    expect(capped[2].capped).toBe(true);
    expect(capped[3].capped).toBe(false);

    // All four should fit within 100KB since the two oversized files got capped
    const output = applyTotalCap(capped, MAX_TOTAL_OUTPUT);
    expect(output).toContain("a.ts");
    expect(output).toContain("b.ts");
    expect(output).toContain("c.ts");
    expect(output).toContain("d.ts");
    expect(output).not.toContain("truncated");
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
