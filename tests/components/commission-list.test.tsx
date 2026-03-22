import { describe, expect, test } from "bun:test";
import type { CommissionMeta } from "@/lib/commissions";
import {
  DEFAULT_STATUSES,
  FILTER_GROUPS,
  filterCommissions,
  countByStatus,
  isDefaultSelection,
} from "@/web/components/commission/commission-filter";

function makeCommission(status: string, id?: string): CommissionMeta {
  return {
    commissionId: id ?? `commission-${status}`,
    title: "",
    status,
    type: "one-shot",
    sourceSchedule: "",
    sourceTrigger: "",
    worker: "",
    workerDisplayTitle: "",
    prompt: "",
    dependencies: [],
    linked_artifacts: [],
    resource_overrides: {},
    current_progress: "",
    result_summary: "",
    projectName: "test",
    date: "2026-01-01",
    relevantDate: "2026-01-01",
  };
}

describe("DEFAULT_STATUSES", () => {
  test("contains exactly 8 members", () => {
    expect(DEFAULT_STATUSES.size).toBe(8);
  });

  test("contains all expected default-on statuses", () => {
    const expected = [
      "pending",
      "blocked",
      "dispatched",
      "in_progress",
      "halted",
      "active",
      "failed",
      "cancelled",
    ];
    for (const s of expected) {
      expect(DEFAULT_STATUSES.has(s)).toBe(true);
    }
  });

  test("does not contain default-off statuses", () => {
    const off = ["paused", "abandoned", "completed"];
    for (const s of off) {
      expect(DEFAULT_STATUSES.has(s)).toBe(false);
    }
  });
});

describe("FILTER_GROUPS", () => {
  test("has four groups in order: Idle, Active, Failed, Done", () => {
    expect(FILTER_GROUPS.map((g) => g.label)).toEqual([
      "Idle",
      "Active",
      "Failed",
      "Done",
    ]);
  });

  test("covers all 11 statuses exactly once", () => {
    const allStatuses = FILTER_GROUPS.flatMap((g) => g.statuses);
    expect(allStatuses).toHaveLength(11);
    expect(new Set(allStatuses).size).toBe(11);
  });
});

describe("filterCommissions", () => {
  const commissions = [
    makeCommission("pending", "c1"),
    makeCommission("completed", "c2"),
    makeCommission("failed", "c3"),
    makeCommission("in_progress", "c4"),
  ];

  test("returns only commissions whose status is in the selected set", () => {
    const selected = new Set(["pending", "failed"]);
    const result = filterCommissions(commissions, selected);
    expect(result.map((c) => c.commissionId)).toEqual(["c1", "c3"]);
  });

  test("preserves input order", () => {
    const selected = new Set(["in_progress", "pending"]);
    const result = filterCommissions(commissions, selected);
    expect(result.map((c) => c.commissionId)).toEqual(["c1", "c4"]);
  });

  test("returns empty array when selected set is empty", () => {
    const result = filterCommissions(commissions, new Set());
    expect(result).toEqual([]);
  });

  test("returns all when all statuses are selected", () => {
    const all = new Set(commissions.map((c) => c.status));
    const result = filterCommissions(commissions, all);
    expect(result).toHaveLength(4);
  });

  test("excludes commissions with unrecognized status", () => {
    const list = [makeCommission("pending", "c1"), makeCommission("unknown_status", "c2")];
    const selected = new Set(["pending"]);
    const result = filterCommissions(list, selected);
    expect(result.map((c) => c.commissionId)).toEqual(["c1"]);
  });
});

describe("countByStatus", () => {
  test("returns correct counts for each status", () => {
    const list = [
      makeCommission("pending", "c1"),
      makeCommission("pending", "c2"),
      makeCommission("failed", "c3"),
    ];
    const counts = countByStatus(list);
    expect(counts["pending"]).toBe(2);
    expect(counts["failed"]).toBe(1);
  });

  test("absent status has no key in the map", () => {
    const list = [makeCommission("pending", "c1")];
    const counts = countByStatus(list);
    expect(counts["completed"]).toBeUndefined();
  });

  test("empty list returns empty object", () => {
    expect(countByStatus([])).toEqual({});
  });
});

describe("isDefaultSelection", () => {
  test("returns true when set matches DEFAULT_STATUSES exactly", () => {
    expect(isDefaultSelection(new Set(DEFAULT_STATUSES))).toBe(true);
  });

  test("returns false when one default-on status is removed", () => {
    const modified = new Set(DEFAULT_STATUSES);
    modified.delete("blocked");
    expect(isDefaultSelection(modified)).toBe(false);
  });

  test("returns false when a default-off status is added", () => {
    const modified = new Set(DEFAULT_STATUSES);
    modified.add("completed");
    expect(isDefaultSelection(modified)).toBe(false);
  });

  test("returns false for empty set", () => {
    expect(isDefaultSelection(new Set())).toBe(false);
  });

  test("returns false for all 11 statuses", () => {
    const all = new Set(FILTER_GROUPS.flatMap((g) => g.statuses));
    expect(isDefaultSelection(all)).toBe(false);
  });
});
