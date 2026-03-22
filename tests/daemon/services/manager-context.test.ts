import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  buildManagerContext,
  type ManagerContextDeps,
} from "@/daemon/services/manager/context";
import { MANAGER_PACKAGE_NAME } from "@/daemon/services/manager/worker";
import type { DiscoveredPackage, WorkerMetadata } from "@/lib/types";
import type { CommissionMeta } from "@/lib/commissions";
import type { MeetingMeta } from "@/lib/meetings";

let tmpDir: string;
let integrationPath: string;
let guildHallHome: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gh-mgr-ctx-"));
  integrationPath = path.join(tmpDir, "integration");
  guildHallHome = path.join(tmpDir, "guild-hall-home");

  await fs.mkdir(path.join(integrationPath, ".lore", "commissions"), {
    recursive: true,
  });
  await fs.mkdir(path.join(integrationPath, ".lore", "meetings"), {
    recursive: true,
  });
  await fs.mkdir(path.join(guildHallHome, "state", "meetings"), {
    recursive: true,
  });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// -- Helpers --

/* eslint-disable @typescript-eslint/require-await */

function makeWorkerPackage(
  name: string,
  displayTitle: string,
  description: string,
): DiscoveredPackage {
  const metadata: WorkerMetadata = {
    type: "worker",
    identity: { name: displayTitle, description, displayTitle },
    posture: "Test posture",
    domainToolboxes: [],
    builtInTools: ["Read", "Glob"],
    checkoutScope: "sparse",
  };
  return { name, path: `/fake/${name}`, metadata };
}

function makeManagerPackage(): DiscoveredPackage {
  const metadata: WorkerMetadata = {
    type: "worker",
    identity: {
      name: "Guild Master",
      description: "Coordination specialist",
      displayTitle: "Guild Master",
    },
    posture: "Manager posture",
    domainToolboxes: [],
    builtInTools: ["Read", "Glob", "Grep"],
    checkoutScope: "sparse",
    resourceDefaults: { maxTurns: 200 },
  };
  return { name: MANAGER_PACKAGE_NAME, path: "", metadata };
}

function makeCommission(overrides: Partial<CommissionMeta> = {}): CommissionMeta {
  return {
    commissionId: "commission-test-20260223-120000",
    title: "Test Commission",
    status: "pending",
    type: "one-shot",
    sourceSchedule: "",
    sourceTrigger: "",
    worker: "Test Worker",
    workerDisplayTitle: "Test Worker",
    prompt: "Do the thing",
    dependencies: [],
    linked_artifacts: [],
    resource_overrides: {},
    current_progress: "",
    result_summary: "",
    projectName: "test-project",
    date: "2026-02-23",
    relevantDate: "",
    ...overrides,
  };
}

function makeMeetingRequest(overrides: Partial<MeetingMeta> = {}): MeetingMeta {
  return {
    meetingId: "audience-Worker-20260223-120000",
    title: "Follow-up on refactoring",
    status: "requested",
    worker: "Researcher",
    agenda: "Need to discuss the approach",
    date: "2026-02-23",
    deferred_until: "",
    linked_artifacts: [],
    notes: "",
    workerDisplayTitle: "The Researcher",
    projectName: "test-project",
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ManagerContextDeps> = {}): ManagerContextDeps {
  return {
    packages: [makeManagerPackage(), makeWorkerPackage("sample-worker", "The Assistant", "Helps with things")],
    projectName: "test-project",
    integrationPath,
    guildHallHome,
    scanCommissionsFn: async () => [],
    scanMeetingRequestsFn: async () => [],
    ...overrides,
  };
}

async function writeMeetingStateFile(
  meetingId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const filePath = path.join(guildHallHome, "state", "meetings", `${meetingId}.json`);
  await fs.writeFile(filePath, JSON.stringify(data), "utf-8");
}

// -- Tests --

describe("buildManagerContext - worker section", () => {
  test("includes workers from packages list", async () => {
    const result = await buildManagerContext(makeDeps());
    expect(result).toContain("## Available Workers");
    expect(result).toContain("The Assistant");
    expect(result).toContain("sample-worker");
    expect(result).toContain("Helps with things");
  });

  test("excludes the manager itself from worker list", async () => {
    const result = await buildManagerContext(makeDeps());
    expect(result).not.toContain(MANAGER_PACKAGE_NAME);
    expect(result).not.toContain("Guild Master");
  });

  test("lists multiple workers", async () => {
    const deps = makeDeps({
      packages: [
        makeManagerPackage(),
        makeWorkerPackage("worker-a", "Worker Alpha", "Does alpha tasks"),
        makeWorkerPackage("worker-b", "Worker Beta", "Does beta tasks"),
      ],
    });
    const result = await buildManagerContext(deps);
    expect(result).toContain("Worker Alpha");
    expect(result).toContain("Worker Beta");
    expect(result).toContain("Does alpha tasks");
    expect(result).toContain("Does beta tasks");
  });

  test("shows checkout scope and built-in tools", async () => {
    const result = await buildManagerContext(makeDeps());
    expect(result).toContain("Checkout: sparse");
    expect(result).toContain("Built-in tools: Read, Glob");
  });

  test("handles empty worker list (manager only)", async () => {
    const deps = makeDeps({ packages: [makeManagerPackage()] });
    const result = await buildManagerContext(deps);
    expect(result).toContain("No workers available");
  });
});

describe("buildManagerContext - commission section", () => {
  test("groups active commissions correctly", async () => {
    const deps = makeDeps({
      scanCommissionsFn: async () => [
        makeCommission({
          commissionId: "c1",
          title: "Active Task",
          status: "in_progress",
          worker: "Worker A",
          current_progress: "50% done",
        }),
        makeCommission({
          commissionId: "c2",
          title: "Dispatched Task",
          status: "dispatched",
          worker: "Worker B",
        }),
      ],
    });
    const result = await buildManagerContext(deps);
    expect(result).toContain("### Active");
    expect(result).toContain("Active Task");
    expect(result).toContain("in_progress");
    expect(result).toContain("Progress: 50% done");
    expect(result).toContain("Dispatched Task");
    expect(result).toContain("dispatched");
  });

  test("groups pending commissions correctly", async () => {
    const deps = makeDeps({
      scanCommissionsFn: async () => [
        makeCommission({
          commissionId: "c1",
          title: "Waiting Task",
          status: "pending",
          dependencies: ["dep-1", "dep-2"],
        }),
        makeCommission({
          commissionId: "c2",
          title: "Blocked Task",
          status: "blocked",
          dependencies: ["dep-3"],
        }),
      ],
    });
    const result = await buildManagerContext(deps);
    expect(result).toContain("### Pending");
    expect(result).toContain("Waiting Task");
    expect(result).toContain("Dependencies: dep-1, dep-2");
    expect(result).toContain("Blocked Task");
  });

  test("groups completed commissions (up to 5)", async () => {
    const completed = Array.from({ length: 7 }, (_, i) =>
      makeCommission({
        commissionId: `c-completed-${i}`,
        title: `Done ${i}`,
        status: "completed",
        result_summary: `Result ${i}`,
      }),
    );
    const deps = makeDeps({ scanCommissionsFn: async () => completed });
    const result = await buildManagerContext(deps);
    expect(result).toContain("### Recently Completed");
    expect(result).toContain("Done 0");
    expect(result).toContain("Done 4");
    // The 6th and 7th should be excluded (only 5 shown)
    expect(result).not.toContain("Done 5");
    expect(result).not.toContain("Done 6");
  });

  test("groups failed commissions correctly", async () => {
    const deps = makeDeps({
      scanCommissionsFn: async () => [
        makeCommission({
          commissionId: "c-fail",
          title: "Broken Task",
          status: "failed",
          result_summary: "Ran out of turns",
        }),
        makeCommission({
          commissionId: "c-cancel",
          title: "Cancelled Task",
          status: "cancelled",
          result_summary: "User cancelled",
        }),
      ],
    });
    const result = await buildManagerContext(deps);
    expect(result).toContain("### Failed");
    expect(result).toContain("Broken Task");
    expect(result).toContain("Reason: Ran out of turns");
    expect(result).toContain("Cancelled Task");
  });

  test("shows 'No commissions' when empty", async () => {
    const result = await buildManagerContext(makeDeps());
    expect(result).toContain("No commissions");
  });

  test("uses commissionId as fallback when title is empty", async () => {
    const deps = makeDeps({
      scanCommissionsFn: async () => [
        makeCommission({
          commissionId: "commission-abc-123",
          title: "",
          status: "in_progress",
        }),
      ],
    });
    const result = await buildManagerContext(deps);
    expect(result).toContain("commission-abc-123");
  });
});

describe("buildManagerContext - active meetings section", () => {
  test("lists open meetings from state files", async () => {
    await writeMeetingStateFile("audience-Worker-20260223-120000", {
      meetingId: "audience-Worker-20260223-120000",
      projectName: "test-project",
      workerName: "The Researcher",
      status: "open",
    });

    const result = await buildManagerContext(makeDeps());
    expect(result).toContain("## Active Meetings");
    expect(result).toContain("audience-Worker-20260223-120000");
    expect(result).toContain("The Researcher");
  });

  test("excludes closed meetings", async () => {
    await writeMeetingStateFile("audience-Worker-20260223-130000", {
      meetingId: "audience-Worker-20260223-130000",
      projectName: "test-project",
      workerName: "The Researcher",
      status: "closed",
    });

    const result = await buildManagerContext(makeDeps());
    expect(result).toContain("No active meetings");
  });

  test("excludes meetings from other projects", async () => {
    await writeMeetingStateFile("audience-Worker-20260223-140000", {
      meetingId: "audience-Worker-20260223-140000",
      projectName: "other-project",
      workerName: "The Researcher",
      status: "open",
    });

    const result = await buildManagerContext(makeDeps());
    expect(result).toContain("No active meetings");
  });

  test("handles missing state directory gracefully", async () => {
    await fs.rm(path.join(guildHallHome, "state", "meetings"), {
      recursive: true,
    });
    const result = await buildManagerContext(makeDeps());
    expect(result).toContain("No active meetings");
  });

  test("handles malformed state files gracefully", async () => {
    await fs.writeFile(
      path.join(guildHallHome, "state", "meetings", "bad.json"),
      "not valid json",
    );
    const result = await buildManagerContext(makeDeps());
    // Should not throw, just skip the bad file
    expect(result).toContain("No active meetings");
  });
});

describe("buildManagerContext - meeting requests section", () => {
  test("lists pending meeting requests with reason and artifacts", async () => {
    const deps = makeDeps({
      scanMeetingRequestsFn: async () => [
        makeMeetingRequest({
          title: "Follow-up on API design",
          worker: "Architect",
          agenda: "Need to discuss REST vs GraphQL",
          linked_artifacts: ["specs/api-design.md", "decisions/tech-stack.md"],
        }),
      ],
    });
    const result = await buildManagerContext(deps);
    expect(result).toContain("## Pending Meeting Requests");
    expect(result).toContain("Follow-up on API design");
    expect(result).toContain("Architect");
    expect(result).toContain("Reason: Need to discuss REST vs GraphQL");
    expect(result).toContain("specs/api-design.md");
    expect(result).toContain("decisions/tech-stack.md");
  });

  test("shows 'No pending requests' when empty", async () => {
    const result = await buildManagerContext(makeDeps());
    expect(result).toContain("No pending requests");
  });

  test("uses meetingId as fallback when title is empty", async () => {
    const deps = makeDeps({
      scanMeetingRequestsFn: async () => [
        makeMeetingRequest({
          meetingId: "audience-Bot-20260223-150000",
          title: "",
          worker: "Bot",
        }),
      ],
    });
    const result = await buildManagerContext(deps);
    expect(result).toContain("audience-Bot-20260223-150000");
  });
});

describe("buildManagerContext - truncation", () => {
  test("context is bounded to 8000 chars", async () => {
    // Generate enough commissions to blow past 8000 chars
    const manyCommissions = Array.from({ length: 200 }, (_, i) =>
      makeCommission({
        commissionId: `commission-worker-${String(i).padStart(4, "0")}`,
        title: `Commission ${i}: A moderately long title that takes up space in the context string`,
        status: i < 50 ? "in_progress" : i < 100 ? "pending" : "completed",
        worker: "Some Worker",
        current_progress: i < 50 ? `Working on step ${i} of many` : "",
        result_summary: i >= 100 ? `Completed task ${i} successfully with some output` : "",
        dependencies: i >= 50 && i < 100 ? [`dep-${i}-a`, `dep-${i}-b`] : [],
      }),
    );

    const manyRequests = Array.from({ length: 50 }, (_, i) =>
      makeMeetingRequest({
        meetingId: `audience-Worker-${String(i).padStart(4, "0")}`,
        title: `Meeting Request ${i} about some topic`,
        worker: "Researcher",
        agenda: `Need to discuss topic ${i} in detail with the team`,
      }),
    );

    const deps = makeDeps({
      scanCommissionsFn: async () => manyCommissions,
      scanMeetingRequestsFn: async () => manyRequests,
    });
    const result = await buildManagerContext(deps);
    expect(result.length).toBeLessThanOrEqual(8000);
  });

  test("truncation preserves higher-priority sections", async () => {
    // Create content where workers + commissions are within budget but
    // adding meetings would exceed it. Workers should always be present.
    const manyCommissions = Array.from({ length: 100 }, (_, i) =>
      makeCommission({
        commissionId: `c-${i}`,
        title: `Commission ${i} with a somewhat long title for testing truncation`,
        status: i < 30 ? "in_progress" : i < 60 ? "pending" : "completed",
        worker: "Worker",
        current_progress: i < 30 ? "Working..." : "",
        result_summary: i >= 60 ? "Done" : "",
      }),
    );

    const deps = makeDeps({
      scanCommissionsFn: async () => manyCommissions,
    });
    const result = await buildManagerContext(deps);
    // Workers section should always be present (highest priority)
    expect(result).toContain("## Available Workers");
  });
});

describe("buildManagerContext - empty project", () => {
  test("produces valid context with no commissions, no meetings, no requests", async () => {
    const result = await buildManagerContext(makeDeps());
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("## Available Workers");
    expect(result).toContain("## Commission Status");
    expect(result).toContain("No commissions");
    expect(result).toContain("## Active Meetings");
    expect(result).toContain("No active meetings");
    expect(result).toContain("## Pending Meeting Requests");
    expect(result).toContain("No pending requests");
  });

  test("produces valid context even with no packages at all", async () => {
    const deps = makeDeps({ packages: [] });
    const result = await buildManagerContext(deps);
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("No workers available");
    expect(result).toContain("No commissions");
    expect(result).toContain("No active meetings");
    expect(result).toContain("No pending requests");
  });
});

describe("buildManagerContext - all sections together", () => {
  test("assembles all four sections when data is present", async () => {
    await writeMeetingStateFile("audience-Worker-20260223-160000", {
      meetingId: "audience-Worker-20260223-160000",
      projectName: "test-project",
      workerName: "The Assistant",
      status: "open",
    });

    const deps = makeDeps({
      scanCommissionsFn: async () => [
        makeCommission({
          title: "Active Commission",
          status: "in_progress",
          worker: "Assistant",
          current_progress: "75% done",
        }),
        makeCommission({
          title: "Pending Commission",
          status: "pending",
          dependencies: ["dep-1"],
        }),
      ],
      scanMeetingRequestsFn: async () => [
        makeMeetingRequest({
          title: "Proposed follow-up",
          worker: "Researcher",
          agenda: "Need to discuss findings",
        }),
      ],
    });

    const result = await buildManagerContext(deps);

    // All four sections present
    expect(result).toContain("## Available Workers");
    expect(result).toContain("## Commission Status");
    expect(result).toContain("## Active Meetings");
    expect(result).toContain("## Pending Meeting Requests");

    // Specific data
    expect(result).toContain("Active Commission");
    expect(result).toContain("75% done");
    expect(result).toContain("Pending Commission");
    expect(result).toContain("audience-Worker-20260223-160000");
    expect(result).toContain("Proposed follow-up");
    expect(result).toContain("Need to discuss findings");
  });
});

describe("buildManagerContext - meeting session integration", () => {
  test("activationContext.managerContext is populated when activateManager receives it", async () => {
    // This test verifies the data flow: buildManagerContext output is passed
    // to activateManager via activationContext.managerContext, and it appears
    // in the system prompt. We test this end-to-end without the meeting session
    // machinery by calling buildManagerContext and then activateManager directly.
    const { activateManager } = await import("@/daemon/services/manager/worker");

    const context = await buildManagerContext(makeDeps({
      scanCommissionsFn: async () => [
        makeCommission({
          title: "Active work item",
          status: "in_progress",
          worker: "Researcher",
        }),
      ],
    }));

    expect(context).toContain("Active work item");
    expect(context).toContain("## Available Workers");

    // Verify it can be injected into the activation context
    const activationCtx = {
      identity: { name: "Guild Master", description: "Test manager", displayTitle: "Guild Master" },
      posture: "Test posture.",
      injectedMemory: "",
      resolvedTools: { mcpServers: [], allowedTools: [], builtInTools: [] },
      resourceDefaults: { maxTurns: 200 },
      projectPath: "/tmp/test",
      workingDirectory: "/tmp/test",
      managerContext: context,
    } satisfies import("@/lib/types").ActivationContext;

    const result = activateManager(activationCtx);
    expect(result.systemPrompt).toContain("## Available Workers");
    expect(result.systemPrompt).toContain("Active work item");
    expect(result.systemPrompt).toContain("Test posture.");
  });
});
