import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  getGuildHallHome,
  getConfigPath,
  projectLorePath,
  integrationWorktreePath,
  activityWorktreeRoot,
  commissionWorktreePath,
  meetingWorktreePath,
  commissionBranchName,
  meetingBranchName,
  briefingCachePath,
  allProjectsBriefingCachePath,
  resolveCommissionBasePath,
  resolveMeetingBasePath,
} from "@/lib/paths";

describe("getGuildHallHome", () => {
  test("returns override path when provided", () => {
    const result = getGuildHallHome("/tmp/test-home");
    expect(result).toBe(path.join("/tmp/test-home", ".guild-hall"));
  });

  test("uses os.homedir() when no override", () => {
    const result = getGuildHallHome();
    expect(result).toBe(path.join(os.homedir(), ".guild-hall"));
  });

  test("falls back to os.homedir() when HOME is unset", () => {
    const savedHome = process.env.HOME;
    const savedGhHome = process.env.GUILD_HALL_HOME;
    try {
      delete process.env.HOME;
      delete process.env.GUILD_HALL_HOME;
      const result = getGuildHallHome();
      // os.homedir() falls back to platform-native resolution (e.g., passwd
      // on Linux, USERPROFILE on Windows) when HOME is unset.
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
      // Windows-specific scenario (USERPROFILE fallback) is manual-only
      // until a Windows CI runner exists.
    } finally {
      if (savedHome !== undefined) process.env.HOME = savedHome;
      if (savedGhHome !== undefined) process.env.GUILD_HALL_HOME = savedGhHome;
    }
  });
});

describe("getConfigPath", () => {
  test("returns config.yaml under guild-hall home", () => {
    const result = getConfigPath("/tmp/test-home");
    expect(result).toBe(path.join("/tmp/test-home", ".guild-hall", "config.yaml"));
  });

  test("uses os.homedir() when no override", () => {
    const result = getConfigPath();
    expect(result).toBe(
      path.join(os.homedir(), ".guild-hall", "config.yaml")
    );
  });
});

describe("projectLorePath", () => {
  test("appends .lore to project path", () => {
    expect(projectLorePath("/home/user/my-project")).toBe(
      path.join("/home/user/my-project", ".lore")
    );
  });

  test("handles trailing slash in project path", () => {
    const result = projectLorePath("/home/user/my-project/");
    expect(result).toBe(path.join("/home/user/my-project", ".lore"));
  });
});

describe("integrationWorktreePath", () => {
  test("returns correct path", () => {
    expect(integrationWorktreePath("/home/user/.guild-hall", "my-project"))
      .toBe(path.join("/home/user/.guild-hall", "projects", "my-project"));
  });
});

describe("activityWorktreeRoot", () => {
  test("returns correct path", () => {
    expect(activityWorktreeRoot("/home/user/.guild-hall", "my-project"))
      .toBe(path.join("/home/user/.guild-hall", "worktrees", "my-project"));
  });
});

describe("commissionWorktreePath", () => {
  test("returns correct path", () => {
    expect(commissionWorktreePath("/home/user/.guild-hall", "my-project", "commission-Assistant-20260222-120000"))
      .toBe(path.join("/home/user/.guild-hall", "worktrees", "my-project", "commission-Assistant-20260222-120000"));
  });
});

describe("meetingWorktreePath", () => {
  test("returns correct path", () => {
    expect(meetingWorktreePath("/home/user/.guild-hall", "my-project", "kickoff"))
      .toBe(path.join("/home/user/.guild-hall", "worktrees", "my-project", "meeting-kickoff"));
  });
});

describe("commissionBranchName", () => {
  test("returns base name without attempt", () => {
    expect(commissionBranchName("commission-Assistant-20260222-120000")).toBe("claude/commission/commission-Assistant-20260222-120000");
  });
  test("returns base name for attempt 1", () => {
    expect(commissionBranchName("commission-Assistant-20260222-120000", 1)).toBe("claude/commission/commission-Assistant-20260222-120000");
  });
  test("appends attempt number for attempt > 1", () => {
    expect(commissionBranchName("commission-Assistant-20260222-120000", 2)).toBe("claude/commission/commission-Assistant-20260222-120000-2");
    expect(commissionBranchName("commission-Assistant-20260222-120000", 3)).toBe("claude/commission/commission-Assistant-20260222-120000-3");
  });
});

describe("meetingBranchName", () => {
  test("returns correct branch name", () => {
    expect(meetingBranchName("kickoff")).toBe("claude/meeting/kickoff");
  });
});

describe("briefingCachePath", () => {
  test("returns correct path", () => {
    expect(briefingCachePath("/home/user/.guild-hall", "my-project"))
      .toBe(path.join("/home/user/.guild-hall", "state", "briefings", "my-project.json"));
  });
});

describe("allProjectsBriefingCachePath", () => {
  test("returns _all.json path", () => {
    expect(allProjectsBriefingCachePath("/home/user/.guild-hall"))
      .toBe(path.join("/home/user/.guild-hall", "state", "briefings", "_all.json"));
  });
});

describe("resolveCommissionBasePath", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  test("returns worktree dir when commission is dispatched", async () => {
    const ghHome = await fs.mkdtemp(path.join(os.tmpdir(), "gh-paths-"));
    tmpDirs.push(ghHome);
    const stateDir = path.join(ghHome, "state", "commissions");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "commission-Test-001.json"),
      JSON.stringify({ status: "dispatched", worktreeDir: "/fake/worktree" }),
    );
    const result = await resolveCommissionBasePath(ghHome, "proj", "commission-Test-001");
    expect(result).toBe("/fake/worktree");
  });

  test("returns worktree dir when commission is in_progress", async () => {
    const ghHome = await fs.mkdtemp(path.join(os.tmpdir(), "gh-paths-"));
    tmpDirs.push(ghHome);
    const stateDir = path.join(ghHome, "state", "commissions");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "commission-Test-002.json"),
      JSON.stringify({ status: "in_progress", worktreeDir: "/fake/worktree2" }),
    );
    const result = await resolveCommissionBasePath(ghHome, "proj", "commission-Test-002");
    expect(result).toBe("/fake/worktree2");
  });

  test("returns integration path when commission is completed", async () => {
    const ghHome = await fs.mkdtemp(path.join(os.tmpdir(), "gh-paths-"));
    tmpDirs.push(ghHome);
    const stateDir = path.join(ghHome, "state", "commissions");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "commission-Test-003.json"),
      JSON.stringify({ status: "completed", worktreeDir: "/fake/worktree3" }),
    );
    const result = await resolveCommissionBasePath(ghHome, "proj", "commission-Test-003");
    expect(result).toBe(path.join(ghHome, "projects", "proj"));
  });

  test("returns integration path when no state file exists", async () => {
    const ghHome = await fs.mkdtemp(path.join(os.tmpdir(), "gh-paths-"));
    tmpDirs.push(ghHome);
    const result = await resolveCommissionBasePath(ghHome, "proj", "commission-Missing");
    expect(result).toBe(path.join(ghHome, "projects", "proj"));
  });
});

describe("resolveMeetingBasePath", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  test("returns worktree dir when meeting is open", async () => {
    const ghHome = await fs.mkdtemp(path.join(os.tmpdir(), "gh-paths-"));
    tmpDirs.push(ghHome);
    const stateDir = path.join(ghHome, "state", "meetings");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "meeting-request-123.json"),
      JSON.stringify({ status: "open", worktreeDir: "/fake/meeting-wt" }),
    );
    const result = await resolveMeetingBasePath(ghHome, "proj", "meeting-request-123");
    expect(result).toBe("/fake/meeting-wt");
  });

  test("returns integration path when meeting is closed", async () => {
    const ghHome = await fs.mkdtemp(path.join(os.tmpdir(), "gh-paths-"));
    tmpDirs.push(ghHome);
    const stateDir = path.join(ghHome, "state", "meetings");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "meeting-request-456.json"),
      JSON.stringify({ status: "closed", worktreeDir: "/fake/meeting-wt2" }),
    );
    const result = await resolveMeetingBasePath(ghHome, "proj", "meeting-request-456");
    expect(result).toBe(path.join(ghHome, "projects", "proj"));
  });

  test("returns integration path when no state file exists", async () => {
    const ghHome = await fs.mkdtemp(path.join(os.tmpdir(), "gh-paths-"));
    tmpDirs.push(ghHome);
    const result = await resolveMeetingBasePath(ghHome, "proj", "meeting-missing");
    expect(result).toBe(path.join(ghHome, "projects", "proj"));
  });

  test("returns integration path when state file has no worktreeDir", async () => {
    const ghHome = await fs.mkdtemp(path.join(os.tmpdir(), "gh-paths-"));
    tmpDirs.push(ghHome);
    const stateDir = path.join(ghHome, "state", "meetings");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "meeting-request-789.json"),
      JSON.stringify({ status: "open" }),
    );
    const result = await resolveMeetingBasePath(ghHome, "proj", "meeting-request-789");
    expect(result).toBe(path.join(ghHome, "projects", "proj"));
  });
});
