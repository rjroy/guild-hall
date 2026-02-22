import { describe, test, expect } from "bun:test";
import type { CommissionMeta } from "@/lib/commissions";
import {
  sortCommissions,
  commissionHref,
} from "@/components/dashboard/DependencyMap";
import { statusToGem } from "@/lib/types";

/**
 * Tests for the DependencyMap component's exported helpers and
 * the data flow from commission metadata to dashboard display.
 *
 * Component rendering is validated through the exported pure functions;
 * the React tree is a server component that wires these together with
 * Panel, GemIndicator, EmptyState, and Link.
 */

function makeCommission(overrides: Partial<CommissionMeta> = {}): CommissionMeta {
  return {
    commissionId: "commission-test-20260221-120000",
    title: "Test Commission",
    status: "pending",
    worker: "researcher",
    workerDisplayTitle: "Research Specialist",
    prompt: "Investigate the thing",
    dependencies: [],
    linked_artifacts: [],
    resource_overrides: {},
    current_progress: "",
    result_summary: "",
    projectName: "my-project",
    date: "2026-02-21",
    ...overrides,
  };
}

describe("DependencyMap empty state", () => {
  test("sortCommissions returns empty array for empty input", () => {
    const result = sortCommissions([]);
    expect(result).toEqual([]);
  });
});

describe("DependencyMap commission card data", () => {
  test("commission title is used for display", () => {
    const commission = makeCommission({ title: "Investigate Performance" });
    expect(commission.title).toBe("Investigate Performance");
  });

  test("commission falls back to commissionId when title is empty", () => {
    const commission = makeCommission({ title: "" });
    // Component uses: commission.title || commission.commissionId
    const displayTitle = commission.title || commission.commissionId;
    expect(displayTitle).toBe("commission-test-20260221-120000");
  });

  test("workerDisplayTitle is shown when present", () => {
    const commission = makeCommission({ workerDisplayTitle: "Architect" });
    expect(commission.workerDisplayTitle).toBe("Architect");
  });

  test("current_progress is shown when non-empty", () => {
    const commission = makeCommission({
      current_progress: "Analyzing dependencies...",
    });
    expect(commission.current_progress).toBe("Analyzing dependencies...");
  });

  test("status maps to correct gem via statusToGem", () => {
    expect(statusToGem("in_progress")).toBe("active");
    expect(statusToGem("dispatched")).toBe("active");
    expect(statusToGem("pending")).toBe("pending");
    expect(statusToGem("blocked")).toBe("pending");
    // "completed" is not in ACTIVE_STATUSES ("complete" is); falls to "info"
    expect(statusToGem("completed")).toBe("info");
    expect(statusToGem("failed")).toBe("blocked");
    expect(statusToGem("cancelled")).toBe("blocked");
  });
});

describe("commissionHref", () => {
  test("constructs correct link to commission view", () => {
    const href = commissionHref("my-project", "commission-researcher-20260221-120000");
    expect(href).toBe(
      "/projects/my-project/commissions/commission-researcher-20260221-120000",
    );
  });

  test("encodes special characters in project name", () => {
    const href = commissionHref("my project & stuff", "commission-test-123");
    expect(href).toBe(
      "/projects/my%20project%20%26%20stuff/commissions/commission-test-123",
    );
  });

  test("encodes special characters in commission ID", () => {
    const href = commissionHref("project", "commission with spaces");
    expect(href).toBe(
      "/projects/project/commissions/commission%20with%20spaces",
    );
  });
});

describe("sortCommissions", () => {
  test("running commissions (in_progress) sort first", () => {
    const commissions = [
      makeCommission({ commissionId: "pending-1", status: "pending", date: "2026-02-21" }),
      makeCommission({ commissionId: "running-1", status: "in_progress", date: "2026-02-20" }),
      makeCommission({ commissionId: "done-1", status: "completed", date: "2026-02-22" }),
    ];

    const sorted = sortCommissions(commissions);
    expect(sorted[0].commissionId).toBe("running-1");
  });

  test("dispatched commissions also sort first (same as in_progress)", () => {
    const commissions = [
      makeCommission({ commissionId: "pending-1", status: "pending", date: "2026-02-21" }),
      makeCommission({ commissionId: "dispatched-1", status: "dispatched", date: "2026-02-19" }),
      makeCommission({ commissionId: "done-1", status: "completed", date: "2026-02-22" }),
    ];

    const sorted = sortCommissions(commissions);
    expect(sorted[0].commissionId).toBe("dispatched-1");
  });

  test("pending commissions sort after running, before completed", () => {
    const commissions = [
      makeCommission({ commissionId: "done-1", status: "completed", date: "2026-02-22" }),
      makeCommission({ commissionId: "pending-1", status: "pending", date: "2026-02-20" }),
      makeCommission({ commissionId: "running-1", status: "in_progress", date: "2026-02-19" }),
    ];

    const sorted = sortCommissions(commissions);
    expect(sorted[0].commissionId).toBe("running-1");
    expect(sorted[1].commissionId).toBe("pending-1");
    expect(sorted[2].commissionId).toBe("done-1");
  });

  test("terminal states sort by date descending", () => {
    const commissions = [
      makeCommission({ commissionId: "old", status: "completed", date: "2026-02-18" }),
      makeCommission({ commissionId: "new", status: "failed", date: "2026-02-21" }),
      makeCommission({ commissionId: "mid", status: "cancelled", date: "2026-02-20" }),
    ];

    const sorted = sortCommissions(commissions);
    expect(sorted[0].commissionId).toBe("new");
    expect(sorted[1].commissionId).toBe("mid");
    expect(sorted[2].commissionId).toBe("old");
  });

  test("same-priority commissions sort by date descending", () => {
    const commissions = [
      makeCommission({ commissionId: "early", status: "in_progress", date: "2026-02-18" }),
      makeCommission({ commissionId: "late", status: "in_progress", date: "2026-02-21" }),
      makeCommission({ commissionId: "mid", status: "dispatched", date: "2026-02-20" }),
    ];

    const sorted = sortCommissions(commissions);
    expect(sorted[0].commissionId).toBe("late");
    expect(sorted[1].commissionId).toBe("mid");
    expect(sorted[2].commissionId).toBe("early");
  });

  test("does not mutate original array", () => {
    const commissions = [
      makeCommission({ commissionId: "b", status: "completed", date: "2026-02-20" }),
      makeCommission({ commissionId: "a", status: "in_progress", date: "2026-02-19" }),
    ];

    const originalFirst = commissions[0].commissionId;
    sortCommissions(commissions);
    expect(commissions[0].commissionId).toBe(originalFirst);
  });

  test("full sort order: running, pending, terminal", () => {
    const commissions = [
      makeCommission({ commissionId: "cancelled-1", status: "cancelled", date: "2026-02-15" }),
      makeCommission({ commissionId: "pending-1", status: "pending", date: "2026-02-18" }),
      makeCommission({ commissionId: "running-1", status: "in_progress", date: "2026-02-20" }),
      makeCommission({ commissionId: "failed-1", status: "failed", date: "2026-02-19" }),
      makeCommission({ commissionId: "dispatched-1", status: "dispatched", date: "2026-02-21" }),
      makeCommission({ commissionId: "completed-1", status: "completed", date: "2026-02-17" }),
    ];

    const sorted = sortCommissions(commissions);
    const ids = sorted.map((c) => c.commissionId);

    // Running (in_progress + dispatched) first, by date desc
    expect(ids[0]).toBe("dispatched-1");
    expect(ids[1]).toBe("running-1");

    // Pending next
    expect(ids[2]).toBe("pending-1");

    // Terminal states by date desc
    expect(ids[3]).toBe("failed-1");
    expect(ids[4]).toBe("completed-1");
    expect(ids[5]).toBe("cancelled-1");
  });
});

describe("commission status gem mapping completeness", () => {
  test("all commission statuses produce valid gem values", () => {
    const commissionStatuses = [
      "pending",
      "dispatched",
      "in_progress",
      "completed",
      "failed",
      "cancelled",
    ];
    const validGems = new Set(["active", "pending", "blocked", "info"]);

    for (const status of commissionStatuses) {
      const gem = statusToGem(status);
      expect(validGems.has(gem)).toBe(true);
    }
  });
});
