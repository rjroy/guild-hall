/**
 * Dual-write layout tests (REQ-LDR-38).
 *
 * Each daemon write site for in-flight artifacts must land at
 * `.lore/work/<type>/...` and not at the legacy flat `.lore/<type>/...`.
 * These tests pin that contract per write site so a future refactor that
 * accidentally points a write back at the flat layout fails loudly.
 *
 * Sites covered:
 *   - workspace issue create (REQ-LDR-24)
 *   - manager toolbox initiate_meeting (REQ-LDR-20)
 *   - meeting record writeMeetingArtifact (REQ-LDR-21)
 *   - commission orchestrator createCommission (REQ-LDR-22)
 *
 * Outcome triage is read-only for artifacts (it writes to memory, not
 * artifact files) so it is exercised by the prefix-detection tests in
 * `apps/daemon/tests/routes/artifacts.test.ts` instead.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  createWorkspaceIssueRoutes,
  type IssueRouteDeps,
} from "@/apps/daemon/routes/workspace-issue";
import {
  makeInitiateMeetingHandler,
  type ManagerToolboxDeps,
} from "@/apps/daemon/services/manager/toolbox";
import {
  meetingArtifactPath,
  writeMeetingArtifact,
} from "@/apps/daemon/services/meeting/record";
import type { MeetingId } from "@/apps/daemon/types";
import type { GitOps } from "@/apps/daemon/lib/git";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-dual-write-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// -- Shared helpers --

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function makeMockGitOps(overrides?: Partial<GitOps>): GitOps {
  /* eslint-disable @typescript-eslint/require-await */
  return {
    async createBranch() {},
    async branchExists() { return false; },
    async deleteBranch() {},
    async hasCommitsBeyond() { return false; },
    async createWorktree() {},
    async removeWorktree() {},
    async configureSparseCheckout() {},
    async commitAll() { return false; },
    async squashMerge() {},
    async hasUncommittedChanges() { return false; },
    async rebase() {},
    async currentBranch() { return "claude/main"; },
    async listWorktrees() { return []; },
    async initClaudeBranch() {},
    async detectDefaultBranch() { return "main"; },
    async fetch() {},
    async push() {},
    async resetHard() {},
    async resetSoft() {},
    async createPullRequest() { return { url: "https://example.com/pr/1" }; },
    async isAncestor() { return false; },
    async treesEqual() { return false; },
    async revParse() { return "abc"; },
    async rebaseOnto() {},
    async merge() {},
    async squashMergeNoCommit() { return true; },
    async listConflictedFiles() { return []; },
    async resolveConflictsTheirs() {},
    async mergeAbort() {},
    async lorePendingChanges() { return { hasPendingChanges: false, fileCount: 0 }; },
    async commitLore() { return { committed: false }; },
    ...overrides,
  } as GitOps;
  /* eslint-enable @typescript-eslint/require-await */
}

// -- workspace issue create (REQ-LDR-24) --

describe("REQ-LDR-38 / REQ-LDR-24: workspace issue create writes to .lore/work/issues/", () => {
  test("create lands at .lore/work/issues/<slug>.md and not at the flat path", async () => {
    const projectName = "test-project";
    const integrationPath = path.join(tmpDir, "projects", projectName);
    await fs.mkdir(integrationPath, { recursive: true });

    const deps: IssueRouteDeps = {
      config: { projects: [{ name: projectName, path: path.join(tmpDir, "src") }] },
      guildHallHome: tmpDir,
      gitOps: makeMockGitOps(),
    };
    const { routes } = createWorkspaceIssueRoutes(deps);

    const res = await routes.request("/workspace/issue/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectName, title: "Layout Smoke Test" }),
    });
    expect(res.status).toBe(201);

    const data = (await res.json()) as { path: string; slug: string };
    expect(data.slug).toBe("layout-smoke-test");
    expect(data.path).toBe(".lore/work/issues/layout-smoke-test.md");

    const workPath = path.join(
      integrationPath, ".lore", "work", "issues", "layout-smoke-test.md",
    );
    const flatPath = path.join(
      integrationPath, ".lore", "issues", "layout-smoke-test.md",
    );
    expect(await pathExists(workPath)).toBe(true);
    expect(await pathExists(flatPath)).toBe(false);
  });
});

// -- manager toolbox initiate_meeting (REQ-LDR-20) --

describe("REQ-LDR-38 / REQ-LDR-20: manager toolbox initiate_meeting writes to .lore/work/meetings/", () => {
  test("meeting request artifact lands at .lore/work/meetings/ and not at flat path", async () => {
    const projectName = "test-project";
    const integrationPath = path.join(tmpDir, "guild-hall-home", "projects", projectName);
    await fs.mkdir(path.join(integrationPath, ".lore", "work", "meetings"), {
      recursive: true,
    });

    const deps: ManagerToolboxDeps = {
      projectName,
      guildHallHome: path.join(tmpDir, "guild-hall-home"),
      // eslint-disable-next-line @typescript-eslint/require-await
      callRoute: async () => ({ ok: true, status: 200, data: {} }),
      eventBus: {
        emit() {},
        subscribe() {
          return () => {};
        },
      },
      gitOps: makeMockGitOps(),
      config: { projects: [{ name: projectName, path: path.join(tmpDir, "src") }] },
      getProjectConfig: () =>
        Promise.resolve({
          name: projectName,
          path: path.join(tmpDir, "src"),
          defaultBranch: "main",
        }),
    };

    const handler = makeInitiateMeetingHandler(deps);
    const result = await handler({
      workerName: "test-worker",
      reason: "Verify layout",
    });
    expect(result.isError).toBeUndefined();

    const parsed = JSON.parse(result.content[0].text) as { artifactPath?: string };
    expect(parsed.artifactPath).toMatch(/^work\/meetings\//);

    // Filename portion lives under both candidate locations
    const filename = String(parsed.artifactPath).replace(/^work\/meetings\//, "");
    const workPath = path.join(integrationPath, ".lore", "work", "meetings", filename);
    const flatPath = path.join(integrationPath, ".lore", "meetings", filename);
    expect(await pathExists(workPath)).toBe(true);
    expect(await pathExists(flatPath)).toBe(false);
  });
});

// -- meeting record writeMeetingArtifact (REQ-LDR-21) --

describe("REQ-LDR-38 / REQ-LDR-21: meeting record writeMeetingArtifact writes to .lore/work/meetings/", () => {
  test("initial meeting artifact lands at .lore/work/meetings/ and not at flat path", async () => {
    const meetingId = "test-meeting-20260301-120000" as MeetingId;
    await writeMeetingArtifact(
      tmpDir,
      meetingId,
      "Test Worker",
      "test agenda",
      "test-worker",
    );

    const expectedWritePath = meetingArtifactPath(tmpDir, meetingId);
    expect(expectedWritePath).toBe(
      path.join(tmpDir, ".lore", "work", "meetings", `${meetingId as string}.md`),
    );

    const workPath = path.join(tmpDir, ".lore", "work", "meetings", `${meetingId as string}.md`);
    const flatPath = path.join(tmpDir, ".lore", "meetings", `${meetingId as string}.md`);
    expect(await pathExists(workPath)).toBe(true);
    expect(await pathExists(flatPath)).toBe(false);
  });
});

// -- commission orchestrator createCommission (REQ-LDR-22) --
//
// The commission orchestrator's createCommission has heavy DI surface and is
// already exercised end-to-end in apps/daemon/tests/services/commission/orchestrator.test.ts.
// We re-pin the path-shape contract here through the shared path helper so a
// regression in lib/paths.ts trips this test even if higher-level test fixtures
// drift.

import { commissionArtifactPath } from "@/lib/paths";

describe("REQ-LDR-38 / REQ-LDR-22: commission path helper returns .lore/work/commissions/", () => {
  test("commissionArtifactPath returns the canonical work-layout path", () => {
    const projectPath = "/some/project";
    const commissionId = "commission-test-20260301-120000";
    const expected = path.join(
      projectPath, ".lore", "work", "commissions", `${commissionId}.md`,
    );
    expect(commissionArtifactPath(projectPath, commissionId)).toBe(expected);
  });

  test("commissionArtifactPath does not return the legacy flat path", () => {
    const projectPath = "/some/project";
    const commissionId = "commission-test-20260301-120000";
    const flat = path.join(
      projectPath, ".lore", "commissions", `${commissionId}.md`,
    );
    expect(commissionArtifactPath(projectPath, commissionId)).not.toBe(flat);
  });
});
