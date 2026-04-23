import { afterAll, beforeAll, describe, test, expect } from "bun:test";
import {
  getCommissionFormatter,
  isCommissionAction,
  formatActionConfirmation,
  formatCommissionList,
  formatCommissionDetail,
} from "@/cli/commission-format";
import type { CliOperation } from "@/cli/resolve";

function makeOperation(overrides: Partial<CliOperation> = {}): CliOperation {
  return {
    operationId: "test.op",
    invocation: { method: "POST", path: "/test" },
    ...overrides,
  };
}

describe("getCommissionFormatter", () => {
  test("returns formatter for commission.request.commission.list", () => {
    const formatter = getCommissionFormatter("commission.request.commission.list");
    expect(formatter).toBeDefined();
  });

  test("returns formatter for commission.request.commission.read", () => {
    const formatter = getCommissionFormatter("commission.request.commission.read");
    expect(formatter).toBeDefined();
  });

  test("returns undefined for unregistered operationId", () => {
    expect(getCommissionFormatter("some.other.op")).toBeUndefined();
  });

  test("does not accept path-style keys", () => {
    // Path-style keys are the old contract; they must not match anymore.
    expect(getCommissionFormatter("/commission/request/commission/list")).toBeUndefined();
    expect(getCommissionFormatter("/commission/request/commission/read")).toBeUndefined();
  });
});

describe("isCommissionAction", () => {
  test("returns true for dispatch/cancel/abandon/redispatch", () => {
    expect(isCommissionAction("commission.run.dispatch")).toBe(true);
    expect(isCommissionAction("commission.run.cancel")).toBe(true);
    expect(isCommissionAction("commission.run.abandon")).toBe(true);
    expect(isCommissionAction("commission.run.redispatch")).toBe(true);
  });

  test("returns false for removed continue/save operations", () => {
    expect(isCommissionAction("commission.run.continue")).toBe(false);
    expect(isCommissionAction("commission.run.save")).toBe(false);
  });

  test("returns false for non-action operationIds", () => {
    expect(isCommissionAction("commission.request.commission.list")).toBe(false);
    expect(isCommissionAction("other.op")).toBe(false);
  });
});

describe("formatActionConfirmation", () => {
  test("dispatch uses response body commissionId", () => {
    const op = makeOperation({
      operationId: "commission.run.dispatch",
      invocation: { method: "POST", path: "/commission/run/dispatch" },
    });
    const result = formatActionConfirmation(
      { commissionId: "commission-Dalton-123" },
      op,
      [],
    );
    expect(result).toBe("Dispatched: commission-Dalton-123");
  });

  test("redispatch uses response body commissionId", () => {
    const op = makeOperation({
      operationId: "commission.run.redispatch",
      invocation: { method: "POST", path: "/commission/run/redispatch" },
    });
    const result = formatActionConfirmation(
      { commissionId: "commission-Thorne-456" },
      op,
      [],
    );
    expect(result).toBe("Redispatched: commission-Thorne-456");
  });

  test("cancel uses positional arg for commissionId", () => {
    const op = makeOperation({
      operationId: "commission.run.cancel",
      invocation: { method: "POST", path: "/commission/run/cancel" },
    });
    const result = formatActionConfirmation(
      { status: "ok" },
      op,
      ["commission-Dalton-123"],
    );
    expect(result).toBe("Cancelled: commission-Dalton-123");
  });

  test("abandon uses positional arg for commissionId", () => {
    const op = makeOperation({
      operationId: "commission.run.abandon",
      invocation: { method: "POST", path: "/commission/run/abandon" },
    });
    const result = formatActionConfirmation(
      { status: "ok" },
      op,
      ["commission-Dalton-123", "not needed"],
    );
    expect(result).toBe("Abandoned: commission-Dalton-123");
  });
});

describe("formatCommissionList", () => {
  test("formats commissions as a table (snapshot-style shape check)", () => {
    const data = {
      commissions: [
        {
          commissionId: "commission-Dalton-20260320-200023",
          status: "in_progress",
          workerDisplayTitle: "Developer",
          title: "Fix login validation bug",
          worker: "guild-hall-developer",
        },
        {
          commissionId: "commission-Octavia-20260320-201208",
          status: "halted",
          workerDisplayTitle: "Chronicler",
          title: "Write CLI commission spec",
          worker: "guild-hall-writer",
        },
      ],
    };

    const output = formatCommissionList(data);
    const lines = output.split("\n");

    expect(lines[0]).toContain("ID");
    expect(lines[0]).toContain("STATUS");
    expect(lines[0]).toContain("WORKER");
    expect(lines[0]).toContain("TITLE");
    expect(lines[1]).toMatch(/^-+/);

    expect(lines[2]).toContain("commission-Dalton-20260320-200023");
    expect(lines[2]).toContain("in_progress");
    expect(lines[2]).toContain("Developer");
    expect(lines[2]).toContain("Fix login");

    expect(lines[3]).toContain("commission-Octavia-20260320-201208");
    expect(lines[3]).toContain("halted");
    expect(lines[3]).toContain("Chronicler");
  });

  test("returns (no commissions) for empty list", () => {
    const output = formatCommissionList({ commissions: [] });
    expect(output).toBe("(no commissions)");
  });
});

describe("formatCommissionDetail", () => {
  const baseResponse = {
    commission: {
      commissionId: "commission-Dalton-20260320-200023",
      title: "Fix login validation bug",
      status: "in_progress",
      type: "one-shot",
      date: "2026-03-20",
      worker: "guild-hall-developer",
      workerDisplayTitle: "Developer",
      current_progress: "Implementing the login validation changes. Tests passing.",
      result_summary: "",
    },
    timeline: [
      { timestamp: "2026-03-20 20:00:23", event: "status_pending", reason: "Commission created" },
      { timestamp: "2026-03-20 20:01:00", event: "status_dispatched", reason: "Commission dispatched" },
      { timestamp: "2026-03-20 20:15:32", event: "status_in_progress", reason: "Dispatched to worker" },
    ],
    rawContent: "",
  };

  test("formats header with commission ID, status, worker, date", () => {
    const output = formatCommissionDetail(baseResponse);
    expect(output).toContain("commission-Dalton-20260320-200023");
    expect(output).toContain("Status:   in_progress");
    expect(output).toContain("Worker:   Developer (guild-hall-developer)");
    expect(output).toContain("Created:  2026-03-20");
  });

  test("shows progress when non-empty", () => {
    const output = formatCommissionDetail(baseResponse);
    expect(output).toContain("Progress: Implementing the login validation changes.");
  });

  test("omits progress when empty", () => {
    const resp = {
      ...baseResponse,
      commission: { ...baseResponse.commission, current_progress: "" },
    };
    const output = formatCommissionDetail(resp);
    expect(output).not.toContain("Progress:");
  });

  test("omits result when empty", () => {
    const output = formatCommissionDetail(baseResponse);
    expect(output).not.toContain("Result:");
  });

  test("shows result when non-empty", () => {
    const resp = {
      ...baseResponse,
      commission: { ...baseResponse.commission, result_summary: "All tests pass." },
    };
    const output = formatCommissionDetail(resp);
    expect(output).toContain("Result:   All tests pass.");
  });

  test("shows timeline entries most recent first", () => {
    const output = formatCommissionDetail(baseResponse);
    const timelineIdx = output.indexOf("Timeline:");
    const timelineSection = output.slice(timelineIdx);
    const lines = timelineSection.split("\n").slice(1);

    expect(lines[0]).toContain("status_in_progress");
    expect(lines[1]).toContain("status_dispatched");
    expect(lines[2]).toContain("status_pending");
  });

  test("limits timeline to last 5 entries", () => {
    const manyEntries = Array.from({ length: 10 }, (_, i) => ({
      timestamp: `2026-03-20 20:${String(i).padStart(2, "0")}:00`,
      event: `event_${i}`,
      reason: `Reason ${i}`,
    }));
    const resp = { ...baseResponse, timeline: manyEntries };
    const output = formatCommissionDetail(resp);
    const timelineIdx = output.indexOf("Timeline:");
    const timelineLines = output.slice(timelineIdx).split("\n").slice(1).filter(Boolean);
    expect(timelineLines.length).toBe(5);
    expect(timelineLines[0]).toContain("event_9");
  });

  test("shows schedule info for scheduled commissions", () => {
    const resp = {
      ...baseResponse,
      scheduleInfo: {
        cron: "0 9 * * 1",
        cronDescription: "Every Monday at 9:00 AM",
        repeat: null,
        runsCompleted: 3,
        lastRun: "2026-03-17T09:00:00.000Z",
        nextRun: "2026-03-24T09:00:00.000Z",
      },
    };
    const output = formatCommissionDetail(resp);
    expect(output).toContain("Schedule: Every Monday at 9:00 AM");
    expect(output).toContain("Runs:     3");
    expect(output).toContain("Next run: 2026-03-24T09:00:00.000Z");
  });

  test("shows trigger info for triggered commissions", () => {
    const resp = {
      ...baseResponse,
      triggerInfo: {
        match: { type: "commission_result" },
        approval: "auto",
        runsCompleted: 2,
        lastTriggered: "2026-03-20T15:00:00.000Z",
      },
    };
    const output = formatCommissionDetail(resp);
    expect(output).toContain('Trigger:  {"type":"commission_result"}');
    expect(output).toContain("Approval: auto");
    expect(output).toContain("Runs:     2");
    expect(output).toContain("Last:     2026-03-20T15:00:00.000Z");
  });
});

describe("M-3 snapshot coverage for commission UX (REQ-CLI-AGENT-25)", () => {
  // Shape-based tests confirm fields are present; snapshots catch silent
  // drift in column widths, ordering, truncation, and spacing. Terminal
  // width is pinned so list layout is deterministic across environments.
  const originalColumns = process.stdout.columns;
  beforeAll(() => {
    Object.defineProperty(process.stdout, "columns", {
      value: 100,
      configurable: true,
    });
  });
  afterAll(() => {
    Object.defineProperty(process.stdout, "columns", {
      value: originalColumns,
      configurable: true,
    });
  });

  const baseDetail = {
    commission: {
      commissionId: "commission-Dalton-20260320-200023",
      title: "Fix login validation bug",
      status: "in_progress",
      type: "one-shot",
      date: "2026-03-20",
      worker: "guild-hall-developer",
      workerDisplayTitle: "Developer",
      current_progress: "Implementing the login validation changes. Tests passing.",
      result_summary: "",
    },
    timeline: [
      { timestamp: "2026-03-20 20:00:23", event: "status_pending", reason: "Commission created" },
      { timestamp: "2026-03-20 20:01:00", event: "status_dispatched", reason: "Commission dispatched" },
      { timestamp: "2026-03-20 20:15:32", event: "status_in_progress", reason: "Dispatched to worker" },
    ],
    rawContent: "",
  };

  test("formatCommissionList — populated", () => {
    const output = formatCommissionList({
      commissions: [
        {
          commissionId: "commission-Dalton-20260320-200023",
          status: "in_progress",
          workerDisplayTitle: "Developer",
          title: "Fix login validation bug",
          worker: "guild-hall-developer",
        },
        {
          commissionId: "commission-Octavia-20260320-201208",
          status: "halted",
          workerDisplayTitle: "Chronicler",
          title: "Write CLI commission spec",
          worker: "guild-hall-writer",
        },
      ],
    });
    expect(output).toMatchSnapshot();
  });

  test("formatCommissionList — empty", () => {
    expect(formatCommissionList({ commissions: [] })).toMatchSnapshot();
  });

  test("formatCommissionDetail — with progress, without result", () => {
    expect(formatCommissionDetail(baseDetail)).toMatchSnapshot();
  });

  test("formatCommissionDetail — without progress, without result", () => {
    expect(
      formatCommissionDetail({
        ...baseDetail,
        commission: { ...baseDetail.commission, current_progress: "" },
      }),
    ).toMatchSnapshot();
  });

  test("formatCommissionDetail — with result", () => {
    expect(
      formatCommissionDetail({
        ...baseDetail,
        commission: {
          ...baseDetail.commission,
          result_summary: "All tests pass. Deployed to staging.",
        },
      }),
    ).toMatchSnapshot();
  });

  test("formatCommissionDetail — with schedule info", () => {
    expect(
      formatCommissionDetail({
        ...baseDetail,
        scheduleInfo: {
          cron: "0 9 * * 1",
          cronDescription: "Every Monday at 9:00 AM",
          repeat: null,
          runsCompleted: 3,
          lastRun: "2026-03-17T09:00:00.000Z",
          nextRun: "2026-03-24T09:00:00.000Z",
        },
      }),
    ).toMatchSnapshot();
  });

  test("formatCommissionDetail — with trigger info", () => {
    expect(
      formatCommissionDetail({
        ...baseDetail,
        triggerInfo: {
          match: { type: "commission_result" },
          approval: "auto",
          runsCompleted: 2,
          lastTriggered: "2026-03-20T15:00:00.000Z",
        },
      }),
    ).toMatchSnapshot();
  });

  test("formatCommissionDetail — timeline truncation at 5 entries", () => {
    const manyEntries = Array.from({ length: 10 }, (_, i) => ({
      timestamp: `2026-03-20 20:${String(i).padStart(2, "0")}:00`,
      event: `event_${i}`,
      reason: `Reason ${i}`,
    }));
    expect(
      formatCommissionDetail({ ...baseDetail, timeline: manyEntries }),
    ).toMatchSnapshot();
  });

  function actionOp(operationId: string, path: string): CliOperation {
    return {
      operationId,
      invocation: { method: "POST", path },
    };
  }

  test("formatActionConfirmation — dispatch", () => {
    expect(
      formatActionConfirmation(
        { commissionId: "commission-Dalton-20260320-200023" },
        actionOp("commission.run.dispatch", "/commission/run/dispatch"),
        [],
      ),
    ).toMatchSnapshot();
  });

  test("formatActionConfirmation — redispatch", () => {
    expect(
      formatActionConfirmation(
        { commissionId: "commission-Thorne-20260320-200025" },
        actionOp("commission.run.redispatch", "/commission/run/redispatch"),
        [],
      ),
    ).toMatchSnapshot();
  });

  test("formatActionConfirmation — cancel", () => {
    expect(
      formatActionConfirmation(
        { status: "ok" },
        actionOp("commission.run.cancel", "/commission/run/cancel"),
        ["commission-Dalton-20260320-200023"],
      ),
    ).toMatchSnapshot();
  });

  test("formatActionConfirmation — abandon", () => {
    expect(
      formatActionConfirmation(
        { status: "ok" },
        actionOp("commission.run.abandon", "/commission/run/abandon"),
        ["commission-Dalton-20260320-200023", "Scope changed"],
      ),
    ).toMatchSnapshot();
  });
});
