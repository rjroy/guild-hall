import { describe, test, expect } from "bun:test";
import * as path from "node:path";
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
} from "@/lib/paths";

describe("getGuildHallHome", () => {
  test("returns override path when provided", () => {
    const result = getGuildHallHome("/tmp/test-home");
    expect(result).toBe("/tmp/test-home/.guild-hall");
  });

  test("uses HOME env var when no override", () => {
    const result = getGuildHallHome();
    expect(result).toBe(path.join(process.env.HOME!, ".guild-hall"));
  });
});

describe("getConfigPath", () => {
  test("returns config.yaml under guild-hall home", () => {
    const result = getConfigPath("/tmp/test-home");
    expect(result).toBe("/tmp/test-home/.guild-hall/config.yaml");
  });

  test("uses HOME env var when no override", () => {
    const result = getConfigPath();
    expect(result).toBe(
      path.join(process.env.HOME!, ".guild-hall", "config.yaml")
    );
  });
});

describe("projectLorePath", () => {
  test("appends .lore to project path", () => {
    expect(projectLorePath("/home/user/my-project")).toBe(
      "/home/user/my-project/.lore"
    );
  });

  test("handles trailing slash in project path", () => {
    const result = projectLorePath("/home/user/my-project/");
    expect(result).toBe("/home/user/my-project/.lore");
  });
});

describe("integrationWorktreePath", () => {
  test("returns correct path", () => {
    expect(integrationWorktreePath("/home/user/.guild-hall", "my-project"))
      .toBe("/home/user/.guild-hall/projects/my-project");
  });
});

describe("activityWorktreeRoot", () => {
  test("returns correct path", () => {
    expect(activityWorktreeRoot("/home/user/.guild-hall", "my-project"))
      .toBe("/home/user/.guild-hall/worktrees/my-project");
  });
});

describe("commissionWorktreePath", () => {
  test("returns correct path", () => {
    expect(commissionWorktreePath("/home/user/.guild-hall", "my-project", "commission-Assistant-20260222-120000"))
      .toBe("/home/user/.guild-hall/worktrees/my-project/commission-Assistant-20260222-120000");
  });
});

describe("meetingWorktreePath", () => {
  test("returns correct path", () => {
    expect(meetingWorktreePath("/home/user/.guild-hall", "my-project", "kickoff"))
      .toBe("/home/user/.guild-hall/worktrees/my-project/meeting-kickoff");
  });
});

describe("commissionBranchName", () => {
  test("returns base name without attempt", () => {
    expect(commissionBranchName("commission-Assistant-20260222-120000")).toBe("claude/commission-Assistant-20260222-120000");
  });
  test("returns base name for attempt 1", () => {
    expect(commissionBranchName("commission-Assistant-20260222-120000", 1)).toBe("claude/commission-Assistant-20260222-120000");
  });
  test("appends attempt number for attempt > 1", () => {
    expect(commissionBranchName("commission-Assistant-20260222-120000", 2)).toBe("claude/commission-Assistant-20260222-120000-2");
    expect(commissionBranchName("commission-Assistant-20260222-120000", 3)).toBe("claude/commission-Assistant-20260222-120000-3");
  });
});

describe("meetingBranchName", () => {
  test("returns correct branch name", () => {
    expect(meetingBranchName("kickoff")).toBe("claude/meeting/kickoff");
  });
});
